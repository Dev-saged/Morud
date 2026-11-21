import { describe, expect, it } from 'vitest';
import { bootstrap } from '../src/admin/bootstrap';
import { ALL_ROUTES } from '../src/api/routes';
import { inspectImage } from '../src/infra/files';
import { addUser, world, type World } from './helpers';
import { png, webpX } from './images';

const H = (k = 'k_' + Math.random().toString(36).slice(2).padEnd(18, 'x')) => ({ 'idempotency-key': k });

function staffWorld() {
  const w = world(ALL_ROUTES);
  addUser(w, 'own', { username: 'owner', roles: ['super_admin'] });
  addUser(w, 'mgr', { username: 'manager', roles: ['admin_manager'] });
  addUser(w, 'oe', { username: 'orders', roles: ['orders_employee'] });
  addUser(w, 'cat', { username: 'catalog', roles: ['catalog_employee'] });
  addUser(w, 'acc', { username: 'accountant', roles: ['accountant'] });
  return w;
}
const T = (w: World, uid: string) => w.tokenFor(uid);

describe('المستخدمون والصلاحيات (SRS 2.4)', () => {
  it('مدير الإدارة ينشئ موظف طلبات بكلمة مؤقتة وفهارس دخول وclaims وتدقيق', async () => {
    const w = staffWorld();
    const r = await w.call('POST', '/admin/users', { token: T(w, 'mgr'), headers: H(), body: { displayName: 'سامي', username: 'Sami.Orders', phone: '0599000111', roles: ['orders_employee'] } });
    expect(r.status).toBe(201);
    expect(r.body.tempPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    const u = await w.db.get(`users/${r.body.uid}`);
    expect(u!.data).toMatchObject({ username: 'sami.orders', phone: '0599000111', mustChangePassword: true, status: 'active', createdBy: 'mgr' });
    expect(await w.db.get('logins/u:sami.orders')).not.toBeNull();
    expect(await w.db.get('logins/p:0599000111')).not.toBeNull();
    expect(w.identity.updates.at(-1)).toMatchObject({ uid: r.body.uid, patch: { claims: { rp: ['ov', 'sv'], k: ['staff'] } } });
    expect((await w.db.query({ collection: 'auditLogs', where: [['action', '==', 'users.create']] })).length).toBe(1);
    const login = await w.call('POST', '/auth/login', { body: { identifier: '0599000111', password: r.body.tempPassword } });
    expect(login.body.user.mustChangePassword).toBe(true);
  });
  it('لا يُمنح ما لا يملكه المانح، ودور مالك النظام لمالكه فقط', async () => {
    const w = staffWorld();
    const make = (token: string, roles: string[], grant: string[] = []) => w.call('POST', '/admin/users', { token, headers: H(), body: { displayName: 'x', username: `u${Math.random().toString(36).slice(2, 8)}`, roles, grant } });
    expect((await make(T(w, 'mgr'), ['super_admin'])).body.error.message).toContain('مالك النظام');
    expect((await make(T(w, 'mgr'), ['accountant'])).body.error.details.permissions).toContain('payments.create');
    expect((await make(T(w, 'mgr'), ['orders_employee'], ['settings.manage'])).status).toBe(403);
    expect((await make(T(w, 'mgr'), ['ghost'])).body.error.code).toBe('VALIDATION');
    expect((await make(T(w, 'mgr'), [])).body.error.code).toBe('VALIDATION');
    expect((await make(T(w, 'own'), ['super_admin'])).status).toBe(201);
    expect((await make(T(w, 'oe'), ['orders_employee'])).status).toBe(403);
  });
  it('اسم مستخدم مكرر يُرفض، وفشل Firebase لا يترك وثيقة', async () => {
    const w = staffWorld();
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'orders', roles: ['orders_employee'] } })).body.error.code).toBe('CONFLICT');
    w.identity.failCreate = true;
    const errLog = console.error;
    console.error = () => undefined;
    const r = await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'newone', roles: ['orders_employee'] } });
    console.error = errLog;
    expect(r.status).toBe(500);
    expect(await w.db.get('logins/u:newone')).toBeNull();
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'a b', roles: ['orders_employee'] } })).body.error.code).toBe('VALIDATION');
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'goodname', phone: '123', roles: ['orders_employee'] } })).body.error.code).toBe('VALIDATION');
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'goodname', email: 'bad@', roles: ['orders_employee'] } })).body.error.code).toBe('VALIDATION');
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'goodname', roles: 'x' } })).body.error.code).toBe('VALIDATION');
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'goodname', roles: ['orders_employee'], expiresAt: -5 } })).body.error.code).toBe('VALIDATION');
    expect((await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'goodname', roles: ['orders_employee'], password: 'weak' } })).body.error.code).toBe('PASSWORD_WEAK');
    w.identity.failCreate = false;
    const withPw = await w.call('POST', '/admin/users', { token: T(w, 'own'), headers: H(), body: { displayName: 'x', username: 'withpw', email: 'w@m.ps', roles: ['orders_employee'], password: 'Strong2026' } });
    expect(withPw.body.tempPassword).toBeNull();
    expect((await w.db.get(`users/${withPw.body.uid}`))!.data).toMatchObject({ mustChangePassword: false, loginEmail: 'w@m.ps' });
  });
  it('تعديل الأدوار يجدد claims ويلغي الجلسات، وتغيير الهاتف ينقل فهرس الدخول', async () => {
    const w = staffWorld();
    w.db.seed('logins/p:0599111222', { uid: 'oe', loginEmail: 'uoe@login.mawred' });
    await w.db.commit([{ kind: 'update', path: 'users/oe', data: { phone: '0599111222' } }]);
    const old = T(w, 'oe');
    w.clock.now += 1000;
    const r = await w.call('PATCH', '/admin/users/oe', { token: T(w, 'own'), body: { roles: ['orders_employee', 'delivery_manager'], phone: '0599333444', displayName: 'موظف' } });
    expect(r.status).toBe(200);
    expect(r.body.user.roles).toEqual(['orders_employee', 'delivery_manager']);
    expect(await w.db.get('logins/p:0599111222')).toBeNull();
    expect(await w.db.get('logins/p:0599333444')).not.toBeNull();
    expect(w.identity.updates.at(-1)!.patch).toMatchObject({ revokeSessions: true, claims: { rp: expect.arrayContaining(['dv', 'dt']) } });
    expect((await w.call('GET', '/auth/me', { token: old })).status).toBe(401);
    expect((await w.call('PATCH', '/admin/users/nope', { token: T(w, 'own'), body: { displayName: 'x' } })).status).toBe(404);
    expect((await w.call('PATCH', '/admin/users/oe', { token: T(w, 'own'), body: { password: 'Abcdefg123' } })).status).toBe(400);
    expect((await w.call('PATCH', '/admin/users/oe', { token: T(w, 'own'), body: { roles: [] } })).status).toBe(400);
    expect((await w.call('PATCH', '/admin/users/own', { token: T(w, 'mgr'), body: { displayName: 'x' } })).status).toBe(403);
    expect((await w.call('PATCH', '/admin/users/own', { token: T(w, 'own'), body: { roles: ['admin_manager'] } })).body.error.code).toBe('LAST_OWNER');
  });
  it('الإيقاف والتفعيل وإعادة كلمة المرور وإلغاء الجلسات', async () => {
    const w = staffWorld();
    expect((await w.call('POST', '/admin/users/oe/status', { token: T(w, 'mgr'), body: { status: 'suspended', reason: 'غياب متكرر' } })).status).toBe(200);
    expect(w.identity.updates.at(-1)).toMatchObject({ uid: 'oe', patch: { disabled: true } });
    expect((await w.call('GET', '/auth/me', { token: T(w, 'oe') })).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await w.call('POST', '/admin/users/oe/status', { token: T(w, 'mgr'), body: { status: 'active', reason: 'عودة للعمل' } })).status).toBe(200);
    expect((await w.call('POST', '/admin/users/oe/status', { token: T(w, 'mgr'), body: { status: 'x', reason: 'سبب' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/users/oe/status', { token: T(w, 'mgr'), body: { status: 'suspended' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/users/mgr/status', { token: T(w, 'mgr'), body: { status: 'suspended', reason: 'تجربة' } })).status).toBe(403);
    expect((await w.call('POST', '/admin/users/own/status', { token: T(w, 'mgr'), body: { status: 'suspended', reason: 'تجربة' } })).status).toBe(403);
    addUser(w, 'own2', { username: 'owner2', roles: ['super_admin'] });
    expect((await w.call('POST', '/admin/users/own2/status', { token: T(w, 'own'), body: { status: 'suspended', reason: 'مغادرة' } })).status).toBe(200);
    expect((await w.call('POST', '/admin/users/ghost/status', { token: T(w, 'own'), body: { status: 'suspended', reason: 'سبب' } })).status).toBe(404);
    const rp = await w.call('POST', '/admin/users/oe/reset-password', { token: T(w, 'mgr') });
    expect(rp.body.tempPassword).toHaveLength(10);
    expect((await w.db.get('users/oe'))!.data.mustChangePassword).toBe(true);
    expect((await w.call('POST', '/admin/users/own/reset-password', { token: T(w, 'mgr') })).status).toBe(403);
    expect((await w.call('POST', '/admin/users/ghost/reset-password', { token: T(w, 'mgr') })).status).toBe(404);
    expect((await w.call('POST', '/admin/users/cat/revoke-sessions', { token: T(w, 'mgr') })).status).toBe(200);
    expect((await w.call('POST', '/admin/users/ghost/revoke-sessions', { token: T(w, 'mgr') })).status).toBe(404);
  });
  it('القائمة والفلاتر والتفاصيل', async () => {
    const w = staffWorld();
    const all = await w.call('GET', '/admin/users', { token: T(w, 'mgr') });
    expect(all.body.users.length).toBe(5);
    expect((await w.call('GET', '/admin/users?role=accountant', { token: T(w, 'mgr') })).body.users.map((u: any) => u.uid)).toEqual(['acc']);
    expect((await w.call('GET', '/admin/users?status=active&q=cata', { token: T(w, 'mgr') })).body.users.map((u: any) => u.uid)).toEqual(['cat']);
    expect((await w.call('GET', '/admin/users/acc', { token: T(w, 'mgr') })).body.user.loginEmail).toBeUndefined();
    expect((await w.call('GET', '/admin/users/zz', { token: T(w, 'mgr') })).status).toBe(404);
  });
});

describe('الأدوار والصلاحيات المضافة', () => {
  it('دور مخصص وصلاحية جديدة دون إعادة بناء', async () => {
    const w = staffWorld();
    expect((await w.call('POST', '/admin/permissions', { token: T(w, 'own'), body: { id: 'reports.night', scope: 'staff', label: 'تقرير الليل' } })).status).toBe(201);
    expect((await w.call('POST', '/admin/permissions', { token: T(w, 'own'), body: { id: 'reports.night', scope: 'staff', label: 'x' } })).status).toBe(409);
    expect((await w.call('POST', '/admin/permissions', { token: T(w, 'own'), body: { id: 'Bad Id', scope: 'staff', label: 'x' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/permissions', { token: T(w, 'own'), body: { id: 'a.b', scope: 'x', label: 'x' } })).status).toBe(400);
    const put = await w.call('PUT', '/admin/roles/night_lead', { token: T(w, 'own'), body: { label: 'مشرف ليلي', kind: 'staff', home: 'admin.orders', permissions: ['orders.view', 'reports.night'] } });
    expect(put.status).toBe(200);
    const roles = await w.call('GET', '/admin/roles', { token: T(w, 'mgr') });
    expect(roles.body.roles.find((r: any) => r.id === 'night_lead')).toBeTruthy();
    expect(roles.body.permissions.find((p: any) => p.id === 'reports.night')).toBeTruthy();
    expect((await w.call('GET', '/admin/roles', { token: T(w, 'oe') })).status).toBe(403);
    addUser(w, 'nl', { username: 'night', roles: ['night_lead'] });
    expect((await w.call('DELETE', '/admin/roles/night_lead', { token: T(w, 'own') })).status).toBe(409);
    await w.db.commit([{ kind: 'update', path: 'users/nl', data: { roles: ['orders_employee'] } }]);
    expect((await w.call('DELETE', '/admin/roles/night_lead', { token: T(w, 'own') })).status).toBe(200);
    expect((await w.call('DELETE', '/admin/roles/night_lead', { token: T(w, 'own') })).status).toBe(404);
  });
  it('تحقق تعريف الدور', async () => {
    const w = staffWorld();
    const put = (id: string, body: object) => w.call('PUT', `/admin/roles/${id}`, { token: T(w, 'own'), body });
    expect((await put('super_admin', {})).status).toBe(403);
    expect((await put('Bad', {})).status).toBe(400);
    expect((await put('role1', { label: 'x', kind: 'alien', home: 'admin.orders', permissions: ['orders.view'] })).status).toBe(400);
    expect((await put('role1', { label: 'x', kind: 'shop', home: 'admin.orders', permissions: ['orders.view'] })).status).toBe(400);
    expect((await put('role1', { label: 'x', kind: 'staff', home: 'admin.orders', permissions: [] })).status).toBe(400);
    const shopPerm = await put('role1', { label: 'x', kind: 'staff', home: 'admin.orders', permissions: ['shop.orders.submit'] });
    expect(shopPerm.body).toMatchObject({ error: { details: { permissions: ['shop.orders.submit'] } } });
    expect((await put('accountant', { label: 'محاسب', kind: 'staff', home: 'admin.finance', permissions: ['invoices.view'] })).status).toBe(200);
    expect((await w.call('DELETE', '/admin/roles/accountant', { token: T(w, 'own') })).status).toBe(403);
    expect((await w.call('PUT', '/admin/roles/x1', { token: T(w, 'mgr'), body: {} })).status).toBe(403);
  });
});

describe('الإعدادات العامة (SRS 13)', () => {
  it('القراءة والتعديل والتحقق', async () => {
    const w = staffWorld();
    expect((await w.call('GET', '/settings', { token: T(w, 'oe') })).body.settings).toMatchObject({ currency: 'ILS', orderIntakeStart: '06:00', slaWorkingHours: 6 });
    const ok = await w.call('PATCH', '/admin/settings', { token: T(w, 'own'), body: {
      workDays: [6, 0, 1, 2, 3, 4], orderIntakeStart: '07:00', orderIntakeEnd: '22:00', slaWorkingHours: 5, holidays: ['2026-12-25'], closures: [{ from: 1, to: 2, reason: 'صيانة' }],
      paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: true }, { id: 'bank_transfer', label: 'تحويل', enabled: true }], supplier: { name: 'مؤسسة مورد', phone: '082000000' },
      creditWarnPercent: 70, backupRetentionDays: 60, newOrderSound: false, timezone: 'Asia/Gaza', currency: 'ILS', currencyDecimals: 2, platformName: 'مورد',
      shopCancelStates: ['new'], cancellationPolicy: 'قبل التأكيد فقط', defaultPrepMinutes: 60, deliveryStart: '07:00', deliveryEnd: '22:00', creditBlocksDeferredOrders: false,
    } });
    expect(ok.status).toBe(200);
    expect(ok.body.settings.workDays).toEqual([0, 1, 2, 3, 4, 6]);
    expect((await w.call('GET', '/settings', { token: T(w, 'oe') })).body.settings.orderIntakeStart).toBe('07:00');
    const bad = async (body: object) => (await w.call('PATCH', '/admin/settings', { token: T(w, 'own'), body })).status;
    for (const b of [{ orderIntakeStart: '25:00' }, { orderIntakeStart: '23:30' }, { slaWorkingHours: 0 }, { workDays: [] }, { workDays: [7] }, { holidays: ['tomorrow'] },
      { closures: [{ from: 5, to: 1 }] }, { paymentMethods: [{ id: 'cash', label: 'نقداً', enabled: false }] }, { paymentMethods: [{ id: 'X Y', label: 'x' }] }, { paymentMethods: [] },
      { currency: 'shekel' }, { currencyDecimals: 3 }, { timezone: 'Mars/Base' }, { creditWarnPercent: 0 }, { backupRetentionDays: 1 }, { shopCancelStates: ['delivered'] },
      { unknownField: 1 }, { defaultPrepMinutes: -1 }, { supplier: 'x' }]) expect(await bad(b)).toBe(400);
    expect((await w.call('PATCH', '/admin/settings', { token: T(w, 'mgr'), body: { slaWorkingHours: 4 } })).status).toBe(403);
  });
});

async function makeShop(w: World, token: string, extra: object = {}) {
  return w.call('POST', '/admin/shops', { token, headers: H(), body: { name: 'بقالة النور', ownerName: 'أبو أحمد', phone: '0599888777', region: 'الوسطى', city: 'دير البلح', address: 'شارع صلاح الدين بجانب المسجد', geo: { lat: 31.41, lng: 34.35 }, owner: { username: 'alnoor' }, adminNotes: 'عميل جديد', ...extra } });
}

describe('المحلات وموظفوها (SRS 2.6–2.7)', () => {
  it('إنشاء محل مع حساب صاحبه يدخل برقم هاتفه ويرى محله فقط', async () => {
    const w = staffWorld();
    const r = await makeShop(w, T(w, 'mgr'));
    expect(r.status).toBe(201);
    const shop = await w.db.get(`shops/${r.body.shopId}`);
    expect(shop!.data).toMatchObject({ name: 'بقالة النور', status: 'active', balance: 0, ownerUid: r.body.ownerUid, paymentTerms: ['cash'], credit: { enabled: false, limit: 0 } });
    expect(await w.db.get(`shops/${r.body.shopId}/members/${r.body.ownerUid}`)).not.toBeNull();
    const login = await w.call('POST', '/auth/login', { body: { identifier: '0599888777', password: r.body.tempPassword } });
    expect(login.body.user).toMatchObject({ home: 'shop.home', shopIds: [r.body.shopId] });
    await w.db.commit([{ kind: 'update', path: `users/${r.body.ownerUid}`, data: { mustChangePassword: false } }]);
    const own = T(w, r.body.ownerUid);
    const mine = await w.call('GET', `/shops/${r.body.shopId}`, { token: own });
    expect(mine.body.shop.adminNotes).toBeUndefined();
    expect((await w.call('GET', `/shops/${r.body.shopId}`, { token: T(w, 'acc') })).body.shop.adminNotes).toBe('عميل جديد');
    expect((await w.call('GET', '/shops/other', { token: own })).status).toBe(404);
    w.db.seed('shops/s9', { name: 'محل آخر' });
    expect((await w.call('GET', '/shops/s9', { token: own })).status).toBe(403);
    expect((await w.call('GET', '/admin/shops', { token: own })).status).toBe(403);
    expect((await w.call('GET', '/admin/shops?q=النور', { token: T(w, 'acc') })).body.shops).toHaveLength(1);
    expect((await w.call('GET', '/admin/shops?status=suspended', { token: T(w, 'acc') })).body.shops).toHaveLength(0);
  });
  it('شروط الدفع والائتمان بصلاحية مالية فقط', async () => {
    const w = staffWorld();
    expect((await makeShop(w, T(w, 'mgr'), { paymentTerms: ['cash', 'credit'], credit: { enabled: true, limit: 500000 } })).status).toBe(403);
    const r = await makeShop(w, T(w, 'own'), { paymentTerms: ['cash', 'credit'], credit: { enabled: true, limit: 500000 } });
    expect((await w.db.get(`shops/${r.body.shopId}`))!.data.credit).toEqual({ enabled: true, limit: 500000 });
    expect((await w.call('PATCH', `/admin/shops/${r.body.shopId}`, { token: T(w, 'mgr'), body: { credit: { enabled: true, limit: 1 } } })).status).toBe(403);
    expect((await w.call('PATCH', `/admin/shops/${r.body.shopId}`, { token: T(w, 'own'), body: { credit: { enabled: true, limit: 1.5 } } })).status).toBe(400);
    expect((await w.call('PATCH', `/admin/shops/${r.body.shopId}`, { token: T(w, 'own'), body: { paymentTerms: ['bitcoin'] } })).status).toBe(400);
    const up = await w.call('PATCH', `/admin/shops/${r.body.shopId}`, { token: T(w, 'mgr'), body: { name: 'بقالة النور الجديدة', adminNotes: 'تحديث' } });
    expect(up.body.shop.name).toBe('بقالة النور الجديدة');
    expect((await w.db.get(`shops/${r.body.shopId}/private/admin`))!.data.adminNotes).toBe('تحديث');
    expect((await w.call('PATCH', '/admin/shops/zz', { token: T(w, 'mgr'), body: { name: 'x' } })).status).toBe(404);
    expect((await makeShop(w, T(w, 'mgr'), { geo: { lat: 200, lng: 0 }, owner: { username: 'geo1' }, phone: '0599000999' })).status).toBe(400);
    expect((await makeShop(w, T(w, 'acc'))).status).toBe(403);
  });
  it('إيقاف المحل وتعديل صاحب المحل لبياناته المسموحة فقط', async () => {
    const w = staffWorld();
    const r = await makeShop(w, T(w, 'mgr'));
    expect((await w.call('POST', `/admin/shops/${r.body.shopId}/status`, { token: T(w, 'mgr'), body: { status: 'suspended', reason: 'تأخر السداد' } })).status).toBe(200);
    expect((await w.call('POST', `/admin/shops/${r.body.shopId}/status`, { token: T(w, 'mgr'), body: { status: 'closed', reason: 'سبب' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/shops/zz/status', { token: T(w, 'mgr'), body: { status: 'active', reason: 'سبب' } })).status).toBe(404);
    await w.db.commit([{ kind: 'update', path: `users/${r.body.ownerUid}`, data: { mustChangePassword: false } }]);
    const own = T(w, r.body.ownerUid);
    expect((await w.call('PATCH', `/shops/${r.body.shopId}/profile`, { token: own, body: { phoneAlt: '0597000000', address: 'عنوان جديد', geo: { lat: 31.4, lng: 34.3 } } })).status).toBe(200);
    expect((await w.call('PATCH', `/shops/${r.body.shopId}/profile`, { token: own, body: { name: 'تغيير الاسم' } })).body.error.details.fields).toEqual(['name']);
    expect((await w.call('PATCH', '/shops/zz/profile', { token: own, body: {} })).status).toBe(403);
  });
  it('صاحب المحل يدير موظفيه فقط إن سمحت الإدارة، وضمن صلاحياته', async () => {
    const w = staffWorld();
    const r = await makeShop(w, T(w, 'mgr'));
    const sid = r.body.shopId;
    await w.db.commit([{ kind: 'update', path: `users/${r.body.ownerUid}`, data: { mustChangePassword: false } }]);
    const own = T(w, r.body.ownerUid);
    const add = (token: string, body: object) => w.call('POST', `/shops/${sid}/members`, { token, headers: H(), body: { displayName: 'موظف صباحي', ...body } });
    expect((await add(own, { username: 'morning', permissions: ['shop.orders.submit'] })).body.error.message).toContain('لم تفعّل');
    await w.call('PATCH', `/admin/shops/${sid}`, { token: T(w, 'mgr'), body: { allowMemberManagement: true } });
    const m = await add(own, { username: 'morning', permissions: ['shop.orders.submit'] });
    expect(m.status).toBe(201);
    const emp = await w.db.get(`users/${m.body.uid}`);
    expect(emp!.data).toMatchObject({ roles: ['shop_employee'], grant: ['shop.orders.submit'], shopIds: [sid] });
    expect((await add(own, { username: 'evil', permissions: ['orders.confirm'] })).status).toBe(400);
    const list = await w.call('GET', `/shops/${sid}/members`, { token: own });
    expect(list.body.members.map((x: any) => x.role).sort()).toEqual(['employee', 'owner']);
    // موظف يدير الموظفين لا يمنح ما لا يملكه
    await w.call('PATCH', `/shops/${sid}/members/${m.body.uid}`, { token: own, body: { permissions: ['shop.members.manage'] } });
    await w.db.commit([{ kind: 'update', path: `users/${m.body.uid}`, data: { mustChangePassword: false } }]);
    w.clock.now += 1000;
    const empTok = T(w, m.body.uid);
    expect((await add(empTok, { username: 'evening', permissions: ['shop.statement.view'] })).status).toBe(403);
    expect((await w.call('PATCH', `/shops/${sid}/members/${m.body.uid}`, { token: own, body: { status: 'suspended' } })).status).toBe(200);
    expect(w.identity.updates.at(-1)!.patch).toMatchObject({ disabled: true });
    expect((await w.call('PATCH', `/shops/${sid}/members/${r.body.ownerUid}`, { token: T(w, 'mgr'), body: { permissions: [] } })).status).toBe(403);
    expect((await w.call('PATCH', `/shops/${sid}/members/zz`, { token: own, body: {} })).status).toBe(404);
    expect((await w.call('PATCH', `/shops/${sid}/members/${m.body.uid}`, { token: own, body: { status: 'gone' } })).status).toBe(400);
    expect((await w.call('GET', '/shops/zz/members', { token: own })).status).toBe(404);
    expect((await w.call('GET', `/shops/${sid}/members`, { token: T(w, 'cat') })).status).toBe(403);
    expect((await w.call('POST', `/shops/${sid}/members`, { token: T(w, 'mgr'), headers: H(), body: { displayName: 'x', username: 'bystaff', permissions: ['shop.statement.view'] } })).status).toBe(201);
  });
});

async function seedUnits(w: World) {
  await w.db.commit([
    { kind: 'set', path: 'units/box', data: { name: 'علبة', kind: 'count', allowFraction: false } },
    { kind: 'set', path: 'units/carton', data: { name: 'كرتونة', kind: 'count', allowFraction: false } },
    { kind: 'set', path: 'units/kg', data: { name: 'كيلوغرام', kind: 'weight', allowFraction: true } },
    { kind: 'set', path: 'categories/dairy', data: { name: 'الألبان والأجبان', order: 3 } },
    { kind: 'set', path: 'categories/snacks', data: { name: 'المسليات', order: 4 } },
  ]);
}
const feta = { name: 'جبنة فيتا', altNames: ['جبنة بيضاء'], brand: 'الصافي', sku: 'dai-001', barcodes: ['6281000000011'], categoryId: 'dairy', baseUnitId: 'box', description: 'علبة 500 غرام',
  units: [{ unitId: 'box', factorToBase: 1000, price: 800, minQtyMilli: 1000, stepMilli: 1000 }, { unitId: 'carton', factorToBase: 12000, price: 9000, minQtyMilli: 1000, stepMilli: 1000 }] };

describe('الكتالوج (SRS 3)', () => {
  it('إنشاء منتج بوحدات مستقلة ومفاتيح بحث وSKU فريد', async () => {
    const w = staffWorld();
    await seedUnits(w);
    const r = await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: feta });
    expect(r.status).toBe(201);
    const p = await w.db.get(`products/${r.body.id}`);
    expect(p!.data).toMatchObject({ sku: 'DAI-001', unitIds: ['box', 'carton'], available: true, visible: true, archived: false });
    expect(p!.data.searchKeys).toContain('فيتا');
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: feta })).status).toBe(409);
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'X1', units: [{ unitId: 'kg', factorToBase: 1000, price: 0, minQtyMilli: 1000, stepMilli: 1000 }] } })).body.error.details.problems).toEqual(expect.arrayContaining(['PRICE_INVALID:kg', 'BASE_UNIT_MISSING']));
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'X2', categoryId: 'ghost' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'X3', units: [{ unitId: 'box', price: 'free' }] } })).status).toBe(400);
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'X4', images: [{ key: 'products/abcdefgh12.png', thumb: 'products/abcdefgh13.png' }] } })).body.error.message).toBe('صورة غير مرفوعة');
    expect((await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'X5', images: [{ key: '../etc/passwd', thumb: 'x' }] } })).status).toBe(400);
    expect((await w.call('POST', '/admin/products', { token: T(w, 'oe'), headers: H(), body: feta })).status).toBe(403);
    const costed = await w.call('POST', '/admin/products', { token: T(w, 'own'), headers: H(), body: { ...feta, sku: 'C1', cost: 600 } });
    expect((await w.db.get(`products/${costed.body.id}/private/cost`))!.data.cost).toBe(600);
    expect((await w.call('POST', '/admin/products', { token: T(w, 'own'), headers: H(), body: { ...feta, sku: 'C2', cost: -1 } })).status).toBe(400);
  });
  it('السعر للإدارة المخولة فقط، والتوفر بصلاحيته، والتعديل مسجّل', async () => {
    const w = staffWorld();
    await seedUnits(w);
    const id = (await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: feta })).body.id;
    const newUnits = feta.units.map((u) => ({ ...u, price: u.price + 100 }));
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { units: newUnits } })).body.error.details.missing).toEqual(['products.price.update']);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { available: false } })).status).toBe(200);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'oe'), body: { available: true } })).status).toBe(403);
    const ok = await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'own'), body: { units: newUnits, name: 'جبنة فيتا بلدية', sku: 'DAI-002', brand: '', description: 'جديد', order: 1, featured: true, categoryId: 'snacks', cost: 650 } });
    expect(ok.status).toBe(200);
    expect(ok.body.product.units[0].price).toBe(900);
    expect(ok.body.product.brand).toBeUndefined();
    expect(await w.db.get('skus/DAI-001')).toBeNull();
    expect(await w.db.get('skus/DAI-002')).not.toBeNull();
    expect((await w.db.query({ collection: 'auditLogs', where: [['action', '==', 'products.price']] }))[0]!.data.before).toMatchObject({ units: [{ price: 800 }, { price: 9000 }] });
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { name: 'x', available: true } })).status).toBe(200);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { cost: 1 } })).status).toBe(403);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'own'), body: { cost: 1.2 } })).status).toBe(400);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { categoryId: 'ghost' } })).status).toBe(400);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { baseUnitId: 'kg' } })).status).toBe(400);
    const other = (await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, sku: 'OTHER' } })).body.id;
    expect((await w.call('PATCH', `/admin/products/${other}`, { token: T(w, 'cat'), body: { sku: 'dai-002' } })).status).toBe(409);
    expect((await w.call('DELETE', `/admin/products/${id}`, { token: T(w, 'cat') })).status).toBe(200);
    expect(await w.db.get('skus/DAI-002')).toBeNull();
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { name: 'x' } })).status).toBe(404);
    expect((await w.call('DELETE', `/admin/products/${id}`, { token: T(w, 'cat') })).status).toBe(404);
  });
  it('التصنيفات: إنشاء وتعديل وحذف آمن بنقل المنتجات', async () => {
    const w = staffWorld();
    await seedUnits(w);
    const c = await w.call('POST', '/admin/categories', { token: T(w, 'cat'), body: { id: 'canned', name: 'المعلبات', order: 11, icon: 'can' } });
    expect(c.status).toBe(201);
    expect((await w.call('POST', '/admin/categories', { token: T(w, 'cat'), body: { name: 'تونة', parentId: 'canned' } })).status).toBe(201);
    expect((await w.call('POST', '/admin/categories', { token: T(w, 'cat'), body: { name: 'x', parentId: 'ghost' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/categories', { token: T(w, 'cat'), body: { id: 'BAD ID', name: 'x' } })).status).toBe(400);
    expect((await w.call('POST', '/admin/categories', { token: T(w, 'cat'), body: { name: 'x', order: 1.5 } })).status).toBe(400);
    expect((await w.call('DELETE', '/admin/categories/canned', { token: T(w, 'cat') })).body.error.message).toContain('فرعية');
    expect((await w.call('PATCH', '/admin/categories/dairy', { token: T(w, 'cat'), body: { hidden: true, imageKey: null, parentId: 'dairy' } })).status).toBe(400);
    expect((await w.call('PATCH', '/admin/categories/dairy', { token: T(w, 'cat'), body: { hidden: true, imageKey: null } })).body.category.hidden).toBe(true);
    expect((await w.call('PATCH', '/admin/categories/zz', { token: T(w, 'cat'), body: {} })).status).toBe(404);
    await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: feta });
    expect((await w.call('DELETE', '/admin/categories/dairy', { token: T(w, 'cat') })).body.error.details.products).toBe(1);
    expect((await w.call('DELETE', '/admin/categories/dairy?moveTo=ghost', { token: T(w, 'cat') })).status).toBe(400);
    const del = await w.call('DELETE', '/admin/categories/dairy?moveTo=snacks', { token: T(w, 'cat') });
    expect(del.body).toEqual({ ok: true, moved: 1 });
    expect((await w.db.query({ collection: 'products', where: [['categoryId', '==', 'snacks']] })).length).toBe(1);
    expect((await w.call('DELETE', '/admin/categories/dairy', { token: T(w, 'cat') })).status).toBe(404);
    expect((await w.call('POST', '/admin/categories', { token: T(w, 'oe'), body: { name: 'x' } })).status).toBe(403);
  });
  it('الوحدات: إضافة وتعديل، ولا حذف لوحدة مستخدمة', async () => {
    const w = staffWorld();
    await seedUnits(w);
    expect((await w.call('PUT', '/admin/units/gallon', { token: T(w, 'cat'), body: { name: 'جالون', kind: 'volume', allowFraction: true } })).body.unit.allowFraction).toBe(true);
    expect((await w.call('PUT', '/admin/units/dozen', { token: T(w, 'cat'), body: { name: 'دستة', kind: 'count', allowFraction: true } })).body.unit.allowFraction).toBe(false);
    expect((await w.call('PUT', '/admin/units/x', { token: T(w, 'cat'), body: { name: 'x', kind: 'area' } })).status).toBe(400);
    expect((await w.call('PUT', '/admin/units/x', { token: T(w, 'cat'), body: { name: 'x', kind: 'count' } })).status).toBe(400);
    await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: feta });
    expect((await w.call('DELETE', '/admin/units/carton', { token: T(w, 'cat') })).status).toBe(409);
    expect((await w.call('DELETE', '/admin/units/gallon', { token: T(w, 'cat') })).status).toBe(200);
    expect((await w.call('DELETE', '/admin/units/gallon', { token: T(w, 'cat') })).status).toBe(404);
  });
});

describe('صور المنتجات المفرّغة (R3.4b)', () => {
  it('فحص البايتات', () => {
    expect(inspectImage(png(6))).toMatchObject({ type: 'png', alpha: true, width: 256 });
    expect(inspectImage(png(2))).toMatchObject({ alpha: false });
    expect(inspectImage(png(3, 100, 100, true))).toMatchObject({ alpha: true });
    expect(inspectImage(webpX(true))).toMatchObject({ type: 'webp', alpha: true, width: 300, height: 200 });
    expect(inspectImage(webpX(false))).toMatchObject({ alpha: false });
    const vp8l = new Uint8Array(40);
    vp8l.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    vp8l.set([...'WEBPVP8L'].map((c) => c.charCodeAt(0)), 8);
    new DataView(vp8l.buffer).setUint32(21, (1 << 28) | (199 << 14) | 299, true);
    expect(inspectImage(vp8l.buffer)).toMatchObject({ alpha: true, width: 300, height: 200 });
    const vp8 = new Uint8Array(40);
    vp8.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    vp8.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
    expect(inspectImage(vp8.buffer)).toMatchObject({ alpha: false });
    expect(inspectImage(new Uint8Array([0xff, 0xd8, 0xff]).buffer)).toBeNull();
  });
  it('الرفع يقبل الشفاف فقط ويظهر للجميع، والربط بالمنتج', async () => {
    const w = staffWorld();
    await seedUnits(w);
    const up = (buf: ArrayBuffer, token = T(w, 'cat')) => w.call('POST', '/admin/uploads/product-image', { token, body: new Uint8Array(buf) as never, headers: { 'content-type': 'image/png' } });
    const ok = await up(png(6));
    expect(ok.status).toBe(201);
    expect(ok.body.key).toMatch(/^products\/id\d+\.png$/);
    const thumb = await up(webpX(true, 320, 320));
    expect((await up(png(2))).body.error.code).toBe('IMAGE_NOT_CUTOUT');
    expect((await up(new Uint8Array([1, 2, 3]).buffer)).body.error.code).toBe('IMAGE_TYPE');
    expect((await up(png(6, 32, 32))).body.error.code).toBe('IMAGE_SIZE');
    expect((await up(png(6), T(w, 'oe'))).status).toBe(403);
    const big = await w.call('POST', '/admin/uploads/product-image', { token: T(w, 'cat'), body: new Uint8Array(5_000_001) as never });
    expect(big.status).toBe(413);
    const id = (await w.call('POST', '/admin/products', { token: T(w, 'cat'), headers: H(), body: { ...feta, images: [{ key: ok.body.key, thumb: thumb.body.key }] } })).body.id;
    expect((await w.db.get(`products/${id}`))!.data.images).toEqual([{ key: ok.body.key, thumb: thumb.body.key }]);
    const pub = await w.call('GET', `/files/${ok.body.key}`.replace('/files/products/', '/files/products/'));
    expect(pub.status).toBe(200);
    expect(pub.headers.get('cache-control')).toContain('immutable');
    expect((await w.call('GET', '/files/products/missing0001.png')).status).toBe(404);
    expect((await w.call('GET', '/files/products/..%2Fsecret')).status).toBe(404);
    expect((await w.call('PATCH', `/admin/products/${id}`, { token: T(w, 'cat'), body: { images: [] } })).body.product.images).toEqual([]);
  });
});

describe('التهيئة الأولى الآمنة', () => {
  it('تبذر البيانات وتنشئ مالك النظام مرة واحدة فقط', async () => {
    const w = world(ALL_ROUTES);
    const r = await bootstrap(w.s, { username: 'sajed', displayName: 'مالك مورد' });
    expect(r.tempPassword).toHaveLength(10);
    expect((await w.db.query({ collection: 'categories' })).length).toBe(12);
    expect((await w.db.query({ collection: 'units' })).length).toBe(14);
    expect((await w.db.get('settings/system'))!.data.currency).toBe('ILS');
    expect((await w.db.get(`users/${r.uid}`))!.data.roles).toEqual(['super_admin']);
    await expect(bootstrap(w.s, { username: 'other', displayName: 'x' })).rejects.toMatchObject({ code: 'ALREADY_BOOTSTRAPPED' });
    const login = await w.call('POST', '/auth/login', { body: { identifier: 'sajed', password: r.tempPassword } });
    expect(login.body.user).toMatchObject({ home: 'admin.dashboard', mustChangePassword: true });
  });
  it('كلمة المالك من سرّ النشر: لا كلمة مؤقتة تُعاد، وضعيفة تُرفض', async () => {
    const w = world(ALL_ROUTES);
    await expect(bootstrap(w.s, { username: 'sajed', displayName: 'مالك', password: 'short' })).rejects.toMatchObject({ code: 'PASSWORD_WEAK' });
    expect(await w.db.get('system/bootstrap')).toBeNull();
    const w2 = w;
    const r = await bootstrap(w2.s, { username: 'sajed', displayName: 'مالك', password: 'Mawred2026Strong' });
    expect(r.tempPassword).toBeNull();
    const login = await w2.call('POST', '/auth/login', { body: { identifier: 'sajed', password: 'Mawred2026Strong' } });
    expect(login.body.user).toMatchObject({ home: 'admin.dashboard', mustChangePassword: false });
  });
});
