import { describe, expect, it } from 'vitest';
import { move, setup, submit, T } from './order-world';

describe('لوحة لكل دور', () => {
  it('صاحب المحل يرى طلباته المفتوحة ومصروفه وآخر طلب وما يعيد طلبه', async () => {
    const w = setup();
    const a = (await submit(w)).body.order.id;
    await submit(w);
    await move(w, 'oe', a, 'under_review');
    const r = await w.call('GET', '/me/summary', { token: T(w, 'so1') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ area: 'shop', shopName: 'بقالة النور', open: 2, ordersMonth: 2, spendMonth: 49500, due: 0, creditAvailable: 100000 });
    expect(r.body.spendLast7Days).toHaveLength(7);
    expect(r.body.last).toMatchObject({ status: expect.any(String), total: 24750 });
    expect(r.body.reorder[0]).toMatchObject({ productId: 'feta', count: 2 });
    expect((await w.call('GET', '/me/summary?shopId=s2', { token: T(w, 'so1') })).status).toBe(403);
  });
  it('المندوب يرى مهامه اليوم وما حصّله', async () => {
    const w = setup();
    const r = await w.call('GET', '/me/summary', { token: T(w, 'ag') });
    expect(r.body).toEqual({ area: 'agent', pending: 0, onRoad: 0, deliveredToday: 0, failed: 0, collectedToday: 0 });
  });
});

describe('ترويسات الأمان', () => {
  it('كل استجابة تحمل HSTS ومنع التأطير ولا تُخزَّن بيانات الحساب', async () => {
    const w = setup();
    const r = await w.call('GET', '/me/summary', { token: T(w, 'so1') });
    expect(r.headers.get('strict-transport-security')).toContain('max-age=');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});
