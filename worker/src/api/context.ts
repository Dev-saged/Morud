import { effectivePermissions, resolveHome, roleMap, type RoleDef } from '../domain/permissions';
import type { Data, Db, Doc, Tx, Write } from '../infra/db';
import type { IdClaims } from '../infra/google';
import type { BlobStore } from '../infra/blobs';
import type { Pusher } from '../infra/fcm';
import type { FileStore } from '../infra/files';
import type { Identity } from '../infra/identity';
import type { Counter, RateLimiter } from '../infra/ratelimit';
import { fail } from './http';

export interface Services {
  db: Db;
  identity: Identity;
  files: FileStore;
  pusher: Pusher;
  backupStore: BlobStore;
  backupKey: string; // مفتاح AES-256 بصيغة base64 (سر)
  defer(p: Promise<unknown>): void; // ExecutionContext.waitUntil في الإنتاج
  verifyToken(token: string): Promise<IdClaims | null>;
  customToken(uid: string, claims: Record<string, unknown>): Promise<string>;
  loginLimiter: RateLimiter;
  ipLimiter: RateLimiter;
  /** كاش مشترك بين نسخ الخادم (KV) للقراءات الثقيلة المتكررة مثل الكتالوج. */
  cache?: Counter;
  now(): number;
  id(): string;
}

export interface AuthUser {
  uid: string;
  displayName: string;
  roles: string[];
  kinds: Set<string>;
  permissions: Set<string>;
  shopIds: string[];
  home: string;
  contexts: string[];
  mustChangePassword: boolean;
  doc: Data;
}

export interface Ctx {
  req: Request;
  url: URL;
  s: Services;
  requestId: string;
  ip: string;
  device: string;
  workContext: string | null;
  user: AuthUser | null;
}

// تعريفات الأدوار والصلاحيات الإضافية تتغير نادراً: تُحفظ في ذاكرة النسخة 15 ثانية وتُمسح فور أي تعديل عليها
const ROLE_TTL = 15_000;
const roleCache = new WeakMap<Db, { at: number; roles: Promise<Map<string, RoleDef>>; extra: Promise<string[]> }>();
function roleEntry(db: Db) {
  const now = Date.now();
  let e = roleCache.get(db);
  if (!e || now - e.at > ROLE_TTL) {
    const roles = db.query({ collection: 'roles' }).then((rows) => {
      const m = roleMap();
      for (const r of rows) m.set(r.id, { id: r.id, ...(r.data as Omit<RoleDef, 'id'>) });
      return m;
    });
    const extra = db.get('system/permissions').then((d) => ((d?.data.extra as Array<{ id: string }>) ?? []).map((p) => p.id));
    e = { at: now, roles, extra };
    roleCache.set(db, e);
    // فشل القراءة لا يُحفظ
    Promise.all([roles, extra]).catch(() => { if (roleCache.get(db) === e) roleCache.delete(db); });
  }
  return e;
}

export function invalidateRoleCache(db: Db) {
  roleCache.delete(db);
}

export async function loadRoles(db: Db): Promise<Map<string, RoleDef>> {
  return new Map(await roleEntry(db).roles);
}

export async function extraPermissions(db: Db): Promise<string[]> {
  return [...(await roleEntry(db).extra)];
}

/** يبني المستخدم من وثيقته في كل طلب ويرفض الموقوف والمنتهي والجلسات الملغاة. */
export async function buildUser(s: Services, uid: string, claims: IdClaims | null): Promise<AuthUser> {
  roleEntry(s.db); // تبدأ قراءة الأدوار بالتوازي مع وثيقة المستخدم
  const doc = await s.db.get(`users/${uid}`);
  if (!doc) throw fail('UNAUTHENTICATED', 'الحساب غير موجود');
  return userFromDoc(s, doc, claims);
}

export async function userFromDoc(s: Services, doc: Doc, claims: IdClaims | null): Promise<AuthUser> {
  const d = doc.data;
  if (d.status !== 'active') throw fail('ACCOUNT_SUSPENDED', 'الحساب موقوف، تواصل مع الإدارة');
  if (typeof d.expiresAt === 'number' && d.expiresAt <= s.now()) throw fail('ACCOUNT_EXPIRED', 'انتهت صلاحية الحساب');
  if (claims && typeof d.sessionsRevokedAt === 'number' && claims.auth_time * 1000 < d.sessionsRevokedAt) {
    throw fail('UNAUTHENTICATED', 'انتهت الجلسة، سجّل الدخول من جديد');
  }
  const roles = (d.roles as string[]) ?? [];
  const [defs, extra] = await Promise.all([loadRoles(s.db), extraPermissions(s.db)]);
  const permissions = effectivePermissions({ roles, grant: (d.grant as string[]) ?? [], deny: (d.deny as string[]) ?? [] }, defs, extra);
  const kinds = new Set(roles.map((r) => defs.get(r)?.kind).filter((k): k is NonNullable<typeof k> => !!k));
  const { home, contexts } = resolveHome(roles, defs);
  return {
    uid: doc.id, displayName: String(d.displayName ?? ''), roles, kinds, permissions, shopIds: (d.shopIds as string[]) ?? [],
    home, contexts, mustChangePassword: d.mustChangePassword === true, doc: d,
  };
}

export function requireUser(ctx: Ctx): AuthUser {
  if (!ctx.user) throw fail('UNAUTHENTICATED', 'سجّل الدخول أولاً');
  return ctx.user;
}

export function requirePerm(ctx: Ctx, ...perms: string[]): AuthUser {
  const u = requireUser(ctx);
  const missing = perms.filter((p) => !u.permissions.has(p));
  if (missing.length) throw fail('FORBIDDEN', 'لا تملك صلاحية تنفيذ هذا الإجراء', { missing });
  return u;
}

/** عضو المحل يصل لمحله فقط؛ موظف المورد يحتاج صلاحية العرض المناسبة. معرّف المحل من العميل لا يُوثق به وحده. */
export function assertShopAccess(ctx: Ctx, shopId: string, staffPermission: string): AuthUser {
  const u = requireUser(ctx);
  if (u.kinds.has('staff') && u.permissions.has(staffPermission)) return u;
  if (u.shopIds.includes(shopId)) return u;
  throw fail('FORBIDDEN', 'لا يمكنك الوصول إلى بيانات هذا المحل');
}

export interface AuditInput {
  action: string;
  entity: { kind: string; id: string };
  before?: Data | null;
  after?: Data | null;
  affectedUserId?: string;
  result?: 'ok' | 'denied' | 'failed';
}

export function auditWrite(ctx: Ctx, a: AuditInput, actorId = ctx.user?.uid ?? 'anonymous'): Write {
  const id = ctx.s.id();
  return {
    kind: 'create', path: `auditLogs/${id}`,
    data: {
      actorId, roleContext: ctx.workContext ?? ctx.user?.home ?? null, action: a.action, entity: a.entity,
      affectedUserId: a.affectedUserId ?? null, before: a.before ?? null, after: a.after ?? null,
      ip: ctx.ip, device: ctx.device, requestId: ctx.requestId, result: a.result ?? 'ok', at: ctx.s.now(),
    },
  };
}

const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;

/**
 * منع التكرار لعمليات تدير معاملتها بنفسها (مثل إنشاء حساب): يُفحص المفتاح قبل التنفيذ،
 * وتُكتب وثيقة المفتاح داخل معاملة العملية نفسها (create يمنع التنفيذ المزدوج المتزامن).
 */
export async function idempotencySlot(ctx: Ctx, route: string): Promise<{ prev: Data | null; write: (result: Data) => Write; path: string }> {
  const u = requireUser(ctx);
  const key = ctx.req.headers.get('idempotency-key');
  if (!key || !KEY_RE.test(key)) throw fail('IDEMPOTENCY_KEY_REQUIRED', 'مفتاح منع التكرار مفقود أو غير صالح');
  const path = `idempotency/${u.uid}_${key}`;
  const prev = await ctx.s.db.get(path);
  if (prev && prev.data.route !== route) throw fail('IDEMPOTENCY_KEY_REUSED', 'المفتاح مستخدم لعملية أخرى');
  return {
    path,
    prev: prev ? (prev.data.result as Data) : null,
    write: (result) => ({ kind: 'create', path, data: { uid: u.uid, route, result, createdAt: ctx.s.now(), expireAt: new Date(ctx.s.now() + 7 * 86_400_000) } }),
  };
}

/** تنفيذ عملية حساسة مرة واحدة لكل مفتاح داخل نفس المعاملة (create-if-absent يمنع السباق). */
export async function idempotent<T>(ctx: Ctx, route: string, fn: (tx: Tx) => Promise<T>): Promise<{ value: T; replayed: boolean }> {
  const u = requireUser(ctx);
  const key = ctx.req.headers.get('idempotency-key');
  if (!key || !KEY_RE.test(key)) throw fail('IDEMPOTENCY_KEY_REQUIRED', 'مفتاح منع التكرار مفقود أو غير صالح');
  const path = `idempotency/${u.uid}_${key}`;
  return ctx.s.db.runTransaction(async (tx) => {
    const prev = await tx.get(path);
    if (prev) {
      if (prev.data.route !== route) throw fail('IDEMPOTENCY_KEY_REUSED', 'المفتاح مستخدم لعملية أخرى');
      return { value: prev.data.result as T, replayed: true };
    }
    const value = await fn(tx);
    tx.write({ kind: 'create', path, data: { uid: u.uid, route, result: value as unknown as Data, createdAt: ctx.s.now(), expireAt: new Date(ctx.s.now() + 7 * 86_400_000) } });
    return { value, replayed: false };
  });
}
