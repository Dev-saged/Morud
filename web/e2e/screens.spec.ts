import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { adminUser, mockBackend } from './mock';

const roles = JSON.parse(readFileSync(new URL('../../spec/roles.json', import.meta.url), 'utf8'));
const permissions = JSON.parse(readFileSync(new URL('../../spec/permissions.json', import.meta.url), 'utf8'));

// لقطات مراجعة بصرية للشاشات (تُشغَّل يدوياً: SHOTS=1 npx playwright test screens)
test.skip(!process.env.SHOTS, 'لقطات يدوية');

const admin = { ...adminUser, permissions: ['users.manage', 'roles.manage', 'settings.manage', 'orders.view'] };
const now = Date.now();
const users = [
  { uid: 'own', displayName: 'ساجد العبادلة', username: 'sajed', phone: '0597857250', email: null, status: 'active', roles: ['super_admin'], grant: [], deny: [], lastLoginAt: now - 3600_000 },
  { uid: 'u2', displayName: 'محمد أبو سلمية', username: 'm.salmiya', phone: '0599123456', email: null, status: 'active', roles: ['orders_employee'], grant: ['reports.view'], deny: [], lastLoginAt: now - 86_400_000 },
  { uid: 'u3', displayName: 'سماح الشوا', username: 'samah', phone: '0592223344', email: null, status: 'active', roles: ['accountant'], grant: [], deny: [], lastLoginAt: now - 7200_000 },
  { uid: 'u4', displayName: 'أحمد النجار', username: 'a.najjar', phone: '0598887766', email: null, status: 'active', roles: ['delivery_agent'], grant: [], deny: [], lastLoginAt: null },
  { uid: 'u5', displayName: 'خالد الحلو', username: 'khaled', phone: '0591112233', email: null, status: 'suspended', roles: ['catalog_employee', 'orders_employee'], grant: [], deny: ['orders.cancel'], lastLoginAt: now - 9 * 86_400_000 },
];

for (const [name, size] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]] as const) {
  test(`users ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockBackend(page, admin as never, {
      'POST /auth/login': () => ({ json: { customToken: 'CT', user: admin } }),
      'GET /dashboard/summary': () => ({ json: {} }),
      'GET /admin/roles': () => ({ json: { roles: (roles as any).roles ?? roles, permissions: (permissions as any).permissions ?? permissions } }),
      'GET /admin/users': () => ({ json: { users } }),
      'GET /settings': () => ({ json: { settings: { platformName: 'مورد', workDays: [0, 1, 2, 3, 4, 5, 6], orderIntakeStart: '06:00', orderIntakeEnd: '23:00', deliveryStart: '06:00', deliveryEnd: '23:00', slaWorkingHours: 6, defaultPrepMinutes: 90, holidays: [], closures: [], paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }], creditWarnPercent: 80, creditBlocksDeferredOrders: true, newOrderSound: true, mfaFeature: false, supplier: { name: 'مورد', phone: '', address: '', taxId: '' } } } }),
    });
    await page.goto('/');
    await page.getByLabel('المعرّف').fill('sajed');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
    await page.getByRole('button', { name: 'دخول' }).click();
    await page.getByRole('button', { name: /المستخدمون/ }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/users-list-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: /محمد أبو سلمية/ }).click();
    await page.waitForTimeout(300);
    await page.getByText('تخصيص صلاحيات هذا المستخدم').click();
    await page.screenshot({ path: `shots/user-form-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'كل المستخدمين' }).click();
    await page.getByRole('tab', { name: /الأدوار/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/roles-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: /^موظف الطلبات/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/role-edit-${name}.png`, fullPage: true });
  });
}

for (const [name, size] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]] as const) {
  test(`settings ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockBackend(page, { ...admin, mfaAvailable: true } as never, {
      'POST /auth/login': () => ({ json: { customToken: 'CT', user: { ...admin, mfaAvailable: true } } }),
      'GET /dashboard/summary': () => ({ json: {} }),
      'GET /settings': () => ({ json: { settings: { platformName: 'مورد', workDays: [0, 1, 2, 3, 4, 6], orderIntakeStart: '06:00', orderIntakeEnd: '23:00', deliveryStart: '06:00', deliveryEnd: '23:00', slaWorkingHours: 6, defaultPrepMinutes: 90, holidays: ['2026-12-25'], closures: [], paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }, { id: 'bank_transfer', label: 'تحويل بنكي', enabled: false }], creditWarnPercent: 80, backupRetentionDays: 30, creditBlocksDeferredOrders: true, newOrderSound: true, mfaFeature: true, supplier: { name: 'مورد للتوريد', phone: '0597857250', address: 'غزة', taxId: '' } } } }),
    });
    await page.goto('/');
    await page.getByLabel('المعرّف').fill('sajed');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
    await page.getByRole('button', { name: 'دخول' }).click();
    await page.getByRole('button', { name: 'الإعدادات' }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/settings-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'أمان حسابي' }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/security-${name}.png`, fullPage: true });
  });
}

test('iphone install', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('dialog', { name: 'ثبّت مورد على جوالك' }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: 'shots/install-iphone.png' });
  await ctx.close();
});
