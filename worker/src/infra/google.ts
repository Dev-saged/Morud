// توقيع JWT بحساب الخدمة عبر WebCrypto، رموز الوصول OAuth، وتحقق Firebase ID token — بلا مكتبات
export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const enc = new TextEncoder();

export function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importPrivateKey(pem: string): Promise<CryptoKey> {
  let k = keyCache.get(pem);
  if (!k) {
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    k = crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(pem, k);
  }
  return k;
}

export async function signJwt(payload: Record<string, unknown>, privateKeyPem: string, kid?: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(kid ? { kid } : {}) }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importPrivateKey(privateKeyPem), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

type Fetch = typeof fetch;
const tokenCache = new Map<string, { token: string; exp: number }>();

export async function accessToken(sa: ServiceAccount, scope: string, f: Fetch = fetch, now = Date.now()): Promise<string> {
  const key = `${sa.client_email}|${scope}`;
  const hit = tokenCache.get(key);
  if (hit && hit.exp - 60_000 > now) return hit.token;
  const iat = Math.floor(now / 1000);
  const assertion = await signJwt({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }, sa.private_key);
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(key, { token: j.access_token, exp: now + j.expires_in * 1000 });
  return j.access_token;
}

/** رمز مخصص يدخل به العميل عبر signInWithCustomToken (صلاحية ساعة). */
export function customToken(sa: ServiceAccount, uid: string, claims: Record<string, unknown>, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  return signJwt({
    iss: sa.client_email, sub: sa.client_email, uid, claims, iat, exp: iat + 3600,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
  }, sa.private_key);
}

export interface IdClaims {
  sub: string;
  auth_time: number;
  iat: number;
  exp: number;
  [k: string]: unknown;
}

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwks: { keys: Map<string, CryptoKey>; exp: number } | null = null;

async function loadJwks(f: Fetch, now: number) {
  if (jwks && jwks.exp > now) return jwks.keys;
  const res = await f(JWKS_URL);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  const body = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> };
  const keys = new Map<string, CryptoKey>();
  for (const k of body.keys) {
    keys.set(k.kid, await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  jwks = { keys, exp: now + maxAge * 1000 };
  return keys;
}

export function resetJwksCache() {
  jwks = null;
  tokenCache.clear();
}

/** تحقق Firebase ID token وفق متطلبات Google: التوقيع، iss، aud، exp، iat، sub. يعيد null عند أي خلل. */
export async function verifyIdToken(token: string, projectId: string, f: Fetch = fetch, now = Date.now()): Promise<IdClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]!))) as { alg: string; kid: string };
    if (header.alg !== 'RS256') return null;
    const key = (await loadJwks(f, now)).get(header.kid);
    if (!key) return null;
    const okSig = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]!), enc.encode(`${parts[0]}.${parts[1]}`));
    if (!okSig) return null;
    const c = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]!))) as IdClaims & { iss: string; aud: string };
    const t = Math.floor(now / 1000);
    if (c.iss !== `https://securetoken.google.com/${projectId}` || c.aud !== projectId) return null;
    if (typeof c.sub !== 'string' || !c.sub || c.exp <= t || c.iat > t + 60 || c.auth_time > t + 60) return null;
    return c;
  } catch {
    return null;
  }
}
