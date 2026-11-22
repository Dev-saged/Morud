import { describe, expect, it } from 'vitest';
import { H, move, setup, T } from './order-world';

/**
 * الدورة الكاملة (SRS 21 — معيار القبول النهائي): إنشاء محل من الإدارة ← دخول صاحبه ← طلب ← مراجعة وتأكيد (فاتورة)
 * ← تجهيز ← إسناد مندوب ← توصيل بإثبات وتحصيل نقدي ← الدفعة تظهر في كشف الحساب والرصيد صفر والطلب مكتمل مالياً.
 */
describe('الدورة الكاملة من إنشاء المحل حتى ظهور الدفعة في الكشف', () => {
  it('تعمل بكل أدوارها على الخادم الحقيقي', async () => {
    const w = setup();
    const created = await w.call('POST', '/admin/shops', { token: T(w, 'own'), headers: H(), body: { name: 'بقالة الياسمين', ownerName: 'أم محمد', phone: '0599111222', region: 'الوسطى', city: 'النصيرات', address: 'شارع السوق', owner: { username: 'yasmin' } } });
    expect(created.status).toBe(201);
    const { shopId, ownerUid, tempPassword } = created.body;
    const login = await w.call('POST', '/auth/login', { body: { identifier: '0599111222', password: tempPassword } });
    expect(login.body.user).toMatchObject({ home: 'shop.home', shopIds: [shopId], mustChangePassword: true });
    await w.db.commit([{ kind: 'update', path: `users/${ownerUid}`, data: { mustChangePassword: false } }]);
    const shop = T(w, ownerUid);

    const cat = (await w.call('GET', '/catalog', { token: shop })).body;
    expect(cat.products.some((p: any) => p.id === 'feta')).toBe(true);
    const items = [{ productId: 'feta', unitId: 'carton', qtyMilli: 2000 }];
    const quote = (await w.call('POST', '/orders/quote', { token: shop, body: { items } })).body.cart;
    expect(quote.total).toBe(18000);
    const sent = await w.call('POST', '/orders', { token: shop, headers: H(), body: { shopId, items, paymentMethod: 'cash', seenTotal: quote.total } });
    expect(sent.status).toBe(201);
    const id = sent.body.order.id;
    expect((await w.call('GET', '/notifications', { token: T(w, 'oe') })).body.notifications.some((n: any) => n.ref?.id === id)).toBe(true);

    for (const to of ['under_review', 'confirmed', 'preparing', 'ready_for_pickup']) expect((await move(w, 'oe', id, to)).status).toBe(200);
    const invoiceId = (await w.db.get(`orders/${id}`))!.data.invoiceId as string;
    expect(invoiceId).toBeTruthy();
    expect((await w.db.get(`shops/${shopId}`))!.data.balance).toBe(18000);

    expect((await w.call('POST', `/orders/${id}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } })).status).toBe(200);
    expect((await w.call('GET', '/agent/tasks', { token: T(w, 'ag') })).body.tasks.map((t: any) => t.id)).toContain(id);
    expect((await move(w, 'dm', id, 'out_for_delivery')).status).toBe(200);
    expect((await move(w, 'ag', id, 'on_the_way')).status).toBe(200);
    expect((await w.call('POST', `/orders/${id}/track`, { token: T(w, 'ag'), body: { lat: 31.45, lng: 34.39 } })).status).toBe(200);
    const done = await move(w, 'ag', id, 'delivered', { proof: { receiverName: 'أم محمد', collectedAmount: 18000 } });
    expect(done.status).toBe(200);

    const st = (await w.call('GET', `/shops/${shopId}/statement`, { token: shop })).body.statement;
    expect(st.rows.map((r: any) => r.type)).toEqual(expect.arrayContaining(['invoice', 'payment']));
    expect(st.closing).toBe(0);
    expect((await w.db.get(`shops/${shopId}`))!.data.balance).toBe(0);
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('financially_completed');
    const pays = (await w.call('GET', `/shops/${shopId}/payments`, { token: shop })).body.payments;
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ amount: 18000, method: 'cash' });
    const log = (await w.call('GET', `/admin/audit?entity=${id}`, { token: T(w, 'own') })).body.logs.map((l: any) => l.action);
    expect(log).toEqual(expect.arrayContaining(['orders.transition', 'delivery.assign']));
  });
});
