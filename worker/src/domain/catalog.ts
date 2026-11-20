import type { Agorot } from './money';

export interface Unit {
  id: string;
  name: string;
  kind: 'count' | 'weight' | 'volume';
  allowFraction: boolean;
}

// وحدة بيع خاصة بالمنتج: معامل تحويل وسعر مستقلان (الكرتونة لا تحتوي نفس العدد في كل المنتجات)
export interface ProductUnit {
  unitId: string;
  factorToBase: number; // كم وحدة أساسية (×1000) في هذه الوحدة: كرتونة = 12 علبة → 12000
  price: Agorot;
  minQtyMilli: number;
  stepMilli: number;
  allowFraction: boolean;
}

export interface Product {
  id: string;
  name: string;
  altNames: string[];
  brand?: string;
  sku: string;
  barcodes: string[];
  categoryId: string;
  baseUnitId: string;
  units: ProductUnit[];
  available: boolean;
  visible: boolean;
  archived?: boolean;
}

export function findUnit(p: Product, unitId: string): ProductUnit | undefined {
  return p.units.find((u) => u.unitId === unitId);
}

// تحقق سلامة تعريف المنتج قبل حفظه
export function validateProduct(p: Product, units: ReadonlyMap<string, Unit>): string[] {
  const problems: string[] = [];
  if (!p.name.trim()) problems.push('NAME_REQUIRED');
  if (!p.sku.trim()) problems.push('SKU_REQUIRED');
  if (p.units.length === 0) problems.push('UNITS_REQUIRED');
  const seen = new Set<string>();
  for (const u of p.units) {
    const def = units.get(u.unitId);
    if (!def) problems.push(`UNIT_UNKNOWN:${u.unitId}`);
    if (seen.has(u.unitId)) problems.push(`UNIT_DUPLICATE:${u.unitId}`);
    seen.add(u.unitId);
    if (!Number.isSafeInteger(u.price) || u.price <= 0) problems.push(`PRICE_INVALID:${u.unitId}`);
    if (!Number.isSafeInteger(u.factorToBase) || u.factorToBase <= 0) problems.push(`FACTOR_INVALID:${u.unitId}`);
    if (def && u.allowFraction && !def.allowFraction) problems.push(`FRACTION_NOT_ALLOWED:${u.unitId}`);
    if (u.minQtyMilli <= 0 || u.stepMilli <= 0) problems.push(`QTY_RULE_INVALID:${u.unitId}`);
  }
  if (!p.units.some((u) => u.unitId === p.baseUnitId)) problems.push('BASE_UNIT_MISSING');
  return problems;
}
