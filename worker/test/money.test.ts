import { describe, expect, it } from 'vitest';
import { divRoundHalfUp, formatMoney, lineTotal, parseMoney, percentOf, sum, assertAgorot } from '../src/domain/money';
import { formatQty, parseQty, validateQty } from '../src/domain/quantity';

describe('المال', () => {
  it('إجمالي السطر بالأغورة بتقريب نصف للأعلى', () => {
    expect(lineTotal(1000, 800)).toBe(800);
    expect(lineTotal(1500, 4500)).toBe(6750);
    expect(lineTotal(333, 100)).toBe(33);
    expect(lineTotal(335, 100)).toBe(34); // 33.5 → 34
  });
  it('التقريب تماثلي للسالب ويرفض المقام غير الموجب', () => {
    expect(divRoundHalfUp(-335, 10)).toBe(-34);
    expect(() => divRoundHalfUp(1, 0)).toThrow();
  });
  it('النسبة بنقاط الأساس', () => {
    expect(percentOf(10000, 1000)).toBe(1000);
    expect(percentOf(999, 1500)).toBe(150);
    expect(() => percentOf(100, 10001)).toThrow();
  });
  it('يرفض الكسور والأعداد غير الآمنة', () => {
    expect(() => assertAgorot(1.5)).toThrow();
    expect(() => lineTotal(Number.MAX_SAFE_INTEGER, 10)).toThrow();
    expect(sum([100, 250, -50])).toBe(300);
  });
  it('العرض والتحويل', () => {
    expect(formatMoney(1250)).toBe('12.50 ₪');
    expect(formatMoney(123456789)).toBe('1,234,567.89 ₪');
    expect(formatMoney(-5)).toBe('-0.05 ₪');
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('-3')).toBe(-300);
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('الكميات (SRS 3.4)', () => {
  const count = { allowFraction: false, minQtyMilli: 1000, stepMilli: 1000 };
  const weight = { allowFraction: true, minQtyMilli: 250, stepMilli: 250, maxQtyMilli: 50_000 };
  it('لا صفر ولا سالب', () => {
    expect(validateQty(0, count)).toMatchObject({ ok: false, code: 'QTY_NOT_POSITIVE' });
    expect(validateQty(-1000, count)).toMatchObject({ ok: false, code: 'QTY_NOT_POSITIVE' });
    expect(validateQty(1.5, count)).toMatchObject({ ok: false, code: 'QTY_INVALID' });
  });
  it('الكسور للوزن فقط', () => {
    expect(validateQty(1500, count)).toMatchObject({ ok: false, code: 'QTY_FRACTION_NOT_ALLOWED' });
    expect(validateQty(1500, weight)).toMatchObject({ ok: true, value: 1500 });
  });
  it('الحد الأدنى والخطوة والحد الأعلى', () => {
    expect(validateQty(125, { ...weight, minQtyMilli: 100 })).toMatchObject({ code: 'QTY_STEP' });
    expect(validateQty(200, weight)).toMatchObject({ code: 'QTY_BELOW_MIN' });
    expect(validateQty(51_000, weight)).toMatchObject({ code: 'QTY_ABOVE_MAX' });
  });
  it('تحويل الإدخال والعرض بالأرقام العربية', () => {
    expect(parseQty('١٫٥')).toBe(1500);
    expect(parseQty('12')).toBe(12000);
    expect(parseQty('0.25')).toBe(250);
    expect(parseQty('1.2345')).toBeNull();
    expect(formatQty(1500)).toBe('1.5');
    expect(formatQty(12000)).toBe('12');
    expect(formatQty(250)).toBe('0.25');
  });
});
