import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fromAgorot, toAgorot } from '../src/admin/kit';
import { hasTransparentEdges, removeBackground } from '../src/lib/cutout';
import { adminUser, catalog, json, mount, shopUser } from './helpers';

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
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['لوحة المعلومات', 'الطلبات', 'أمان حسابي', 'المساعدة']);
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
    expect(await screen.findByText('حُفظت الإعدادات')).toBeTruthy();
    expect(body(calls.find(([p]) => p === '/admin/settings')![1])).toEqual({ workDays: [0, 1, 2, 3, 4, 6] });
    await u.click(screen.getByRole('switch', { name: /التحقق بخطوتين/ }));
    await u.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }));
    await waitFor(() => expect(calls.filter(([p]) => p === '/admin/settings').length).toBe(2));
    expect(body(calls.filter(([p]) => p === '/admin/settings')[1]![1])).toEqual({ mfaFeature: true });
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

describe('المستخدمون والأدوار', () => {
  const roles = [
    { id: 'orders_employee', label: 'موظف الطلبات', kind: 'staff', home: 'admin.orders', permissions: ['orders.view'] },
    { id: 'accountant', label: 'الموظف المالي', kind: 'staff', home: 'admin.finance', permissions: ['payments.create'] },
  ];
  const permissions = [{ id: 'orders.view', scope: 'staff', label: 'عرض الطلبات' }, { id: 'orders.cancel', scope: 'staff', label: 'إلغاء طلب' }, { id: 'payments.create', scope: 'staff', label: 'تسجيل دفعة' }, { id: 'products.view', scope: 'any', label: 'عرض المنتجات' }];
  const users = [
    { uid: 'u1', displayName: 'محمد أبو سلمية', username: 'mo', phone: null, email: null, status: 'active', roles: ['orders_employee'], grant: [], deny: [], lastLoginAt: null },
    { uid: 'u2', displayName: 'سماح الشوا', username: 'samah', phone: null, email: null, status: 'active', roles: ['accountant'], grant: [], deny: [], lastLoginAt: null },
  ];
  it('تصفية بالدور، منح صلاحية خاصة بثلاث حالات، وتحرير دور بمجموعات وتحديد الكل', async () => {
    const own = { ...owner, permissions: [...owner.permissions, 'users.manage', 'roles.manage'] };
    const { calls } = mount({ 'GET /auth/me': () => json({ user: own }), 'GET /dashboard/summary': () => json(summary), 'GET /admin/roles': () => json({ roles, permissions }), 'GET /admin/users': () => json({ users }), 'PATCH /admin/users/u1': () => json({ ok: true }), 'PUT /admin/roles/orders_employee': () => json({ ok: true }) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /المستخدمون/ }));
    expect(await screen.findByRole('button', { name: /سماح الشوا/ })).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /^موظف الطلبات/ }));
    expect(screen.queryByRole('button', { name: /سماح الشوا/ })).toBeNull();
    await u.click(screen.getByRole('button', { name: /محمد أبو سلمية/ }));
    await u.click(screen.getByText('تخصيص صلاحيات هذا المستخدم'));
    const cancel = screen.getByRole('radiogroup', { name: 'إلغاء طلب' });
    await u.click(within(cancel).getByRole('radio', { name: 'منح' }));
    await u.click(within(screen.getByRole('radiogroup', { name: 'عرض الطلبات' })).getByRole('radio', { name: 'حجب' }));
    await u.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));
    await waitFor(() => expect(calls.some(([p]) => p === '/admin/users/u1')).toBe(true));
    expect(body(calls.find(([p]) => p === '/admin/users/u1')![1])).toMatchObject({ grant: ['orders.cancel'], deny: ['orders.view'], roles: ['orders_employee'] });
    await u.click(await screen.findByRole('tab', { name: /الأدوار/ }));
    await u.click(screen.getByRole('button', { name: /^موظف الطلبات/ }));
    expect(screen.getByText('عرض المنتجات')).toBeTruthy();
    const group = screen.getByRole('group', { name: /الطلبات/ });
    await u.click(within(group).getByRole('button', { name: 'تحديد الكل' }));
    await u.click(screen.getByRole('button', { name: 'حفظ الدور' }));
    await waitFor(() => expect(calls.some(([p]) => p === '/admin/roles/orders_employee')).toBe(true));
    expect(body(calls.find(([p]) => p === '/admin/roles/orders_employee')![1]).permissions.sort()).toEqual(['orders.cancel', 'orders.view']);
  });
});

describe('المساعدة والدعم', () => {
  it('الدليل يعرض موضوعات الإدارة حسب الصلاحيات فقط، والبحث يصفّيها', async () => {
    mount({ 'GET /auth/me': () => json({ user: { ...adminUser, home: 'admin.help', permissions: ['orders.view'] } }), 'GET /dashboard/summary': () => json(summary) }, true);
    expect(await screen.findByRole('heading', { name: 'المساعدة' })).toBeTruthy();
    const titles = () => screen.getAllByRole('group').map((d) => d.querySelector('summary b')!.textContent);
    expect(titles()).toEqual(['لوحة المعلومات', 'استقبال الطلبات ومراحلها']);
    expect(screen.queryByRole('tab', { name: /تواصل مع الدعم/ })).toBeNull();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('ابحث في الدليل'), 'الفاتوره');
    await waitFor(() => expect(titles()).toEqual(['استقبال الطلبات ومراحلها']));
  });
  it('المحل يراسل الدعم: نوع وعنوان وتفاصيل بمفتاح منع تكرار، ويرى رد الإدارة', async () => {
    let tickets: any[] = [];
    const { calls } = mount({
      'GET /auth/me': () => json({ user: { ...shopUser, permissions: [...shopUser.permissions, 'support.create'] } }),
      'GET /catalog': () => json(catalog),
      'GET /support': () => json({ tickets }),
      'POST /support': (i) => { tickets = [{ id: 't1', ...body(i), status: 'in_progress', createdAt: 1, replies: [{ text: 'سنعوضك بالطلب القادم', at: 2 }] }]; return json({ id: 't1' }, 201); },
    }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'حسابي' }));
    await u.click(await screen.findByRole('button', { name: /المساعدة والدعم/ }));
    await u.click(screen.getByRole('tab', { name: /تواصل مع الدعم/ }));
    await u.click(screen.getByRole('radio', { name: 'شكوى' }));
    await u.type(screen.getByLabelText('العنوان'), 'نقص في الطلب');
    await u.type(screen.getByLabelText('التفاصيل'), 'وصلت كرتونتان بدل ثلاث');
    await u.click(screen.getByRole('button', { name: 'إرسال' }));
    expect(await screen.findByText('سنعوضك بالطلب القادم')).toBeTruthy();
    const [, init] = calls.find(([p, i]) => p === '/support' && i?.method === 'POST')!;
    expect(body(init)).toEqual({ type: 'complaint', subject: 'نقص في الطلب', body: 'وصلت كرتونتان بدل ثلاث' });
    expect(headers(init)['idempotency-key']).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('التحية والسلة', () => {
  it('الكنية تبقى كاملة في التحية', async () => {
    const { shortName } = await import('../src/ui/Desk');
    expect(shortName('أبو أحمد الشوا')).toBe('أبو أحمد');
    expect(shortName('أم محمد')).toBe('أم محمد');
    expect(shortName('عبد الله النجار')).toBe('عبد الله');
    expect(shortName('سماح الشوا')).toBe('سماح');
  });
  it('السلة: زيادة وإنقاص بخطوة الوحدة، ولا نزول تحت الحد الأدنى', async () => {
    mount({ 'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => json(catalog) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'أضف جبنة فيتا إلى السلة' }));
    await u.click(screen.getAllByRole('button', { name: /السلة/ }).at(-1)!);
    const g = await screen.findByRole('group', { name: 'كمية جبنة فيتا' });
    expect(within(g).getByRole('button', { name: 'إنقاص' })).toHaveProperty('disabled', true);
    await u.click(within(g).getByRole('button', { name: 'زيادة' }));
    expect(within(g).getByText('2')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.total b')!.textContent).toBe('16.00 ₪'));
    await u.click(within(g).getByRole('button', { name: 'إنقاص' }));
    expect(within(g).getByText('1')).toBeTruthy();
  });
});
