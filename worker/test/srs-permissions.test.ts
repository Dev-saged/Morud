import { describe, expect, it } from 'vitest';
import { H, move, setup, submit, T } from './order-world';

/** SRS 19.2 — اختبارات الصلاحيات السبعة، كل بند باسمه كما في المتطلبات، على الخادم الحقيقي. */
describe('SRS 19.2 — الصلاحيات', () => {
  it('1. صاحب محل لا يستطيع فتح لوحة الإدارة', async () => {
    const w = setup();
    for (const [m, p] of [['GET', '/dashboard/summary'], ['GET', '/orders'], ['GET', '/admin/users'], ['GET', '/admin/shops'], ['GET', '/admin/audit'], ['GET', '/delivery/board']] as const) {
      expect((await w.call(m, p, { token: T(w, 'so1') })).status, p).toBe(403);
    }
    const me = await w.call('GET', '/auth/me', { token: T(w, 'so1') });
    expect(me.body.user.home).toMatch(/^shop\./);
  });

  it('2. محل لا يستطيع مشاهدة طلبات محل آخر', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    expect([403, 404]).toContain((await w.call('GET', `/orders/${id}`, { token: T(w, 'so2') })).status);
    expect((await w.call('GET', '/shops/s1/orders', { token: T(w, 'so2') })).status).toBe(403);
    const own = await w.call('GET', '/shops/s2/orders', { token: T(w, 'so2') });
    expect(own.body.orders.map((o: { id: string }) => o.id)).not.toContain(id);
  });

  it('3. مندوب لا يستطيع مشاهدة الطلبات غير المسندة إليه', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    for (const to of ['under_review', 'confirmed', 'preparing', 'ready_for_pickup']) await move(w, 'oe', id, to);
    await w.call('POST', `/orders/${id}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
    expect((await w.call('GET', '/agent/tasks', { token: T(w, 'ag') })).body.tasks.map((t: { id: string }) => t.id)).toContain(id);
    expect((await w.call('GET', '/agent/tasks', { token: T(w, 'ag2') })).body.tasks).toEqual([]);
    expect([403, 404]).toContain((await w.call('GET', `/orders/${id}`, { token: T(w, 'ag2') })).status);
    expect((await w.call('GET', '/orders', { token: T(w, 'ag2') })).status).toBe(403);
  });

  it('4. موظف الطلبات لا يستطيع تسجيل دفعات دون صلاحية', async () => {
    const w = setup();
    const r = await w.call('POST', '/payments', { token: T(w, 'oe'), headers: H(), body: { shopId: 's1', method: 'cash', amount: 5000 } });
    expect(r.status).toBe(403);
    expect(await w.db.query({ collection: 'payments' })).toHaveLength(0);
    expect(await w.db.query({ collection: 'ledger' })).toHaveLength(0);
  });

  it('5. الموظف المالي لا يستطيع تعديل أسعار المنتجات دون صلاحية', async () => {
    const w = setup();
    const before = (await w.db.get('products/feta'))!.data.units;
    const units = (before as Array<{ price: number }>).map((u) => ({ ...u, price: u.price * 2 }));
    const r = await w.call('PATCH', '/admin/products/feta', { token: T(w, 'acc'), body: { units } });
    expect(r.status).toBe(403);
    expect((await w.db.get('products/feta'))!.data.units).toEqual(before);
  });

  it('6. المستخدم المعطل لا يستطيع الدخول', async () => {
    const w = setup();
    const ok = await w.call('GET', '/auth/me', { token: T(w, 'oe') });
    expect(ok.status).toBe(200);
    await w.call('POST', '/admin/users/oe/status', { token: T(w, 'own'), body: { status: 'suspended', reason: 'انتهى العقد' } });
    const after = await w.call('GET', '/auth/me', { token: T(w, 'oe') });
    expect([401, 403]).toContain(after.status);
    expect((await w.call('GET', '/orders', { token: T(w, 'oe') })).status).toBeGreaterThanOrEqual(401);
  });

  it('7. تغيير بيانات الدور من الهاتف لا يمنح صلاحية جديدة', async () => {
    const w = setup();
    // التطبيق يرسل أدواراً وصلاحيات مزورة وسياق عمل إداري: الخادم يتجاهلها ويقرأ من قاعدة البيانات
    const r = await w.call('POST', '/payments', { token: T(w, 'so1'), headers: { ...H(), 'x-work-context': 'admin.finance' }, body: { shopId: 's1', method: 'cash', amount: 5000, roles: ['super_admin'], permissions: ['payments.create'] } });
    expect(r.status).toBe(403);
    expect((await w.call('PATCH', '/admin/users/so1', { token: T(w, 'so1'), body: { roles: ['super_admin'] } })).status).toBe(403);
    expect((await w.db.get('users/so1'))!.data.roles).toEqual(['shop_owner']);
  });
});
