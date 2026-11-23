import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sparkline } from '../src/admin/AdminApp';
import { Api, ApiError } from '../src/lib/api';
import { cartReducer, EMPTY, loadCart, saveCart } from '../src/lib/cart';
import { formatDuration, stageIndex, STATUS } from '../src/lib/format';
import { iosBrowser, isIosSafari } from '../src/ui/InstallPrompt';

import { adminUser, catalog, json, mount, shopUser } from './helpers';

describe('المكتبات', () => {
  it('السلة: إضافة، دمج، تعديل، حذف، مفتاح محاولة ثابت، حفظ واسترجاع', () => {
    let c = cartReducer(EMPTY, { type: 'add', productId: 'p', unitId: 'box', qtyMilli: 1000 });
    c = cartReducer(c, { type: 'add', productId: 'p', unitId: 'box', qtyMilli: 2000 });
    expect(c.lines).toEqual([{ productId: 'p', unitId: 'box', qtyMilli: 3000 }]);
    c = cartReducer(c, { type: 'begin' });
    const key = c.pendingKey;
    expect(cartReducer(c, { type: 'begin' }).pendingKey).toBe(key);
    expect(cartReducer(c, { type: 'notes', value: 'x' }).pendingKey).toBe(key);
    expect(cartReducer(c, { type: 'set', productId: 'p', unitId: 'box', qtyMilli: 5000 }).pendingKey).toBeNull();
    expect(cartReducer(c, { type: 'set', productId: 'p', unitId: 'box', qtyMilli: 0 }).lines).toEqual([]);
    expect(cartReducer(c, { type: 'remove', productId: 'p', unitId: 'box' }).lines).toEqual([]);
    expect(cartReducer(c, { type: 'method', value: 'credit' }).paymentMethod).toBe('credit');
    saveCart(c);
    expect(loadCart().lines).toHaveLength(1);
    localStorage.setItem('mawred.cart.v1', '{bad');
    expect(loadCart()).toEqual(EMPTY);
    expect(cartReducer(c, { type: 'clear' })).toEqual(EMPTY);
    expect(cartReducer(EMPTY, { type: 'load', cart: c })).toBe(c);
  });
  it('العميل: الرمز ومفتاح منع التكرار والأخطاء العربية وانقطاع الشبكة', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => (init.method === 'POST' ? json({ error: { code: 'X', message: 'رسالة', details: { a: 1 } } }, 400) : json({ ok: 1 })));
    const api = new Api('https://a', async () => 'TOK', f as never);
    api.workContext = 'admin.finance';
    expect(await api.get('/x')).toEqual({ ok: 1 });
    expect(f.mock.calls[0]![1].headers).toMatchObject({ authorization: 'Bearer TOK', 'x-work-context': 'admin.finance' });
    await expect(api.post('/y', {}, 'K123')).rejects.toMatchObject({ code: 'X', message: 'رسالة', status: 400 });
    expect((f.mock.calls[1]![1].headers as Record<string, string>)['idempotency-key']).toBe('K123');
    const down = new Api('https://a', async () => null, (async () => { throw new TypeError('fail'); }) as never);
    await expect(down.get('/x')).rejects.toBeInstanceOf(ApiError);
    await expect(down.get('/x')).rejects.toMatchObject({ code: 'NETWORK' });
    const raw = new Api('https://a', async () => null, (async () => new Response('<html>')) as never);
    expect(await raw.request('GET', '/p', undefined, { raw: true })).toBe('<html>');
    const bad = new Api('https://a', async () => null, (async () => new Response('x', { status: 500 })) as never);
    await expect(bad.patch('/p', {})).rejects.toMatchObject({ code: 'ERROR' });
    await expect(bad.put('/p', {})).rejects.toMatchObject({ status: 500 });
  });
  it('التنسيق ومراحل الطلب والتثبيت على آيفون', () => {
    expect(STATUS.new!.label).toBe('جديد');
    expect(stageIndex('on_the_way')).toBe(stageIndex('out_for_delivery'));
    expect(stageIndex('financially_completed')).toBe(6);
    expect(formatDuration(3 * 3600_000 + 5 * 60_000)).toBe('3 س 5 د');
    expect(formatDuration(-5)).toBe('0 د');
    expect(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18.0 Mobile Safari/604.1', false)).toBe(true);
    expect(isIosSafari('Mozilla/5.0 (iPhone) CriOS/120 Safari/604.1', false)).toBe(false);
    expect(isIosSafari('Mozilla/5.0 (iPhone) Safari/604.1', true)).toBe(false);
    // كروم وإيدج على آيفون يدعمان الإضافة للشاشة أيضاً، وفايرفوكس يُوجَّه لسفاري، وآيباد الحديث يظهر كماك باللمس
    expect(iosBrowser('Mozilla/5.0 (iPhone) CriOS/120 Safari/604.1', false)).toBe('chrome');
    expect(iosBrowser('Mozilla/5.0 (iPhone) FxiOS/120 Safari/604.1', false)).toBe('other');
    expect(iosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1', false, true)).toBe('safari');
    expect(iosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1', false, false)).toBeNull();
    expect(iosBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36', false)).toBeNull();
    render(<Sparkline values={[1, 3, 2]} />);
  });
});

describe('الواجهة', () => {
  it('الدخول الموحد يوجّه صاحب المحل لواجهة المحل', async () => {
    const { b, calls } = mount({
      'POST /auth/login': () => json({ customToken: 'CT', user: shopUser }),
      'GET /catalog': () => json(catalog),
    });
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('المعرّف'), '0599888777');
    await u.type(screen.getByLabelText('كلمة المرور', { selector: 'input' }), 'Secret123');
    await u.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }));
    expect(screen.getByLabelText('كلمة المرور', { selector: 'input' })).toHaveProperty('type', 'text');
    await u.click(screen.getByRole('button', { name: 'دخول' }));
    expect(await screen.findByText('جبنة فيتا')).toBeTruthy();
    expect(b.tokens).toEqual(['CT']);
    expect(JSON.parse(String(calls[0]![1]!.body))).toEqual({ identifier: '0599888777', password: 'Secret123' });
    expect(screen.getByText('غير متوفر حالياً')).toBeTruthy();
  });
  it('خطأ الدخول يظهر بالعربية، ونسيت كلمة المرور', async () => {
    mount({ 'POST /auth/login': () => json({ error: { code: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' } }, 401), 'POST /auth/forgot': () => json({ ok: true }) });
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('المعرّف'), 'x');
    await u.type(screen.getByLabelText('كلمة المرور', { selector: 'input' }), 'y');
    await u.click(screen.getByRole('button', { name: 'دخول' }));
    expect((await screen.findByRole('alert')).textContent).toBe('بيانات الدخول غير صحيحة');
    await u.click(screen.getByRole('button', { name: 'نسيت كلمة المرور؟' }));
    await u.click(screen.getByRole('button', { name: 'إرسال' }));
    expect(await screen.findByText(/سيصلك رابط الاستعادة/)).toBeTruthy();
  });
  it('إضافة للسلة ثم إرسال الطلب بمفتاح منع تكرار، ومعالجة تغيّر السعر', async () => {
    let attempt = 0;
    const { calls } = mount({
      'GET /auth/me': () => json({ user: shopUser }),
      'GET /catalog': () => json(catalog),
      'POST /orders': () => (++attempt === 1 ? json({ error: { code: 'PRICE_CHANGED', message: 'تغيّرت الأسعار', details: { total: 900 } } }, 409) : json({ order: { id: 'o1' } }, 201)),
      'GET /orders/o1': () => json({ order: { id: 'o1', number: 'MW-O-2026-000001', status: 'new', items: [], totals: { total: 900 }, sla: { submittedAt: 1, clockStartAt: 1, dueAt: Date.now() + 3600_000, estimated: true } }, history: [], changes: [], internal: [], actions: [{ to: 'cancelled', reason: true }] }),
    }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'أضف جبنة فيتا إلى السلة' }));
    expect(screen.getByText('1', { selector: '.dot-badge' })).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /^1?السلة$/ }));
    expect(screen.getByText('غير مرسلة')).toBeTruthy();
    expect(screen.getAllByText('8.00 ₪').length).toBeGreaterThan(0);
    await u.click(screen.getByRole('button', { name: 'تأكيد وإرسال الطلب' }));
    expect(await screen.findByText(/تغيّرت الأسعار منذ إعداد السلة/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'موافق، أرسل بالسعر الجديد' }));
    expect(await screen.findByText('MW-O-2026-000001')).toBeTruthy();
    expect(screen.getByText(/متبقٍ/)).toBeTruthy();
    const posts = calls.filter(([p, i]) => p === '/orders' && i?.method === 'POST');
    expect(JSON.parse(String(posts[1]![1]!.body)).seenTotal).toBe(900);
    expect((posts[0]![1]!.headers as Record<string, string>)['idempotency-key']).toMatch(/^[a-f0-9]{32}$/);
    expect(loadCart().lines).toEqual([]);
  });
  it('البحث والتصفية في الكتالوج، والعمل بلا نت من النسخة المحفوظة', async () => {
    localStorage.setItem('mawred.c.so1./catalog', JSON.stringify({ at: 1, data: catalog }));
    mount({ 'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => { throw new TypeError('offline'); } }, true);
    const u = userEvent.setup();
    expect(await screen.findByText(/بلا اتصال/)).toBeTruthy();
    await u.type(screen.getByLabelText('بحث'), 'جبنه');
    expect(screen.getByText('جبنة فيتا')).toBeTruthy();
    expect(screen.queryByText('منتج نافد')).toBeNull();
    await u.clear(screen.getByLabelText('بحث'));
    await u.click(screen.getByRole('checkbox'));
    expect(screen.queryByText('منتج نافد')).toBeNull();
    await u.type(screen.getByLabelText('بحث'), 'غير موجود');
    expect(screen.getByText(/لا توجد منتجات مطابقة/)).toBeTruthy();
  });
  it('مدير النظام يرى لوحة المعلومات بالمؤشرات', async () => {
    mount({
      'GET /auth/me': () => json({ user: adminUser }),
      'GET /dashboard/summary': () => json({ ordersToday: 4, new: 2, review: 1, preparing: 1, overdue: 1, delivering: 0, completed: 0, salesToday: 24750, collectedToday: 0, totalDue: 24750, activeShops: 2, availableProducts: 10, unavailableProducts: 1, topProducts: [{ name: 'جبنة فيتا', count: 2 }], ordersLast7Days: [0, 1, 0, 2, 1, 0, 4], recent: [{ id: 'o1', number: 'MW-O-2026-000001', shopName: 'بقالة النور', status: 'new', total: 24750 }] }),
      'GET /orders': () => json({ orders: [{ id: 'o1', number: 'MW-O-2026-000001', shopName: 'بقالة النور', status: 'new', createdAt: Date.now(), items: 2, total: 24750, paymentMethod: 'cash', sla: { dueAt: Date.now(), overdue: false } }] }),
      'GET /reports': () => json({ reports: [{ id: 'debts', title: 'الديون المستحقة', allowed: true }, { id: 'profit', title: 'الأرباح', allowed: false }] }),
      'GET /reports/debts': () => json({ report: 'debts', title: 'الديون المستحقة', columns: [['shop', 'المحل'], ['balance', 'المستحق']], rows: [{ shop: 'بقالة النور', balance: 24750 }] }),
    }, true);
    expect((await screen.findAllByText('طلبات اليوم')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('247.50 ₪').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /^متأخرة: 1/ }).className).toContain('alert');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'الطلبات' }));
    expect(await screen.findByText('بقالة النور')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'التقارير' }));
    await u.click(await screen.findByRole('button', { name: 'الديون المستحقة' }));
    expect(await screen.findByText('247.50 ₪')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'الأرباح' })).toBeNull();
  });
  it('كل بطاقة وسطر في اللوحة يفتح تفاصيله', async () => {
    const order = { id: 'o1', number: 'MW-O-2026-000001', shopName: 'بقالة النور', status: 'new', items: [], totals: { total: 24750 }, address: {} };
    const { calls } = mount({
      'GET /auth/me': () => json({ user: adminUser }),
      'GET /dashboard/summary': () => json({ ordersToday: 4, new: 2, overdue: 1, activeShops: 2, topProducts: [{ productId: 'feta', name: 'جبنة فيتا', count: 2 }], ordersLast7Days: [0, 1, 0, 2, 1, 0, 4], recent: [{ id: 'o1', number: 'MW-O-2026-000001', shopName: 'بقالة النور', status: 'new', total: 24750 }] }),
      'GET /orders': () => json({ orders: [] }),
      'GET /orders/o1': () => json({ order, history: [], actions: [], internal: [], changes: [] }),
    }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /متأخرة: 1/ }));
    await waitFor(() => expect(calls.some(([p]) => p === '/orders?filter=overdue')).toBe(true));
    expect(screen.getByRole('button', { name: 'المتأخرة' }).className).toContain('on');
    // اللوحة مربعات فقط: «جديدة» تفتح فلترها، والمنتجات خارج صلاحياته غير قابلة للنقر
    await u.click(screen.getByRole('button', { name: 'لوحة المعلومات' }));
    await u.click(await screen.findByRole('button', { name: /^جديدة: 2/ }));
    await waitFor(() => expect(calls.some(([p]) => p === '/orders?filter=new')).toBe(true));
    await u.click(screen.getByRole('button', { name: 'لوحة المعلومات' }));
    expect(await screen.findByText('محلات نشطة')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^محلات نشطة/ })).toBeNull();
    expect(screen.queryByText('أحدث الطلبات')).toBeNull();
  });
  it('كلمة المرور المؤقتة تفرض شاشة التغيير', async () => {
    mount({ 'GET /auth/me': () => json({ user: { ...shopUser, mustChangePassword: true } }) }, true);
    expect(await screen.findByText('كلمة مرور جديدة')).toBeTruthy();
    await act(async () => undefined);
  });
  it('جلسة منتهية تعيد إلى الدخول', async () => {
    mount({ 'GET /auth/me': () => json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401) }, true);
    await waitFor(() => expect(screen.getByLabelText('المعرّف')).toBeTruthy());
  });
});

describe('نافذة التثبيت', () => {
  it('تظهر لزائر آيفون من شاشة الدخول بخطوات واضحة، و«فهمت» تؤجلها 3 أيام، وزر التثبيت يعيدها', async () => {
    const { render } = await import('@testing-library/react');
    const { InstallPrompt, InstallButton } = await import('../src/ui/InstallPrompt');
    const orig = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18.0 Mobile Safari/604.1', configurable: true });
    const u = userEvent.setup();
    mount({});
    await screen.findByLabelText('المعرّف');
    const sheet = await screen.findByRole('dialog', { name: 'ثبّت مورد على جوالك' }, { timeout: 6000 });
    expect(within(sheet).getByText(/في الشريط السفلي/)).toBeTruthy();
    expect(within(sheet).getByText('إضافة إلى الشاشة الرئيسية')).toBeTruthy();
    await u.click(within(sheet).getByRole('button', { name: 'فهمت' }));
    expect(screen.queryByRole('dialog', { name: 'ثبّت مورد على جوالك' })).toBeNull();
    expect(Number(localStorage.getItem('mawred.install.snooze'))).toBeGreaterThan(0);
    render(<><InstallPrompt delayMs={0} /><InstallButton /></>);
    expect(screen.queryByRole('dialog', { name: 'ثبّت مورد على جوالك' })).toBeNull();
    await u.click(screen.getByRole('button', { name: /تثبيت التطبيق على الجهاز/ }));
    expect(screen.getByRole('dialog', { name: 'خطوات التثبيت' })).toBeTruthy();
    Object.defineProperty(navigator, 'userAgent', { value: orig, configurable: true });
  }, 15000);
});

describe('الطلب السريع على الويب', () => {
  it('يفهم «3 جبنه» كرتونات (وحدة الصنف المعتادة) ويضيفها للسلة، ويشرح ما لم يفهمه', async () => {
    const cat2 = { ...catalog, products: catalog.products.map((p) => (p.id === 'feta' ? { ...p, defaultUnitId: 'carton' } : p)) };
    mount({ 'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => json(cat2) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByText('طلب سريع بالكتابة'));
    await u.type(screen.getByLabelText('نص الطلب السريع'), '3 جبنه، 2 تفاح');
    expect(screen.getByText(/3 كرتونة/)).toBeTruthy();
    expect(screen.getByText('(الوحدة المعتادة)')).toBeTruthy();
    expect(screen.getByText('لم أجد هذا الصنف')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'أضف 1 صنف إلى السلة' }));
    expect(loadCart().lines).toEqual([{ productId: 'feta', unitId: 'carton', qtyMilli: 3000 }]);
    expect(screen.getByRole('button', { name: 'كرتونة' }).className).toContain('on');
  });
});

describe('التفاصيل والعمل بلا نت في واجهة المحل', () => {
  it('النقر على المنتج يفتح تفاصيله بكل الوحدات والأسعار', async () => {
    mount({ 'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => json(catalog) }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'تفاصيل جبنة فيتا' }));
    const dlg = await screen.findByRole('dialog', { hidden: true });
    expect(dlg.textContent).toContain('كرتونة');
    expect(dlg.textContent).toContain('90.00 ₪');
  });
  it('طلب بلا نت يُحفظ بمفتاحه ويظهر «بانتظار الإرسال» ثم يُرسل وحده', async () => {
    let online = false;
    const keys: string[] = [];
    const { b } = mount({
      'GET /auth/me': () => json({ user: shopUser }),
      'GET /catalog': () => json(catalog),
      'GET /shops/s1/orders': () => json({ orders: [] }),
      'POST /orders': (init) => {
        keys.push((init!.headers as Record<string, string>)['idempotency-key']!);
        if (!online) throw new TypeError('Failed to fetch');
        return json({ order: { id: 'o9', number: 'MW-9' } }, 201);
      },
    }, true);
    void b;
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'أضف جبنة فيتا إلى السلة' }));
    await u.click(within(screen.getByRole('navigation', { name: 'التنقل' })).getByRole('button', { name: /السلة/ }));
    await u.click(screen.getByRole('button', { name: 'تأكيد وإرسال الطلب' }));
    expect(await screen.findByText('بانتظار الإرسال')).toBeTruthy();
    expect(loadCart().lines).toEqual([]);
    online = true;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByText('بانتظار الإرسال')).toBeNull());
    expect(new Set(keys).size).toBe(1);
  });
});

describe('لوحة صاحب المحل', () => {
  it('تعرض المستحق والحد وآخر طلب، و«اطلب مجدداً» يضيف بالوحدة المعتادة', async () => {
    const cat2 = { ...catalog, products: catalog.products.map((p) => (p.id === 'feta' ? { ...p, defaultUnitId: 'carton' } : p)) };
    mount({
      'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => json(cat2), 'GET /shops/s1/orders': () => json({ orders: [] }),
      'GET /orders/o7': () => json({ order: { id: 'o7', number: 'MW-7', status: 'preparing', items: [], totals: { subtotal: 0, discount: 0, total: 9000 } }, history: [], actions: [] }),
      'GET /me/summary': () => json({ open: 1, ordersMonth: 3, spendMonth: 27000, spendLast7Days: [0, 0, 9000, 0, 9000, 0, 9000], due: 9000, creditAvailable: 91000, last: { id: 'o7', number: 'MW-7', status: 'preparing', total: 9000, createdAt: Date.now() }, reorder: [{ productId: 'feta', name: 'جبنة فيتا', unitId: 'carton', count: 3 }] }),
    }, true);
    expect(await screen.findByText('عندك 1 طلب مفتوح')).toBeTruthy();
    expect(screen.getAllByText('90.00 ₪').length).toBeGreaterThan(0);
    const u = userEvent.setup();
    await u.click(within(screen.getByText('اطلب مجدداً').closest('.panel') as HTMLElement).getByRole('button', { name: /جبنة فيتا/ }));
    expect(loadCart().lines).toEqual([{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }]);
    await u.click(screen.getByRole('button', { name: 'آخر طلب MW-7' }));
    expect(await screen.findByRole('heading', { name: 'MW-7' })).toBeTruthy();
  });
});

describe('الرئيسية والعروض', () => {
  it('تعرض العروض والمميزة والأكثر طلباً، والسلة تحسب الخصم كالخادم فيرسل الإجمالي الصحيح', async () => {
    const now = Date.now();
    const cat2 = {
      ...catalog, ver: 'v1', popular: ['feta'],
      products: catalog.products.map((p) => (p.id === 'feta' ? { ...p, featured: true } : p)),
      promotions: [{ id: 'pr1', name: 'أسبوع الأجبان', type: 'item_percent', productIds: ['feta'], percentBp: 1000, startsAt: now - 1000, endsAt: now + 86_400_000, active: true, usedCount: 0 }],
    };
    let sent: any = null;
    mount({ 'GET /auth/me': () => json({ user: shopUser }), 'GET /catalog': () => json(cat2), 'POST /orders': (init) => { sent = JSON.parse(String(init?.body)); return json({ order: { id: 'o1' } }, 201); } }, true);
    const u = userEvent.setup();
    expect(await screen.findByRole('button', { name: /أسبوع الأجبان/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'منتجات مميزة' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'الأكثر طلباً' })).toBeTruthy();
    expect(screen.getAllByText(/خصم ١٠٪/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole('button', { name: /أسبوع الأجبان/ }));
    expect(screen.queryByRole('region', { name: 'منتجات مميزة' })).toBeNull();
    await u.click(screen.getAllByRole('button', { name: 'أضف جبنة فيتا إلى السلة' })[0]!);
    await u.click(within(screen.getByRole('navigation', { name: 'التنقل' })).getByRole('button', { name: /السلة/ }));
    expect(screen.getByText('خصم العروض')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'تأكيد وإرسال الطلب' }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent.seenTotal).toBe(720);
  });
});

describe('سجل العمليات', () => {
  it('يعرض من عدّل السعر وما تغيّر، والضغط على العنصر يفلتر عملياته', async () => {
    const log = { id: 'l1', at: Date.now(), action: 'products.price', actor: 'سامي', actorId: 'u9', entity: { kind: 'product', id: 'feta' }, result: 'ok', before: { price: 800, name: 'فيتا' }, after: { price: 900, name: 'فيتا' }, ip: '1.1.1.1', device: 'web' };
    const { calls } = mount({
      'GET /auth/me': () => json({ user: { ...adminUser, permissions: [...adminUser.permissions, 'audit.view'] } }),
      'GET /dashboard/summary': () => json({}),
      'GET /admin/users': () => json({ users: [{ uid: 'u9', displayName: 'سامي' }] }),
      'GET /admin/audit': () => json({ logs: [log], next: null }),
    }, true);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /سجل العمليات/ }));
    const item = (await screen.findByText('سامي', { selector: '.audit-head span' })).closest('li')!;
    expect(within(item).getByText('تعديل سعر')).toBeTruthy();
    await u.click(within(item).getByText('ما تغيّر (1)'));
    expect(within(item).getByText('900')).toBeTruthy();
    await u.click(within(item).getByRole('button', { name: /منتج feta/ }));
    await waitFor(() => expect(calls.some(([p]) => p === '/admin/audit?entity=feta')).toBe(true));
  });
});
