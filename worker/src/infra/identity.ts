// Firebase Auth عبر Identity Toolkit REST
type Fetch = typeof fetch;
const BASE = 'https://identitytoolkit.googleapis.com/v1';

export type SignInResult = { ok: true; uid: string } | { ok: false; reason: 'INVALID' | 'DISABLED' | 'THROTTLED' | 'ERROR' };

export interface Identity {
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  createUser(uid: string, email: string, password: string, displayName: string): Promise<void>;
  updateUser(uid: string, patch: { password?: string; disabled?: boolean; email?: string; displayName?: string; revokeSessions?: boolean; claims?: Record<string, unknown> }): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
}

export class IdentityToolkit implements Identity {
  constructor(
    private readonly projectId: string,
    private readonly apiKey: string,
    private readonly token: () => Promise<string>,
    private readonly f: Fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    const res = await this.f(`${BASE}/accounts:signInWithPassword?key=${this.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
    if (res.ok) return { ok: true, uid: ((await res.json()) as { localId: string }).localId };
    const msg = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    if (msg.startsWith('USER_DISABLED')) return { ok: false, reason: 'DISABLED' };
    if (msg.startsWith('TOO_MANY_ATTEMPTS')) return { ok: false, reason: 'THROTTLED' };
    if (/INVALID|EMAIL_NOT_FOUND|PASSWORD/.test(msg)) return { ok: false, reason: 'INVALID' };
    return { ok: false, reason: 'ERROR' };
  }

  private async admin(path: string, body: unknown): Promise<void> {
    const res = await this.f(`${BASE}/projects/${this.projectId}/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await this.token()}` }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`identity ${path} ${res.status}`);
  }

  createUser(uid: string, email: string, password: string, displayName: string) {
    return this.admin('accounts', { localId: uid, email, password, displayName, emailVerified: false });
  }

  updateUser(uid: string, p: Parameters<Identity['updateUser']>[1]) {
    return this.admin('accounts:update', {
      localId: uid,
      ...(p.password ? { password: p.password } : {}),
      ...(p.disabled !== undefined ? { disableUser: p.disabled } : {}),
      ...(p.email ? { email: p.email } : {}),
      ...(p.displayName ? { displayName: p.displayName } : {}),
      ...(p.revokeSessions ? { validSince: String(Math.floor(this.clock() / 1000)) } : {}),
      ...(p.claims ? { customAttributes: JSON.stringify(p.claims) } : {}),
    });
  }

  deleteUser(uid: string) {
    return this.admin('accounts:delete', { localId: uid });
  }

  async sendPasswordReset(email: string) {
    await this.f(`${BASE}/accounts:sendOobCode?key=${this.apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
  }
}
