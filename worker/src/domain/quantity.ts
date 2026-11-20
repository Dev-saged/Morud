import { err, ok, type Result } from './result';

export interface UnitRule {
  allowFraction: boolean;
  minQtyMilli: number; // الحد الأدنى للطلب
  stepMilli: number; // خطوة الزيادة (1000 = واحد صحيح)
  maxQtyMilli?: number;
}

// "1.5" → 1500 ؛ يقبل الأرقام العربية الهندية
export function parseQty(input: string): number | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace('٫', '.');
  const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0'));
}

export function validateQty(qtyMilli: number, rule: UnitRule): Result<number> {
  if (!Number.isSafeInteger(qtyMilli)) return err('QTY_INVALID', 'الكمية غير صالحة');
  if (qtyMilli <= 0) return err('QTY_NOT_POSITIVE', 'الكمية يجب أن تكون أكبر من صفر');
  if (!rule.allowFraction && qtyMilli % 1000 !== 0) return err('QTY_FRACTION_NOT_ALLOWED', 'هذا الصنف يُباع بالعدد الصحيح فقط');
  if (qtyMilli < rule.minQtyMilli) return err('QTY_BELOW_MIN', 'الكمية أقل من الحد الأدنى للطلب', { minQtyMilli: rule.minQtyMilli });
  if (rule.stepMilli > 0 && qtyMilli % rule.stepMilli !== 0) return err('QTY_STEP', 'الكمية لا تطابق خطوة البيع', { stepMilli: rule.stepMilli });
  if (rule.maxQtyMilli !== undefined && qtyMilli > rule.maxQtyMilli) return err('QTY_ABOVE_MAX', 'الكمية تتجاوز الحد المسموح', { maxQtyMilli: rule.maxQtyMilli });
  return ok(qtyMilli);
}

// عرض: 1500 → "1.5" ، 12000 → "12"
export function formatQty(qtyMilli: number): string {
  const whole = Math.trunc(qtyMilli / 1000);
  const frac = Math.abs(qtyMilli % 1000);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}
