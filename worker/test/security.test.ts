import { describe, expect, it } from 'vitest';
import { H, move, setup, submit, T } from './order-world';

/**
 * الاختبارات الأمنية الخمس عشرة المطلوبة في SRS 16.5، كل بند باسمه، على الخادم الحقيقي بقاعدة معزولة.
 * (التغطية التفصيلية لكل مسار موجودة في ملفات الوحدات؛ هنا الهجوم نفسه كما يجربه مخترق.)
 */
describe('SRS 16.5 — منع الثغرات', () => {
  it('1. حقن الاستعلامات: المدخلات بيانات لا أوامر', async () => {
    const w = setup();
    await submit(w);
    const evil = ["' OR '1'='1", '"; drop collection orders; --', '{"$ne":null}'];
    for (const e of evil) {
      const login = await w.call('POST', '/auth/login', { body: { identifier: e, password: e } });
      expect(login.status).toBe(401);
      const r = await w.call('GET', `/orders?filter=${encodeURIComponent(e)}`, { token: T(w, 'oe') });
      expect([200, 400]).toContain(r.status);
      if (r.status === 200) expect(r.body.orders).toHaveLength(0);
      expect((await w.call('GET', `/admin/audit?action=${encodeURIComponent(e)}`, { token: T(w, 'own') })).status).toBe(400);
    }
    expect((await w.call('GET', '/orders', { token: T(w, 'oe') })).body.orders).toHaveLength(1);
  });

  it('2. XSS: الأسماء المخزّنة تُهرَّب في كل صفحة يولّدها الخادم وتُمنع السكربتات', async () => {
    const w = setup();
    w.db.seed('products/feta', { ...(await w.db.get('products/feta'))!.data, name: '<img src=x onerror=alert(1)>' });
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await move(w, 'oe', id, 'confirmed');
    const inv = (await w.db.get(`orders/${id}`))!.data.invoiceId as string;
    const page = await w.call('GET', `/invoices/${inv}/print`, { token: T(w, 'so1') });
    expect(page.body).not.toContain('<img src=x');
    expect(page.body).toContain('&lt;img');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('3. CSRF: لا جلسات كوكيز؛ بلا ترويسة Bearer يُرفض الطلب، ونطاق غريب لا يحصل على إذن CORS', async () => {
    const w = setup();
    const r = await w.call('POST', '/orders', { headers: { ...H(), cookie: 'session=stolen', origin: 'https://evil.example' }, body: { shopId: 's1', items: [] } });
    expect(r.status).toBe(401);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await w.call('OPTIONS', '/orders', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(pre.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('4. IDOR: محل لا يصل لطلب أو كشف أو فواتير محل آخر بتغيير المعرّف', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    expect([403, 404]).toContain((await w.call('GET', `/orders/${id}`, { token: T(w, 'so2') })).status);
    expect((await w.call('GET', '/shops/s1/statement', { token: T(w, 'so2') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/invoices', { token: T(w, 'so2') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/orders', { token: T(w, 'so2') })).status).toBe(403);
  });

  it('5. كسر الصلاحيات: كل دور يُمنع خارج صلاحياته، والمندوب لا يحرّك طلب زميله', async () => {
    const w = setup();
    expect((await w.call('POST', '/admin/products', { token: T(w, 'so1'), headers: H(), body: { name: 'x' } })).status).toBe(403);
    expect((await w.call('POST', '/payments', { token: T(w, 'oe'), headers: H(), body: { shopId: 's1', method: 'cash', amount: 100 } })).status).toBe(403);
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'acc') })).status).toBe(403);
    expect((await w.call('PATCH', '/admin/users/own', { token: T(w, 'so1'), body: { roles: ['shop_owner'] } })).status).toBe(403);
    const id = (await submit(w)).body.order.id;
    for (const to of ['under_review', 'confirmed', 'preparing', 'ready_for_pickup']) await move(w, 'oe', id, to);
    await w.call('POST', `/orders/${id}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
    await move(w, 'dm', id, 'out_for_delivery');
    expect([403, 404]).toContain((await move(w, 'ag2', id, 'on_the_way')).status);
    expect((await move(w, 'so1', id, 'delivered')).status).toBeGreaterThanOrEqual(400);
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('out_for_delivery');
  });

  it('6. التخمين: بعد 5 محاولات خاطئة يُقفل الحساب مؤقتاً حتى بكلمة المرور الصحيحة', async () => {
    const w = setup();
    for (let i = 0; i < 5; i++) expect((await w.call('POST', '/auth/login', { body: { identifier: 'shop1', password: `wrong${i}` } })).status).toBe(401);
    const r = await w.call('POST', '/auth/login', { body: { identifier: 'shop1', password: 'Secret123' } });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('7. اختطاف الجلسة: إنهاء الجلسات أو تغيير الصلاحيات يُبطل كل رمز صادر قبلها فوراً', async () => {
    const w = setup();
    const old = w.tokenFor('so1', w.s.now() - 60_000);
    expect((await w.call('GET', '/auth/me', { token: old })).status).toBe(200);
    expect((await w.call('POST', '/admin/users/so1/revoke-sessions', { token: T(w, 'own') })).status).toBe(200);
    expect((await w.call('GET', '/auth/me', { token: old })).status).toBe(401);
    expect((await w.call('GET', '/auth/me', { token: 'forged.jwt.token' })).status).toBe(401);
  });

  it('8. تسريب الرموز: الردود لا تُخزَّن في أي كاش، ولا تحمل كلمات مرور أو أسراراً', async () => {
    const w = setup();
    const r = await w.call('POST', '/auth/login', { body: { identifier: 'shop1', password: 'Secret123' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/Secret123|"password"|loginEmail|refreshToken|passwordHash/i);
    const me = await w.call('GET', '/auth/me', { token: T(w, 'so1') });
    expect(JSON.stringify(me.body)).not.toMatch(/loginEmail|totp|secret/i);
  });

  it('9. الملفات الضارة: لا يُقبل إلا PNG/WebP حقيقي بحجم محدود، وأي ملف آخر يُرفض مهما ادعى نوعه', async () => {
    const w = setup();
    const up = (bytes: Uint8Array, type: string) => w.call('POST', '/admin/uploads/product-image', { token: T(w, 'own'), body: bytes as never, headers: { 'content-type': type } });
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect((await up(html, 'image/png')).status).toBe(400);
    expect((await up(svg, 'image/svg+xml')).status).toBe(400);
    expect((await up(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'image/png')).status).toBe(400);
    expect([400, 413]).toContain((await up(new Uint8Array(5_000_001), 'image/png')).status);
    expect((await up(html, 'image/png').then(() => w.call('POST', '/admin/uploads/product-image', { token: T(w, 'so1'), body: html as never }))).status).toBe(403);
  });

  it('10. التلاعب بالأسعار: الخادم يتجاهل أي سعر أو إجمالي يرسله التطبيق ويحسب بنفسه', async () => {
    const w = setup();
    const r = await w.call('POST', '/orders', { token: T(w, 'so1'), headers: H(), body: { shopId: 's1', paymentMethod: 'cash', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000, unitPrice: 1, total: 1 }], totals: { total: 1 }, discount: 99999 } });
    expect(r.status).toBe(201);
    expect(r.body.order.totals.total).toBe(9000);
    const fake = await w.call('POST', '/orders', { token: T(w, 'so1'), headers: H(), body: { shopId: 's1', paymentMethod: 'cash', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }], seenTotal: 1 } });
    expect(fake.body.error.code).toBe('PRICE_CHANGED');
    expect(fake.body.error.details.total).toBe(9000);
  });

  it('11. تكرار المعاملات المالية: نفس المفتاح مرتين = دفعة واحدة ورصيد يتغير مرة واحدة', async () => {
    const w = setup();
    const h = { 'idempotency-key': 'pay_dup_0000000000001' };
    const send = () => w.call('POST', '/payments', { token: T(w, 'acc'), headers: h, body: { shopId: 's1', method: 'cash', amount: 5000 } });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].filter((s) => s === 200 || s === 201).length).toBeGreaterThanOrEqual(1);
    await send();
    const pays = await w.db.query({ collection: 'payments' });
    expect(pays).toHaveLength(1);
    expect((await w.call('POST', '/payments', { token: T(w, 'acc'), body: { shopId: 's1', method: 'cash', amount: 5000 } })).status).toBe(400);
  });

  it('12. تجاوز حدود الكميات: صفر أو سالب أو كسر غير مسموح أو أقل من الحد أو خارج الخطوة أو ضخم يُرفض', async () => {
    const w = setup();
    const bad = [
      { productId: 'feta', unitId: 'carton', qtyMilli: 0 },
      { productId: 'feta', unitId: 'carton', qtyMilli: -1000 },
      { productId: 'feta', unitId: 'carton', qtyMilli: 1500 },
      { productId: 'nuts', unitId: 'kg', qtyMilli: 100 },
      { productId: 'nuts', unitId: 'kg', qtyMilli: 300 },
      { productId: 'feta', unitId: 'carton', qtyMilli: 1e15 },
      { productId: 'feta', unitId: 'carton', qtyMilli: 1.5 },
      { productId: 'off', unitId: 'box', qtyMilli: 1000 },
    ];
    for (const item of bad) {
      const r = await w.call('POST', '/orders', { token: T(w, 'so1'), headers: H(), body: { shopId: 's1', paymentMethod: 'cash', items: [item] } });
      expect(r.status, JSON.stringify(item)).toBeGreaterThanOrEqual(400);
    }
    const many = Array.from({ length: 301 }, () => ({ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }));
    expect((await w.call('POST', '/orders', { token: T(w, 'so1'), headers: H(), body: { shopId: 's1', paymentMethod: 'cash', items: many } })).status).toBe(400);
    expect(await w.db.query({ collection: 'orders' })).toHaveLength(0);
  });

  it('13. التلاعب بمعرّف المحل: لا طلب ولا مسودة باسم محل آخر', async () => {
    const w = setup();
    expect((await submit(w, 'so1', { shopId: 's2' })).status).toBe(403);
    expect((await submit(w, 'se1', { shopId: 's2' })).status).toBe(403);
    expect(await w.db.query({ collection: 'orders' })).toHaveLength(0);
  });

  it('14. الطلبات المزوّرة: رمز مزيف أو منتهي أو لحساب موقوف، وعمليات المال بلا مفتاح تكرار، كلها تُرفض', async () => {
    const w = setup();
    expect((await w.call('GET', '/orders', { token: 'x.y.z' })).status).toBe(401);
    expect((await w.call('GET', '/orders', { headers: { authorization: 'Basic abc' } })).status).toBe(401);
    w.db.seed('users/oe', { ...(await w.db.get('users/oe'))!.data, status: 'suspended' });
    expect((await w.call('GET', '/orders', { token: T(w, 'oe') })).status).toBe(403);
    expect((await w.call('POST', '/orders', { token: T(w, 'so1'), body: { shopId: 's1', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }] } })).status).toBe(400);
  });

  it('15. التلاعب بموقع التوصيل: الموقع يقبله الخادم من المندوب المسند فقط وأثناء المهمة فقط وبإحداثيات صحيحة', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    for (const to of ['under_review', 'confirmed', 'preparing', 'ready_for_pickup']) await move(w, 'oe', id, to);
    await w.call('POST', `/orders/${id}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
    const track = (uid: string, body: object) => w.call('POST', `/orders/${id}/track`, { token: T(w, uid), body });
    expect((await track('ag', { lat: 31.4, lng: 34.3 })).status).toBeGreaterThanOrEqual(400);
    await move(w, 'dm', id, 'out_for_delivery');
    await move(w, 'ag', id, 'on_the_way');
    expect((await track('ag2', { lat: 31.4, lng: 34.3 })).status).toBeGreaterThanOrEqual(400);
    expect((await track('so1', { lat: 31.4, lng: 34.3 })).status).toBe(403);
    expect((await track('ag', { lat: 191, lng: 34.3 })).status).toBe(400);
    expect((await track('ag', { lat: 'x', lng: 34.3 })).status).toBe(400);
    expect((await track('ag', { lat: 31.4, lng: 34.3 })).status).toBe(200);
    expect((await w.call('GET', `/orders/${id}/track`, { token: T(w, 'so2') })).status).toBe(403);
  });
});
