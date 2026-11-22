import { describe, expect, it } from 'vitest';
import { move, setup, submit, T } from './order-world';
import { computePopular } from '../src/api/catalog-public';

describe('الكتالوج ولوحة المؤشرات', () => {
  it('المحل يرى المرئي فقط بلا مفاتيح البحث، والموظف يرى الكل', async () => {
    const w = setup();
    w.db.seed('products/hidden', { name: 'مخفي', visible: false, archived: false, searchKeys: ['x'] });
    w.db.seed('categories/dairy', { name: 'الألبان', order: 2 }).seed('categories/secret', { name: 'مخفي', order: 1, hidden: true });
    const shop = (await w.call('GET', '/catalog', { token: T(w, 'so1') })).body;
    expect(shop.products.map((p: any) => p.id).sort()).toEqual(['feta', 'nuts', 'off']);
    expect(shop.categories.map((c: any) => c.id)).toEqual(['dairy']);
    expect(shop.units).toHaveLength(3);
    expect(JSON.stringify(shop)).not.toContain('searchKeys');
    const staff = (await w.call('GET', '/catalog', { token: T(w, 'oe') })).body;
    expect(staff.products).toHaveLength(4);
    expect(staff.categories.map((c: any) => c.id)).toEqual(['secret', 'dairy']);
  });
  it('الكتالوج يُخدم من الكاش ويتجدد فور تعديل منتج أو عرض، ومعه العروض الفعالة والأكثر طلباً', async () => {
    const w = setup();
    const first = (await w.call('GET', '/catalog', { token: T(w, 'so1') })).body;
    expect(first.promotions).toEqual([]);
    expect(first.popular).toEqual([]);
    w.db.seed('products/feta', { ...(await w.db.get('products/feta'))!.data, name: 'تغيير مباشر بلا API' });
    expect((await w.call('GET', '/catalog', { token: T(w, 'so1') })).body.products.find((p: any) => p.id === 'feta').name).toBe('جبنة فيتا');
    expect((await w.call('PATCH', '/admin/products/feta', { token: T(w, 'own'), body: { name: 'فيتا بلدية' } })).status).toBe(200);
    expect((await w.call('GET', '/catalog', { token: T(w, 'so1') })).body.products.find((p: any) => p.id === 'feta').name).toBe('فيتا بلدية');
    const start = w.s.now() - 1000;
    expect((await w.call('POST', '/admin/promotions', { token: T(w, 'own'), body: { name: 'خصم الفيتا', type: 'item_percent', productIds: ['feta'], percentBp: 1000, startsAt: start, endsAt: start + 86_400_000 }, headers: { 'idempotency-key': 'promo-key-0000000001' } })).status).toBe(201);
    w.db.seed('promotions/old', { name: 'منتهٍ', type: 'item_percent', productIds: ['feta'], percentBp: 500, startsAt: 1, endsAt: 2, active: true, usedCount: 0 });
    const cat = (await w.call('GET', '/catalog', { token: T(w, 'so1') })).body;
    expect(cat.promotions.map((p: any) => p.name)).toEqual(['خصم الفيتا']);
    expect(cat.promotions[0]).not.toHaveProperty('createdBy');
    await submit(w);
    await computePopular(w.s);
    expect((await w.call('GET', '/catalog', { token: T(w, 'so1') })).body.popular[0]).toBe('feta');
  });
  it('مؤشرات الإدارة تخفي المالية عمّن لا يملكها', async () => {
    const w = setup();
    const a = (await submit(w)).body.order.id;
    await submit(w);
    await move(w, 'oe', a, 'under_review');
    await move(w, 'oe', a, 'confirmed');
    const own = (await w.call('GET', '/dashboard/summary', { token: T(w, 'own') })).body;
    expect(own).toMatchObject({ ordersToday: 2, new: 1, preparing: 1, salesToday: 24750, totalDue: 24750, activeShops: 2, availableProducts: 2, unavailableProducts: 1 });
    expect(own.topProducts[0]).toMatchObject({ productId: 'feta', name: 'جبنة فيتا', count: 2 });
    expect(own.ordersLast7Days).toHaveLength(7);
    expect(own.recent).toHaveLength(2);
    expect(own.recent[0]).toMatchObject({ shopId: expect.any(String) });
    // كل بطاقة في اللوحة تفتح قائمة مطابقة لعددها
    expect((await w.call('GET', '/orders?filter=today', { token: T(w, 'oe') })).body.orders).toHaveLength(own.ordersToday);
    expect((await w.call('GET', '/orders?filter=new', { token: T(w, 'oe') })).body.orders).toHaveLength(own.new);
    expect((await w.call('GET', '/orders?filter=preparing', { token: T(w, 'oe') })).body.orders).toHaveLength(own.preparing);
    const oe = (await w.call('GET', '/dashboard/summary', { token: T(w, 'oe') })).body;
    expect(oe.salesToday).toBeUndefined();
    expect((await w.call('GET', '/dashboard/summary', { token: T(w, 'so1') })).status).toBe(403);
  });
});
