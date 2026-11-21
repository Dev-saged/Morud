import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fromAgorot, toAgorot } from '../src/admin/kit';
import { hasTransparentEdges, removeBackground } from '../src/lib/cutout';
import { adminUser, catalog, json, mount } from './helpers';

const owner = { ...adminUser, permissions: ['orders.view', 'products.view', 'products.create', 'products.update', 'products.availability.update', 'categories.manage', 'units.manage', 'shops.view', 'shops.create', 'shops.update', 'shops.suspend', 'shops.credit.manage', 'invoices.view', 'payments.create', 'payments.reverse', 'accounts.view', 'accounts.adjust', 'promotions.manage', 'users.manage', 'roles.manage', 'support.manage', 'settings.manage', 'backups.manage', 'reports.view'] };
const summary = { ordersToday: 0, new: 0, review: 0, preparing: 0, overdue: 0, delivering: 0, completed: 0, salesToday: 0, collectedToday: 0, totalDue: 0, activeShops: 0, availableProducts: 0, unavailableProducts: 0, topProducts: [], ordersLast7Days: [0, 0, 0, 0, 0, 0, 0], recent: [] };
const body = (i?: RequestInit) => JSON.parse(String(i?.body ?? '{}'));
const headers = (i?: RequestInit) => (i?.headers ?? {}) as Record<string, string>;

describe('أدوات الإدارة', () => {
  it('تحويل الشيكل إلى أغورة صحيحة بلا float', () => {
    expect(toAgorot('12.5')).toBe(1250);
    expect(toAgorot('12,05')).toBe(1205);
    expect(toAgorot('7')).toBe(700);
    expect(toAgorot('1.234')).toBeNaN();
    expect(toAgorot('abc')).toBeNaN();
    expect(fromAgorot(1250)).toBe('12.50');
  });
  it('التفريغ: يزيل الخلفية المتصلة بالحواف ويُبقي المنتج', () => {
    const w = 10, h = 10, d = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const x = p % w, y = Math.floor(p / w), inside = x >= 3 && x <= 6 && y >= 3 && y <= 6;
      d.set(inside ? [200, 30, 30, 255] : [250, 250, 250, 255], p * 4);
    }
    expect(hasTransparentEdges(d, w, h)).toBe(false);
    const removed = removeBackground(d, w, h);
    expect(removed).toBe(100 - 16);
    expect(d[0 * 4 + 3]).toBe(0);
    expect(d[(5 * w + 5) * 4 + 3]).toBe(255);
    expect(hasTransparentEdges(d, w, h)).toBe(true);
  });
});

describe('لوحة الإدارة الشاملة', () => {
  it('الأقسام تظهر حسب الصلاحيات فقط', async () => {
    mount({ 'GET /auth/me': () => json({ user: { ...adminUser, permissions: ['orders.view'] } }), 'GET /dashboard/summary': () => json(summary) }, true);
    const nav = await screen.findByRole('navigation', { name: 'أقسام الإدارة' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['لوحة المعلومات', 'الطلبات']);
  });
  it('الواجهة الافتراضية حسب الدور: موظف المنتجات يبدأ بالمنتجات ويغيّر التوفر', async () => {
    const { calls } = mount({
      'GET /auth/me': () => json({ user: { ...owner, home: 'admin.products' } }),
      'GET /catalog': () => json(catalog),
      'PATCH /admin/products/feta': () => json({ product: {} }),
    }, true);
    expect(await screen.findByRole('heading', { name: 'المنتجات والتصنيفات' })).toBeTruthy();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'متوفر' }));
    expect(await screen.findByText('تم تحديث التوفر')).toBeTruthy();
    expect(body(calls.find(([p, i]) => p === '/admin/products/feta' && i?.method === 'PATCH')![1])).toEqual({ available: false });
  });
  it('إنشاء منتج بسعر بالأغورة ومفتاح منع تكرار', async () => {
    const { calls } = mount({ 'GET /auth/me': () => json({ user: { ...owner, home: 'admin.products' } }), 'GET /catalog': () => json(catalog), 'POST /admin/products': () => json({ id: 'n1' }, 201) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'منتج جديد' }));
    await u.type(screen.getByLabelText('اسم المنتج'), 'لبنة');
    await u.type(screen.getByLabelText('الرمز (SKU)'), 'dai-9');
    await u.type(screen.getByLabelText('السعر (₪)'), '12.5');
    await u.click(screen.getByRole('button', { name: 'حفظ المنتج' }));
    expect(await screen.findByRole('heading', { name: 'المنتجات والتصنيفات' })).toBeTruthy();
    const [, init] = calls.find(([p, i]) => p === '/admin/products' && i?.method === 'POST')!;
    const b = body(init);
    expect(b.units[0]).toMatchObject({ price: 1250, factorToBase: 1000 });
    expect(b).toMatchObject({ name: 'لبنة', sku: 'dai-9', categoryId: 'dairy' });
    expect(headers(init)['idempotency-key']).toMatch(/^[a-f0-9]{32}$/);
  });
  it('إنشاء محل يعرض كلمة المرور المؤقتة مرة واحدة', async () => {
    const { calls } = mount({
      'GET /auth/me': () => json({ user: { ...owner, home: 'admin.dashboard' } }), 'GET /dashboard/summary': () => json(summary),
      'GET /admin/shops': () => json({ shops: [] }), 'POST /admin/shops': () => json({ shopId: 's9', ownerUid: 'u9', tempPassword: 'Ab3kq9Zt2m' }, 201),
    }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'المحلات' }));
    await u.click(await screen.findByRole('button', { name: 'محل جديد' }));
    for (const [l, v] of [['اسم المحل', 'بقالة الأمل'], ['اسم صاحب المحل', 'أبو سامي'], ['الهاتف الأساسي', '0599111222'], ['المنطقة', 'الوسطى'], ['المدينة', 'دير البلح'], ['العنوان التفصيلي', 'شارع البحر'], ['اسم المستخدم لصاحب المحل (لاتيني)', 'amal']] as const) await u.type(screen.getByLabelText(l), v);
    await u.click(screen.getByRole('checkbox', { name: 'يسمح بالآجل' }));
    await u.clear(screen.getByLabelText('الحد الائتماني (₪)'));
    await u.type(screen.getByLabelText('الحد الائتماني (₪)'), '1500');
    await u.click(screen.getByRole('button', { name: 'إنشاء المحل' }));
    expect(await screen.findByText('Ab3kq9Zt2m')).toBeTruthy();
    const b = body(calls.find(([p, i]) => p === '/admin/shops' && i?.method === 'POST')![1]);
    expect(b).toMatchObject({ name: 'بقالة الأمل', owner: { username: 'amal' }, credit: { enabled: true, limit: 150000 }, paymentTerms: ['cash', 'credit'] });
  });
  it('تسجيل دفعة: مبلغ صحيح بالأغورة، مفتاح جديد بعد النجاح', async () => {
    const { calls } = mount({
      'GET /auth/me': () => json({ user: { ...owner, home: 'admin.finance' } }),
      'GET /admin/shops': () => json({ shops: [{ id: 's1', name: 'بقالة النور', balance: 24750 }] }),
      'GET /shops/s1/payments': () => json({ payments: [] }),
      'POST /payments': () => json({ payment: { id: 'p1' }, replayed: false }, 201),
    }, true);
    const u = userEvent.setup();
    await u.selectOptions(await screen.findByLabelText('المحل'), 's1');
    await u.type(screen.getByLabelText('المبلغ (₪)'), '100');
    await u.click(screen.getByRole('button', { name: 'تسجيل الدفعة' }));
    expect(await screen.findByText(/سُجّلت الدفعة/)).toBeTruthy();
    await u.type(screen.getByLabelText('المبلغ (₪)'), '5.25');
    await u.click(screen.getByRole('button', { name: 'تسجيل الدفعة' }));
    await screen.findByText(/سُجّلت الدفعة/);
    const posts = calls.filter(([p, i]) => p === '/payments' && i?.method === 'POST');
    expect(posts.map(([, i]) => body(i).amount)).toEqual([10000, 525]);
    expect(headers(posts[0]![1])['idempotency-key']).not.toBe(headers(posts[1]![1])['idempotency-key']);
  });
  it('الإعدادات: تعديل العطلة الأسبوعية وحفظها', async () => {
    const settings = { platformName: 'مورد', workDays: [0, 1, 2, 3, 4, 5, 6], orderIntakeStart: '06:00', orderIntakeEnd: '23:00', deliveryStart: '06:00', deliveryEnd: '23:00', slaWorkingHours: 6, defaultPrepMinutes: 90, holidays: [], paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }], creditWarnPercent: 80, backupRetentionDays: 30 };
    const { calls } = mount({ 'GET /auth/me': () => json({ user: owner }), 'GET /dashboard/summary': () => json(summary), 'GET /settings': () => json({ settings }), 'PATCH /admin/settings': () => json({ settings }) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'الإعدادات' }));
    await u.click(await screen.findByRole('button', { name: 'الجمعة' }));
    await u.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }));
    expect(await screen.findByText('تم الحفظ')).toBeTruthy();
    expect(body(calls.find(([p]) => p === '/admin/settings')![1]).workDays).toEqual([0, 1, 2, 3, 4, 6]);
  });
  it('خطأ الخادم يظهر بالعربية داخل القسم', async () => {
    mount({ 'GET /auth/me': () => json({ user: owner }), 'GET /dashboard/summary': () => json(summary), 'GET /admin/backups': () => json({ backups: [{ id: 'b1', at: 1, docs: 10, bytes: 2048, status: 'ok' }] }), 'POST /admin/backups/run': () => json({ error: { code: 'BACKUP_FAILED', message: 'تعذّر إنشاء النسخة' } }, 500) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'النسخ الاحتياطي' }));
    expect(await screen.findByText('ناجحة')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'نسخة الآن' }));
    expect((await screen.findByRole('alert')).textContent).toBe('تعذّر إنشاء النسخة');
  });
});

describe('علامة مورد على الصور', () => {
  it('في الزاوية السفلية بعرض 14% وحد أدنى 40px، داخل الصورة دائماً', async () => {
    const { markRect } = await import('../src/lib/cutout');
    expect(markRect(1000, 800)).toEqual({ x: 24, y: 800 - 112 - 24, size: 112 });
    const small = markRect(100, 100);
    expect(small.size).toBe(40);
    for (const [w, h] of [[64, 64], [1600, 900], [300, 1200]] as const) {
      const r = markRect(w, h);
      expect(r.x + r.size).toBeLessThanOrEqual(w);
      expect(r.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('مراجعة المسودات ونشرها', () => {
  it('فلتر المسودات ونشرها دفعة واحدة', async () => {
    const drafts = { ...catalog, products: catalog.products.map((p) => ({ ...p, visible: false })) };
    const { calls } = mount({ 'GET /auth/me': () => json({ user: { ...owner, home: 'admin.products' } }), 'GET /catalog': () => json(drafts), 'PATCH /admin/products/feta': () => json({}), 'PATCH /admin/products/off': () => json({}) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'المسودات (2)' }));
    await u.click(screen.getByRole('button', { name: 'انشر 2 مسودة' }));
    expect(await screen.findByText('نُشر 2 منتج')).toBeTruthy();
    const pubs = calls.filter(([p, i]) => p.startsWith('/admin/products/') && i?.method === 'PATCH');
    expect(pubs.map(([, i]) => JSON.parse(String(i!.body)))).toEqual([{ visible: true }, { visible: true }]);
  });
});
