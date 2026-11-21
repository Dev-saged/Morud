import { expect, test } from '@playwright/test';
import { adminUser, catalog, mockBackend, shopUser } from './mock';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as any).__errors = errors;
});
test.afterEach(async ({ page }) => expect((page as any).__errors).toEqual([]));

test('صاحب المحل: دخول، بحث، سلة، إرسال بمنع التكرار، تتبع الطلب', async ({ page }) => {
  let posted = 0;
  const calls = await mockBackend(page, shopUser, {
    'POST /auth/login': () => ({ json: { customToken: 'CT', user: shopUser } }),
    'GET /catalog': () => ({ json: catalog }),
    'POST /orders': () => ({ status: 201, json: { order: { id: 'o1' } }, ...(posted++, {}) }),
    'GET /orders/o1': () => ({ json: { order: { id: 'o1', number: 'MW-O-2026-000123', status: 'new', items: [{ productId: 'feta', unitId: 'carton', name: 'جبنة فيتا بلدية', unitName: 'كرتونة', qtyMilli: 1000, unitPrice: 9000, total: 9000 }], totals: { subtotal: 9000, discount: 0, total: 9000 }, paymentMethod: 'cash', sla: { submittedAt: Date.now(), clockStartAt: Date.now(), dueAt: Date.now() + 5 * 3600_000, estimated: true } }, history: [{ to: 'new', at: Date.now() }], changes: [], internal: [], actions: [{ to: 'cancelled', reason: true }] } }),
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('المعرّف').fill('0599888777');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByText('جبنة فيتا بلدية')).toBeVisible();
  await page.getByLabel('بحث').fill('جبنه');
  await expect(page.getByText('أرز مصري حبة قصيرة')).toHaveCount(0);
  await page.getByRole('button', { name: 'كرتونة' }).click();
  await page.getByRole('button', { name: 'أضف جبنة فيتا بلدية إلى السلة' }).click();
  await expect(page.locator('.dot-badge')).toHaveText('1');
  await page.locator('.bottom-nav').getByRole('button', { name: /السلة/ }).click();
  await expect(page.getByText('90.00 ₪').first()).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد وإرسال الطلب' }).click();
  await expect(page.getByText('MW-O-2026-000123')).toBeVisible();
  await expect(page.getByText(/متبقٍ/)).toBeVisible();
  const post = calls.find((c) => c.method === 'POST' && c.path === '/orders')!;
  expect(post.headers['idempotency-key']).toMatch(/^[a-f0-9]{32}$/);
  expect(post.headers.authorization).toMatch(/^Bearer ey/);
  expect(post.body.items).toEqual([{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }]);
  expect(posted).toBe(1);
  await page.reload();
  await expect(page.getByText('جبنة فيتا بلدية').first()).toBeVisible();
});

test('المدير: لوحة المعلومات ثم الطلبات والتقارير حسب الصلاحية', async ({ page }) => {
  await mockBackend(page, adminUser, {
    'POST /auth/login': () => ({ json: { customToken: 'CT', user: adminUser } }),
    'GET /dashboard/summary': () => ({ json: { ordersToday: 7, new: 3, review: 1, preparing: 2, overdue: 1, delivering: 1, completed: 0, salesToday: 124750, collectedToday: 30000, totalDue: 94750, activeShops: 12, availableProducts: 140, unavailableProducts: 6, topProducts: [{ name: 'جبنة فيتا بلدية', count: 5 }], ordersLast7Days: [2, 4, 3, 6, 5, 8, 7], recent: [{ id: 'o1', number: 'MW-O-2026-000123', shopName: 'بقالة النور', status: 'new', total: 9000 }] } }),
    'GET /orders': () => ({ json: { orders: [{ id: 'o1', number: 'MW-O-2026-000123', shopName: 'بقالة النور', status: 'new', createdAt: Date.now(), items: 1, total: 9000, paymentMethod: 'cash', sla: { dueAt: Date.now(), overdue: false } }] } }),
    'GET /reports': () => ({ json: { reports: [{ id: 'debts', title: 'الديون المستحقة', allowed: true }] } }),
    'GET /reports/debts': () => ({ json: { report: 'debts', title: 'الديون المستحقة', columns: [['shop', 'المحل'], ['balance', 'المستحق']], rows: [{ shop: 'بقالة النور', balance: 94750 }] } }),
  });
  await page.goto('/');
  await page.getByLabel('المعرّف').fill('owner');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByText('طلبات اليوم')).toBeVisible();
  await expect(page.getByText('1,247.50 ₪')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'أقسام الإدارة' });
  await expect(nav.getByRole('button')).toHaveText(['لوحة المعلومات', 'الطلبات', 'المحلات', 'التوصيل', 'التقارير']);
  await nav.getByRole('button', { name: 'الطلبات' }).click();
  await expect(page.getByRole('cell', { name: 'بقالة النور' })).toBeVisible();
  await nav.getByRole('button', { name: 'التقارير' }).click();
  await page.getByRole('button', { name: 'الديون المستحقة' }).click();
  await expect(page.getByText('947.50 ₪')).toBeVisible();
});

test('توافق: لا تمرير أفقي على الجوال وبخط نظام كبير', async ({ page }) => {
  await mockBackend(page, shopUser, { 'GET /catalog': () => ({ json: catalog }) });
  await page.goto('/');
  await page.addStyleTag({ content: 'html{font-size:150% !important}' });
  for (const w of [320, 390, 768]) {
    await page.setViewportSize({ width: w, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `عرض ${w}`).toBeLessThanOrEqual(0);
  }
});
