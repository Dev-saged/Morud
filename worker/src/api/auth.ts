import { loginKey, passwordProblem, ruleClaims } from '../domain/permissions';
import { auditWrite, buildUser, requireUser, userFromDoc, type AuthUser, type Ctx } from './context';
import { cleanText, fail, json, readJson, type Router } from './http';

export function publicUser(u: AuthUser) {
  return {
    uid: u.uid, displayName: u.displayName, roles: u.roles, home: u.home, contexts: u.contexts,
    permissions: [...u.permissions].sort(), shopIds: u.shopIds, mustChangePassword: u.mustChangePassword,
  };
}

const GENERIC = 'بيانات الدخول غير صحيحة';

async function login(ctx: Ctx): Promise<Response> {
  const body = await readJson<{ identifier?: unknown; password?: unknown }>(ctx.req, 4096);
  const identifier = cleanText(body.identifier, 120, 'المعرّف');
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 128) throw fail('INVALID_CREDENTIALS', GENERIC);
  const key = loginKey(identifier);
  const { loginLimiter, ipLimiter, db, identity } = ctx.s;
  if ((key && (await loginLimiter.blocked(key))) || (await ipLimiter.blocked(ctx.ip))) {
    throw fail('RATE_LIMITED', 'محاولات كثيرة، حاول بعد 15 دقيقة');
  }
  const deny = async (reason: string): Promise<never> => {
    if (key) await loginLimiter.hit(key);
    await ipLimiter.hit(ctx.ip);
    await db.commit([auditWrite(ctx, { action: 'auth.login', entity: { kind: 'login', id: key ?? 'invalid' }, result: 'denied', after: { reason } })]);
    throw fail('INVALID_CREDENTIALS', GENERIC);
  };
  if (!key) return deny('bad_identifier');
  const map = await db.get(`logins/${key}`);
  if (!map) return deny('unknown');
  const r = await identity.signInWithPassword(String(map.data.loginEmail), password);
  if (!r.ok) {
    if (r.reason === 'DISABLED') throw fail('ACCOUNT_SUSPENDED', 'الحساب موقوف، تواصل مع الإدارة');
    if (r.reason === 'THROTTLED') throw fail('RATE_LIMITED', 'محاولات كثيرة، حاول لاحقاً');
    if (r.reason === 'ERROR') throw fail('AUTH_UNAVAILABLE', 'خدمة الدخول غير متاحة مؤقتاً، حاول بعد قليل', undefined, 503);
    return deny('password');
  }
  if (r.uid !== map.data.uid) return deny('mismatch');
  const doc = await db.get(`users/${r.uid}`);
  if (!doc) return deny('no_profile');
  const user = await userFromDoc(ctx.s, doc, null);
  await loginLimiter.reset(key);
  const claims = ruleClaims(user.permissions, user.kinds, user.shopIds);
  const token = await ctx.s.customToken(user.uid, claims);
  ctx.user = user;
  await db.commit([
    { kind: 'update', path: `users/${user.uid}`, data: { lastLoginAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'auth.login', entity: { kind: 'user', id: user.uid } }),
  ]);
  return json({ customToken: token, user: publicUser(user) });
}

async function me(ctx: Ctx) {
  return json({ user: publicUser(requireUser(ctx)) });
}

async function changePassword(ctx: Ctx) {
  const u = requireUser(ctx);
  const body = await readJson<{ newPassword?: unknown }>(ctx.req, 4096);
  const pw = typeof body.newPassword === 'string' ? body.newPassword : '';
  const problem = passwordProblem(pw);
  if (problem) throw fail(problem, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حرفاً ورقماً');
  await ctx.s.identity.updateUser(u.uid, { password: pw, revokeSessions: true });
  await ctx.s.db.commit([
    { kind: 'update', path: `users/${u.uid}`, data: { mustChangePassword: false, sessionsRevokedAt: ctx.s.now(), passwordChangedAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'auth.password.change', entity: { kind: 'user', id: u.uid } }),
  ]);
  const token = await ctx.s.customToken(u.uid, ruleClaims(u.permissions, u.kinds, u.shopIds));
  return json({ ok: true, customToken: token });
}

async function logoutAll(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.s.identity.updateUser(u.uid, { revokeSessions: true });
  await ctx.s.db.commit([
    { kind: 'update', path: `users/${u.uid}`, data: { sessionsRevokedAt: ctx.s.now() } },
    auditWrite(ctx, { action: 'auth.sessions.revoke', entity: { kind: 'user', id: u.uid } }),
  ]);
  return json({ ok: true });
}

/** نسيت كلمة المرور: رد عام دائماً (لا كشف لوجود الحساب). ببريد ← رابط Firebase، بلا بريد ← تذكرة للإدارة. */
async function forgot(ctx: Ctx) {
  const body = await readJson<{ identifier?: unknown }>(ctx.req, 4096);
  const key = loginKey(cleanText(body.identifier, 120, 'المعرّف'));
  const ok = json({ ok: true, message: 'إن كان الحساب موجوداً فسيصلك رابط الاستعادة أو تتواصل معك الإدارة' });
  if (await ctx.s.ipLimiter.blocked(ctx.ip)) return ok;
  await ctx.s.ipLimiter.hit(ctx.ip);
  if (!key) return ok;
  const map = await ctx.s.db.get(`logins/${key}`);
  if (!map) return ok;
  const user = await ctx.s.db.get(`users/${map.data.uid}`);
  if (!user || user.data.status !== 'active') return ok;
  if (typeof user.data.email === 'string' && user.data.email) await ctx.s.identity.sendPasswordReset(user.data.email);
  else {
    const id = ctx.s.id();
    await ctx.s.db.commit([{ kind: 'create', path: `supportTickets/${id}`, data: { type: 'password_reset', by: user.id, shopId: (user.data.shopIds as string[])?.[0] ?? null, status: 'open', subject: 'طلب استعادة كلمة المرور', createdAt: ctx.s.now() } }]);
  }
  return ok;
}

export function authRoutes(r: Router<Ctx>) {
  r.on('POST', '/auth/login', login).on('GET', '/auth/me', me).on('POST', '/auth/change-password', changePassword)
    .on('POST', '/auth/logout-all', logoutAll).on('POST', '/auth/forgot', forgot);
}

export { buildUser };
