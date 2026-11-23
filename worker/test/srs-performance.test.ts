import { describe, expect, it } from 'vitest';
import { matches } from '../src/domain/search';
import { H, setup, T } from './order-world';

/**
 * SRS 19.4 — الأداء والتزامن على منطق الخادم الحقيقي (قاعدة بالذاكرة).
 * الحدود الزمنية واسعة عمداً حتى لا تتذبذب في CI؛ الهدف كشف أي تعقيد تربيعي أو تكرار عند التزامن.
 * زمن الشبكة الفعلي على الإنتاج يقيسه scripts/latency.ts.
 */
const products = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `p${i}`, name: `${['جبنة', 'زيت', 'أرز', 'سكر', 'شاي', 'عدس', 'معكرونة', 'حليب'][i % 8]} صنف ${i}`, altNames: [`بديل${i}`], sku: `SKU-${i}`, barcodes: [], brand: i % 3 ? 'الأصيل' : 'الريف',
}));

describe('SRS 19.4 — الأداء', () => {
  it('كتالوج كبير: 3000 منتج يُبنى ويُقدَّم، والقراءة الثانية من الكاش', async () => {
    const w = setup();
    for (let i = 0; i < 3000; i++) {
      w.db.seed(`products/p${i}`, { name: `صنف ${i}`, altNames: [], sku: `S-${i}`, barcodes: [], categoryId: 'dairy', baseUnitId: 'box', available: i % 10 !== 0, visible: true, archived: false,
        units: [{ unitId: 'box', factorToBase: 1000, price: 500 + i, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] });
    }
    let t = performance.now();
    const first = await w.call('GET', '/catalog', { token: T(w, 'so1') });
    const cold = performance.now() - t;
    expect(first.status).toBe(200);
    expect(first.body.products.length).toBeGreaterThanOrEqual(3000);
    t = performance.now();
    const second = await w.call('GET', '/catalog', { token: T(w, 'so2') });
    const warm = performance.now() - t;
    expect(second.body.ver).toBe(first.body.ver);
    expect(cold).toBeLessThan(3000);
    expect(warm).toBeLessThan(cold + 50);
  });

  it('البحث السريع: 200 بحث على 5000 منتج بالهمزة والتاء المربوطة', () => {
    const list = products(5000);
    const t = performance.now();
    let hits = 0;
    for (let i = 0; i < 200; i++) hits += list.filter((p) => matches(['جبنه', 'ارز', 'زيت الاصيل', 'SKU-49'][i % 4]!, p)).length;
    const ms = performance.now() - t;
    expect(hits).toBeGreaterThan(0);
    expect(matches('جبنه', list[0]!)).toBe(true);
    expect(ms).toBeLessThan(1500);
  });

  it('لوحة الإدارة مع 2500 طلب: الملخص صحيح وسريع', async () => {
    const w = setup();
    const now = w.s.now();
    const states = ['new', 'under_review', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'];
    for (let i = 0; i < 2500; i++) {
      w.db.seed(`orders/o${i}`, { number: `O-${i}`, shopId: i % 2 ? 's1' : 's2', shopName: 'محل', status: states[i % 8], createdAt: now - (i % 7) * 86_400_000 - 1000, items: [{ productId: 'feta', name: 'جبنة', qtyMilli: 1000 }], totals: { total: 1000 }, sla: { overdue: i % 50 === 0 } });
    }
    const t = performance.now();
    const r = await w.call('GET', '/dashboard/summary', { token: T(w, 'own') });
    const ms = performance.now() - t;
    expect(r.status).toBe(200);
    expect(r.body.ordersLast7Days.reduce((a: number, b: number) => a + b, 0)).toBeGreaterThan(0);
    expect(r.body.recent).toHaveLength(8);
    expect(ms).toBeLessThan(3000);
  });

  it('عدة مستخدمين في الوقت نفسه: 40 طلباً متزامناً من محلين = 40 طلباً بأرقام فريدة ودفتر مطابق', async () => {
    const w = setup();
    const send = (uid: string, shopId: string) => w.call('POST', '/orders', { token: T(w, uid), headers: H(), body: { shopId, items: [{ productId: 'feta', unitId: 'box', qtyMilli: 1000 }], paymentMethod: 'cash' } });
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? send('so1', 's1') : send('so2', 's2'))));
    expect(res.every((r) => r.status === 201)).toBe(true);
    const orders = await w.db.query({ collection: 'orders' });
    expect(orders).toHaveLength(40);
    expect(new Set(orders.map((o) => o.data.number)).size).toBe(40);
  });

  it('ضغط الطلبات المتزامنة بنفس المفتاح (ضغط متكرر وضعف نت): طلب واحد فقط', async () => {
    const w = setup();
    const headers = H();
    const body = { shopId: 's1', items: [{ productId: 'feta', unitId: 'box', qtyMilli: 1000 }], paymentMethod: 'cash' };
    const res = await Promise.all(Array.from({ length: 10 }, () => w.call('POST', '/orders', { token: T(w, 'so1'), headers, body })));
    const ids = new Set(res.filter((r) => r.status < 300).map((r) => r.body.order.id));
    expect(ids.size).toBe(1);
    expect(await w.db.query({ collection: 'orders' })).toHaveLength(1);
  });

  it('دفعات متزامنة على محل واحد: الرصيد يساوي مجموعها بالضبط', async () => {
    const w = setup();
    const pay = (amount: number) => w.call('POST', '/payments', { token: T(w, 'own'), headers: H(), body: { shopId: 's1', method: 'cash', amount } });
    const res = await Promise.all([1000, 2500, 700, 4300, 1500].map(pay));
    expect(res.every((r) => r.status === 201)).toBe(true);
    const shop = (await w.db.get('shops/s1'))!.data;
    expect(shop.balance).toBe(-(1000 + 2500 + 700 + 4300 + 1500));
  });
});
