import type { Page } from '@playwright/test';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** رمز JWT غير موقّع يكفي لـ Firebase SDK في المتصفح (التحقق الحقيقي على الخادم). */
export function fakeIdToken(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: 'https://securetoken.google.com/mawred-test', aud: 'mawred-test', auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, firebase: { sign_in_provider: 'custom' } })}.sig`;
}

export const catalog = {
  products: [
    { id: 'feta', name: 'جبنة فيتا بلدية', altNames: ['فيتا'], sku: 'DAI-001', barcodes: [], categoryId: 'dairy', baseUnitId: 'box', available: true, visible: true, images: [],
      units: [{ unitId: 'box', factorToBase: 1000, price: 800, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }, { unitId: 'carton', factorToBase: 12000, price: 9000, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] },
    { id: 'rice', name: 'أرز مصري حبة قصيرة', altNames: [], sku: 'GRN-004', barcodes: [], categoryId: 'grains', baseUnitId: 'kg', available: true, visible: true, images: [],
      units: [{ unitId: 'sack', factorToBase: 25000, price: 9500, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] },
  ],
  categories: [{ id: 'dairy', name: 'الألبان والأجبان', order: 1 }, { id: 'grains', name: 'الحبوب', order: 2 }],
  units: [{ id: 'box', name: 'علبة' }, { id: 'carton', name: 'كرتونة' }, { id: 'sack', name: 'كيس 25 كغ' }],
  at: 1,
};

export const shopUser = { uid: 'so1', displayName: 'أبو أحمد', roles: ['shop_owner'], home: 'shop.home', contexts: ['shop.home'], permissions: ['shop.orders.submit', 'shop.statement.view'], shopIds: ['s1'], mustChangePassword: false };
export const adminUser = { uid: 'own', displayName: 'مدير مورد', roles: ['super_admin'], home: 'admin.dashboard', contexts: ['admin.dashboard'], permissions: ['orders.view', 'reports.view', 'delivery.view', 'shops.view'], shopIds: [], mustChangePassword: false };

type Handler = (body: any, url: URL) => { status?: number; json: unknown };

/** يعترض الشبكة على الحافة فقط: Google Identity Toolkit والخادم. التطبيق نفسه هو بناء الإنتاج الحقيقي. */
export async function mockBackend(page: Page, user: typeof shopUser, routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: any; headers: Record<string, string> }> = [];
  await page.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/, async (route) => {
    const url = route.request().url();
    const idToken = fakeIdToken(user.uid);
    if (url.includes('signInWithCustomToken')) return route.fulfill({ json: { kind: 'identitytoolkit#VerifyCustomTokenResponse', idToken, refreshToken: 'refresh', expiresIn: '3600', isNewUser: false } });
    if (url.includes('accounts:lookup')) return route.fulfill({ json: { users: [{ localId: user.uid, lastLoginAt: String(Date.now()), createdAt: String(Date.now()) }] } });
    return route.fulfill({ json: { id_token: idToken, refresh_token: 'refresh', expires_in: '3600', user_id: user.uid } });
  });
  await page.route('**/__api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url().replace('/__api', ''));
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    calls.push({ method: req.method(), path: url.pathname, body, headers: req.headers() });
    const h = routes[`${req.method()} ${url.pathname}`] ?? (url.pathname === '/auth/me' ? () => ({ json: { user } }) : undefined);
    if (!h) return route.fulfill({ status: 404, headers: cors, json: { error: { code: 'NOT_FOUND', message: 'غير موجود' } } });
    const r = h(body, url);
    return route.fulfill({ status: r.status ?? 200, headers: cors, json: r.json });
  });
  return calls;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-work-context, x-device', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE' };
