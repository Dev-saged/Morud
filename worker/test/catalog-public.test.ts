import { describe, expect, it } from 'vitest';
import { move, setup, submit, T } from './order-world';

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
  it('مؤشرات الإدارة تخفي المالية عمّن لا يملكها', async () => {
    const w = setup();
    const a = (await submit(w)).body.order.id;
    await submit(w);
    await move(w, 'oe', a, 'under_review');
    await move(w, 'oe', a, 'confirmed');
    const own = (await w.call('GET', '/dashboard/summary', { token: T(w, 'own') })).body;
    expect(own).toMatchObject({ ordersToday: 2, new: 1, preparing: 1, salesToday: 24750, totalDue: 24750, activeShops: 2, availableProducts: 2, unavailableProducts: 1 });
    expect(own.topProducts[0]).toMatchObject({ name: 'جبنة فيتا', count: 2 });
    expect(own.ordersLast7Days).toHaveLength(7);
    expect(own.recent).toHaveLength(2);
    const oe = (await w.call('GET', '/dashboard/summary', { token: T(w, 'oe') })).body;
    expect(oe.salesToday).toBeUndefined();
    expect((await w.call('GET', '/dashboard/summary', { token: T(w, 'so1') })).status).toBe(403);
  });
});
