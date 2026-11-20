import { findUnit, type Product } from './catalog';
import { lineTotal, type Agorot } from './money';
import { applyPromotions, type Promotion } from './promotions';
import { validateQty } from './quantity';
import { err, ok, type Result } from './result';

export interface CartItem {
  productId: string;
  unitId: string;
  qtyMilli: number;
  note?: string;
}

// لقطة ثابتة تُحفظ في الطلب والفاتورة؛ تغيير السعر لاحقاً لا يمسّها
export interface OrderLine {
  productId: string;
  name: string;
  sku: string;
  unitId: string;
  unitName: string;
  factorToBase: number;
  qtyMilli: number;
  unitPrice: Agorot;
  gross: Agorot;
  discount: Agorot;
  promotionId?: string;
  promotionName?: string;
  total: Agorot;
  note?: string;
}

export interface PricedCart {
  lines: OrderLine[];
  subtotal: Agorot;
  discount: Agorot;
  total: Agorot;
}

export interface LineProblem {
  index: number;
  code: string;
  message: string;
}

/** يسعّر السلة على الخادم من الكتالوج الحالي فقط؛ أي إجمالي من العميل يُتجاهل. */
export function priceCart(
  items: readonly CartItem[],
  products: ReadonlyMap<string, Product>,
  unitNames: ReadonlyMap<string, string>,
  promotions: readonly Promotion[],
  now: number,
): Result<PricedCart> {
  if (items.length === 0) return err('CART_EMPTY', 'السلة فارغة');
  if (items.length > 300) return err('CART_TOO_LARGE', 'عدد الأصناف أكبر من المسموح');
  const problems: LineProblem[] = [];
  const seen = new Set<string>();
  const base: Array<Omit<OrderLine, 'discount' | 'total'>> = [];
  items.forEach((it, index) => {
    const p = products.get(it.productId);
    if (!p || p.archived || !p.visible) return problems.push({ index, code: 'PRODUCT_NOT_FOUND', message: 'المنتج غير موجود' });
    if (!p.available) return problems.push({ index, code: 'PRODUCT_UNAVAILABLE', message: `«${p.name}» غير متوفر حالياً` });
    const u = findUnit(p, it.unitId);
    if (!u) return problems.push({ index, code: 'UNIT_NOT_ALLOWED', message: 'الوحدة غير متاحة لهذا الصنف' });
    const key = `${it.productId}|${it.unitId}`;
    if (seen.has(key)) return problems.push({ index, code: 'DUPLICATE_LINE', message: 'الصنف مكرر بنفس الوحدة' });
    seen.add(key);
    const q = validateQty(it.qtyMilli, u);
    if (!q.ok) return problems.push({ index, code: q.code, message: q.message });
    base.push({
      productId: p.id, name: p.name, sku: p.sku, unitId: u.unitId, unitName: unitNames.get(u.unitId) ?? u.unitId,
      factorToBase: u.factorToBase, qtyMilli: it.qtyMilli, unitPrice: u.price, gross: lineTotal(it.qtyMilli, u.price),
      ...(it.note ? { note: it.note.slice(0, 300) } : {}),
    });
    return undefined;
  });
  if (problems.length) return err('CART_INVALID', 'بعض أصناف السلة تحتاج مراجعة', { problems });
  const discounts = applyPromotions(base.map((l) => ({ key: `${l.productId}|${l.unitId}`, ...l })), promotions, now);
  const lines: OrderLine[] = base.map((l) => {
    const d = discounts.get(`${l.productId}|${l.unitId}`);
    return { ...l, discount: d?.amount ?? 0, ...(d ? { promotionId: d.promotionId, promotionName: d.name } : {}), total: l.gross - (d?.amount ?? 0) };
  });
  const subtotal = lines.reduce((a, l) => a + l.gross, 0);
  const discount = lines.reduce((a, l) => a + l.discount, 0);
  return ok({ lines, subtotal, discount, total: subtotal - discount });
}

/** يقارن ما رآه المستخدم بما حسبه الخادم؛ أي فرق يتطلب موافقة صريحة (SRS 4.4). */
export function detectPriceChange(seenTotal: Agorot | undefined, cart: PricedCart): Result<PricedCart> {
  if (seenTotal !== undefined && seenTotal !== cart.total) {
    return err('PRICE_CHANGED', 'تغيّرت الأسعار أو العروض منذ إعداد السلة، راجع الإجمالي الجديد', { seenTotal, total: cart.total, lines: cart.lines });
  }
  return ok(cart);
}
