import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sparkline } from '../src/admin/AdminApp';
import { Api, ApiError } from '../src/lib/api';
import { cartReducer, EMPTY, loadCart, saveCart } from '../src/lib/cart';
import { formatDuration, stageIndex, STATUS } from '../src/lib/format';
import { isIosSafari } from '../src/ui/InstallPrompt';

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
    await u.click(screen.getByRole('button', { name: 'لوحة المعلومات' }));
    await u.click(await screen.findByRole('button', { name: /MW-O-2026-000001/ }));
    expect(await screen.findByRole('heading', { name: /MW-O-2026-000001 — بقالة النور/ })).toBeTruthy();
    // المنتجات خارج صلاحيات هذا المستخدم: السطر يظهر لكنه غير قابل للنقر
    await u.click(screen.getByRole('button', { name: 'لوحة المعلومات' }));
    expect(await screen.findByText('جبنة فيتا')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /جبنة فيتا/ })).toBeNull();
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
  it('لا تظهر في شاشة الدخول، وتظهر بعد المهلة لمستخدم آيفون ويمكن تأجيلها', async () => {
    const { render } = await import('@testing-library/react');
    const { InstallPrompt } = await import('../src/ui/InstallPrompt');
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18.0 Mobile Safari/604.1', configurable: true });
    mount({});
    await screen.findByLabelText('المعرّف');
    expect(screen.queryByRole('dialog', { name: 'تثبيت مورد' })).toBeNull();
    render(<InstallPrompt delayMs={0} />);
    expect(await screen.findByRole('dialog', { name: 'تثبيت مورد' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'لاحقاً' }));
    expect(screen.queryByRole('dialog', { name: 'تثبيت مورد' })).toBeNull();
  });
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
    expect(await screen.findByText(/MW-7/)).toBeTruthy();
  });
});
