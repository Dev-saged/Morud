import { defaultUnit, type Product } from './catalog';
import { normalizeArabic, matches } from './search';

/**
 * الطلب السريع: صاحب المحل يكتب كما يتكلم — «10 سمك بوري، كرتونتين جبنة، نص كيلو زعتر» —
 * فيُفهم كل سطر: الكمية، والوحدة (المذكورة أو الافتراضية للصنف)، والصنف.
 * «10 سمك» = 10 كغ لأن وحدة السمك الافتراضية الكيلو، و«2 جبنة» = 2 كرتونة.
 */
export interface QuickLine {
  text: string;
  productId: string;
  unitId: string;
  qtyMilli: number;
  /** الوحدة لم تُكتب فاستُخدمت الوحدة الافتراضية للصنف */
  assumedUnit: boolean;
}
export interface QuickProblem {
  text: string;
  reason: 'NOT_FOUND' | 'AMBIGUOUS' | 'UNIT_NOT_SOLD' | 'UNAVAILABLE' | 'FRACTION_NOT_ALLOWED';
  candidates?: string[];
  unitId?: string;
}
export interface QuickResult {
  lines: QuickLine[];
  problems: QuickProblem[];
}

const NUMBER_WORDS: Record<string, number> = {
  واحد: 1, وحده: 1, اثنين: 2, اتنين: 2, ثنتين: 2, اثنان: 2, ثلاث: 3, ثلاثه: 3, تلات: 3, تلاته: 3, اربع: 4, اربعه: 4,
  خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثماني: 8, ثمانيه: 8, تمن: 8, تمنيه: 8, تسع: 9, تسعه: 9,
  عشر: 10, عشره: 10, عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50, ميه: 100, مايه: 100, مئه: 100,
};
const FRACTION_WORDS: Record<string, number> = { نص: 500, نصف: 500, ربع: 250 };

/** كلمة الوحدة (بعد التطبيع) ← معرّف الوحدة؛ صيغة المثنى تُفهم «×2». */
const UNIT_WORDS: Record<string, string> = {
  كيلو: 'kg', كيلوغرام: 'kg', كيلوجرام: 'kg', كغ: 'kg', كجم: 'kg', كيلوات: 'kg', كيلوهات: 'kg',
  غرام: 'g', جرام: 'g', غم: 'g',
  لتر: 'liter', لترات: 'liter', لتره: 'liter',
  كرتونه: 'carton', كرتون: 'carton', كراتين: 'carton', كرتونات: 'carton',
  علبه: 'box', علب: 'box', علبات: 'box',
  حبه: 'piece', حبات: 'piece', حب: 'piece', قطعه: 'piece', قطع: 'piece',
  كيس: 'bag', اكياس: 'bag',
  شوال: 'sack', شوالات: 'sack', شواله: 'sack',
  دسته: 'dozen', دست: 'dozen', دزينه: 'dozen',
  عبوه: 'pack', عبوات: 'pack', باكيت: 'pack', باكيتات: 'pack', باكو: 'pack', ربطه: 'pack',
  جالون: 'gallon', جالونات: 'gallon', جلن: 'gallon',
};
const DUAL: Record<string, string> = { كرتونتين: 'carton', علبتين: 'box', كيسين: 'bag', حبتين: 'piece', كيلوين: 'kg', شوالين: 'sack', دستتين: 'dozen', عبوتين: 'pack', جالونين: 'gallon', لترين: 'liter' };
const FRACTION_UNITS: Record<string, string> = { نص_كيلو: 'half_kg', نصف_كيلو: 'half_kg', ربع_كيلو: 'quarter_kg' };
const FILLER = new Set(['من', 'و', 'الى', 'لو', 'سمحت', 'بدي', 'بدنا', 'اريد', 'نريد', 'اعطيني', 'هات', 'كمان', 'ايضا', 'تبع', 'نوع']);

export function splitOrder(text: string): string[] {
  return text.split(/[\n،,؛;+]|(?:\s+و\s+)/).map((s) => s.trim()).filter(Boolean);
}

interface Parsed { qtyMilli: number | null; unitId: string | null; words: string[] }

export function parseSegment(segment: string): Parsed {
  const tokens = normalizeArabic(segment.replace(/(\d)[.٫](\d)/g, '$1DOT$2').replace(/(\d)\/(\d)/g, '$1SLASH$2')).split(' ').filter(Boolean)
    .map((t) => t.replace(/dot/g, '.').replace(/slash/g, '/'));
  let qty: number | null = null;
  let unit: string | null = null;
  const words: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const pair = i + 1 < tokens.length ? `${t}_${tokens[i + 1]}` : '';
    if (pair && FRACTION_UNITS[pair]) { unit = FRACTION_UNITS[pair]!; qty ??= 1000; i++; continue; }
    if (/^\d+(\.\d{1,3})?$/.test(t)) { qty = Math.round(Number(t) * 1000); continue; }
    if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); if (b) qty = Math.round((a! / b) * 1000); continue; }
    if (DUAL[t]) { unit = DUAL[t]!; qty = 2000; continue; }
    if (UNIT_WORDS[t]) { unit = UNIT_WORDS[t]!; continue; }
    if (NUMBER_WORDS[t] !== undefined) { qty = (qty && qty % 1000 === 0 && qty < 10000 && NUMBER_WORDS[t]! >= 20 ? qty : 0) + NUMBER_WORDS[t]! * 1000; continue; }
    if (FRACTION_WORDS[t] !== undefined) { qty = (qty ?? 0) + FRACTION_WORDS[t]!; continue; }
    if (FILLER.has(t)) continue;
    words.push(t);
  }
  return { qtyMilli: qty, unitId: unit, words };
}

/** أفضل صنف لكلمات السطر: كل الكلمات تطابق، ثم الأقرب اسماً (أقل كلمات زائدة). */
export function findProduct(words: string[], products: readonly Product[]): { product?: Product; candidates: Product[] } {
  if (words.length === 0) return { candidates: [] };
  const q = words.join(' ');
  let hits = products.filter((p) => !p.archived && p.visible && matches(q, p));
  if (hits.length === 0) {
    // تسامح: صيغة جمع أو كلمة زائدة — طابق أغلب الكلمات
    const scored = products.filter((p) => !p.archived && p.visible).map((p) => ({ p, n: words.filter((w) => matches(w, p)).length })).filter((x) => x.n > 0 && x.n >= Math.ceil(words.length / 2));
    const best = Math.max(0, ...scored.map((x) => x.n));
    hits = scored.filter((x) => x.n === best).map((x) => x.p);
  }
  if (hits.length <= 1) return { product: hits[0], candidates: hits };
  const extra = (p: Product) => normalizeArabic(p.name).split(' ').length - words.length;
  const exact = hits.filter((p) => normalizeArabic(p.name) === q || p.altNames.some((a) => normalizeArabic(a) === q));
  if (exact.length === 1) return { product: exact[0], candidates: hits };
  const sorted = [...hits].sort((a, b) => extra(a) - extra(b));
  if (extra(sorted[0]!) < extra(sorted[1]!)) return { product: sorted[0], candidates: hits };
  return { candidates: sorted.slice(0, 5) };
}

export function parseQuickOrder(text: string, products: readonly Product[]): QuickResult {
  const out: QuickResult = { lines: [], problems: [] };
  for (const seg of splitOrder(text)) {
    const parsed = parseSegment(seg);
    const { product, candidates } = findProduct(parsed.words, products);
    if (!product) {
      out.problems.push(candidates.length > 1 ? { text: seg, reason: 'AMBIGUOUS', candidates: candidates.map((c) => c.id) } : { text: seg, reason: 'NOT_FOUND' });
      continue;
    }
    if (!product.available) { out.problems.push({ text: seg, reason: 'UNAVAILABLE', candidates: [product.id] }); continue; }
    const assumed = parsed.unitId === null;
    const unit = assumed ? defaultUnit(product) : product.units.find((u) => u.unitId === parsed.unitId);
    if (!unit) { out.problems.push({ text: seg, reason: 'UNIT_NOT_SOLD', candidates: [product.id], unitId: parsed.unitId! }); continue; }
    const qty = parsed.qtyMilli ?? Math.max(unit.minQtyMilli, 1000);
    if (!unit.allowFraction && qty % 1000 !== 0) { out.problems.push({ text: seg, reason: 'FRACTION_NOT_ALLOWED', candidates: [product.id], unitId: unit.unitId }); continue; }
    const existing = out.lines.find((l) => l.productId === product.id && l.unitId === unit.unitId);
    if (existing) existing.qtyMilli += qty;
    else out.lines.push({ text: seg, productId: product.id, unitId: unit.unitId, qtyMilli: qty, assumedUnit: assumed });
  }
  return out;
}
