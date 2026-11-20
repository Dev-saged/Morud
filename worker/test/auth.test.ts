import { describe, expect, it } from 'vitest';
import { assertShopAccess, idempotent, requirePerm } from '../src/api/context';
import { json } from '../src/api/http';
import { addUser, world } from './helpers';

const login = (w: ReturnType<typeof world>, identifier: string, password = 'Secret123', ip?: string) =>
  w.call('POST', '/auth/login', { body: { identifier, password }, ...(ip ? { headers: { 'cf-connecting-ip': ip } } : {}) });

describe('الدخول الموحد (SRS 2.1–2.2)', () => {
  it('صاحب محل يدخل ويُوجَّه للوحة المحل مع claims للقواعد', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'abu.ahmad', roles: ['shop_owner'], shopIds: ['s1'], phone: '0599123456' });
    const r = await login(w, '+970 599 123 456');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ uid: 'u1', home: 'shop.home', shopIds: ['s1'] });
    expect(r.body.user.permissions).toContain('shop.orders.submit');
    expect(r.body.customToken).toContain('"sh":["s1"]');
    expect(r.body.customToken).toContain('"k":["shop"]');
    expect((await w.db.get('users/u1'))!.data.lastLoginAt).toBe(w.clock.now);
  });
  it('مدير النظام يُوجَّه للوحة الإدارة', async () => {
    const w = world();
    addUser(w, 'a1', { username: 'owner', roles: ['super_admin'] });
    const r = await login(w, 'OWNER');
    expect(r.body.user.home).toBe('admin.dashboard');
    expect(r.body.customToken).toContain('"rp":["ov"');
  });
  it('رسالة عامة للمعرّف المجهول وكلمة المرور الخاطئة، مع تسجيل تدقيق', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    for (const [id, pw] of [['nobody', 'x1234567'], ['shop1', 'wrongpass1'], ['!!', 'x'], ['shop1', '']]) {
      const r = await login(w, id!, pw);
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('بيانات الدخول غير صحيحة');
    }
    const audits = await w.db.query({ collection: 'auditLogs', where: [['result', '==', 'denied']] });
    expect(audits.length).toBe(3);
  });
  it('خمس محاولات خاطئة تقفل المعرّف، وكثرة الطلبات من نفس IP تقفله', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    for (let i = 0; i < 5; i++) await login(w, 'shop1', 'wrongpass1');
    expect((await login(w, 'shop1')).body.error.code).toBe('RATE_LIMITED');
    for (let i = 0; i < 30; i++) await login(w, `ghost${i}`, 'x12345678', '10.9.9.9');
    expect((await login(w, 'other', 'x', '10.9.9.9')).body.error.code).toBe('RATE_LIMITED');
  });
  it('الدخول الناجح يصفّر عداد المحاولات', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    for (let i = 0; i < 4; i++) await login(w, 'shop1', 'wrongpass1');
    expect((await login(w, 'shop1')).status).toBe(200);
    for (let i = 0; i < 4; i++) await login(w, 'shop1', 'wrongpass1');
    expect((await login(w, 'shop1')).status).toBe(200);
  });
  it('الحساب الموقوف أو المنتهي أو المعطّل في Firebase لا يدخل', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'stopped', roles: ['shop_owner'], status: 'suspended' });
    addUser(w, 'u2', { username: 'old', roles: ['shop_owner'], expiresAt: w.clock.now - 1 });
    addUser(w, 'u3', { username: 'disabled', roles: ['shop_owner'] });
    w.identity.passwords.get('uu3@login.mawred')!.disabled = true;
    expect((await login(w, 'stopped')).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await login(w, 'old')).body.error.code).toBe('ACCOUNT_EXPIRED');
    expect((await login(w, 'disabled')).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
  it('تعطّل خدمة الدخول يعيد 503 لا «بيانات خاطئة»', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    w.identity.down = true;
    expect((await login(w, 'shop1')).status).toBe(503);
  });
  it('فهرس دخول يشير لحساب آخر أو بلا ملف يُرفض', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    w.db.seed('logins/u:evil', { uid: 'u9', loginEmail: 'uu1@login.mawred' });
    expect((await login(w, 'evil')).status).toBe(401);
    w.identity.passwords.set('ghost@login.mawred', { uid: 'g1', pw: 'Secret123' });
    w.db.seed('logins/u:ghost', { uid: 'g1', loginEmail: 'ghost@login.mawred' });
    expect((await login(w, 'ghost')).status).toBe(401);
  });
});

describe('الجلسة والصلاحيات على كل طلب', () => {
  it('/auth/me يتطلب جلسة صالحة', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'], shopIds: ['s1'] });
    expect((await w.call('GET', '/auth/me')).status).toBe(401);
    expect((await w.call('GET', '/auth/me', { token: 'forged' })).status).toBe(401);
    const r = await w.call('GET', '/auth/me', { token: w.tokenFor('u1') });
    expect(r.body.user.uid).toBe('u1');
  });
  it('إلغاء الجلسات يرفض الرموز القديمة فوراً', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    const old = w.tokenFor('u1');
    w.clock.now += 1000;
    expect((await w.call('POST', '/auth/logout-all', { token: old })).status).toBe(200);
    expect(w.identity.updates.at(-1)).toMatchObject({ uid: 'u1', patch: { revokeSessions: true } });
    expect((await w.call('GET', '/auth/me', { token: old })).status).toBe(401);
    w.clock.now += 1000;
    expect((await w.call('GET', '/auth/me', { token: w.tokenFor('u1') })).status).toBe(200);
  });
  it('إيقاف الحساب يقطع الجلسات القائمة', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    const t = w.tokenFor('u1');
    await w.db.commit([{ kind: 'update', path: 'users/u1', data: { status: 'suspended' } }]);
    expect((await w.call('GET', '/auth/me', { token: t })).body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
  it('تغيير الدور من الهاتف لا يمنح صلاحية: الصلاحيات من الخادم فقط (SRS 19.2)', async () => {
    const w = world([(r) => r.on('GET', '/t/admin', async (ctx) => (requirePerm(ctx, 'settings.manage'), json({ ok: true })))]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    const r = await w.call('GET', '/t/admin', { token: w.tokenFor('u1'), headers: { 'x-work-context': 'admin.dashboard', 'x-role': 'super_admin' } });
    expect(r.status).toBe(403);
    expect(r.body.error.details.missing).toEqual(['settings.manage']);
  });
  it('كلمة مرور مؤقتة: كل المسارات مغلقة حتى تغييرها', async () => {
    const w = world([(r) => r.on('GET', '/t/x', async () => json({ ok: true }))]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'], mustChangePassword: true });
    const t = w.tokenFor('u1');
    expect((await w.call('GET', '/t/x', { token: t })).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await w.call('POST', '/auth/change-password', { token: t, body: { newPassword: 'short' } })).body.error.code).toBe('PASSWORD_TOO_SHORT');
    expect((await w.call('POST', '/auth/change-password', { token: t, body: { newPassword: 'onlyletters' } })).body.error.code).toBe('PASSWORD_WEAK');
    const ok = await w.call('POST', '/auth/change-password', { token: t, body: { newPassword: 'NewPass2026' } });
    expect(ok.status).toBe(200);
    expect(ok.body.customToken).toContain('custom:u1');
    expect((await w.db.get('users/u1'))!.data.mustChangePassword).toBe(false);
    w.clock.now += 1000;
    expect((await w.call('GET', '/t/x', { token: w.tokenFor('u1') })).status).toBe(200);
    expect((await login(w, 'shop1', 'NewPass2026')).status).toBe(200);
  });
  it('سياق العمل يُقبل فقط من سياقات المستخدم', async () => {
    let seen = '';
    const w = world([(r) => r.on('GET', '/t/ctx', async (ctx) => ((seen = ctx.workContext ?? ''), json({})))]);
    addUser(w, 'm1', { username: 'multi', roles: ['delivery_manager', 'accountant'] });
    await w.call('GET', '/t/ctx', { token: w.tokenFor('m1'), headers: { 'x-work-context': 'admin.delivery' } });
    expect(seen).toBe('admin.delivery');
    await w.call('GET', '/t/ctx', { token: w.tokenFor('m1'), headers: { 'x-work-context': 'admin.dashboard' } });
    expect(seen).toBe('admin.finance');
  });
  it('الوصول لبيانات محل: عضوه أو موظف بالصلاحية فقط', async () => {
    const w = world([(r) => r.on('GET', '/t/shop/:id', async (ctx, p) => (assertShopAccess(ctx, p.id!, 'shops.view'), json({ ok: true })))]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'], shopIds: ['s1'] });
    addUser(w, 'e1', { username: 'acc', roles: ['accountant'] });
    addUser(w, 'd1', { username: 'agent', roles: ['delivery_agent'] });
    expect((await w.call('GET', '/t/shop/s1', { token: w.tokenFor('u1') })).status).toBe(200);
    expect((await w.call('GET', '/t/shop/s2', { token: w.tokenFor('u1') })).status).toBe(403);
    expect((await w.call('GET', '/t/shop/s2', { token: w.tokenFor('e1') })).status).toBe(200);
    expect((await w.call('GET', '/t/shop/s2', { token: w.tokenFor('d1') })).status).toBe(403);
  });
  it('أدوار مخصصة من قاعدة البيانات وصلاحيات مضافة وقت التشغيل', async () => {
    const w = world([(r) => r.on('GET', '/t/custom', async (ctx) => (requirePerm(ctx, 'reports.custom'), json({ ok: true })))]);
    w.db.seed('roles/night_supervisor', { label: 'مشرف ليلي', kind: 'staff', home: 'admin.orders', permissions: ['orders.view', 'reports.custom'] });
    w.db.seed('system/permissions', { extra: [{ id: 'reports.custom', scope: 'staff', label: 'تقرير مخصص' }] });
    addUser(w, 'n1', { username: 'night', roles: ['night_supervisor'] });
    expect((await w.call('GET', '/t/custom', { token: w.tokenFor('n1') })).status).toBe(200);
  });
});

describe('منع التكرار (SRS 17 و19.3-4)', () => {
  const mod = (r: any) => r
    .on('POST', '/t/once', async (ctx: any) => {
      const { value, replayed } = await idempotent(ctx, 'test.once', async (tx) => {
        const c = (await tx.get('counters/t'))?.data.n ?? 0;
        tx.write({ kind: 'set', path: 'counters/t', data: { n: (c as number) + 1 } });
        return { n: (c as number) + 1 };
      });
      return json({ ...value, replayed });
    })
    .on('POST', '/t/other', async (ctx: any) => json((await idempotent(ctx, 'test.other', async () => ({}))).value));
  it('نفس المفتاح مرتين = تنفيذ واحد ونفس النتيجة', async () => {
    const w = world([mod]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    const t = w.tokenFor('u1');
    const h = { 'idempotency-key': 'k_abcdefghijklmnop' };
    const [a, b] = await Promise.all([w.call('POST', '/t/once', { token: t, headers: h }), w.call('POST', '/t/once', { token: t, headers: h })]);
    expect([a.body.n, b.body.n]).toEqual([1, 1]);
    expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
    expect((await w.db.get('counters/t'))!.data.n).toBe(1);
  });
  it('مفتاح مفقود أو مستخدم لعملية أخرى يُرفض', async () => {
    const w = world([mod]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    const t = w.tokenFor('u1');
    expect((await w.call('POST', '/t/once', { token: t })).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    await w.call('POST', '/t/once', { token: t, headers: { 'idempotency-key': 'k_abcdefghijklmnop' } });
    expect((await w.call('POST', '/t/other', { token: t, headers: { 'idempotency-key': 'k_abcdefghijklmnop' } })).body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('نسيت كلمة المرور', () => {
  it('ببريد يرسل رابطاً، بلا بريد ينشئ تذكرة، والمجهول رد عام', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'mail', roles: ['accountant'], email: 'acc@mawred.ps' });
    addUser(w, 'u2', { username: 'nomail', roles: ['shop_owner'], shopIds: ['s1'] });
    addUser(w, 'u3', { username: 'off', roles: ['shop_owner'], status: 'suspended' });
    for (const id of ['mail', 'nomail', 'ghost', 'off', '!!']) expect((await w.call('POST', '/auth/forgot', { body: { identifier: id } })).status).toBe(200);
    expect(w.identity.resets).toEqual(['acc@mawred.ps']);
    const t = await w.db.query({ collection: 'supportTickets' });
    expect(t.map((x) => x.data)).toEqual([expect.objectContaining({ type: 'password_reset', by: 'u2', shopId: 's1' })]);
  });
  it('يتوقف بصمت عند كثرة الطلبات', async () => {
    const w = world();
    addUser(w, 'u1', { username: 'mail', roles: ['accountant'], email: 'a@b.ps' });
    for (let i = 0; i < 35; i++) await w.call('POST', '/auth/forgot', { body: { identifier: 'mail' } });
    expect(w.identity.resets.length).toBe(30);
  });
});

describe('سلوك HTTP العام', () => {
  it('الصحة، 404، 405، JSON تالف، حجم كبير، CORS', async () => {
    const w = world();
    expect((await w.call('GET', '/health')).body.ok).toBe(true);
    expect((await w.call('GET', '/nope')).status).toBe(404);
    expect((await w.call('GET', '/auth/login')).status).toBe(405);
    expect((await w.call('POST', '/auth/login', { body: '{bad' })).body.error.code).toBe('BAD_JSON');
    expect((await w.call('POST', '/auth/login', { body: '[]' })).body.error.code).toBe('BAD_JSON');
    expect((await w.call('POST', '/auth/login', { body: { identifier: 'x'.repeat(5000) } })).status).toBe(413);
    expect((await w.call('POST', '/auth/login', { body: { identifier: 5 } })).body.error.code).toBe('VALIDATION');
    const pre = await w.call('OPTIONS', '/auth/login', { headers: { origin: 'https://app.test' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://app.test');
    expect((await w.call('OPTIONS', '/auth/login', { headers: { origin: 'https://evil.test' } })).status).toBe(403);
    expect((await w.call('GET', '/health', { headers: { origin: 'https://evil.test' } })).headers.get('access-control-allow-origin')).toBeNull();
  });
  it('الأخطاء غير المتوقعة لا تكشف التفاصيل، والتعارض 409', async () => {
    const w = world([(r) => r.on('GET', '/t/boom', async () => { throw new Error('secret db path'); }).on('GET', '/t/conflict', async (ctx) => {
      await ctx.s.db.commit([{ kind: 'create', path: 'x/1', data: {} }, { kind: 'create', path: 'x/1', data: {} }]);
      return json({});
    })]);
    addUser(w, 'u1', { username: 'shop1', roles: ['shop_owner'] });
    w.db.seed('x/1', {});
    const errLog = console.error;
    console.error = () => undefined;
    const r = await w.call('GET', '/t/boom', { token: w.tokenFor('u1') });
    console.error = errLog;
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
    expect((await w.call('GET', '/t/conflict', { token: w.tokenFor('u1') })).status).toBe(409);
  });
});
