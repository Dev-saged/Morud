import { test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mockBackend } from './mock';

// جولة لقطات على كل أقسام الإدارة ببيانات حقيقية ملتقطة محلياً (FX=/path/prod.json، لا تُرفع للمستودع)
const FX = process.env.FX ?? '';
test.skip(!FX || !existsSync(FX), 'لقطات يدوية');

for (const [name, size] of [['m', { width: 390, height: 844 }], ['d', { width: 1280, height: 860 }]] as const) {
  test(`admin sweep ${name}`, async ({ page }) => {
    test.setTimeout(180_000);
    const fx = JSON.parse(readFileSync(FX, 'utf8')) as Record<string, { status: number; json: any }>;
    const user = fx['/auth/me']!.json.user;
    await page.setViewportSize(size);
    const routes: Record<string, any> = { 'POST /auth/login': () => ({ json: { customToken: 'CT', user } }) };
    for (const [k, v] of Object.entries(fx)) routes[`GET ${k.split('?')[0]}`] = () => ({ status: v.status, json: v.json });
    await mockBackend(page, user, routes);
    await page.goto('/');
    await page.getByLabel('المعرّف').fill('x');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('Secret123');
    await page.getByRole('button', { name: 'دخول' }).click();
    await page.waitForTimeout(800);
    const nav = page.locator('nav.side button, .side button, aside button');
    const labels = (await page.locator('.side button').allTextContents()).map((t) => t.trim()).filter(Boolean);
    let i = 0;
    for (const l of labels) {
      await page.locator('.side button', { hasText: l }).first().click().catch(() => undefined);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `shots/sweep-${name}-${String(i++).padStart(2, '0')}.png`, fullPage: true });
    }
    void nav;
  });
}
