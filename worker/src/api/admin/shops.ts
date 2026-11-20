import type { Data } from '../../infra/db';
import { auditWrite, requirePerm, requireUser, type Ctx } from '../context';
import { cleanText, fail, json, readJson, type Router } from '../http';
import { claimsFor, createAccountOnce, parseAccount, publicAccount, type AccountInput } from './accounts';

// صلاحيات يمكن لصاحب المحل منحها لموظفيه (SRS 2.7)
export const MEMBER_PERMS = ['shop.orders.submit', 'shop.orders.view_all', 'shop.orders.cancel', 'shop.orders.approve', 'shop.invoices.view', 'shop.statement.view', 'shop.members.manage'];

function parseGeo(v: unknown) {
  if (v === undefined || v === null) return null;
  const g = v as Data;
  if (typeof g.lat !== 'number' || typeof g.lng !== 'number' || Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180) throw fail('VALIDATION', 'الموقع الجغرافي غير صالح', { field: 'geo' });
  return { lat: g.lat, lng: g.lng };
}

function parseShop(b: Data, partial: boolean, canCredit: boolean): Data {
  const out: Data = {};
  const has = (k: string) => !partial || b[k] !== undefined;
  if (has('name')) out.name = cleanText(b.name, 100, 'اسم المحل');
  if (has('ownerName')) out.ownerName = cleanText(b.ownerName, 80, 'اسم صاحب المحل');
  if (has('phone')) out.phone = cleanText(b.phone, 20, 'الهاتف الأساسي');
  if (has('phoneAlt')) out.phoneAlt = cleanText(b.phoneAlt, 20, 'الهاتف البديل', false);
  if (has('region')) out.region = cleanText(b.region, 60, 'المنطقة');
  if (has('city')) out.city = cleanText(b.city, 60, 'المدينة');
  if (has('address')) out.address = cleanText(b.address, 300, 'العنوان التفصيلي');
  if (has('geo')) out.geo = parseGeo(b.geo);
  if (has('allowMemberManagement')) out.allowMemberManagement = b.allowMemberManagement === true;
  if (b.paymentTerms !== undefined || b.credit !== undefined) {
    if (!canCredit) throw fail('FORBIDDEN', 'تعديل شروط الدفع والائتمان يتطلب صلاحية مالية');
  }
  if (has('paymentTerms')) {
    const t = b.paymentTerms ?? ['cash'];
    if (!Array.isArray(t) || t.length === 0 || t.some((x) => x !== 'cash' && x !== 'credit')) throw fail('VALIDATION', 'شروط الدفع: cash و/أو credit');
    out.paymentTerms = [...new Set(t as string[])];
  }
  if (has('credit')) {
    const c = (b.credit ?? { enabled: false, limit: 0 }) as Data;
    if (typeof c.enabled !== 'boolean' || !Number.isSafeInteger(c.limit) || (c.limit as number) < 0) throw fail('VALIDATION', 'الحد الائتماني بالأغورة وعدد صحيح');
    out.credit = { enabled: c.enabled, limit: c.limit };
  }
  return out;
}

async function list(ctx: Ctx) {
  requirePerm(ctx, 'shops.view');
  const status = ctx.url.searchParams.get('status');
  const rows = await ctx.s.db.query({ collection: 'shops', ...(status ? { where: [['status', '==', status]] } : {}), orderBy: [['createdAt', 'desc']], limit: 500 });
  const q = (ctx.url.searchParams.get('q') ?? '').trim();
  return json({ shops: rows.map((r): Data => ({ id: r.id, ...r.data })).filter((s) => !q || [s.name, s.ownerName, s.phone, s.city].some((x) => String(x ?? '').includes(q))) });
}

async function getOne(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const shop = await ctx.s.db.get(`shops/${p.id}`);
  if (!shop) throw fail('NOT_FOUND', 'المحل غير موجود');
  const staff = u.kinds.has('staff') && u.permissions.has('shops.view');
  if (!staff && !u.shopIds.includes(shop.id)) throw fail('FORBIDDEN', 'لا يمكنك الوصول إلى بيانات هذا المحل');
  const notes = staff ? ((await ctx.s.db.get(`shops/${shop.id}/private/admin`))?.data.adminNotes ?? '') : undefined;
  return json({ shop: { id: shop.id, ...shop.data, ...(staff ? { adminNotes: notes } : {}) } });
}

/** إنشاء محل مع حساب صاحبه في عملية واحدة (SRS 2.6). */
async function create(ctx: Ctx) {
  const actor = requirePerm(ctx, 'shops.create');
  const body = await readJson(ctx.req);
  const shop = parseShop(body, false, actor.permissions.has('shops.credit.manage') || (body.paymentTerms === undefined && body.credit === undefined));
  const ownerBody = (body.owner ?? {}) as Data;
  const owner = parseAccount({ displayName: shop.ownerName, phone: shop.phone, ...ownerBody, roles: ['shop_owner'], grant: [], deny: [], shopIds: [] }) as AccountInput;
  const adminNotes = cleanText(body.adminNotes, 2000, 'ملاحظات إدارية', false);
  const shopId = ctx.s.id();
  owner.shopIds = [shopId];
  const data: Data = { ...shop, status: 'active', balance: 0, createdAt: ctx.s.now(), createdBy: actor.uid };
  const r = await createAccountOnce(ctx, 'shops.create', owner, (uid) => [
    { kind: 'create', path: `shops/${shopId}`, data: { ...data, ownerUid: uid } },
    { kind: 'set', path: `shops/${shopId}/private/admin`, data: { adminNotes } },
    { kind: 'create', path: `shops/${shopId}/members/${uid}`, data: { role: 'owner', permissions: MEMBER_PERMS, addedAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'shops.create', entity: { kind: 'shop', id: shopId }, after: data }),
  ], (uid) => ({ shopId, ownerUid: uid }));
  return json(r, 201);
}

async function update(ctx: Ctx, p: Record<string, string>) {
  const actor = requirePerm(ctx, 'shops.update');
  const cur = await ctx.s.db.get(`shops/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'المحل غير موجود');
  const body = await readJson(ctx.req);
  const patch = parseShop(body, true, actor.permissions.has('shops.credit.manage'));
  const writes = [
    { kind: 'update' as const, path: `shops/${cur.id}`, data: { ...patch, updatedAt: ctx.s.now(), updatedBy: actor.uid } },
    auditWrite(ctx, { action: 'shops.update', entity: { kind: 'shop', id: cur.id }, before: cur.data, after: patch }),
  ];
  if (body.adminNotes !== undefined) writes.push({ kind: 'set', path: `shops/${cur.id}/private/admin`, data: { adminNotes: cleanText(body.adminNotes, 2000, 'ملاحظات إدارية', false) } } as never);
  await ctx.s.db.commit(writes);
  return json({ shop: { id: cur.id, ...cur.data, ...patch } });
}

async function setStatus(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'shops.suspend');
  const body = await readJson(ctx.req);
  if (body.status !== 'active' && body.status !== 'suspended') throw fail('VALIDATION', 'الحالة غير صالحة');
  const reason = cleanText(body.reason, 300, 'السبب');
  const cur = await ctx.s.db.get(`shops/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'المحل غير موجود');
  await ctx.s.db.commit([
    { kind: 'update', path: `shops/${cur.id}`, data: { status: body.status, statusReason: reason, updatedAt: ctx.s.now() } },
    auditWrite(ctx, { action: `shops.${body.status === 'active' ? 'activate' : 'suspend'}`, entity: { kind: 'shop', id: cur.id }, before: { status: cur.data.status }, after: { status: body.status, reason } }),
  ]);
  return json({ ok: true });
}

/** بيانات يعدّلها صاحب المحل بنفسه (SRS 4 و2.3-ح). */
async function selfProfile(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'shop.profile.update');
  if (!u.shopIds.includes(p.id!)) throw fail('FORBIDDEN', 'لا يمكنك تعديل محل آخر');
  const b = await readJson(ctx.req);
  const allowed = ['phoneAlt', 'address', 'geo'];
  const extra = Object.keys(b).filter((k) => !allowed.includes(k));
  if (extra.length) throw fail('FORBIDDEN', 'هذه الحقول تعدّلها الإدارة فقط', { fields: extra });
  const patch: Data = {};
  if (b.phoneAlt !== undefined) patch.phoneAlt = cleanText(b.phoneAlt, 20, 'الهاتف البديل', false);
  if (b.address !== undefined) patch.address = cleanText(b.address, 300, 'العنوان التفصيلي');
  if (b.geo !== undefined) patch.geo = parseGeo(b.geo);
  const cur = await ctx.s.db.get(`shops/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'المحل غير موجود');
  await ctx.s.db.commit([{ kind: 'update', path: `shops/${cur.id}`, data: { ...patch, updatedAt: ctx.s.now() } }, auditWrite(ctx, { action: 'shops.profile', entity: { kind: 'shop', id: cur.id }, before: cur.data, after: patch })]);
  return json({ ok: true });
}

/** صاحب المحل (إن سمحت الإدارة) أو موظف المورد بصلاحية users.manage. */
async function memberActor(ctx: Ctx, shopId: string) {
  const u = requireUser(ctx);
  const shop = await ctx.s.db.get(`shops/${shopId}`);
  if (!shop) throw fail('NOT_FOUND', 'المحل غير موجود');
  if (u.kinds.has('staff') && u.permissions.has('users.manage')) return { u, shop, staff: true };
  if (!u.shopIds.includes(shopId) || !u.permissions.has('shop.members.manage')) throw fail('FORBIDDEN', 'لا تملك إدارة موظفي هذا المحل');
  if (shop.data.allowMemberManagement !== true) throw fail('FORBIDDEN', 'الإدارة لم تفعّل إدارة الموظفين لهذا المحل');
  return { u, shop, staff: false };
}

function memberPerms(v: unknown, actorPerms: Set<string>, staff: boolean): string[] {
  if (!Array.isArray(v) || v.some((x) => !MEMBER_PERMS.includes(x as string))) throw fail('VALIDATION', 'صلاحيات الموظف غير صالحة', { allowed: MEMBER_PERMS });
  const perms = [...new Set(v as string[])];
  if (!staff) {
    const beyond = perms.filter((x) => !actorPerms.has(x));
    if (beyond.length) throw fail('FORBIDDEN', 'لا يمكنك منح صلاحيات لا تملكها', { permissions: beyond });
  }
  return perms;
}

async function listMembers(ctx: Ctx, p: Record<string, string>) {
  await memberActor(ctx, p.id!);
  const rows = await ctx.s.db.query({ collection: `shops/${p.id}/members` });
  const users = await ctx.s.db.getMany(rows.map((r) => `users/${r.id}`));
  return json({ members: rows.map((r, i) => ({ ...r.data, ...(users[i] ? publicAccount(r.id, users[i]!.data) : { uid: r.id }) })) });
}

async function addMember(ctx: Ctx, p: Record<string, string>) {
  const { u, shop, staff } = await memberActor(ctx, p.id!);
  const body = await readJson(ctx.req);
  const perms = memberPerms(body.permissions ?? [], u.permissions, staff);
  const acc = parseAccount({ ...body, roles: ['shop_employee'], grant: perms, deny: [], shopIds: [shop.id], expiresAt: body.expiresAt ?? null }) as AccountInput;
  const r = await createAccountOnce(ctx, 'shops.members.add', acc, (uid) => [
    { kind: 'create', path: `shops/${shop.id}/members/${uid}`, data: { role: 'employee', permissions: perms, addedAt: ctx.s.now(), addedBy: u.uid } },
  ]);
  return json(r, 201);
}

async function updateMember(ctx: Ctx, p: Record<string, string>) {
  const { u, shop, staff } = await memberActor(ctx, p.id!);
  const m = await ctx.s.db.get(`shops/${shop.id}/members/${p.uid}`);
  if (!m) throw fail('NOT_FOUND', 'الموظف غير موجود في هذا المحل');
  if (m.data.role === 'owner') throw fail('FORBIDDEN', 'حساب صاحب المحل تديره الإدارة');
  const body = await readJson(ctx.req);
  const user = await ctx.s.db.get(`users/${p.uid}`);
  if (!user) throw fail('NOT_FOUND', 'الحساب غير موجود');
  const writes = [];
  let grant = user.data.grant as string[];
  if (body.permissions !== undefined) {
    grant = memberPerms(body.permissions, u.permissions, staff);
    writes.push({ kind: 'update' as const, path: `shops/${shop.id}/members/${p.uid}`, data: { permissions: grant } });
  }
  const userPatch: Data = { grant, sessionsRevokedAt: ctx.s.now() };
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'suspended') throw fail('VALIDATION', 'الحالة غير صالحة');
    userPatch.status = body.status;
  }
  writes.push({ kind: 'update' as const, path: `users/${p.uid}`, data: userPatch });
  writes.push(auditWrite(ctx, { action: 'shops.members.update', entity: { kind: 'shop', id: shop.id }, affectedUserId: p.uid!, before: { grant: user.data.grant, status: user.data.status }, after: userPatch }));
  await ctx.s.db.commit(writes);
  await ctx.s.identity.updateUser(p.uid!, {
    revokeSessions: true, ...(userPatch.status ? { disabled: userPatch.status === 'suspended' } : {}),
    claims: await claimsFor(ctx, { roles: user.data.roles as string[], grant, deny: user.data.deny as string[], shopIds: user.data.shopIds as string[] }),
  });
  return json({ ok: true });
}

export function shopRoutes(r: Router<Ctx>) {
  r.on('GET', '/admin/shops', list).on('POST', '/admin/shops', create).on('GET', '/shops/:id', getOne)
    .on('PATCH', '/admin/shops/:id', update).on('POST', '/admin/shops/:id/status', setStatus).on('PATCH', '/shops/:id/profile', selfProfile)
    .on('GET', '/shops/:id/members', listMembers).on('POST', '/shops/:id/members', addMember).on('PATCH', '/shops/:id/members/:uid', updateMember);
}
