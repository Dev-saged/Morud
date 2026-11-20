import { describe, expect, it } from 'vitest';
import { settleSweep } from '../src/api/finance';
import { esc, invoiceHtml } from '../src/api/print';
import { H, move, setup, submit, T } from './order-world';

type W = ReturnType<typeof setup>;
function fin() {
  const w = setup();
  w.db.seed('products/rice', { name: 'أرز مصري', altNames: [], sku: 'STP-001', barcodes: [], categoryId: 'staples', baseUnitId: 'box', available: true, visible: true, archived: false,
    units: [{ unitId: 'box', factorToBase: 1000, price: 1000, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] });
  return w;
}
const shekels = (n: number) => [{ productId: 'rice', unitId: 'box', qtyMilli: n * 1000 }]; // كل علبة 10 ش
async function confirmed(w: W, ils: number, method = 'cash') {
  const id = (await submit(w, 'so1', { items: shekels(ils / 10), paymentMethod: method })).body.order.id;
  await move(w, 'oe', id, 'under_review');
  const invId = (await move(w, 'oe', id, 'confirmed')).body.order.invoiceId;
  return { id, invId };
}
async function deliver(w: W, id: string, collected = 0) {
  await w.db.commit([{ kind: 'update', path: `orders/${id}`, data: { status: 'out_for_delivery', agentId: 'ag' } }]);
  return move(w, 'ag', id, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: collected } });
}
const pay = (w: W, body: object, uid = 'acc') => w.call('POST', '/payments', { token: T(w, uid), headers: H(), body: { shopId: 's1', method: 'cash', ...body } });
const balance = async (w: W) => (await w.db.get('shops/s1'))!.data.balance as number;
const statement = async (w: W, uid = 'so1') => (await w.call('GET', '/shops/s1/statement', { token: T(w, uid) })).body;

describe('سيناريوهات SRS 19.3 المالية على الخادم', () => {
  it('1) طلب 100 ش ودفع 60 ش → المتبقي 40 ش', async () => {
    const w = fin();
    const { id, invId } = await confirmed(w, 100);
    await deliver(w, id);
    const r = await pay(w, { amount: 6000 });
    expect(r.status).toBe(201);
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ paid: 6000, remaining: 4000, status: 'partial' });
    expect(await balance(w)).toBe(4000);
    expect((await statement(w)).statement).toMatchObject({ due: 4000, creditBalance: 0 });
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('delivered');
  });
  it('2) دين 100 ش ودفع 150 ش → رصيد دائن 50 ش يُستهلك في الفاتورة القادمة', async () => {
    const w = fin();
    const { id } = await confirmed(w, 100, 'credit');
    await deliver(w, id);
    const r = await pay(w, { amount: 15000 });
    expect(r.body.payment).toMatchObject({ unallocated: 5000 });
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('financially_completed');
    const st = await statement(w);
    expect(st.statement).toMatchObject({ due: 0, creditBalance: 5000 });
    const next = await confirmed(w, 30);
    expect(await balance(w)).toBe(-2000);
    expect((await w.db.get(`invoices/${next.invId}`))!.data.remaining).toBe(3000);
  });
  it('3) فاتورة 200 ش ثم تعديل السعر → الفاتورة تبقى 200 ش', async () => {
    const w = fin();
    const { invId } = await confirmed(w, 200);
    await w.call('PATCH', '/admin/products/rice', { token: T(w, 'own'), body: { units: [{ unitId: 'box', factorToBase: 1000, price: 1500, minQtyMilli: 1000, stepMilli: 1000 }] } });
    expect((await w.db.get('products/rice'))!.data.units).toMatchObject([{ price: 1500 }]);
    const inv = (await w.call('GET', `/invoices/${invId}`, { token: T(w, 'so1') })).body.invoice;
    expect(inv).toMatchObject({ total: 20000, items: [{ unitPrice: 1000 }] });
  });
  it('4) دفعة مكررة بسبب ضعف النت → حركة واحدة', async () => {
    const w = fin();
    const { id } = await confirmed(w, 100);
    await deliver(w, id);
    const h = H();
    const send = () => w.call('POST', '/payments', { token: T(w, 'acc'), headers: h, body: { shopId: 's1', method: 'cash', amount: 6000 } });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.body.payment.id).toBe(b.body.payment.id);
    expect((await w.db.query({ collection: 'payments' })).length).toBe(1);
    expect(await balance(w)).toBe(4000);
  });
  it('5) إلغاء طلب بعد تسجيل دفعة → معالجة صحيحة دون ضياع الحركة الأصلية', async () => {
    const w = fin();
    const { id, invId } = await confirmed(w, 100);
    await pay(w, { amount: 6000, invoiceId: invId });
    const r = await move(w, 'own', id, 'cancelled', { reason: 'نفاد الكمية من المستودع' });
    expect(r.status).toBe(200);
    const types = (await w.db.query({ collection: 'ledger' })).map((l) => [l.data.type, l.data.amount]);
    expect(types).toEqual(expect.arrayContaining([['invoice', 10000], ['payment', -6000], ['credit_note', -10000]]));
    expect(await balance(w)).toBe(-6000);
    expect((await statement(w, 'acc')).statement.creditBalance).toBe(6000);
    // نسخة الرد النقدي
    const w2 = fin();
    const o2 = await confirmed(w2, 100);
    await pay(w2, { amount: 6000 });
    await move(w2, 'own', o2.id, 'cancelled', { reason: 'نفاد الكمية', refund: true });
    expect(await balance(w2)).toBe(0);
  });
});

describe('الدفعات والتسويات والكشف (SRS 9)', () => {
  it('التحقق والصلاحيات', async () => {
    const w = fin();
    await confirmed(w, 100);
    expect((await pay(w, { amount: 100 }, 'oe')).status).toBe(403);
    expect((await pay(w, { amount: 0 })).status).toBe(400);
    expect((await pay(w, { amount: 10.5 })).status).toBe(400);
    expect((await pay(w, { amount: 100, method: 'bank_transfer' })).body.error.message).toBe('طريقة الدفع غير مفعّلة');
    expect((await pay(w, { amount: 100, shopId: 'ghost' })).status).toBe(404);
    expect((await pay(w, { amount: 100, invoiceId: 'ghost' })).body.error.code).toBe('INVOICE_NOT_OPEN');
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title)).not.toContain('تم تسجيل دفعة وتحديث رصيدك');
    await pay(w, { amount: 100 });
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title)).toContain('تم تسجيل دفعة وتحديث رصيدك');
  });
  it('عكس الدفعة: حركة عكسية، إعادة فتح الفاتورة، عودة الطلب المسوّى، ولا عكس مرتين', async () => {
    const w = fin();
    const { id, invId } = await confirmed(w, 100);
    await deliver(w, id);
    const p = (await pay(w, { amount: 10000 })).body.payment;
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('financially_completed');
    expect((await w.call('POST', `/payments/${p.id}/reverse`, { token: T(w, 'acc'), headers: H(), body: {} })).status).toBe(400);
    expect((await w.call('POST', `/payments/${p.id}/reverse`, { token: T(w, 'oe'), headers: H(), body: { reason: 'خطأ' } })).status).toBe(403);
    const r = await w.call('POST', `/payments/${p.id}/reverse`, { token: T(w, 'acc'), headers: H(), body: { reason: 'شيك مرتجع من البنك' } });
    expect(r.status).toBe(200);
    expect(await balance(w)).toBe(10000);
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ paid: 0, remaining: 10000, status: 'open' });
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('delivered');
    expect((await w.db.get(`payments/${p.id}`))!.data.status).toBe('reversed');
    expect((await w.call('POST', `/payments/${p.id}/reverse`, { token: T(w, 'acc'), headers: H(), body: { reason: 'مرة ثانية' } })).body.error.code).toBe('ALREADY_REVERSED');
    expect((await w.call('POST', '/payments/ghost/reverse', { token: T(w, 'acc'), headers: H(), body: { reason: 'سبب' } })).status).toBe(404);
    const hist = (await w.call('GET', `/orders/${id}`, { token: T(w, 'oe') })).body.history.map((h: any) => h.to);
    expect(hist.slice(-2)).toEqual(['financially_completed', 'delivered']);
  });
  it('التسويات والرصيد الافتتاحي بصلاحية مالية وسبب', async () => {
    const w = fin();
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'acc'), headers: H(), body: { shopId: 's1', amount: 50000, reason: 'رصيد سابق من الدفتر الورقي', opening: true } })).status).toBe(201);
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'acc'), headers: H(), body: { shopId: 's1', amount: -2000, reason: 'خصم تعويض تأخير' } })).status).toBe(201);
    expect(await balance(w)).toBe(48000);
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'acc'), headers: H(), body: { shopId: 's1', amount: 0, reason: 'x y z' } })).status).toBe(400);
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'acc'), headers: H(), body: { shopId: 's1', amount: 5 } })).status).toBe(400);
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'acc'), headers: H(), body: { shopId: 'zz', amount: 5, reason: 'سبب واضح' } })).status).toBe(404);
    expect((await w.call('POST', '/ledger/adjustments', { token: T(w, 'oe'), headers: H(), body: { shopId: 's1', amount: 5, reason: 'سبب' } })).status).toBe(403);
    const st = await statement(w, 'acc');
    expect(st.statement.rows.map((r: any) => r.type)).toEqual(['opening', 'adjustment']);
    expect(st.credit).toMatchObject({ limit: 100000, available: 52000 });
    expect((await w.call('GET', '/shops/s1/statement?type=opening', { token: T(w, 'acc') })).body.statement.rows).toHaveLength(1);
    expect((await w.call('GET', `/shops/s1/statement?from=${w.clock.now + 10}&to=${w.clock.now + 20}`, { token: T(w, 'acc') })).body.statement).toMatchObject({ opening: 48000, rows: [] });
    expect((await w.call('GET', '/shops/s1/statement?from=5&to=1', { token: T(w, 'acc') })).status).toBe(400);
  });
  it('من يرى الكشف والفواتير والدفعات', async () => {
    const w = fin();
    const { invId } = await confirmed(w, 100);
    await pay(w, { amount: 1000 });
    expect((await w.call('GET', '/shops/s1/statement', { token: T(w, 'se1') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/statement', { token: T(w, 'so2') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/statement', { token: T(w, 'oe') })).status).toBe(403);
    expect((await w.call('GET', '/shops/zz/statement', { token: T(w, 'acc') })).status).toBe(404);
    expect((await w.call('GET', `/invoices/${invId}`, { token: T(w, 'se1') })).status).toBe(404);
    expect((await w.call('GET', `/invoices/${invId}`, { token: T(w, 'ag') })).status).toBe(404);
    expect((await w.call('GET', `/invoices/${invId}`, { token: T(w, 'acc') })).body.invoice.number).toBe('MW-I-2026-000001');
    expect((await w.call('GET', '/invoices?status=partial', { token: T(w, 'acc') })).body.invoices).toHaveLength(1);
    expect((await w.call('GET', '/invoices?shopId=s2', { token: T(w, 'acc') })).body.invoices).toHaveLength(0);
    expect((await w.call('GET', '/invoices', { token: T(w, 'so1') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/invoices', { token: T(w, 'so1') })).body.invoices).toHaveLength(1);
    expect((await w.call('GET', '/shops/s1/invoices', { token: T(w, 'se1') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/payments', { token: T(w, 'so1') })).body.payments[0]).toMatchObject({ amount: 1000, number: 'MW-P-2026-000001' });
    expect((await w.call('GET', '/shops/s1/payments', { token: T(w, 'so2') })).status).toBe(403);
  });
  it('طباعة الفاتورة والكشف بصفحة عربية مهرّبة', async () => {
    const w = fin();
    w.db.seed('shops/s1', { ...(await w.db.get('shops/s1'))!.data, name: '<script>alert(1)</script>' });
    const { invId } = await confirmed(w, 100);
    const page = await w.call('GET', `/invoices/${invId}/print`, { token: T(w, 'so1') });
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(page.body).toContain('dir="rtl"');
    expect(page.body).toContain('100.00 ₪');
    expect(page.body).not.toContain('<script>alert');
    const st = await w.call('GET', '/shops/s1/statement/print', { token: T(w, 'acc') });
    expect(st.body).toContain('كشف حساب');
    expect(st.body).toContain('فاتورة');
    expect(esc(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    expect(invoiceHtml({ status: 'void', items: [], totals: {}, total: 0, paid: 0, remaining: 0, issuedAt: 0 })).toContain('(ملغاة)');
  });
  it('Cron التسوية اليومي يلتقط الطلبات المسددة', async () => {
    const w = fin();
    const { id, invId } = await confirmed(w, 100);
    await deliver(w, id);
    await w.db.commit([{ kind: 'update', path: `invoices/${invId}`, data: { remaining: 0, paid: 10000, status: 'paid' } }]);
    expect(await settleSweep(w.s)).toBe(1);
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('financially_completed');
    expect(await settleSweep(w.s)).toBe(0);
  });
  it('التحصيل الكامل عند التسليم يسوّي الطلب فوراً', async () => {
    const w = fin();
    const { id } = await confirmed(w, 100);
    await deliver(w, id, 10000);
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('delivered');
    expect(await settleSweep(w.s)).toBe(1);
  });
});
