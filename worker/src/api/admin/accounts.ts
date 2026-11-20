import { effectivePermissions, loginKey, passwordProblem, ruleClaims, type RoleDef } from '../../domain/permissions';
import type { Data, Write } from '../../infra/db';
import { auditWrite, extraPermissions, idempotencySlot, loadRoles, type AuthUser, type Ctx } from '../context';
import { ConflictError } from '../../infra/db';
import { cleanText, fail } from '../http';

export interface AccountInput {
  displayName: string;
  username: string;
  phone: string | null;
  email: string | null;
  roles: string[];
  grant: string[];
  deny: string[];
  shopIds: string[];
  expiresAt: number | null;
  password?: string;
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** كلمة مرور مؤقتة عشوائية (10 أحرف، حرف ورقم) تُعرض مرة واحدة فقط. */
export function tempPassword(): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const pw = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!passwordProblem(pw)) return pw;
  }
}

function strList(v: unknown, field: string, max = 50): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== 'string' || x.length > 80)) throw fail('VALIDATION', `الحقل «${field}» غير صالح`, { field });
  return [...new Set(v as string[])];
}

export function parseAccount(body: Data, partial = false): Partial<AccountInput> {
  const out: Partial<AccountInput> = {};
  if (!partial || body.displayName !== undefined) out.displayName = cleanText(body.displayName, 80, 'الاسم');
  if (!partial || body.username !== undefined) {
    const u = cleanText(body.username, 32, 'اسم المستخدم').toLowerCase();
    if (loginKey(u) !== `u:${u}`) throw fail('VALIDATION', 'اسم المستخدم: 3–32 حرفاً لاتينياً أو أرقاماً أو . _ -', { field: 'username' });
    out.username = u;
  }
  if (!partial || body.phone !== undefined) {
    const p = cleanText(body.phone, 20, 'الهاتف', false);
    const k = p ? loginKey(p) : null;
    if (p && !k?.startsWith('p:')) throw fail('VALIDATION', 'رقم الهاتف غير صالح', { field: 'phone' });
    out.phone = k ? k.slice(2) : null;
  }
  if (!partial || body.email !== undefined) {
    const e = cleanText(body.email, 120, 'البريد', false).toLowerCase();
    if (e && loginKey(e) !== `e:${e}`) throw fail('VALIDATION', 'البريد الإلكتروني غير صالح', { field: 'email' });
    out.email = e || null;
  }
  if (!partial || body.roles !== undefined) out.roles = strList(body.roles, 'الأدوار', 10);
  if (!partial || body.grant !== undefined) out.grant = strList(body.grant, 'المنح');
  if (!partial || body.deny !== undefined) out.deny = strList(body.deny, 'الحجب');
  if (!partial || body.shopIds !== undefined) out.shopIds = strList(body.shopIds, 'المحلات', 20);
  if (!partial || body.expiresAt !== undefined) {
    const x = body.expiresAt;
    if (x !== null && x !== undefined && (!Number.isSafeInteger(x) || (x as number) <= 0)) throw fail('VALIDATION', 'تاريخ الانتهاء غير صالح', { field: 'expiresAt' });
    out.expiresAt = (x as number | null | undefined) ?? null;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || passwordProblem(body.password)) throw fail('PASSWORD_WEAK', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفاً ورقماً');
    out.password = body.password;
  }
  return out;
}

/**
 * لا يمنح أحد صلاحيات لا يملكها (SRS 2.3-ب). مالك النظام وحده يمنح دور مالك النظام.
 * يعيد تعريفات الأدوار للاستخدام اللاحق.
 */
export async function assertGrantable(ctx: Ctx, actor: AuthUser, roles: string[], grant: string[]): Promise<Map<string, RoleDef>> {
  const defs = await loadRoles(ctx.s.db);
  const unknown = roles.filter((r) => !defs.has(r));
  if (unknown.length) throw fail('VALIDATION', 'دور غير معروف', { roles: unknown });
  if (roles.includes('super_admin') && !actor.roles.includes('super_admin')) throw fail('FORBIDDEN', 'منح صلاحية مالك النظام لمالك النظام فقط');
  if (actor.roles.includes('super_admin')) return defs;
  const wanted = effectivePermissions({ roles, grant }, defs, await extraPermissions(ctx.s.db));
  const beyond = [...wanted].filter((p) => !actor.permissions.has(p));
  if (beyond.length) throw fail('FORBIDDEN', 'لا يمكنك منح صلاحيات لا تملكها', { permissions: beyond });
  return defs;
}

export function loginKeys(a: { username: string; phone: string | null; email: string | null }): string[] {
  return [`u:${a.username}`, ...(a.phone ? [`p:${a.phone}`] : []), ...(a.email ? [`e:${a.email}`] : [])];
}

export async function claimsFor(ctx: Ctx, d: { roles: string[]; grant: string[]; deny: string[]; shopIds: string[] }) {
  const defs = await loadRoles(ctx.s.db);
  const perms = effectivePermissions({ roles: d.roles, grant: d.grant, deny: d.deny }, defs, await extraPermissions(ctx.s.db));
  const kinds = new Set(d.roles.map((r) => defs.get(r)?.kind).filter((k): k is NonNullable<typeof k> => !!k));
  return ruleClaims(perms, kinds, d.shopIds);
}

/**
 * إنشاء حساب بمنع تكرار: إعادة نفس الطلب تعيد نفس المعرّف دون كلمة المرور (تُعرض مرة واحدة فقط؛
 * إن ضاعت يُعاد تعيينها). العمليات الإضافية (محل، عضوية) تُكتب في نفس المعاملة.
 */
export async function createAccountOnce(ctx: Ctx, route: string, a: AccountInput, extra: (uid: string) => Write[] = (): Write[] => [], result: (uid: string) => Data = () => ({})) {
  const slot = await idempotencySlot(ctx, route);
  if (slot.prev) return { ...slot.prev, tempPassword: null, replayed: true };
  try {
    const r = await createAccount(ctx, a, (uid) => [...extra(uid), slot.write({ uid, ...result(uid) })]);
    return { ...r, ...result(r.uid), replayed: false };
  } catch (e) {
    if (e instanceof ConflictError) {
      const again = await ctx.s.db.get(slot.path);
      if (again) return { ...(again.data.result as Data), tempPassword: null, replayed: true };
    }
    throw e;
  }
}

/**
 * ينشئ حساباً كاملاً: Firebase Auth + وثيقة المستخدم + فهارس الدخول (فريدة) + تدقيق، في معاملة واحدة.
 * إن فشلت المعاملة يُحذف حساب Firebase كي لا يبقى يتيماً.
 */
export async function createAccount(ctx: Ctx, a: AccountInput, extraWrites: (uid: string) => Write[] = () => []): Promise<{ uid: string; tempPassword: string | null }> {
  const uid = ctx.s.id();
  const password = a.password ?? tempPassword();
  const loginEmail = a.email ?? `u${uid}@login.mawred`;
  const keys = loginKeys(a);
  for (const k of keys) if (await ctx.s.db.get(`logins/${k}`)) throw fail('CONFLICT', 'اسم المستخدم أو الهاتف أو البريد مستخدم مسبقاً', { key: k.slice(0, 1) });
  await ctx.s.identity.createUser(uid, loginEmail, password, a.displayName);
  try {
    const data: Data = {
      displayName: a.displayName, username: a.username, phone: a.phone, email: a.email, loginEmail, status: 'active',
      roles: a.roles, grant: a.grant, deny: a.deny, shopIds: a.shopIds, expiresAt: a.expiresAt, sessionsRevokedAt: null,
      mustChangePassword: !a.password, createdAt: ctx.s.now(), createdBy: ctx.user?.uid ?? 'system',
    };
    await ctx.s.db.runTransaction(async (tx) => {
      tx.write({ kind: 'create', path: `users/${uid}`, data });
      for (const k of keys) tx.write({ kind: 'create', path: `logins/${k}`, data: { uid, loginEmail } });
      for (const w of extraWrites(uid)) tx.write(w);
      tx.write(auditWrite(ctx, { action: 'users.create', entity: { kind: 'user', id: uid }, affectedUserId: uid, after: { ...data, loginEmail: undefined } }));
    });
    await ctx.s.identity.updateUser(uid, { claims: await claimsFor(ctx, a) });
  } catch (e) {
    await ctx.s.identity.deleteUser(uid).catch(() => undefined);
    throw e;
  }
  return { uid, tempPassword: a.password ? null : password };
}

/** يمنع ترك النظام بلا مالك نشط. */
export async function assertNotLastOwner(ctx: Ctx, uid: string) {
  const owners = await ctx.s.db.query({ collection: 'users', where: [['roles', 'array-contains', 'super_admin'], ['status', '==', 'active']], limit: 2 });
  if (owners.length === 1 && owners[0]!.id === uid) throw fail('LAST_OWNER', 'لا يمكن إيقاف أو تقليص صلاحيات آخر مالك للنظام');
}

export function publicAccount(id: string, d: Data) {
  return {
    uid: id, displayName: d.displayName, username: d.username, phone: d.phone, email: d.email, status: d.status, roles: d.roles,
    grant: d.grant, deny: d.deny, shopIds: d.shopIds, expiresAt: d.expiresAt, mustChangePassword: d.mustChangePassword,
    lastLoginAt: d.lastLoginAt ?? null, createdAt: d.createdAt ?? null,
  };
}
