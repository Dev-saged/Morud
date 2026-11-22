import { describe, expect, it, vi } from 'vitest';
import { COLLECTIONS, decodeBackup, encodeBackup, restoreBackup, runBackup } from '../src/api/backup';
import { REPORT_NAMES } from '../src/api/reports';
import type { MemoryBlobs } from '../src/infra/blobs';
import { FirestoreDb } from '../src/infra/firestore';
import { MemoryDb } from '../src/infra/memory-db';
import { addUser } from './helpers';
import { cart, H, move, setup, submit, T } from './order-world';

const promoBody = (o: object = {}) => ({ name: 'عرض الألبان', type: 'item_percent', productIds: ['feta'], percentBp: 1000, startsAt: Date.UTC(2026, 10, 1), endsAt: Date.UTC(2026, 11, 31), ...o });

describe('العروض والخصومات (SRS 10)', () => {
  it('إنشاء عرض يُبلَّغ للمحلات ويُطبَّق على الطلب ويُعدّ استخدامه', async () => {
    const w = setup();
    const r = await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody({ usageLimit: 1 }) });
    expect(r.status).toBe(201);
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title)).toContain('هناك عرض جديد');
    expect((await w.call('GET', '/promotions', { token: T(w, 'so1') })).body.promotions).toHaveLength(1);
    const o = await submit(w);
    expect(o.body.order.totals).toMatchObject({ subtotal: 24750, discount: 1800, total: 22950 });
    expect((await w.db.get(`promotions/${r.body.id}`))!.data.usedCount).toBe(1);
    expect((await w.call('GET', '/promotions', { token: T(w, 'so1') })).body.promotions).toHaveLength(0);
    expect((await submit(w)).body.order.totals.discount).toBe(0);
    expect((await w.call('GET', '/promotions', { token: T(w, 'own') })).body.promotions).toHaveLength(1);
  });
  it('التحقق حسب النوع والصلاحية والتعديل', async () => {
    const w = setup();
    const bad = async (o: object) => (await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody(o) })).status;
    for (const o of [{ type: 'magic' }, { productIds: [] }, { productIds: ['ghost'] }, { percentBp: 0 }, { percentBp: 20000 }, { endsAt: Date.UTC(2026, 9, 1) },
      { type: 'item_amount', amountPerUnit: 0 }, { type: 'qty_percent' }, { type: 'bxgy', buyQty: 5 }, { type: 'bundle_percent' }, { maxDiscount: -1 }, { usageLimit: 0 }, { imageKey: 'products/nopeimage1.png' }]) {
      expect(await bad(o)).toBe(400);
    }
    expect((await w.call('POST', '/admin/promotions', { token: T(w, 'oe'), headers: H(), body: promoBody() })).status).toBe(403);
    const ok = await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody({ type: 'bxgy', buyQty: 5, getQty: 1, percentBp: undefined, active: false, unitIds: ['box'], maxDiscount: 5000, minPurchase: 1000 }) });
    expect(ok.status).toBe(201);
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications).toHaveLength(0);
    const up = await w.call('PATCH', `/admin/promotions/${ok.body.id}`, { token: T(w, 'own'), body: { active: true, name: 'اشترِ 5 واحصل على 1' } });
    expect(up.body.promotion).toMatchObject({ active: true, buyQty: 5, name: 'اشترِ 5 واحصل على 1' });
    expect((await w.call('PATCH', '/admin/promotions/ghost', { token: T(w, 'own'), body: {} })).status).toBe(404);
    const b2 = await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody({ type: 'bundle_percent', productIds: ['feta', 'nuts'] }) });
    expect(b2.status).toBe(201);
    const qp = await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody({ type: 'qty_percent', minQtyMilli: 5000 }) });
    expect(qp.status).toBe(201);
    const ia = await w.call('POST', '/admin/promotions', { token: T(w, 'own'), headers: H(), body: promoBody({ type: 'item_amount', amountPerUnit: 50, percentBp: undefined }) });
    expect(ia.status).toBe(201);
  });
});

describe('الدعم والشكاوى', () => {
  it('شكوى من المحل تصل للمخولين ويُرد عليها', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    const t = await w.call('POST', '/support', { token: T(w, 'so1'), body: { type: 'complaint', subject: 'تأخر الطلب', body: 'الطلب تأخر ساعتين عن الموعد', orderId: id } });
    expect(t.status).toBe(201);
    expect((await w.call('GET', '/notifications', { token: T(w, 'own') })).body.notifications.map((n: any) => n.title)).toContain('شكوى جديدة');
    expect((await w.call('POST', '/support', { token: T(w, 'so1'), body: { type: 'password_reset', subject: 'x', body: 'y' } })).status).toBe(400);
    expect((await w.call('POST', '/support', { token: T(w, 'so1'), body: { type: 'inquiry', subject: '', body: 'y' } })).status).toBe(400);
    expect((await w.call('GET', '/support', { token: T(w, 'so1') })).body.tickets).toHaveLength(1);
    expect((await w.call('GET', '/support', { token: T(w, 'so2') })).body.tickets).toHaveLength(0);
    expect((await w.call('GET', '/support?status=open', { token: T(w, 'own') })).body.tickets).toHaveLength(1);
    expect((await w.call('PATCH', `/admin/support/${t.body.id}`, { token: T(w, 'own'), body: { status: 'resolved', reply: 'نعتذر، تم التوصيل وسيُخصم التأخير', assignedTo: 'oe' } })).status).toBe(200);
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title)).toContain('رد على تذكرتك');
    expect((await w.call('PATCH', `/admin/support/${t.body.id}`, { token: T(w, 'own'), body: { status: 'lost' } })).status).toBe(400);
    expect((await w.call('PATCH', `/admin/support/${t.body.id}`, { token: T(w, 'oe'), body: { status: 'closed' } })).status).toBe(403);
    expect((await w.call('PATCH', '/admin/support/ghost', { token: T(w, 'own'), body: {} })).status).toBe(404);
    expect((await w.call('PATCH', `/admin/support/${t.body.id}`, { token: T(w, 'own'), body: { status: 'closed' } })).status).toBe(200);
  });
});

describe('النسخ الاحتياطي والاستعادة (SRS 18)', () => {
  it('نسخة مشفرة مضغوطة تُستعاد كاملة في قاعدة جديدة ضمن هدف RTO', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await move(w, 'oe', id, 'confirmed');
    const r = await runBackup(w.s);
    expect(r).toMatchObject({ ok: true });
    const log = (await w.db.query({ collection: 'backupLogs' }))[0]!.data;
    expect(log).toMatchObject({ status: 'ok', key: r.key, docs: r.docs });
    const bytes = await w.s.backupStore.get(r.key!);
    expect(new TextDecoder().decode(bytes!.slice(0, 4))).toBe('MWB1');
    expect(new TextDecoder().decode(bytes!)).not.toContain('بقالة النور');
    const fresh = new MemoryDb();
    const t0 = performance.now();
    const n = await restoreBackup(fresh, bytes!, w.s.backupKey);
    expect(performance.now() - t0).toBeLessThan(4 * 3600 * 1000);
    expect(n).toBe(r.docs);
    for (const [path, data] of w.db.docs) {
      if (path.startsWith('backupLogs/') || path.startsWith('idempotency/')) continue;
      expect(fresh.docs.get(path), path).toEqual(data);
    }
    await expect(decodeBackup(bytes!, btoa(String.fromCharCode(...new Uint8Array(32))))).rejects.toThrow();
    await expect(decodeBackup(new Uint8Array([1, 2, 3, 4]), w.s.backupKey)).rejects.toThrow();
  });
  it('كل المجموعات المستخدمة مشمولة في النسخ', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await w.call('POST', `/orders/${id}/notes`, { token: T(w, 'oe'), body: { text: 'ملاحظة' } });
    const names = new Set([...w.db.docs.keys()].map((p) => { const s = p.split('/'); return s[s.length - 2]!; }));
    names.delete('idempotency'); // مؤقتة (TTL أسبوع) ولا تُنسخ عمداً
    for (const n of names) expect(COLLECTIONS, n).toContain(n);
  });
  it('حذف النسخ الأقدم من مدة الاحتفاظ، وتسجيل الفشل وتنبيه المخولين', async () => {
    const w = setup();
    const blobs = w.s.backupStore as MemoryBlobs;
    blobs.clock = () => w.clock.now - 40 * 86_400_000;
    await blobs.put('backups/old.mwb', new Uint8Array([1]));
    blobs.clock = () => w.clock.now;
    await runBackup(w.s);
    expect(await blobs.get('backups/old.mwb')).toBeNull();
    const broken = { ...w.s, backupKey: 'c2hvcnQ=' };
    const r = await runBackup(broken);
    expect(r.ok).toBe(false);
    expect((await w.db.query({ collection: 'backupLogs', where: [['status', '==', 'failed']] })).length).toBe(1);
    expect((await w.call('GET', '/notifications', { token: T(w, 'own') })).body.notifications.map((n: any) => n.title)).toContain('فشل النسخ الاحتياطي اليومي');
  });
  it('واجهات النسخ للمخولين فقط، وCron اليومي', async () => {
    const w = setup();
    expect((await w.call('POST', '/admin/backups/run', { token: T(w, 'own') })).status).toBe(201);
    expect((await w.call('GET', '/admin/backups', { token: T(w, 'own') })).body.backups).toHaveLength(1);
    expect((await w.call('GET', '/admin/backups', { token: T(w, 'acc') })).status).toBe(403);
    const { runScheduled, purgeIdempotency } = await import('../src/api/cron');
    const now = w.s.now();
    w.db.seed('idempotency/u_old', { createdAt: now - 8 * 86_400_000 }).seed('idempotency/u_new', { createdAt: now - 86_400_000 });
    await runScheduled(w.s, '0 1 * * *');
    expect((await w.db.query({ collection: 'backupLogs' })).length).toBe(2);
    const left = (await w.db.query({ collection: 'idempotency' })).map((d) => d.id);
    expect(left).toContain('u_new');
    expect(left).not.toContain('u_old');
    expect(await purgeIdempotency(w.s)).toBe(0);
    const broken = { ...w.s, backupKey: 'c2hvcnQ=' };
    const { createApp } = await import('../src/api/app');
    const { ALL_ROUTES } = await import('../src/api/routes');
    const res = await createApp(ALL_ROUTES)(new Request('https://x/admin/backups/run', { method: 'POST', headers: { authorization: `Bearer ${T(w, 'own')}` } }), broken, { allowedOrigins: [] });
    expect(res.status).toBe(500);
  });
  it('استعلام dump في Firestore REST مرتب بالمسار ومتصل بالمؤشر', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).structuredQuery;
      expect(q.from).toEqual([{ collectionId: 'history', allDescendants: true }]);
      expect(q.startAt.values[0].referenceValue).toContain('/documents/orders/o1/history/h1');
      return new Response(JSON.stringify([{ document: { name: 'projects/p/databases/(default)/documents/orders/o1/history/h2', fields: {} } }]));
    });
    const rows = await new FirestoreDb('p', async () => 'AT', f as never).dump('history', 'orders/o1/history/h1', 10);
    expect(rows[0]!.path).toBe('orders/o1/history/h2');
    expect(await encodeBackup('x', btoa(String.fromCharCode(...new Uint8Array(32))))).toBeInstanceOf(Uint8Array);
  });
});

describe('التقارير الـ17 (SRS 12)', () => {
  async function busy() {
    const w = setup();
    addUser(w, 'aud', { username: 'auditor', roles: ['admin_manager'] });
    await w.db.commit([{ kind: 'set', path: 'products/feta/private/cost', data: { cost: 600 } }]);
    const a = (await submit(w)).body.order.id;
    await move(w, 'oe', a, 'under_review');
    await move(w, 'oe', a, 'confirmed');
    await w.db.commit([{ kind: 'update', path: `orders/${a}`, data: { status: 'out_for_delivery', agentId: 'ag' } }]);
    await move(w, 'ag', a, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: 20000 } });
    await move(w, 'own', a, 'returned', { reason: 'تالف', returnLines: [{ productId: 'nuts', unitId: 'kg', qtyMilli: 500 }] });
    const b = (await submit(w)).body.order.id;
    await move(w, 'so1', b, 'cancelled', { reason: 'مكرر' });
    const c = (await submit(w, 'so1', { items: cart, paymentMethod: 'credit' })).body.order.id;
    await move(w, 'oe', c, 'under_review');
    await move(w, 'oe', c, 'confirmed');
    await w.db.commit([{ kind: 'update', path: `orders/${c}`, data: { 'sla': { overdue: true, dueAt: 1, delayReason: 'ازدحام' } } }, { kind: 'update', path: 'products/nuts', data: { available: false } }]);
    return w;
  }
  it('كل التقارير تعمل للمالك وتحترم الصلاحيات', async () => {
    const w = await busy();
    expect(REPORT_NAMES).toHaveLength(17);
    for (const name of REPORT_NAMES) {
      const r = await w.call('GET', `/reports/${name}`, { token: T(w, 'own') });
      expect(r.status, name).toBe(200);
      expect(Array.isArray(r.body.rows), name).toBe(true);
    }
    const daily = (await w.call('GET', '/reports/sales-daily', { token: T(w, 'own') })).body;
    expect(daily.rows[0]).toMatchObject({ count: 2, credited: 2250 });
    expect(daily.note).toContain('ليست أرباحاً');
    expect((await w.call('GET', '/reports/sales-monthly', { token: T(w, 'own') })).body.rows[0].period).toBe('2026-11');
    expect((await w.call('GET', '/reports/sales-weekly', { token: T(w, 'own') })).body.rows[0].period).toBe('أسبوع 2026-11-14');
    expect((await w.call('GET', '/reports/orders-by-status', { token: T(w, 'own') })).body.rows).toEqual(expect.arrayContaining([{ status: 'cancelled', count: 1 }]));
    expect((await w.call('GET', '/reports/top-products', { token: T(w, 'own') })).body.rows[0].name).toBe('جبنة فيتا');
    expect((await w.call('GET', '/reports/top-products?categoryId=snacks', { token: T(w, 'own') })).body.rows.map((r: any) => r.name)).toEqual(['مكسرات']);
    expect((await w.call('GET', '/reports/least-products?categoryId=dairy', { token: T(w, 'own') })).body.rows).toHaveLength(1);
    expect((await w.call('GET', '/reports/unavailable-products', { token: T(w, 'own') })).body.rows.map((r: any) => r.name)).toEqual(['مكسرات', 'غير متوفر']);
    const profit = (await w.call('GET', '/reports/profit', { token: T(w, 'own') })).body.rows;
    expect(profit.find((r: any) => r.name === 'جبنة فيتا')).toMatchObject({ cost: 28800, profit: 36000 - 28800 });
    expect(profit.find((r: any) => r.name === 'مكسرات')).toMatchObject({ cost: null, profit: null });
    expect((await w.call('GET', '/reports/collections', { token: T(w, 'own') })).body.rows).toEqual([{ method: 'cash', source: 'delivery', count: 1, amount: 20000 }]);
    expect((await w.call('GET', '/reports/debts', { token: T(w, 'own') })).body.rows[0]).toMatchObject({ shop: 'بقالة النور' });
    expect((await w.call('GET', '/reports/agents', { token: T(w, 'own') })).body.rows).toEqual([{ agentId: 'ag', delivered: 1, failed: 0, collected: 20000 }]);
    expect((await w.call('GET', '/reports/delivery-delays', { token: T(w, 'own') })).body.rows[0].reason).toBe('ازدحام');
    expect((await w.call('GET', '/reports/cancellations', { token: T(w, 'own') })).body.rows[0]).toMatchObject({ actor: 'shop', reason: 'مكرر' });
    expect((await w.call('GET', '/reports/returns', { token: T(w, 'own') })).body.rows[0].credited).toBe(2250);
    expect((await w.call('GET', '/reports/staff-activity', { token: T(w, 'own') })).body.rows.length).toBeGreaterThan(3);
    expect((await w.call('GET', '/reports/orders-by-status?status=cancelled', { token: T(w, 'own') })).body.rows).toEqual([{ status: 'cancelled', count: 1 }]);
    expect((await w.call('GET', '/reports/top-shops?shopId=s2', { token: T(w, 'own') })).body.rows).toEqual([]);
    expect((await w.call('GET', '/reports/payments?shopId=s1', { token: T(w, 'own') })).body.rows).toHaveLength(1);
    // الصلاحيات
    expect((await w.call('GET', '/reports/sales-daily', { token: T(w, 'dm') })).status).toBe(403);
    expect((await w.call('GET', '/reports/profit', { token: T(w, 'acc') })).body.error.details.missing).toEqual(['products.cost.view']);
    expect((await w.call('GET', '/reports/agents', { token: T(w, 'dm') })).status).toBe(200);
    expect((await w.call('GET', '/reports/staff-activity', { token: T(w, 'aud') })).status).toBe(200);
    expect((await w.call('GET', '/reports/top-products', { token: T(w, 'so1') })).status).toBe(403);
    const cat = (await w.call('GET', '/reports', { token: T(w, 'dm') })).body.reports;
    expect(cat.find((r: any) => r.id === 'agents').allowed).toBe(true);
    expect(cat.find((r: any) => r.id === 'debts').allowed).toBe(false);
    expect((await w.call('GET', '/reports/nope', { token: T(w, 'own') })).status).toBe(404);
    expect((await w.call('GET', '/reports/debts?from=9&to=1', { token: T(w, 'own') })).status).toBe(400);
  });
  it('التصدير إلى Excel (CSV) والطباعة بأمان', async () => {
    const w = await busy();
    await w.db.commit([{ kind: 'update', path: 'shops/s1', data: { name: '=HYPERLINK("x")' } }]);
    const c = await w.call('GET', '/reports/debts?format=csv', { token: T(w, 'own') });
    expect(c.headers.get('content-type')).toContain('text/csv');
    expect(c.body).toContain(`"'=HYPERLINK(""x"")"`);
    const { createApp } = await import('../src/api/app');
    const { ALL_ROUTES } = await import('../src/api/routes');
    const raw = await createApp(ALL_ROUTES)(new Request('https://x/reports/debts?format=csv', { headers: { authorization: `Bearer ${T(w, 'own')}` } }), w.s, { allowedOrigins: [] });
    expect([...new Uint8Array(await raw.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const h = await w.call('GET', '/reports/debts?format=html', { token: T(w, 'own') });
    expect(h.body).toContain('الديون المستحقة');
    expect(h.body).not.toContain('<script');
    const s = await w.call('GET', '/reports/sales-daily?format=html', { token: T(w, 'own') });
    expect(s.body).toContain('ليست أرباحاً');
  });
});
