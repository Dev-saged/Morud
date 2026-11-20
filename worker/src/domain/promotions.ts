import { lineTotal, percentOf, type Agorot } from './money';

// أنواع العروض في SRS القسم العاشر
export type PromotionType = 'item_percent' | 'item_amount' | 'qty_percent' | 'bxgy' | 'bundle_percent';

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  productIds: string[];
  unitIds?: string[]; // إن حُدّدت فالعرض على هذه الوحدات فقط
  percentBp?: number; // نقاط أساس
  amountPerUnit?: Agorot; // للخصم الثابت على الوحدة
  minQtyMilli?: number; // qty_percent
  buyQty?: number; // bxgy بالوحدات الصحيحة
  getQty?: number;
  minPurchase?: Agorot; // على إجمالي الطلب قبل الخصم
  maxDiscount?: Agorot;
  usageLimit?: number;
  usedCount: number;
  startsAt: number; // ms UTC
  endsAt: number;
  active: boolean;
}

export interface PricedLineInput {
  key: string;
  productId: string;
  unitId: string;
  qtyMilli: number;
  unitPrice: Agorot;
  gross: Agorot;
}

export interface AppliedDiscount {
  promotionId: string;
  name: string;
  amount: Agorot;
}

export function isLive(p: Promotion, now: number): boolean {
  return p.active && now >= p.startsAt && now < p.endsAt && (p.usageLimit === undefined || p.usedCount < p.usageLimit);
}

function eligible(p: Promotion, l: PricedLineInput): boolean {
  return p.productIds.includes(l.productId) && (!p.unitIds || p.unitIds.includes(l.unitId));
}

function lineDiscount(p: Promotion, l: PricedLineInput, lines: readonly PricedLineInput[]): Agorot {
  switch (p.type) {
    case 'item_percent':
      return percentOf(l.gross, p.percentBp ?? 0);
    case 'item_amount':
      return Math.min(l.gross, lineTotal(l.qtyMilli, p.amountPerUnit ?? 0));
    case 'qty_percent':
      return l.qtyMilli >= (p.minQtyMilli ?? Infinity) ? percentOf(l.gross, p.percentBp ?? 0) : 0;
    case 'bxgy': {
      const buy = p.buyQty ?? 0;
      const get = p.getQty ?? 0;
      if (buy <= 0 || get <= 0) return 0;
      const whole = Math.floor(l.qtyMilli / 1000);
      const free = Math.floor(whole / (buy + get)) * get;
      return lineTotal(free * 1000, l.unitPrice);
    }
    case 'bundle_percent': {
      // كل منتجات المجموعة يجب أن تكون في السلة
      const present = new Set(lines.map((x) => x.productId));
      return p.productIds.every((id) => present.has(id)) ? percentOf(l.gross, p.percentBp ?? 0) : 0;
    }
  }
}

/**
 * يطبّق أفضل عرض واحد لكل سطر (لا تكديس خصومات)، ويحترم الحد الأدنى للشراء والحد الأقصى للخصم.
 * يعيد خصم كل سطر بمفتاحه.
 */
export function applyPromotions(lines: readonly PricedLineInput[], promos: readonly Promotion[], now: number): Map<string, AppliedDiscount> {
  const subtotal = lines.reduce((a, l) => a + l.gross, 0);
  const live = promos.filter((p) => isLive(p, now) && subtotal >= (p.minPurchase ?? 0));
  const best = new Map<string, AppliedDiscount>();
  for (const l of lines) {
    for (const p of live) {
      if (!eligible(p, l)) continue;
      const amount = Math.min(lineDiscount(p, l, lines), l.gross);
      if (amount > 0 && amount > (best.get(l.key)?.amount ?? 0)) best.set(l.key, { promotionId: p.id, name: p.name, amount });
    }
  }
  // سقف الخصم لكل عرض: يُوزَّع التخفيض على أسطره بالترتيب
  for (const p of live) {
    if (p.maxDiscount === undefined) continue;
    let total = 0;
    for (const l of lines) {
      const d = best.get(l.key);
      if (!d || d.promotionId !== p.id) continue;
      const allowed = Math.max(0, Math.min(d.amount, p.maxDiscount - total));
      total += allowed;
      if (allowed === 0) best.delete(l.key);
      else best.set(l.key, { ...d, amount: allowed });
    }
  }
  return best;
}
