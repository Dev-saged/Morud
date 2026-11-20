import type { Data, Write } from '../../infra/db';
import { auditWrite, requirePerm, type Ctx } from '../context';
import { cleanText, fail, json, readJson, type Router } from '../http';
import { assertGrantable, assertNotLastOwner, claimsFor, createAccountOnce, loginKeys, parseAccount, publicAccount, tempPassword, type AccountInput } from './accounts';

async function list(ctx: Ctx) {
  requirePerm(ctx, 'users.manage');
  const role = ctx.url.searchParams.get('role');
  const status = ctx.url.searchParams.get('status');
  const where: Array<[string, '==' | 'array-contains', unknown]> = [];
  if (role) where.push(['roles', 'array-contains', role]);
  if (status) where.push(['status', '==', status]);
  const rows = await ctx.s.db.query({ collection: 'users', where, orderBy: [['createdAt', 'desc']], limit: 200 });
  const q = (ctx.url.searchParams.get('q') ?? '').trim().toLowerCase();
  const users = rows.map((r) => publicAccount(r.id, r.data)).filter((u) => !q || [u.displayName, u.username, u.phone, u.email].some((x) => String(x ?? '').toLowerCase().includes(q)));
  return json({ users });
}

async function getOne(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'users.manage');
  const d = await ctx.s.db.get(`users/${p.uid}`);
  if (!d) throw fail('NOT_FOUND', 'المستخدم غير موجود');
  return json({ user: publicAccount(d.id, d.data) });
}

async function create(ctx: Ctx) {
  const actor = requirePerm(ctx, 'users.manage');
  const a = parseAccount(await readJson(ctx.req)) as AccountInput;
  if (a.roles.length === 0) throw fail('VALIDATION', 'اختر دوراً واحداً على الأقل', { field: 'roles' });
  await assertGrantable(ctx, actor, a.roles, a.grant);
  return json(await createAccountOnce(ctx, 'users.create', a), 201);
}

async function update(ctx: Ctx, p: Record<string, string>) {
  const actor = requirePerm(ctx, 'users.manage');
  const uid = p.uid!;
  const patch = parseAccount(await readJson(ctx.req), true);
  if (patch.password !== undefined) throw fail('VALIDATION', 'استخدم إعادة تعيين كلمة المرور');
  const cur = await ctx.s.db.get(`users/${uid}`);
  if (!cur) throw fail('NOT_FOUND', 'المستخدم غير موجود');
  const before = cur.data;
  const isOwner = ((before.roles as string[]) ?? []).includes('super_admin');
  if (isOwner && !actor.roles.includes('super_admin')) throw fail('FORBIDDEN', 'حساب مالك النظام يعدّله مالك النظام فقط');
  const roles = patch.roles ?? (before.roles as string[]);
  const grant = patch.grant ?? (before.grant as string[]);
  const deny = patch.deny ?? (before.deny as string[]);
  const shopIds = patch.shopIds ?? (before.shopIds as string[]);
  if (patch.roles || patch.grant) await assertGrantable(ctx, actor, roles, grant);
  if (roles.length === 0) throw fail('VALIDATION', 'اختر دوراً واحداً على الأقل');
  if (isOwner && !roles.includes('super_admin')) await assertNotLastOwner(ctx, uid);
  const accessChanged = ['roles', 'grant', 'deny', 'shopIds'].some((k) => (patch as Data)[k] !== undefined && JSON.stringify((patch as Data)[k]) !== JSON.stringify(before[k]));
  const next = { username: patch.username ?? String(before.username), phone: patch.phone !== undefined ? patch.phone : (before.phone as string | null), email: patch.email !== undefined ? patch.email : (before.email as string | null) };
  const oldKeys = loginKeys({ username: String(before.username), phone: before.phone as string | null, email: before.email as string | null });
  const newKeys = loginKeys(next);
  const changes: Data = { ...patch, updatedAt: ctx.s.now(), updatedBy: actor.uid };
  if (accessChanged) changes.sessionsRevokedAt = ctx.s.now();
  await ctx.s.db.runTransaction(async (tx) => {
    for (const k of oldKeys.filter((k) => !newKeys.includes(k))) tx.write({ kind: 'delete', path: `logins/${k}` });
    for (const k of newKeys.filter((k) => !oldKeys.includes(k))) tx.write({ kind: 'create', path: `logins/${k}`, data: { uid, loginEmail: before.loginEmail } });
    tx.write({ kind: 'update', path: `users/${uid}`, data: changes });
    tx.write(auditWrite(ctx, { action: 'users.update', entity: { kind: 'user', id: uid }, affectedUserId: uid, before, after: changes }));
  });
  if (patch.displayName) await ctx.s.identity.updateUser(uid, { displayName: patch.displayName });
  if (accessChanged) await ctx.s.identity.updateUser(uid, { claims: await claimsFor(ctx, { roles, grant, deny, shopIds }), revokeSessions: true });
  const after = await ctx.s.db.get(`users/${uid}`);
  return json({ user: publicAccount(uid, after!.data) });
}

async function setStatus(ctx: Ctx, p: Record<string, string>) {
  const actor = requirePerm(ctx, 'users.manage');
  const uid = p.uid!;
  const body = await readJson<{ status?: unknown; reason?: unknown }>(ctx.req);
  if (body.status !== 'active' && body.status !== 'suspended') throw fail('VALIDATION', 'الحالة غير صالحة');
  const reason = cleanText(body.reason, 300, 'السبب');
  const cur = await ctx.s.db.get(`users/${uid}`);
  if (!cur) throw fail('NOT_FOUND', 'المستخدم غير موجود');
  if (uid === actor.uid) throw fail('FORBIDDEN', 'لا يمكنك تغيير حالة حسابك');
  const isOwner = ((cur.data.roles as string[]) ?? []).includes('super_admin');
  if (isOwner && !actor.roles.includes('super_admin')) throw fail('FORBIDDEN', 'حساب مالك النظام يديره مالك النظام فقط');
  if (body.status === 'suspended' && isOwner) await assertNotLastOwner(ctx, uid);
  await ctx.s.identity.updateUser(uid, { disabled: body.status === 'suspended', revokeSessions: true });
  await ctx.s.db.commit([
    { kind: 'update', path: `users/${uid}`, data: { status: body.status, sessionsRevokedAt: ctx.s.now(), statusReason: reason } },
    auditWrite(ctx, { action: `users.${body.status === 'active' ? 'activate' : 'suspend'}`, entity: { kind: 'user', id: uid }, affectedUserId: uid, before: { status: cur.data.status }, after: { status: body.status, reason } }),
  ]);
  return json({ ok: true });
}

async function resetPassword(ctx: Ctx, p: Record<string, string>) {
  const actor = requirePerm(ctx, 'users.manage');
  const cur = await ctx.s.db.get(`users/${p.uid}`);
  if (!cur) throw fail('NOT_FOUND', 'المستخدم غير موجود');
  if (((cur.data.roles as string[]) ?? []).includes('super_admin') && !actor.roles.includes('super_admin')) throw fail('FORBIDDEN', 'حساب مالك النظام يديره مالك النظام فقط');
  const pw = tempPassword();
  await ctx.s.identity.updateUser(cur.id, { password: pw, revokeSessions: true });
  const writes: Write[] = [
    { kind: 'update', path: `users/${cur.id}`, data: { mustChangePassword: true, sessionsRevokedAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'users.password.reset', entity: { kind: 'user', id: cur.id }, affectedUserId: cur.id }),
  ];
  await ctx.s.db.commit(writes);
  return json({ tempPassword: pw });
}

async function revokeSessions(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'users.manage');
  const cur = await ctx.s.db.get(`users/${p.uid}`);
  if (!cur) throw fail('NOT_FOUND', 'المستخدم غير موجود');
  await ctx.s.identity.updateUser(cur.id, { revokeSessions: true });
  await ctx.s.db.commit([
    { kind: 'update', path: `users/${cur.id}`, data: { sessionsRevokedAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'users.sessions.revoke', entity: { kind: 'user', id: cur.id }, affectedUserId: cur.id }),
  ]);
  return json({ ok: true });
}

export function userRoutes(r: Router<Ctx>) {
  r.on('GET', '/admin/users', list).on('POST', '/admin/users', create).on('GET', '/admin/users/:uid', getOne)
    .on('PATCH', '/admin/users/:uid', update).on('POST', '/admin/users/:uid/status', setStatus)
    .on('POST', '/admin/users/:uid/reset-password', resetPassword).on('POST', '/admin/users/:uid/revoke-sessions', revokeSessions);
}
