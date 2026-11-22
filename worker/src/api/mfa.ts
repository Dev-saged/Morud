import { base32Decode, base32Encode, otpauthUri, verifyTotp } from '../domain/totp';
import { auditWrite, requireUser, type Ctx, type Services } from './context';
import { fail, json, readJson, type Router } from './http';

// السر مشفّر بمفتاح مشتق (HKDF) من مفتاح الخادم، ولا تقرؤه قواعد Firestore لأي عميل (mfa/* مغلق افتراضياً)
async function mfaKey(s: Services) {
  const raw = Uint8Array.from(atob(s.backupKey), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', raw as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('mawred-mfa-v1'), info: new Uint8Array() }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(s: Services, secret: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await mfaKey(s), secret as BufferSource));
  return btoa(String.fromCharCode(...iv, ...ct));
}
async function open(s: Services, sealed: string) {
  const b = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await mfaKey(s), b.slice(12) as BufferSource));
}

export async function mfaEnabled(s: Services, uid: string) {
  return (await s.db.get(`mfa/${uid}`))?.data.enabled === true;
}

/** يتحقق من رمز مستخدم ويحفظ آخر خطوة (لا يُقبل نفس الرمز مرتين). */
export async function checkCode(s: Services, uid: string, code: string, pending = false): Promise<boolean> {
  const d = await s.db.get(`mfa/${uid}`);
  const sealed = pending ? d?.data.pending : d?.data.enabled ? d.data.secret : undefined;
  if (!d || typeof sealed !== 'string') return false;
  const st = await verifyTotp(await open(s, sealed), String(code).replace(/\s/g, ''), s.now(), (d.data.lastStep as number) ?? -1);
  if (st === null) return false;
  await s.db.commit([{ kind: 'update', path: d.path, data: { lastStep: st } }]);
  return true;
}

/** بدء التفعيل: سر جديد معلّق حتى يُثبت المستخدم أنه أضافه بإدخال رمز صحيح. */
async function setup(ctx: Ctx) {
  const u = requireUser(ctx);
  if (await mfaEnabled(ctx.s, u.uid)) throw fail('CONFLICT', 'التحقق بخطوتين مفعّل مسبقاً');
  const secret = crypto.getRandomValues(new Uint8Array(20));
  const b32 = base32Encode(secret);
  const prev = await ctx.s.db.get(`mfa/${u.uid}`);
  await ctx.s.db.commit([{ kind: 'set', path: `mfa/${u.uid}`, data: { ...(prev?.data ?? {}), enabled: false, pending: await seal(ctx.s, secret), lastStep: -1, updatedAt: ctx.s.now() } }]);
  return json({ secret: b32.replace(/(.{4})/g, '$1 ').trim(), uri: otpauthUri(b32, u.displayName || u.uid) });
}

async function enable(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await readJson<{ code?: string }>(ctx.req, 512);
  if (!(await checkCode(ctx.s, u.uid, String(b.code ?? ''), true))) throw fail('INVALID_CODE', 'الرمز غير صحيح، تأكد من وقت الهاتف وحاول مجدداً');
  const d = (await ctx.s.db.get(`mfa/${u.uid}`))!;
  await ctx.s.db.commit([
    { kind: 'set', path: d.path, data: { enabled: true, secret: d.data.pending, lastStep: d.data.lastStep, enabledAt: ctx.s.now() } },
    { kind: 'update', path: `users/${u.uid}`, data: { mfa: true } },
    auditWrite(ctx, { action: 'auth.mfa.enable', entity: { kind: 'user', id: u.uid } }),
  ]);
  return json({ ok: true });
}

async function disable(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await readJson<{ code?: string }>(ctx.req, 512);
  if (!(await checkCode(ctx.s, u.uid, String(b.code ?? '')))) throw fail('INVALID_CODE', 'الرمز غير صحيح');
  await ctx.s.db.commit([
    { kind: 'delete', path: `mfa/${u.uid}` },
    { kind: 'update', path: `users/${u.uid}`, data: { mfa: false } },
    auditWrite(ctx, { action: 'auth.mfa.disable', entity: { kind: 'user', id: u.uid } }),
  ]);
  return json({ ok: true });
}

/** تذكرة دخول قصيرة (5 دقائق، 5 محاولات) بعد نجاح كلمة المرور لمن فعّل الخطوتين. */
export async function issueTicket(s: Services, uid: string): Promise<string> {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) => x.toString(16).padStart(2, '0')).join('');
  await s.db.commit([{ kind: 'set', path: `mfaTickets/${id}`, data: { uid, exp: s.now() + 300_000, attempts: 0 } }]);
  return id;
}

/** يستهلك التذكرة عند نجاح الرمز؛ يرجع uid أو يرمي. */
export async function redeemTicket(s: Services, ticket: string, code: string): Promise<string> {
  if (!/^[a-f0-9]{48}$/.test(ticket)) throw fail('MFA_EXPIRED', 'انتهت صلاحية المحاولة، سجّل الدخول من جديد');
  const t = await s.db.get(`mfaTickets/${ticket}`);
  if (!t || (t.data.exp as number) < s.now() || (t.data.attempts as number) >= 5) {
    if (t) await s.db.commit([{ kind: 'delete', path: t.path }]);
    throw fail('MFA_EXPIRED', 'انتهت صلاحية المحاولة، سجّل الدخول من جديد');
  }
  const uid = String(t.data.uid);
  if (!(await checkCode(s, uid, code))) {
    await s.db.commit([{ kind: 'update', path: t.path, data: { attempts: (t.data.attempts as number) + 1 } }]);
    throw fail('INVALID_CODE', 'الرمز غير صحيح');
  }
  await s.db.commit([{ kind: 'delete', path: t.path }]);
  return uid;
}

export function mfaRoutes(r: Router<Ctx>) {
  r.on('POST', '/auth/mfa/setup', setup).on('POST', '/auth/mfa/enable', enable).on('POST', '/auth/mfa/disable', disable);
}
