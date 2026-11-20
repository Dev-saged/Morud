import { describe, expect, it } from 'vitest';
import { validateProduct } from '../src/domain/catalog';
import { detectPriceChange, priceCart } from '../src/domain/pricing';
import { applyPromotions, isLive } from '../src/domain/promotions';
import { NOW, feta, nuts, products, promo, unitNames } from './fixtures';

const units = new Map([
  ['box', { id: 'box', name: 'علبة', kind: 'count' as const, allowFraction: false }],
  ['carton', { id: 'carton', name: 'كرتونة', kind: 'count' as const, allowFraction: false }],
  ['kg', { id: 'kg', name: 'كيلوغرام', kind: 'weight' as const, allowFraction: true }],
  ['half_kg', { id: 'half_kg', name: 'نصف كيلو', kind: 'weight' as const, allowFraction: false }],
]);

describe('تعريف المنتج', () => {
  it('منتج سليم بلا مشاكل', () => expect(validateProduct(feta, units)).toEqual([]));
  it('يكشف كل الأخطاء', () => {
    const bad = { ...feta, name: ' ', sku: '', baseUnitId: 'x', units: [
      { ...feta.units[0]!, price: 0, factorToBase: 0, minQtyMilli: 0 },
      { ...feta.units[0]!, allowFraction: true },
      { ...feta.units[0]!, unitId: 'zz' },
    ] };
    const p = validateProduct(bad, units);
    for (const c of ['NAME_REQUIRED', 'SKU_REQUIRED', 'PRICE_INVALID:box', 'FACTOR_INVALID:box', 'UNIT_DUPLICATE:box', 'FRACTION_NOT_ALLOWED:box', 'UNIT_UNKNOWN:zz', 'QTY_RULE_INVALID:box', 'BASE_UNIT_MISSING']) expect(p).toContain(c);
    expect(validateProduct({ ...feta, units: [] }, units)).toContain('UNITS_REQUIRED');
  });
});

describe('تسعير السلة على الخادم', () => {
  it('وحدات وأسعار مستقلة ولقطات كاملة', () => {
    const r = priceCart([{ productId: 'p-feta', unitId: 'carton', qtyMilli: 2000 }, { productId: 'p-nuts', unitId: 'kg', qtyMilli: 1500, note: 'محمص' }], products, unitNames, [], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lines[0]).toMatchObject({ name: 'جبنة فيتا', unitName: 'كرتونة', factorToBase: 12000, unitPrice: 9000, gross: 18000, total: 18000 });
    expect(r.value.lines[1]).toMatchObject({ gross: 6750, note: 'محمص' });
    expect(r.value).toMatchObject({ subtotal: 24750, discount: 0, total: 24750 });
  });
  it('يرفض غير المتوفر والوحدة غير المرتبطة والكمية والتكرار والمفقود', () => {
    const r = priceCart([
      { productId: 'p-broom', unitId: 'piece', qtyMilli: 1000 },
      { productId: 'p-feta', unitId: 'kg', qtyMilli: 1000 },
      { productId: 'p-feta', unitId: 'box', qtyMilli: 1500 },
      { productId: 'p-nuts', unitId: 'kg', qtyMilli: 1000 },
      { productId: 'p-nuts', unitId: 'kg', qtyMilli: 1000 },
      { productId: 'ghost', unitId: 'box', qtyMilli: 1000 },
    ], products, unitNames, [], NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const codes = (r.details!.problems as Array<{ code: string }>).map((p) => p.code);
    expect(codes).toEqual(['PRODUCT_UNAVAILABLE', 'UNIT_NOT_ALLOWED', 'QTY_FRACTION_NOT_ALLOWED', 'DUPLICATE_LINE', 'PRODUCT_NOT_FOUND']);
  });
  it('سلة فارغة أو ضخمة', () => {
    expect(priceCart([], products, unitNames, [], NOW)).toMatchObject({ code: 'CART_EMPTY' });
    const many = Array.from({ length: 301 }, () => ({ productId: 'p-feta', unitId: 'box', qtyMilli: 1000 }));
    expect(priceCart(many, products, unitNames, [], NOW)).toMatchObject({ code: 'CART_TOO_LARGE' });
  });
  it('تغيّر السعر قبل التأكيد يطلب الموافقة', () => {
    const r = priceCart([{ productId: 'p-feta', unitId: 'box', qtyMilli: 3000 }], products, unitNames, [], NOW);
    if (!r.ok) throw new Error();
    expect(detectPriceChange(2400, r.value).ok).toBe(true);
    expect(detectPriceChange(undefined, r.value).ok).toBe(true);
    expect(detectPriceChange(2100, r.value)).toMatchObject({ ok: false, code: 'PRICE_CHANGED' });
  });
  it('يستخدم معرّف الوحدة عند غياب اسمها', () => {
    const r = priceCart([{ productId: 'p-feta', unitId: 'box', qtyMilli: 1000 }], products, new Map(), [], NOW);
    expect(r.ok && r.value.lines[0]!.unitName).toBe('box');
  });
});

describe('العروض (SRS 10)', () => {
  const line = (over = {}) => ({ key: 'k', productId: 'p-feta', unitId: 'box', qtyMilli: 10_000, unitPrice: 800, gross: 8000, ...over });
  it('خصم نسبة وخصم ثابت على الصنف', () => {
    expect(applyPromotions([line()], [promo({ productIds: ['p-feta'], percentBp: 1000 })], NOW).get('k')?.amount).toBe(800);
    expect(applyPromotions([line()], [promo({ type: 'item_amount', productIds: ['p-feta'], amountPerUnit: 50 })], NOW).get('k')?.amount).toBe(500);
    expect(applyPromotions([line()], [promo({ type: 'item_amount', productIds: ['p-feta'], amountPerUnit: 5000 })], NOW).get('k')?.amount).toBe(8000);
  });
  it('خصم الكمية فقط عند بلوغ الحد', () => {
    const p = promo({ type: 'qty_percent', productIds: ['p-feta'], percentBp: 500, minQtyMilli: 12_000 });
    expect(applyPromotions([line()], [p], NOW).size).toBe(0);
    expect(applyPromotions([line({ qtyMilli: 12_000, gross: 9600 })], [p], NOW).get('k')?.amount).toBe(480);
  });
  it('اشترِ 5 واحصل على 1', () => {
    const p = promo({ type: 'bxgy', productIds: ['p-feta'], buyQty: 5, getQty: 1 });
    expect(applyPromotions([line({ qtyMilli: 12_000, gross: 9600 })], [p], NOW).get('k')?.amount).toBe(1600);
    expect(applyPromotions([line()], [promo({ type: 'bxgy', productIds: ['p-feta'], buyQty: 0, getQty: 1 })], NOW).size).toBe(0);
  });
  it('مجموعة منتجات تُخصم فقط إذا اكتملت', () => {
    const p = promo({ type: 'bundle_percent', productIds: ['p-feta', 'p-nuts'], percentBp: 1000 });
    expect(applyPromotions([line()], [p], NOW).size).toBe(0);
    const both = [line(), line({ key: 'n', productId: 'p-nuts', unitId: 'kg', gross: 4500 })];
    expect(applyPromotions(both, [p], NOW).get('n')?.amount).toBe(450);
  });
  it('لا يطبق خارج الفترة أو بعد استنفاد الاستخدام أو دون الحد الأدنى أو على صنف غير مؤهل', () => {
    const base = { productIds: ['p-feta'], percentBp: 1000 };
    expect(applyPromotions([line()], [promo({ ...base, startsAt: NOW + 1 })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ ...base, endsAt: NOW })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ ...base, usageLimit: 3, usedCount: 3 })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ ...base, minPurchase: 9000 })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ ...base, active: false })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ ...base, unitIds: ['carton'] })], NOW).size).toBe(0);
    expect(applyPromotions([line()], [promo({ productIds: ['p-nuts'], percentBp: 1000 })], NOW).size).toBe(0);
    expect(isLive(promo({}), NOW)).toBe(true);
  });
  it('لا تكديس: أفضل عرض واحد للسطر', () => {
    const r = applyPromotions([line()], [promo({ id: 'a', productIds: ['p-feta'], percentBp: 500 }), promo({ id: 'b', productIds: ['p-feta'], percentBp: 1500 })], NOW);
    expect(r.get('k')).toMatchObject({ promotionId: 'b', amount: 1200 });
  });
  it('سقف الخصم يوزَّع على الأسطر', () => {
    const p = promo({ productIds: ['p-feta', 'p-nuts'], percentBp: 5000, maxDiscount: 5000 });
    const r = applyPromotions([line(), line({ key: 'n', productId: 'p-nuts', unitId: 'kg', gross: 4500 }), line({ key: 'z', productId: 'p-nuts', unitId: 'half_kg', gross: 4600 })], [p], NOW);
    expect(r.get('k')?.amount).toBe(4000);
    expect(r.get('n')?.amount).toBe(1000);
    expect(r.has('z')).toBe(false);
  });
  it('العرض يدخل في تسعير السلة ويحفظ اسمه', () => {
    const r = priceCart([{ productId: 'p-feta', unitId: 'box', qtyMilli: 10_000 }], products, unitNames, [promo({ id: 'w', name: 'عرض الألبان', productIds: ['p-feta'], percentBp: 1000 })], NOW);
    expect(r.ok && r.value).toMatchObject({ subtotal: 8000, discount: 800, total: 7200, lines: [{ promotionId: 'w', promotionName: 'عرض الألبان' }] });
    expect(nuts.units.length).toBe(2);
  });
});
