import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../src/App';
import { SessionProvider, type AuthBackend } from '../src/lib/session';

export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

export const catalog = {
  products: [
    { id: 'feta', name: 'جبنة فيتا', altNames: [], sku: 'DAI-001', barcodes: [], categoryId: 'dairy', baseUnitId: 'box', available: true, visible: true,
      units: [{ unitId: 'box', factorToBase: 1000, price: 800, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }, { unitId: 'carton', factorToBase: 12000, price: 9000, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] },
    { id: 'off', name: 'منتج نافد', altNames: [], sku: 'X', barcodes: [], categoryId: 'dairy', baseUnitId: 'box', available: false, visible: true, units: [{ unitId: 'box', factorToBase: 1000, price: 100, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] },
  ],
  categories: [{ id: 'dairy', name: 'الألبان والأجبان', order: 1 }],
  units: [{ id: 'box', name: 'علبة' }, { id: 'carton', name: 'كرتونة' }],
  at: 1,
};
export const shopUser = { uid: 'so1', displayName: 'أبو أحمد', roles: ['shop_owner'], home: 'shop.home', contexts: ['shop.home'], permissions: ['shop.orders.submit', 'shop.statement.view'], shopIds: ['s1'], mustChangePassword: false };
export const adminUser = { ...shopUser, uid: 'own', roles: ['super_admin'], home: 'admin.dashboard', permissions: ['orders.view', 'reports.view', 'delivery.view', 'reports.finance'], shopIds: [] };

export function backend(signedIn = false): AuthBackend & { tokens: string[] } {
  const b = {
    tokens: [] as string[],
    signed: signedIn,
    async signInWithCustomToken(t: string) { b.tokens.push(t); b.signed = true; },
    idToken: async () => (b.signed ? 'ID' : null),
    async signOut() { b.signed = false; },
    onReady(cb: (s: boolean) => void) { setTimeout(() => cb(b.signed), 0); return () => undefined; },
  };
  return b;
}

export function mount(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>, signedIn = false) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('https://api.test', '');
    calls.push([path, init]);
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    const h = routes[key];
    return h ? h(init) : json({ error: { code: 'NOT_FOUND', message: 'غير موجود' } }, 404);
  });
  const b = backend(signedIn);
  render(<SessionProvider backend={b} apiBase="https://api.test" fetchImpl={f as never}><App /></SessionProvider>);
  return { calls, b };
}

