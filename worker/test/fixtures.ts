import type { Product } from '../src/domain/catalog';
import type { Promotion } from '../src/domain/promotions';

// بيانات اختبار فقط (لا تُستخدم في الإنتاج)
export const feta: Product = {
  id: 'p-feta', name: 'جبنة فيتا', altNames: ['جبنه بيضاء'], brand: 'الصافي', sku: 'DAI-001', barcodes: ['6281000000011'],
  categoryId: 'dairy', baseUnitId: 'box', available: true, visible: true,
  units: [
    { unitId: 'box', factorToBase: 1000, price: 800, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false },
    { unitId: 'carton', factorToBase: 12000, price: 9000, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false },
  ],
};
export const nuts: Product = {
  id: 'p-nuts', name: 'مكسرات مشكّلة', altNames: [], sku: 'SNK-010', barcodes: [], categoryId: 'snacks', baseUnitId: 'kg',
  available: true, visible: true,
  units: [
    { unitId: 'kg', factorToBase: 1000, price: 4500, minQtyMilli: 250, stepMilli: 250, allowFraction: true },
    { unitId: 'half_kg', factorToBase: 500, price: 2300, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false },
  ],
};
export const broom: Product = {
  id: 'p-broom', name: 'عصا مكنسة', altNames: [], sku: 'HOU-004', barcodes: [], categoryId: 'household', baseUnitId: 'piece',
  available: false, visible: true,
  units: [{ unitId: 'piece', factorToBase: 1000, price: 700, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }],
};
export const products = new Map([feta, nuts, broom].map((p) => [p.id, p]));
export const unitNames = new Map([['box', 'علبة'], ['carton', 'كرتونة'], ['kg', 'كيلوغرام'], ['half_kg', 'نصف كيلو'], ['piece', 'حبة']]);

export const NOW = Date.UTC(2026, 10, 20, 10, 0);
export const promo = (p: Partial<Promotion>): Promotion => ({
  id: 'pr', name: 'عرض', type: 'item_percent', productIds: [], usedCount: 0, startsAt: NOW - 1000, endsAt: NOW + 86_400_000, active: true, ...p,
});
