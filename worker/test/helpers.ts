import { createApp, type RouteModule } from '../src/api/app';
import type { Services } from '../src/api/context';
import type { IdClaims } from '../src/infra/google';
import type { Identity, SignInResult } from '../src/infra/identity';
import { MemoryBlobs } from '../src/infra/blobs';
import { MemoryPusher } from '../src/infra/fcm';
import { MemoryFiles } from '../src/infra/files';
import { MemoryDb } from '../src/infra/memory-db';
import { MemoryCounter, RateLimiter } from '../src/infra/ratelimit';

export const T0 = Date.UTC(2026, 10, 20, 10, 0);

export class FakeIdentity implements Identity {
  passwords = new Map<string, { uid: string; pw: string; disabled?: boolean }>();
  updates: Array<{ uid: string; patch: unknown }> = [];
  resets: string[] = [];
  created: string[] = [];
  down = false;
  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    if (this.down) return { ok: false, reason: 'ERROR' };
    const a = this.passwords.get(email);
    if (!a || a.pw !== password) return { ok: false, reason: 'INVALID' };
    if (a.disabled) return { ok: false, reason: 'DISABLED' };
    return { ok: true, uid: a.uid };
  }
  async createUser(uid: string, email: string, password: string) {
    if (this.failCreate) throw new Error('identity down');
    this.created.push(uid);
    this.passwords.set(email, { uid, pw: password });
  }
  async updateUser(uid: string, patch: { password?: string; disabled?: boolean }) {
    this.updates.push({ uid, patch });
    for (const v of this.passwords.values()) if (v.uid === uid) {
      if (patch.password) v.pw = patch.password;
      if (patch.disabled !== undefined) v.disabled = patch.disabled;
    }
  }
  async sendPasswordReset(email: string) {
    this.resets.push(email);
  }
  deleted: string[] = [];
  failCreate = false;
  async deleteUser(uid: string) {
    this.deleted.push(uid);
    for (const [k, v] of this.passwords) if (v.uid === uid) this.passwords.delete(k);
  }
}

export interface World {
  db: MemoryDb;
  identity: FakeIdentity;
  s: Services;
  clock: { now: number };
  tokens: Map<string, IdClaims>;
  deferred: Array<Promise<unknown>>;
  flush(): Promise<void>;
  call(method: string, path: string, opts?: { body?: unknown; token?: string; headers?: Record<string, string> }): Promise<{ status: number; body: any; headers: Headers }>;
  tokenFor(uid: string, authTimeMs?: number): string;
}

export function world(modules: RouteModule[] = []): World {
  const db = new MemoryDb();
  const identity = new FakeIdentity();
  const clock = { now: T0 };
  db.now = () => clock.now;
  const tokens = new Map<string, IdClaims>();
  const deferred: Array<Promise<unknown>> = [];
  let seq = 0;
  const s: Services = {
    db, identity, files: new MemoryFiles(), pusher: new MemoryPusher(), backupStore: new MemoryBlobs(), backupKey: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1))), defer: (p) => void deferred.push(p),
    verifyToken: async (t) => tokens.get(t) ?? null,
    customToken: async (uid, claims) => `custom:${uid}:${JSON.stringify(claims)}`,
    loginLimiter: new RateLimiter(new MemoryCounter(), 5, 900, 'login'),
    ipLimiter: new RateLimiter(new MemoryCounter(), 30, 900, 'ip'),
    cache: new MemoryCounter(),
    now: () => clock.now,
    id: () => `id${String(++seq).padStart(6, '0')}`,
  };
  const handle = createApp(modules);
  const w: World = {
    db, identity, s, clock, tokens, deferred,
    async flush() { await Promise.all(deferred.splice(0)); },
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1', ...(opts.headers ?? {}) };
      if (opts.token) headers.authorization = `Bearer ${opts.token}`;
      const res = await handle(new Request(`https://api.test${path}`, { method, headers, ...(opts.body !== undefined ? { body: typeof opts.body === 'string' || opts.body instanceof Uint8Array ? (opts.body as BodyInit) : JSON.stringify(opts.body) } : {}) }), s, { allowedOrigins: ['https://app.test'] });
      const text = await res.text();
      return { status: res.status, body: text && (res.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : text || null, headers: res.headers };
    },
    tokenFor(uid, authTimeMs = clock.now) {
      const t = `tok-${uid}-${authTimeMs}`;
      tokens.set(t, { sub: uid, auth_time: Math.floor(authTimeMs / 1000), iat: Math.floor(authTimeMs / 1000), exp: Math.floor(authTimeMs / 1000) + 3600 });
      return t;
    },
  };
  return w;
}

/** حساب اختبار كامل: وثيقة المستخدم + فهرس الدخول + كلمة المرور. */
export function addUser(w: World, uid: string, o: { username: string; roles: string[]; password?: string; shopIds?: string[]; email?: string; phone?: string; status?: string; expiresAt?: number; mustChangePassword?: boolean }) {
  const loginEmail = `u${uid}@login.mawred`;
  w.db.seed(`users/${uid}`, {
    displayName: o.username, username: o.username, email: o.email ?? null, phone: o.phone ?? null, loginEmail, status: o.status ?? 'active',
    roles: o.roles, grant: [], deny: [], shopIds: o.shopIds ?? [], expiresAt: o.expiresAt ?? null, sessionsRevokedAt: null, mustChangePassword: o.mustChangePassword ?? false,
  });
  w.db.seed(`logins/u:${o.username}`, { uid, loginEmail });
  if (o.phone) w.db.seed(`logins/p:${o.phone}`, { uid, loginEmail });
  w.identity.passwords.set(loginEmail, { uid, pw: o.password ?? 'Secret123' });
}
