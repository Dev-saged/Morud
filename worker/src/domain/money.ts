// المال بالأغورة (عدد صحيح) والكمية بالألف (qtyMilli). لا float في أي حساب مالي.
export type Agorot = number;

export function assertAgorot(v: number, name = 'amount'): Agorot {
  if (!Number.isSafeInteger(v)) throw new RangeError(`${name} يجب أن يكون عدداً صحيحاً بالأغورة`);
  return v;
}

// تقريب نصف للأعلى لقسمة صحيحة موجبة أو سالبة (تماثلي حول الصفر)
export function divRoundHalfUp(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) throw new RangeError('قسمة غير صالحة');
  const sign = n < 0 ? -1 : 1;
  const a = Math.abs(n);
  return sign * Math.floor((a * 2 + d) / (d * 2));
}

// إجمالي سطر = الكمية × سعر الوحدة
export function lineTotal(qtyMilli: number, unitPrice: Agorot): Agorot {
  assertAgorot(qtyMilli, 'qtyMilli');
  assertAgorot(unitPrice, 'unitPrice');
  const product = qtyMilli * unitPrice;
  if (!Number.isSafeInteger(product)) throw new RangeError('تجاوز حدود الحساب');
  return divRoundHalfUp(product, 1000);
}

// نسبة بنقاط الأساس (10000 = 100%)
export function percentOf(amount: Agorot, basisPoints: number): Agorot {
  assertAgorot(amount);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new RangeError('نسبة غير صالحة');
  return divRoundHalfUp(amount * basisPoints, 10000);
}

export function sum(values: readonly Agorot[]): Agorot {
  let t = 0;
  for (const v of values) t += assertAgorot(v);
  return assertAgorot(t, 'sum');
}

// عرض: 1250 → "12.50 ₪"
export function formatMoney(a: Agorot, symbol = '₪'): string {
  assertAgorot(a);
  const abs = Math.abs(a);
  const grouped = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${a < 0 ? '-' : ''}${grouped}.${String(abs % 100).padStart(2, '0')} ${symbol}`;
}

// تحويل نص عشري صارم إلى أغورة: "12.5" → 1250
export function parseMoney(s: string): Agorot | null {
  const m = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -v : v;
}
