import { describe, expect, it, vi } from 'vitest';
import { computePopular } from '../src/api/catalog-public';
import { REPORT_NAMES } from '../src/api/reports';
import { runScheduled } from '../src/api/cron';
import { move, setup, submit, T } from './order-world';

const failing = { get: async () => { throw new Error('kv down'); }, put: async () => { throw new Error('kv down'); }, delete: async () => { throw new Error('kv down'); } };

describe('المرونة والأداء', () => {
  it('تعطل الكاش المشترك لا يعطل الكتالوج ولا تعديل المنتجات', async () => {
    const w = setup();
    w.s.cache = failing;
    expect((await w.call('GET', '/catalog', { token: T(w, 'so1') })).status).toBe(200);
    expect((await w.call('PATCH', '/admin/products/feta', { token: T(w, 'own'), body: { name: 'فيتا' } })).status).toBe(200);
    expect((await w.call('GET', '/catalog', { token: T(w, 'so1') })).body.products.find((p: any) => p.id === 'feta').name).toBe('فيتا');
    w.s.cache = undefined;
    expect((await w.call('GET', '/catalog', { token: T(w, 'oe') })).status).toBe(200);
  });

  it('فشل قراءة الأدوار لا يُحفظ في الكاش: الطلب التالي ينجح', async () => {
    const w = setup();
    const orig = w.db.query.bind(w.db);
    let broken = true;
    w.db.query = (async (q: any) => { if (broken && q.collection === 'roles') throw new Error('firestore down'); return orig(q); }) as typeof w.db.query;
    expect((await w.call('GET', '/auth/me', { token: T(w, 'so1') })).status).toBe(500);
    broken = false;
    expect((await w.call('GET', '/auth/me', { token: T(w, 'so1') })).status).toBe(200);
  });

  it('تعديل دور يسري فوراً رغم كاش الأدوار', async () => {
    const w = setup();
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(403);
    const r = (await w.call('GET', '/admin/roles', { token: T(w, 'own') })).body.roles.find((x: any) => x.id === 'accountant');
    expect((await w.call('PUT', '/admin/roles/accountant', { token: T(w, 'own'), body: { ...r, permissions: [...r.permissions, 'audit.view'] } })).status).toBe(200);
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(200);
  });

  it('المهمة الساعية تحسب الأكثر طلباً، وفشل مهمة يُسجَّل دون إيقاف غيرها', async () => {
    const w = setup();
    await submit(w);
    const at = Date.UTC(2026, 10, 22, 10, 30);
    await runScheduled(w.s, '* * * * *', at);
    expect((await w.db.get('system/stats'))!.data.popular).toContain('feta');
    expect(await computePopular(w.s)).toContain('feta');
    const orig = w.db.query.bind(w.db);
    w.db.query = (async (q: any) => { if (q.collection === 'orders') throw new Error('boom'); return orig(q); }) as typeof w.db.query;
    await runScheduled(w.s, '* * * * *', at);
    const h = (await w.db.get('systemHealth/cron'))!.data;
    expect(h.popular).toMatchObject({ ok: false });
    expect(h.notifications).toMatchObject({ ok: true });
  });

  it('لوحة المندوب تحسب ما حصّله اليوم والمعلّق والفاشل', async () => {
    const w = setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = (await submit(w)).body.order.id;
      for (const to of ['under_review', 'confirmed', 'preparing', 'ready_for_pickup']) await move(w, 'oe', id, to);
      await w.call('POST', `/orders/${id}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
      ids.push(id);
    }
    await move(w, 'dm', ids[0]!, 'out_for_delivery');
    await move(w, 'ag', ids[0]!, 'on_the_way');
    await move(w, 'ag', ids[0]!, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: 24750 } });
    await move(w, 'dm', ids[1]!, 'out_for_delivery');
    const r = (await w.call('GET', '/me/summary', { token: T(w, 'ag') })).body;
    expect(r).toEqual({ area: 'agent', pending: 1, onRoad: 1, deliveredToday: 1, failed: 0, collectedToday: 24750 });
  });

  it('سجل العمليات يرفض المؤشرات والمعرّفات غير الصالحة', async () => {
    const w = setup();
    for (const q of ['entity=../x', 'actor=a%20b', 'before=abc', 'before=-5']) expect((await w.call('GET', `/admin/audit?${q}`, { token: T(w, 'own') })).status, q).toBe(400);
    expect((await w.call('GET', '/admin/audit?entity=feta&before=99999999999999', { token: T(w, 'own') })).status).toBe(200);
  });

  it('سجل العمليات: صفحات للأقدم، الزائر والمستخدم المحذوف بأسماء مفهومة', async () => {
    const w = setup();
    for (let i = 0; i < 55; i++) w.db.seed(`auditLogs/p${String(i).padStart(3, '0')}`, { actorId: i % 2 ? 'anonymous' : 'ghost', action: 'auth.login', entity: { kind: 'login', id: 'x' }, result: i % 2 ? 'denied' : 'ok', before: null, after: ['قائمة'], at: 1000 + i });
    const first = (await w.call('GET', '/admin/audit?action=auth.login', { token: T(w, 'own') })).body;
    expect(first.logs).toHaveLength(50);
    expect(first.next).toBe(1005);
    expect(first.logs.map((l: any) => l.actor)).toEqual(expect.arrayContaining(['زائر غير مسجل', 'ghost']));
    const rest = (await w.call('GET', `/admin/audit?before=${first.next}`, { token: T(w, 'own') })).body;
    expect(rest.next).toBeNull();
    expect(rest.logs.every((l: any) => l.at < 1005)).toBe(true);
  });

  it('عرض استُنفد عدد مرات استخدامه لا يظهر في الكتالوج', async () => {
    const w = setup();
    const now = w.s.now();
    w.db.seed('promotions/used', { name: 'مستنفد', type: 'item_percent', productIds: ['feta'], percentBp: 500, startsAt: now - 1, endsAt: now + 1e6, active: true, usageLimit: 3, usedCount: 3 });
    w.db.seed('promotions/live', { name: 'فعّال', type: 'item_percent', productIds: ['feta'], percentBp: 500, startsAt: now - 1, endsAt: now + 1e6, active: true, usageLimit: 3, usedCount: 1, createdBy: 'own' });
    w.db.seed('system/stats', { popular: ['nuts'] });
    const c = (await w.call('GET', '/catalog', { token: T(w, 'so1') })).body;
    expect(c.promotions.map((p: any) => p.name)).toEqual(['فعّال']);
    expect(c.popular).toEqual(['nuts']);
  });

  it('تعديل الأدوار مباشرة في القاعدة يسري خلال ثوانٍ (انتهاء كاش الأدوار)', async () => {
    const w = setup();
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(403);
    const r = (await w.call('GET', '/admin/roles', { token: T(w, 'own') })).body.roles.find((x: any) => x.id === 'accountant');
    w.db.seed('roles/accountant', { ...r, id: undefined, permissions: [...r.permissions, 'audit.view'] });
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(403);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 20_000);
    try { expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(200); } finally { vi.useRealTimers(); }
  });

  it('كل التقارير تعمل بفترة ومحل محدد، وبصيغة Excel، والفترة داخل الاستعلام', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    for (const to of ['under_review', 'confirmed']) await move(w, 'oe', id, to);
    await move(w, 'oe', (await submit(w)).body.order.id, 'cancelled', { reason: 'تجربة' });
    const from = w.s.now() - 86_400_000;
    const to = w.s.now() + 86_400_000;
    for (const name of REPORT_NAMES) {
      for (const q of [`from=${from}&to=${to}&shopId=s1`, `from=${from}&to=${to}`, `from=${to}&to=${to + 1000}`]) {
        const r = await w.call('GET', `/reports/${name}?${q}`, { token: T(w, 'own') });
        expect(r.status, `${name} ${q}`).toBe(200);
      }
      const csv = await w.call('GET', `/reports/${name}?format=csv&from=${from}&to=${to}`, { token: T(w, 'own') });
      expect(csv.status).toBe(200);
    }
    const sales = (await w.call('GET', `/reports/sales-daily?from=${to}&to=${to + 1000}`, { token: T(w, 'own') })).body;
    expect(sales.rows.every((r: any) => !r.count && !r.gross)).toBe(true);
  });
});
