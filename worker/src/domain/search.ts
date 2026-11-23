// تطبيع عربي للبحث: الهمزات، التاء المربوطة، الألف المقصورة، التشكيل، التطويل، الأرقام
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface Searchable {
  name: string;
  altNames: string[];
  brand?: string;
  sku: string;
  barcodes: string[];
}

/** مفاتيح البحث المخزّنة مع المنتج (array-contains): كل كلمة وبادئاتها من حرفين فأكثر. */
export function searchKeys(p: Searchable, maxKeys = 200): string[] {
  const keys = new Set<string>();
  const words = [p.name, ...p.altNames, p.brand ?? ''].flatMap((s) => normalizeArabic(s).split(' ')).filter(Boolean);
  for (const w of words) for (let i = 2; i <= Math.min(w.length, 15); i++) keys.add(w.slice(0, i));
  for (const code of [p.sku, ...p.barcodes]) {
    const c = normalizeArabic(code).replace(/ /g, '');
    if (c) keys.add(c);
  }
  return [...keys].slice(0, maxKeys);
}

// المنتج يُطبَّع مرة واحدة (كائنات الكتالوج ثابتة حتى التحديث) والاستعلام يُطبَّع مرة لكل كتابة لا لكل منتج
const prepared = new WeakMap<Searchable, { hay: string[]; codes: string[] }>();
let lastQuery = '';
let lastTerms: string[] = [];

function prep(p: Searchable) {
  let r = prepared.get(p);
  if (!r) {
    r = {
      hay: [p.name, ...p.altNames, p.brand ?? ''].flatMap((s) => normalizeArabic(s).split(' ')).filter(Boolean),
      codes: [p.sku, ...p.barcodes].map((c) => normalizeArabic(c).replace(/ /g, '')).filter(Boolean),
    };
    prepared.set(p, r);
  }
  return r;
}

/** مطابقة محلية (أندرويد/ويب offline): كل كلمات الاستعلام يجب أن تبدأ بها كلمة من المنتج أو تطابق الرمز. */
export function matches(query: string, p: Searchable): boolean {
  if (query !== lastQuery) { lastQuery = query; lastTerms = normalizeArabic(query).split(' ').filter(Boolean); }
  const q = lastTerms;
  if (q.length === 0) return true;
  const { hay, codes } = prep(p);
  const whole = q.join('');
  if (codes.some((c) => c.startsWith(whole))) return true;
  return q.every((t) => hay.some((w) => w.startsWith(t)) || codes.some((c) => c === t || c.startsWith(t)));
}
