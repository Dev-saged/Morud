import { describe, expect, it } from 'vitest';
import { allocatePayment, balance, cancellationEntries, creditCheck, invoiceStatus, reverseEntry, statement, type LedgerEntry } from '../src/domain/ledger';
import { priceCart } from '../src/domain/pricing';
import { MemoryIdempotencyStore, once, validKey } from '../src/domain/idempotency';
import { formatNumber, parseNumber } from '../src/domain/numbering';
import { NOW, products, unitNames } from './fixtures';

let n = 0;
const id = () => `e${++n}`;
const entry = (type: LedgerEntry['type'], amount: number, at = NOW): LedgerEntry => ({ id: id(), shopId: 's1', type, amount, at });

describe('سيناريوهات SRS 19.3 المالية', () => {
  it('1) طلب 100 ودفع 60 → متبقي 40', () => {
    const ledger = [entry('invoice', 10000), entry('payment', -6000)];
    expect(balance(ledger)).toBe(4000);
    const a = allocatePayment(6000, [{ id: 'i1', remaining: 10000, issuedAt: NOW }]);
    expect(a.ok && a.value).toEqual({ allocations: [{ invoiceId: 'i1', amount: 6000 }], unallocated: 0 });
    expect(invoiceStatus(10000, 6000)).toBe('partial');
  });
  it('2) دين 100 ودفع 150 → رصيد دائن 50', () => {
    const ledger = [entry('invoice', 10000), entry('payment', -15000)];
    expect(balance(ledger)).toBe(-5000);
    const a = allocatePayment(15000, [{ id: 'i1', remaining: 10000, issuedAt: NOW }]);
    expect(a.ok && a.value.unallocated).toBe(5000);
    expect(statement(ledger, 0, NOW + 1)).toMatchObject({ closing: -5000, due: 0, creditBalance: 5000 });
  });
  it('3) فاتورة 200 ثم تعديل السعر → الفاتورة تبقى 200', () => {
    const catalog = new Map(products);
    const r = priceCart([{ productId: 'p-feta', unitId: 'box', qtyMilli: 25_000 }], catalog, unitNames, [], NOW);
    if (!r.ok) throw new Error();
    const invoice = structuredClone(r.value);
    expect(invoice.total).toBe(20000);
    const feta = catalog.get('p-feta')!;
    catalog.set('p-feta', { ...feta, units: feta.units.map((u) => ({ ...u, price: u.price * 2 })) });
    expect(invoice.total).toBe(20000);
    expect(invoice.lines[0]!.unitPrice).toBe(800);
    const again = priceCart([{ productId: 'p-feta', unitId: 'box', qtyMilli: 25_000 }], catalog, unitNames, [], NOW);
    expect(again.ok && again.value.total).toBe(40000);
  });
  it('4) إرسال الطلب مرتين بسبب ضعف النت → طلب واحد', async () => {
    const store = new MemoryIdempotencyStore();
    let created = 0;
    const submit = () => once(store, 'k-0123456789abcdef', async () => ({ orderId: `o${++created}` }));
    const a = await submit();
    const b = await submit();
    expect(created).toBe(1);
    expect(b).toEqual({ value: a.value, replayed: true });
    expect(validKey('short')).toBe(false);
    expect(validKey(null)).toBe(false);
    expect(validKey('0123456789abcdef-ok')).toBe(true);
  });
  it('5) إلغاء طلب بعد تسجيل دفعة → معالجة صحيحة دون ضياع الحركة الأصلية', () => {
    const inv = entry('invoice', 10000);
    const pay = entry('payment', -6000);
    const keep = cancellationEntries({ shopId: 's1', invoiceId: 'i1', invoiceTotal: 10000, paid: 6000, mode: 'keep_credit', ids: id, at: NOW, reason: 'نفاد الكمية' });
    if (!keep.ok) throw new Error();
    const ledger = [inv, pay, ...keep.value];
    expect(ledger).toContain(inv);
    expect(ledger).toContain(pay);
    expect(balance(ledger)).toBe(-6000); // المدفوع صار رصيداً دائناً للمحل
    const refund = cancellationEntries({ shopId: 's1', invoiceId: 'i1', invoiceTotal: 10000, paid: 6000, mode: 'refund', ids: id, at: NOW, reason: 'نفاد الكمية' });
    if (!refund.ok) throw new Error();
    expect(balance([inv, pay, ...refund.value])).toBe(0);
    expect(cancellationEntries({ shopId: 's1', invoiceId: 'i1', invoiceTotal: 1, paid: 0, mode: 'refund', ids: id, at: NOW, reason: '' })).toMatchObject({ code: 'REASON_REQUIRED' });
    const noPaid = cancellationEntries({ shopId: 's1', invoiceId: 'i1', invoiceTotal: 100, paid: 0, mode: 'refund', ids: id, at: NOW, reason: 'سبب' });
    expect(noPaid.ok && noPaid.value.length).toBe(1);
  });
});

describe('الدفتر', () => {
  it('عكس حركة مرة واحدة فقط وبسبب', () => {
    const pay = { ...entry('payment', -5000), ref: { kind: 'payment' as const, id: 'p1' } };
    const rev = reverseEntry(pay, [pay], 'r1', NOW, 'دفعة مسجلة بالخطأ');
    expect(rev.ok && rev.value).toMatchObject({ type: 'reversal', amount: 5000, reversesId: pay.id, ref: { id: 'p1' } });
    if (!rev.ok) return;
    expect(reverseEntry(pay, [pay, rev.value], 'r2', NOW, 'مرة ثانية')).toMatchObject({ code: 'ALREADY_REVERSED' });
    expect(reverseEntry(rev.value, [pay, rev.value], 'r3', NOW, 'عكس العكس')).toMatchObject({ code: 'CANNOT_REVERSE_REVERSAL' });
    expect(reverseEntry(entry('invoice', 1), [], 'r4', NOW, ' ')).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(balance([pay, rev.value])).toBe(0);
  });
  it('التخصيص للأقدم أولاً أو لفاتورة محددة', () => {
    const invs = [{ id: 'b', remaining: 3000, issuedAt: NOW + 10 }, { id: 'a', remaining: 2000, issuedAt: NOW }, { id: 'c', remaining: 0, issuedAt: NOW - 5 }];
    expect(allocatePayment(4000, invs)).toMatchObject({ value: { allocations: [{ invoiceId: 'a', amount: 2000 }, { invoiceId: 'b', amount: 2000 }], unallocated: 0 } });
    expect(allocatePayment(1000, invs, 'b')).toMatchObject({ value: { allocations: [{ invoiceId: 'b', amount: 1000 }] } });
    expect(allocatePayment(1000, invs, 'c')).toMatchObject({ code: 'INVOICE_NOT_OPEN' });
    expect(allocatePayment(0, invs)).toMatchObject({ code: 'AMOUNT_NOT_POSITIVE' });
    expect(allocatePayment(500, [])).toMatchObject({ value: { allocations: [], unallocated: 500 } });
  });
  it('حالة الفاتورة', () => {
    expect(invoiceStatus(100, 0)).toBe('open');
    expect(invoiceStatus(100, 100)).toBe('paid');
    expect(invoiceStatus(100, 100, true)).toBe('void');
  });
  it('كشف الحساب برصيد افتتاحي وتراكمي', () => {
    const l = [{ ...entry('opening', 1000, NOW - 100) }, entry('invoice', 5000, NOW), entry('payment', -2000, NOW + 1), entry('invoice', 9, NOW + 99)];
    const s = statement(l, NOW, NOW + 50);
    expect(s).toMatchObject({ opening: 1000, debit: 5000, credit: 2000, closing: 4000, due: 4000, creditBalance: 0 });
    expect(s.rows.map((r) => r.running)).toEqual([6000, 4000]);
  });
});

describe('الحد الائتماني (SRS 9.5)', () => {
  const base = { method: 'credit', enabled: true, limit: 100000, balance: 50000, orderTotal: 10000, blocksDeferred: true, warnPercent: 80 };
  it('النقدي لا يُرفض أبداً', () => expect(creditCheck({ ...base, method: 'cash', balance: 999999 }).decision).toBe('ok'));
  it('الحد غير مفعّل', () => expect(creditCheck({ ...base, enabled: false, balance: 999999 }).decision).toBe('ok'));
  it('ضمن الحد، اقتراب، تجاوز', () => {
    expect(creditCheck(base)).toEqual({ decision: 'ok', available: 50000 });
    expect(creditCheck({ ...base, orderTotal: 35000 }).decision).toBe('warn');
    expect(creditCheck({ ...base, orderTotal: 60000 }).decision).toBe('block');
    expect(creditCheck({ ...base, orderTotal: 60000, blocksDeferred: false }).decision).toBe('warn');
  });
});

describe('الترقيم', () => {
  it('صيغة ثابتة قابلة للتحليل', () => {
    expect(formatNumber('O', 2026, 123)).toBe('MW-O-2026-000123');
    expect(parseNumber('MW-I-2026-000045')).toEqual({ series: 'I', year: 2026, seq: 45 });
    expect(parseNumber('X-1')).toBeNull();
    expect(() => formatNumber('P', 2026, 0)).toThrow();
  });
});
