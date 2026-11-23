import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { adminUser, catalog, mockBackend, shopUser } from './mock';

/** فحص الوصولية الآلي (WCAG 2.1 AA) لكل شاشة رئيسية: لا مخالفة خطيرة أو حرجة. */
async function audit(page: Page, name: string) {
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.install-sheet').analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (process.env.A11Y_ALL) console.log(name, r.violations.map((v) => `${v.impact}:${v.id}:${v.nodes.length} ${v.nodes[0]?.target.join(' ')}`).join(' | '));
  if (bad.length) console.log(name, JSON.stringify(bad.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + n.failureSummary?.split('\n')[1]) })), null, 1));
  expect(bad.map((v) => v.id), name).toEqual([]);
}

const login = async (page: Page) => {
  await page.getByLabel('المعرّف').fill('x');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
  await page.getByRole('button', { name: 'دخول' }).click();
};

test('الوصولية: الدخول', async ({ page }) => {
  await mockBackend(page, shopUser as never, {});
  await page.goto('/');
  await page.getByLabel('المعرّف').waitFor();
  await audit(page, 'login');
});

test('الوصولية: واجهة المحل', async ({ page }) => {
  await mockBackend(page, shopUser as never, {
    'POST /auth/login': () => ({ json: { customToken: 'CT', user: shopUser } }),
    'GET /catalog': () => ({ json: { ...catalog, promotions: [], popular: [] } }),
    'GET /me/summary': () => ({ json: { area: 'shop', shopName: 'بقالة النور', open: 1, ordersMonth: 3, spendMonth: 45000, spendLast7Days: [0, 0, 9000, 0, 0, 0, 0], due: 0, creditAvailable: 100000, last: null, reorder: [] } }),
    'GET /notifications': () => ({ json: { notifications: [], unread: 0 } }),
    'GET /shops/s1/orders': () => ({ json: { orders: [] } }),
  });
  await page.goto('/');
  await login(page);
  await page.getByRole('button', { name: /تفاصيل/ }).first().waitFor();
  await audit(page, 'shop-home');
  await page.getByRole('button', { name: /أضف .* إلى السلة/ }).first().click();
  await page.getByRole('navigation', { name: 'التنقل' }).getByRole('button', { name: /السلة/ }).click();
  await audit(page, 'cart');
  await page.getByRole('navigation', { name: 'التنقل' }).getByRole('button', { name: /حسابي/ }).click();
  await audit(page, 'account');
});

test('الوصولية: الإدارة', async ({ page }) => {
  const admin = { ...adminUser, permissions: ['users.manage', 'roles.manage', 'settings.manage', 'orders.view', 'reports.view'] };
  await mockBackend(page, admin as never, {
    'POST /auth/login': () => ({ json: { customToken: 'CT', user: admin } }),
    'GET /dashboard/summary': () => ({ json: { orders: { today: 2, new: 1, review: 0, preparing: 0, ready: 0, delivering: 0, overdue: 0, completed: 1 }, products: { active: 131, unavailable: 0 }, shops: { active: 1 } } }),
    'GET /notifications': () => ({ json: { notifications: [], unread: 0 } }),
    'GET /admin/roles': () => ({ json: { roles: [{ id: 'orders_employee', label: 'موظف الطلبات', kind: 'staff', home: 'admin.orders', permissions: ['orders.view'] }], permissions: [{ id: 'orders.view', scope: 'staff', label: 'عرض الطلبات' }] } }),
    'GET /admin/users': () => ({ json: { users: [{ uid: 'u1', displayName: 'محمد', username: 'mo', phone: null, email: null, status: 'active', roles: ['orders_employee'], grant: [], deny: [], lastLoginAt: null }] } }),
    'GET /settings': () => ({ json: { settings: { platformName: 'مورد', workDays: [0, 1], orderIntakeStart: '06:00', orderIntakeEnd: '23:00', deliveryStart: '06:00', deliveryEnd: '23:00', slaWorkingHours: 6, defaultPrepMinutes: 90, holidays: [], paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }], creditWarnPercent: 80, backupRetentionDays: 30, mfaFeature: false, supplier: { name: 'مورد' } } } }),
    'GET /orders': () => ({ json: { orders: [] } }),
  });
  await page.goto('/');
  await login(page);
  await page.getByRole('heading', { name: 'لوحة المعلومات' }).waitFor();
  await audit(page, 'dashboard');
  for (const [nav, name] of [['الطلبات', 'orders'], ['المستخدمون', 'users'], ['الإعدادات', 'settings'], ['أمان حسابي', 'security']] as const) {
    await page.getByRole('button', { name: nav }).first().click();
    await audit(page, name);
  }
  await page.getByRole('button', { name: 'المستخدمون' }).first().click();
  await page.getByRole('button', { name: /محمد/ }).click();
  await audit(page, 'user-form');
});

test.describe('الوضع الليلي', () => {
  test.use({ colorScheme: 'dark' });
  test('الوصولية: تباين الألوان في الوضع الليلي', async ({ page }) => {
    await mockBackend(page, shopUser as never, {
      'POST /auth/login': () => ({ json: { customToken: 'CT', user: shopUser } }),
      'GET /catalog': () => ({ json: { ...catalog, promotions: [{ id: 'p1', name: 'أسبوع الأجبان', type: 'item_percent', productIds: [catalog.products[0]!.id], percentBp: 1000, startsAt: 0, endsAt: Date.now() + 9e7 }], popular: [] } }),
      'GET /me/summary': () => ({ json: { area: 'shop', shopName: 'بقالة النور', open: 0, ordersMonth: 0, spendMonth: 0, spendLast7Days: [0, 0, 0, 0, 0, 0, 0], due: 0, creditAvailable: 0, last: null, reorder: [] } }),
      'GET /notifications': () => ({ json: { notifications: [], unread: 0 } }),
    });
    await page.goto('/');
    await audit(page, 'login-dark');
    await login(page);
    await page.getByRole('button', { name: /أسبوع الأجبان/ }).waitFor();
    await audit(page, 'shop-dark');
  });
});
