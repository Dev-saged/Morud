// السلة محلياً (تبقى عند انقطاع النت أو إغلاق التطبيق) وتظهر «غير مرسلة» حتى يؤكد الخادم
import { newKey } from './api';

export interface CartLine {
  productId: string;
  unitId: string;
  qtyMilli: number;
  note?: string;
}
export interface Cart {
  lines: CartLine[];
  paymentMethod: 'cash' | 'credit';
  notes: string;
  pendingKey: string | null; // مفتاح المحاولة الحالية: إعادة الإرسال بعد انقطاع تستخدم نفس المفتاح فلا يتكرر الطلب
}

export type CartAction =
  | { type: 'add'; productId: string; unitId: string; qtyMilli: number }
  | { type: 'set'; productId: string; unitId: string; qtyMilli: number }
  | { type: 'remove'; productId: string; unitId: string }
  | { type: 'method'; value: 'cash' | 'credit' }
  | { type: 'notes'; value: string }
  | { type: 'begin' }
  | { type: 'clear' }
  | { type: 'load'; cart: Cart };

export const EMPTY: Cart = { lines: [], paymentMethod: 'cash', notes: '', pendingKey: null };
const KEY = 'mawred.cart.v1';

export function cartReducer(c: Cart, a: CartAction): Cart {
  const same = (l: CartLine) => l.productId === (a as { productId: string }).productId && l.unitId === (a as { unitId: string }).unitId;
  switch (a.type) {
    case 'add': {
      const ex = c.lines.find(same);
      return { ...c, pendingKey: null, lines: ex ? c.lines.map((l) => (same(l) ? { ...l, qtyMilli: l.qtyMilli + a.qtyMilli } : l)) : [...c.lines, { productId: a.productId, unitId: a.unitId, qtyMilli: a.qtyMilli }] };
    }
    case 'set':
      return { ...c, pendingKey: null, lines: a.qtyMilli <= 0 ? c.lines.filter((l) => !same(l)) : c.lines.map((l) => (same(l) ? { ...l, qtyMilli: a.qtyMilli } : l)) };
    case 'remove':
      return { ...c, pendingKey: null, lines: c.lines.filter((l) => !same(l)) };
    case 'method':
      return { ...c, paymentMethod: a.value, pendingKey: null };
    case 'notes':
      return { ...c, notes: a.value.slice(0, 1000) };
    case 'begin':
      return c.pendingKey ? c : { ...c, pendingKey: newKey() };
    case 'clear':
      return EMPTY;
    case 'load':
      return a.cart;
  }
}

export function loadCart(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Cart) : null;
    return v && Array.isArray(v.lines) ? { ...EMPTY, ...v } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveCart(c: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // التخزين غير متاح: السلة تبقى في الذاكرة
  }
}

export function cartCount(c: Cart): number {
  return c.lines.length;
}
