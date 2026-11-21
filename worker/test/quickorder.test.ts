import { describe, expect, it } from 'vitest';
import { defaultUnit, validateProduct, type Product } from '../src/domain/catalog';
import { parseQuickOrder, parseSegment, splitOrder } from '../src/domain/quickorder';

const u = (unitId: string, price: number, factorToBase = 1000, allowFraction = false) => ({ unitId, factorToBase, price, minQtyMilli: 1000, stepMilli: allowFraction ? 250 : 1000, allowFraction });
const p = (id: string, name: string, units: Product['units'], extra: Partial<Product> = {}): Product => ({ id, name, altNames: [], sku: id.toUpperCase(), barcodes: [], categoryId: 'x', baseUnitId: units[0]!.unitId, units, available: true, visible: true, ...extra });

const catalog: Product[] = [
  p('fish', 'سمك بوري مجمد', [{ ...u('kg', 2800, 1000, true), minQtyMilli: 500 }, u('carton', 25000, 10000)], { defaultUnitId: 'kg', altNames: ['اسماك', 'بوري'] }),
  p('tilapia', 'سمك بلطي مجمد', [{ ...u('kg', 1800, 1000, true), minQtyMilli: 500 }], { defaultUnitId: 'kg', altNames: ['بلطي'] }),
  p('feta', 'جبنة بيضاء فيتا', [u('box', 900), u('carton', 10000, 12000)], { defaultUnitId: 'carton', altNames: ['جبنه', 'جبن'] }),
  p('zaatar', 'زعتر بلدي', [{ ...u('kg', 3000, 1000, true), minQtyMilli: 250 }, u('half_kg', 1600, 500), u('quarter_kg', 850, 250)], { defaultUnitId: 'kg' }),
  p('cola', 'مشروب غازي كولا 330 مل', [u('carton', 4200, 24000), u('piece', 200)], { defaultUnitId: 'carton', altNames: ['كولا', 'بيبسي'] }),
  p('gone', 'زيت ذرة', [u('carton', 9000)], { available: false }),
];

describe('الطلب السريع الذكي', () => {
  it('«10 سمك بوري» = 10 كغ لأن وحدة السمك الافتراضية الكيلو', () => {
    const r = parseQuickOrder('10 سمك بوري', catalog);
    expect(r.lines).toEqual([{ text: '10 سمك بوري', productId: 'fish', unitId: 'kg', qtyMilli: 10000, assumedUnit: true }]);
  });
  it('«2 جبنة» = 2 كرتونة، و«3 علب جبنة» = 3 علب', () => {
    const r = parseQuickOrder('2 جبنة\n3 علب جبنة', catalog);
    expect(r.lines.map((l) => [l.productId, l.unitId, l.qtyMilli, l.assumedUnit])).toEqual([['feta', 'carton', 2000, true], ['feta', 'box', 3000, false]]);
  });
  it('الأرقام العربية والكلمات والمثنى والكسور', () => {
    const r = parseQuickOrder('٥ كيلو بلطي، كرتونتين كولا، نص كيلو زعتر، خمسه حبات كولا، 1.5 كيلو بوري', catalog);
    expect(r.lines.map((l) => [l.productId, l.unitId, l.qtyMilli])).toEqual([
      ['tilapia', 'kg', 5000], ['cola', 'carton', 2000], ['zaatar', 'half_kg', 1000], ['cola', 'piece', 5000], ['fish', 'kg', 1500],
    ]);
  });
  it('بلا رقم = الحد الأدنى بالوحدة الافتراضية، وتكرار الصنف يُجمع', () => {
    const r = parseQuickOrder('بدي جبنة و 2 جبنة', catalog);
    expect(r.lines).toEqual([{ text: 'بدي جبنة', productId: 'feta', unitId: 'carton', qtyMilli: 3000, assumedUnit: true }]);
  });
  it('الجمع والاسم البديل: «اسماك» تطابق البوري لا البلطي', () => {
    expect(parseQuickOrder('4 اسماك', catalog).lines[0]).toMatchObject({ productId: 'fish', qtyMilli: 4000 });
  });
  it('المشاكل: غير موجود، ملتبس، وحدة غير مباعة، غير متوفر، كسر غير مسموح', () => {
    const r = parseQuickOrder('3 تفاح، 2 سمك، 4 شوال كولا، زيت ذرة، 1.5 كرتونة جبنة', catalog);
    expect(r.lines).toEqual([]);
    expect(r.problems.map((x) => x.reason)).toEqual(['NOT_FOUND', 'AMBIGUOUS', 'UNIT_NOT_SOLD', 'UNAVAILABLE', 'FRACTION_NOT_ALLOWED']);
    expect(r.problems[1]!.candidates).toEqual(expect.arrayContaining(['fish', 'tilapia']));
  });
  it('التقسيم والتحليل', () => {
    expect(splitOrder('أ، ب\nج و د;ه')).toEqual(['أ', 'ب', 'ج', 'د', 'ه']);
    expect(parseSegment('عشرين كيلو بطاطا')).toEqual({ qtyMilli: 20000, unitId: 'kg', words: ['بطاطا'] });
    expect(parseSegment('3/4 كيلو جبنه')).toEqual({ qtyMilli: 750, unitId: 'kg', words: ['جبنه'] });
    expect(parseSegment('ربع كيلو زعتر')).toEqual({ qtyMilli: 1000, unitId: 'quarter_kg', words: ['زعتر'] });
  });
  it('الوحدة الافتراضية: المحددة أو أول وحدة، ويجب أن تكون من وحدات البيع', () => {
    expect(defaultUnit(catalog[2]!)!.unitId).toBe('carton');
    expect(defaultUnit({ units: [u('box', 1)] })!.unitId).toBe('box');
    const units = new Map([['box', { id: 'box', name: 'علبة', kind: 'count' as const, allowFraction: false }]]);
    expect(validateProduct(p('a', 'أ', [u('box', 100)], { defaultUnitId: 'kg' }), units)).toContain('DEFAULT_UNIT_MISSING');
  });
});
