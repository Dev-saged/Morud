// ترقيم متسلسل فريد: MW-O-2026-000123 للطلبات و MW-I-2026-000045 للفواتير و MW-P للدفعات
export type Series = 'O' | 'I' | 'P' | 'C';

export function formatNumber(series: Series, year: number, seq: number): string {
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new RangeError('رقم تسلسلي غير صالح');
  return `MW-${series}-${year}-${String(seq).padStart(6, '0')}`;
}

export function parseNumber(s: string): { series: Series; year: number; seq: number } | null {
  const m = /^MW-([OIPC])-(\d{4})-(\d{6,})$/.exec(s);
  return m ? { series: m[1] as Series, year: Number(m[2]), seq: Number(m[3]) } : null;
}
