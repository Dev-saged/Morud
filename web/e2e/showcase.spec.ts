import { test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { adminUser, mockBackend, shopUser } from './mock';

/**
 * لقطات العرض في README: بناء الإنتاج الحقيقي للتطبيق ببيانات عرض.
 * الكتالوج (الأسماء والصور) يُقرأ من ملف خارج المستودع، وكل الأشخاص والمحلات والطلبات أسماء مخترعة.
 * تشغيل: SHOWCASE_CATALOG=/tmp/catalog.json SHOWCASE_IMAGES=https://<worker>/files npx playwright test showcase --project=chromium
 */
test.skip(!process.env.SHOWCASE_CATALOG, 'لقطات العرض يدوية');
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const OUT = new URL('../../docs/screenshots/raw/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const roles = JSON.parse(readFileSync(new URL('../../spec/roles.json', import.meta.url), 'utf8'));
const permissions = JSON.parse(readFileSync(new URL('../../spec/permissions.json', import.meta.url), 'utf8'));

const raw = process.env.SHOWCASE_CATALOG ? JSON.parse(readFileSync(process.env.SHOWCASE_CATALOG, 'utf8')) : { products: [], categories: [], units: [] };
const src = raw['/catalog']?.json ?? raw['/catalog'] ?? raw;
const pick = (prefix: string) => src.products.find((p: any) => p.id.startsWith(prefix))?.id as string;
const FEATURED = ['ceda35', 'd3336b', 'b837a8', '3feab9', 'f4e036', 'e4792a', 'f9fb8e', '69be1c', '591309', '5236e4', '03de84', 'c9f093'].map(pick).filter(Boolean);
const POPULAR = ['1c9fc5', '2c4ba2', '15cb17', '392415', '7a1920', 'c96745', 'ceda35', 'e51440', '59111d', '9657d9'].map(pick).filter(Boolean);
const DAY = 86_400_000;
const now = Date.now();
const dairy = src.products.filter((p: any) => p.categoryId === 'dairy').map((p: any) => p.id);
const cleaning = src.products.filter((p: any) => /منظف|سائل جلي|مسحوق|كلور|معطر/.test(p.name)).map((p: any) => p.id);
const catalog = {
  ...src,
  products: src.products.map((p: any) => ({ ...p, description: undefined, featured: FEATURED.includes(p.id), available: p.id !== pick('274822') })),
  popular: POPULAR,
  promotions: [
    { id: 'pr1', name: 'أسبوع الألبان', type: 'item_percent', productIds: dairy, percentBp: 1000, usedCount: 38, startsAt: now - 2 * DAY, endsAt: now + 5 * DAY, active: true },
    { id: 'pr2', name: 'عرض المنظفات', type: 'bxgy', productIds: cleaning, buyQty: 5, getQty: 1, usedCount: 12, startsAt: now - DAY, endsAt: now + 9 * DAY, active: true },
    { id: 'pr3', name: 'خصم الجملة على الأرز', type: 'qty_percent', productIds: [pick('cfad34')], percentBp: 700, minQtyMilli: 5000, usedCount: 7, startsAt: now - DAY, endsAt: now + 12 * DAY, active: true },
  ],
};
const P = (prefix: string) => catalog.products.find((p: any) => p.id.startsWith(prefix));
const line = (prefix: string, unitIdx: number, qty: number) => {
  const p = P(prefix); const u = p.units[Math.min(unitIdx, p.units.length - 1)];
  return { productId: p.id, unitId: u.unitId, name: p.name, unitName: catalog.units.find((x: any) => x.id === u.unitId)?.name, qtyMilli: qty * 1000, unitPrice: u.price, total: u.price * qty };
};

const SHOP = { ...shopUser, displayName: 'أبو أحمد', permissions: [...shopUser.permissions, 'shop.invoices.view', 'shop.orders.cancel'] };
const items = [line('b837a8', 0, 3), line('5236e4', 1, 2), line('cfad34', 0, 5), line('11eb0f', 0, 4)];
const subtotal = items.reduce((a, l) => a + l.total, 0);
const orderDetail = {
  order: { id: 'o1', number: 'MW-O-2026-000418', shopId: 's1', shopName: 'بقالة النور', status: 'on_the_way', items, totals: { subtotal, discount: Math.round(items[0]!.total * 0.1), total: subtotal - Math.round(items[0]!.total * 0.1) }, paymentMethod: 'cash', invoiceId: 'inv1', createdAt: now - 4 * 3600_000,
    sla: { submittedAt: now - 4 * 3600_000, clockStartAt: now - 4 * 3600_000, dueAt: now + 2 * 3600_000, estimated: false } },
  history: [['new', 4], ['under_review', 3.8], ['confirmed', 3.5], ['preparing', 3], ['ready_for_pickup', 1.4], ['out_for_delivery', 0.9], ['on_the_way', 0.6]].map(([to, h]) => ({ to, at: now - (h as number) * 3600_000 })),
  changes: [], internal: [], actions: [],
};
const shopOrders = [
  { id: 'o1', number: 'MW-O-2026-000418', status: 'on_the_way', total: orderDetail.order.totals.total, createdAt: now - 4 * 3600_000 },
  { id: 'o2', number: 'MW-O-2026-000397', status: 'delivered', total: 186450, createdAt: now - 2 * DAY },
  { id: 'o3', number: 'MW-O-2026-000362', status: 'financially_completed', total: 94200, createdAt: now - 5 * DAY },
  { id: 'o4', number: 'MW-O-2026-000331', status: 'financially_completed', total: 231700, createdAt: now - 9 * DAY },
  { id: 'o5', number: 'MW-O-2026-000304', status: 'cancelled', total: 41500, createdAt: now - 12 * DAY },
];
const shopRoutes = {
  'POST /auth/login': () => ({ json: { customToken: 'CT', user: SHOP } }),
  'GET /catalog': () => ({ json: catalog }),
  'GET /me/summary': () => ({ json: { area: 'shop', shopName: 'بقالة النور', open: 1, ordersMonth: 14, spendMonth: 1284650, spendLast7Days: [86400, 0, 142300, 98750, 0, 186450, 211900], due: 94750, creditAvailable: 405250, last: { id: 'o1', number: 'MW-O-2026-000418', status: 'on_the_way', total: orderDetail.order.totals.total, createdAt: now - 4 * 3600_000 }, reorder: [P('1c9fc5'), P('2c4ba2'), P('15cb17'), P('7a1920')].map((p: any, i) => ({ productId: p.id, name: p.name, unitId: p.units[p.units.length - 1].unitId, count: 9 - i })) } }),
  'GET /shops/s1/orders': () => ({ json: { orders: shopOrders } }),
  'GET /orders/o1': () => ({ json: orderDetail }),
  'GET /shops/s1/statement': () => ({ json: { shop: { id: 's1', name: 'بقالة النور' }, statement: { due: 94750, creditBalance: 0, rows: [] }, credit: { enabled: true, limit: 500000, available: 405250 } } }),
  'GET /notifications': () => ({ json: { notifications: [
    { id: 'n1', type: 'order.status', title: 'طلبك في الطريق إليك', body: 'MW-O-2026-000418 مع المندوب أحمد', ref: { kind: 'order', id: 'o1' }, at: now - 0.6 * 3600_000, readAt: null },
    { id: 'n2', type: 'promotion.new', title: 'عرض جديد: أسبوع الألبان', body: 'خصم 10% على كل الألبان والأجبان', ref: { kind: 'promotion', id: 'pr1' }, at: now - 2 * DAY, readAt: null },
  ], unread: 2 } }),
  'GET /support': () => ({ json: { tickets: [{ id: 't1', type: 'complaint', subject: 'نقص كرتونة في طلب الأسبوع الماضي', body: 'وصلت كرتونتا زيت بدل ثلاث في الطلب MW-O-2026-000331', status: 'resolved', createdAt: now - 8 * DAY, replies: [{ text: 'نعتذر عن الخطأ، أضفنا الكرتونة لطلبك القادم بدون مقابل', at: now - 8 * DAY + 3600_000 }] }] } }),
  'POST /orders/quote': (b: any) => ({ json: { quote: { lines: [], subtotal: 0, discount: 0, total: 0 }, ...b } }),
};

const ADMIN = { ...adminUser, displayName: 'ساجد العبادلة', permissions: Object.keys(Object.fromEntries(((permissions as any).permissions ?? permissions).map((p: any) => [p.id, 1]))) };
const shopNames = ['بقالة النور', 'سوبرماركت الأمل', 'ميني ماركت السلام', 'بقالة الريان', 'سوبرماركت الوفاء', 'دكان أبو خليل', 'بقالة الياسمين', 'ماركت البركة'];
const statuses = ['new', 'new', 'under_review', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'on_the_way', 'delivered', 'financially_completed'];
const adminOrders = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, number: `MW-O-2026-000${430 - i}`, shopName: shopNames[i % 8], status: statuses[i % statuses.length], createdAt: now - i * 47 * 60_000, items: 3 + (i * 7) % 9, total: 38000 + ((i * 7919) % 180000), paymentMethod: i % 3 ? 'cash' : 'credit', sla: { dueAt: now + (6 - i) * 3600_000, overdue: i === 9 } }));
const people = [
  { uid: 'own', displayName: 'ساجد العبادلة', username: 'sajed', phone: null, email: null, status: 'active', roles: ['super_admin'], grant: [], deny: [], lastLoginAt: now - 600_000 },
  { uid: 'u2', displayName: 'محمد أبو سلمية', username: 'm.salmiya', phone: null, email: null, status: 'active', roles: ['orders_employee'], grant: ['reports.view'], deny: [], lastLoginAt: now - 3 * 3600_000 },
  { uid: 'u3', displayName: 'سماح الشوا', username: 'samah', phone: null, email: null, status: 'active', roles: ['accountant'], grant: [], deny: [], lastLoginAt: now - 7200_000 },
  { uid: 'u4', displayName: 'أحمد النجار', username: 'a.najjar', phone: null, email: null, status: 'active', roles: ['delivery_agent'], grant: [], deny: [], lastLoginAt: now - 1800_000 },
  { uid: 'u6', displayName: 'يوسف الغلبان', username: 'y.ghalban', phone: null, email: null, status: 'active', roles: ['delivery_manager'], grant: [], deny: [], lastLoginAt: now - 5400_000 },
  { uid: 'u7', displayName: 'رنا عاشور', username: 'rana', phone: null, email: null, status: 'active', roles: ['catalog_employee'], grant: [], deny: [], lastLoginAt: now - DAY },
  { uid: 'u5', displayName: 'خالد الحلو', username: 'khaled', phone: null, email: null, status: 'suspended', roles: ['catalog_employee', 'orders_employee'], grant: [], deny: ['orders.cancel'], lastLoginAt: now - 9 * DAY },
];
const adminRoutes = {
  'POST /auth/login': () => ({ json: { customToken: 'CT', user: ADMIN } }),
  'GET /catalog': () => ({ json: catalog }),
  'GET /dashboard/summary': () => ({ json: { ordersToday: 23, new: 4, review: 2, preparing: 5, ready: 3, overdue: 1, delivering: 6, completed: 9, salesToday: 2874350, collectedToday: 1962000, totalDue: 4318700, activeShops: 38, availableProducts: 130, unavailableProducts: 1,
    topProducts: [['1c9fc5', 41], ['2c4ba2', 36], ['b837a8', 29], ['5236e4', 25], ['7a1920', 22]].map(([id, count]) => ({ productId: P(id as string).id, name: P(id as string).name, count })),
    ordersLast7Days: [14, 19, 17, 22, 18, 26, 23], recent: adminOrders.slice(0, 8).map((o) => ({ id: o.id, number: o.number, shopId: 's', shopName: o.shopName, status: o.status, total: o.total })) } }),
  'GET /orders': (_b: unknown, url: URL) => {
    const by: Record<string, string[]> = { new: ['new'], review: ['under_review'], preparing: ['confirmed', 'preparing'], ready: ['ready_for_pickup'], delivery: ['out_for_delivery', 'on_the_way'], completed: ['delivered', 'financially_completed'] };
    const f = url.searchParams.get('filter') ?? 'all';
    return { json: { orders: f === 'overdue' ? adminOrders.filter((o) => o.sla.overdue) : by[f] ? adminOrders.filter((o) => by[f]!.includes(o.status)) : adminOrders } };
  },
  'GET /admin/roles': () => ({ json: { roles: (roles as any).roles ?? roles, permissions: (permissions as any).permissions ?? permissions } }),
  'GET /admin/users': () => ({ json: { users: people } }),
  'GET /reports': () => ({ json: { reports: [['sales-daily', 'المبيعات اليومية'], ['top-products', 'المنتجات الأكثر طلباً'], ['top-shops', 'المحلات الأكثر شراءً'], ['debts', 'الديون المستحقة'], ['collections', 'التحصيل'], ['delays', 'التأخير']].map(([id, title]) => ({ id, title, allowed: true })) } }),
  'GET /reports/top-shops': () => ({ json: { report: 'top-shops', title: 'المحلات الأكثر شراءً', columns: [['shop', 'المحل'], ['orders', 'الطلبات'], ['gross', 'المشتريات'], ['collected', 'المحصّل']], rows: shopNames.map((s, i) => ({ shop: s, orders: 31 - i * 3, gross: 4892300 - i * 431700, collected: 4210000 - i * 402500 })) } }),
  'GET /notifications': () => ({ json: { notifications: [], unread: 3 } }),
  'GET /settings': () => ({ json: { settings: { platformName: 'مورد', workDays: [0, 1, 2, 3, 4, 6], orderIntakeStart: '07:00', orderIntakeEnd: '22:00', deliveryStart: '08:00', deliveryEnd: '21:00', slaWorkingHours: 6, defaultPrepMinutes: 90, holidays: [], closures: [], paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }, { id: 'credit', label: 'آجل', enabled: true }], creditWarnPercent: 80, creditBlocksDeferredOrders: true, newOrderSound: true, mfaFeature: false, backupRetentionDays: 30, supplier: { name: 'مورد', phone: '', address: '', taxId: '' } } } }),
  'GET /admin/audit': () => ({ json: { logs: [
    { id: 'l1', at: now - 12 * 60_000, action: 'payments.create', actor: 'سماح الشوا', actorId: 'u3', entity: { kind: 'shop', id: 'بقالة النور' }, result: 'ok', before: null, after: { amount: 120000, method: 'cash' }, ip: '', device: '' },
    { id: 'l2', at: now - 40 * 60_000, action: 'products.update', actor: 'رنا عاشور', actorId: 'u7', entity: { kind: 'product', id: 'جبنة نابلسية 1 كغ' }, result: 'ok', before: { available: false }, after: { available: true }, ip: '', device: '' },
    { id: 'l3', at: now - 2 * 3600_000, action: 'orders.transition', actor: 'محمد أبو سلمية', actorId: 'u2', entity: { kind: 'order', id: 'MW-O-2026-000421' }, result: 'ok', before: { status: 'under_review' }, after: { status: 'confirmed' }, ip: '', device: '' },
    { id: 'l4', at: now - 5 * 3600_000, action: 'users.update', actor: 'ساجد العبادلة', actorId: 'own', entity: { kind: 'user', id: 'خالد الحلو' }, result: 'ok', before: { status: 'active' }, after: { status: 'suspended' }, ip: '', device: '' },
  ], next: null } }),
};

const AGENT = { uid: 'u4', displayName: 'أحمد النجار', roles: ['delivery_agent'], home: 'agent.tasks', contexts: ['agent.tasks'], permissions: ['delivery.update', 'delivery.collect', 'support.create'], shopIds: [], mustChangePassword: false };
const agentRoutes = {
  'POST /auth/login': () => ({ json: { customToken: 'CT', user: AGENT } }),
  'GET /agent/tasks': () => ({ json: { tasks: [
    { id: 'o1', shopName: 'بقالة النور', status: 'on_the_way', address: { text: 'شارع صلاح الدين، قرب مسجد الهدى', city: 'دير البلح', phone: '0590000000', geo: { lat: 31.42, lng: 34.35 } }, items: items.map((l) => ({ name: l.name, unitName: l.unitName, qtyMilli: l.qtyMilli })), toCollect: orderDetail.order.totals.total },
    { id: 'o6', shopName: 'سوبرماركت الأمل', status: 'out_for_delivery', address: { text: 'دوار البلد', city: 'الزوايدة' }, items: [], toCollect: 0 },
    { id: 'o7', shopName: 'ميني ماركت السلام', status: 'out_for_delivery', address: { text: 'السوق المركزي', city: 'النصيرات' }, items: [], toCollect: 64300 },
  ] } }),
  'GET /me/summary': () => ({ json: { area: 'agent', pending: 2, onRoad: 1, deliveredToday: 7, failed: 0, collectedToday: 584200 } }),
  'GET /notifications': () => ({ json: { notifications: [], unread: 0 } }),
};

async function open(page: Page, user: any, routes: Record<string, any>, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.addInitScript(() => localStorage.setItem('mawred.install.snooze', String(Date.now())));
  await mockBackend(page, user, routes);
  // صور المنتجات الحقيقية من مخزن الصور العام
  await page.route('**/__api/files/**', async (route) => {
    const key = new URL(route.request().url()).pathname.split('/files/')[1];
    try { await route.fulfill({ response: await route.fetch({ url: `${process.env.SHOWCASE_IMAGES}/${key}` }) }); } catch { /* الصفحة أُغلقت */ }
  });
  await page.goto('/');
}
async function login(page: Page) {
  await page.getByLabel('المعرّف').fill('demo');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('Demo1234');
  await page.getByRole('button', { name: 'دخول' }).click();
}
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const seen = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; });
    const wait = Promise.all(seen.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))));
    await Promise.race([wait, new Promise((ok) => setTimeout(ok, 15_000))]);
  });
  await page.waitForTimeout(900);
}
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage, animations: 'disabled' });

const phone = { width: 390, height: 844 };
const desk = { width: 1440, height: 900 };

test.use({ deviceScaleFactor: 2, locale: 'ar', colorScheme: 'light' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('المحل', async ({ page }) => {
  await open(page, SHOP, shopRoutes, phone);
  await page.getByLabel('المعرّف').waitFor();
  await settle(page);
  await shot(page, 'login');
  await login(page);
  await page.getByRole('button', { name: /تفاصيل/ }).first().waitFor();
  await settle(page);
  await shot(page, 'shop-desk');
  await page.locator('.rail-title').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await settle(page);
  await shot(page, 'shop-catalog');
  await page.getByRole('button', { name: /أسبوع الألبان/ }).first().click();
  await settle(page);
  await shot(page, 'shop-promo');
  await page.getByRole('button', { name: /أسبوع الألبان/ }).first().click();
  for (const n of ['جبنة نابلسية 1 كغ', 'لبنة 500 غرام', 'زيت نباتي 1 لتر', 'أرز حبة طويلة']) {
    await page.getByLabel('بحث').fill(n);
    await page.getByRole('button', { name: `أضف ${n} إلى السلة` }).first().click();
  }
  await page.getByLabel('بحث').fill('');
  await page.locator('.bottom-nav').getByRole('button', { name: /السلة/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await shot(page, 'shop-cart');
  await page.locator('.bottom-nav').getByRole('button', { name: /طلباتي/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await shot(page, 'shop-orders');
  await page.getByRole('button', { name: /MW-O-2026-000418/ }).first().click();
  await settle(page);
  await shot(page, 'shop-track');
  await page.locator('.bottom-nav').getByRole('button', { name: /حسابي/ }).click();
  await page.getByRole('button', { name: /المساعدة والدعم/ }).click();
  await settle(page);
  await shot(page, 'shop-help');
  await page.getByRole('tab', { name: /تواصل مع الدعم/ }).click();
  await page.getByText('نعتذر عن الخطأ').waitFor();
  await settle(page);
  await shot(page, 'shop-support');
});

test('الإدارة', async ({ page }) => {
  await open(page, ADMIN, adminRoutes, desk);
  await login(page);
  await page.getByRole('button', { name: /^طلبات اليوم/ }).waitFor();
  await settle(page);
  await shot(page, 'admin-dashboard');
  const nav = page.getByRole('navigation', { name: 'أقسام الإدارة' });
  await nav.getByRole('button', { name: 'الطلبات', exact: true }).click();
  await page.getByRole('button', { name: 'اليوم', exact: true }).click();
  await settle(page);
  await shot(page, 'admin-orders');
  for (const [label, name] of [ ['المستخدمون', 'admin-team'], ['المنتجات', 'admin-products'], ['سجل العمليات', 'admin-audit']] as const) {
    await nav.getByRole('button', { name: label, exact: true }).click();
    await settle(page);
    await shot(page, name);
  }
  await nav.getByRole('button', { name: 'التقارير', exact: true }).click();
  await page.getByRole('button', { name: 'المحلات الأكثر شراءً' }).click();
  await page.locator('table').waitFor();
  await settle(page);
  await shot(page, 'admin-reports');
});

test('الإدارة على الجوال', async ({ page }) => {
  await open(page, ADMIN, adminRoutes, phone);
  await login(page);
  await page.getByRole('button', { name: /^طلبات اليوم/ }).waitFor();
  await settle(page);
  await shot(page, 'admin-mobile');
});

test('المندوب', async ({ page }) => {
  await open(page, AGENT, agentRoutes, phone);
  await login(page);
  await page.getByText('بقالة النور').first().waitFor();
  await settle(page);
  await shot(page, 'agent-tasks');
});
