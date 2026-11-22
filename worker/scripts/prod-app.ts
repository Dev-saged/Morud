// تشغيل كود الخادم الحقيقي محلياً ضد الإنتاج (Firestore + R2) بصلاحيات المالك: للنصوص الإدارية الدفعية.
import { readFileSync } from 'node:fs';
import { createApp } from '../src/api/app';
import type { Services } from '../src/api/context';
import { ALL_ROUTES } from '../src/api/routes';
import { MemoryBlobs } from '../src/infra/blobs';
import { MemoryPusher } from '../src/infra/fcm';
import type { FileStore, StoredFile } from '../src/infra/files';
import { FirestoreDb } from '../src/infra/firestore';
import { accessToken, customToken, type ServiceAccount } from '../src/infra/google';
import { IdentityToolkit } from '../src/infra/identity';
import { MemoryCounter, RateLimiter } from '../src/infra/ratelimit';

const need = (k: string) => process.env[k] ?? (console.error(`المتغير ${k} مطلوب`), process.exit(1));
const sa = JSON.parse(readFileSync(need('SERVICE_ACCOUNT'), 'utf8')) as ServiceAccount;
const token = () => accessToken(sa, 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit');
const CF = `https://api.cloudflare.com/client/v4/accounts/${need('CF_ACCOUNT')}/r2/buckets/mawred-files/objects/`;
const cfh = { authorization: `Bearer ${need('CF_TOKEN')}` };

/** R2 عبر واجهة Cloudflare (نفس المخزن الذي يقرأ منه الخادم). */
class R2Rest implements FileStore {
  async put(key: string, body: ArrayBuffer, contentType: string) {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(CF + encodeURIComponent(key), { method: 'PUT', headers: { ...cfh, 'content-type': contentType }, body });
      if (r.ok) return;
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 15_000)); continue; }
      throw new Error(`R2 ${r.status} ${await r.text()}`);
    }
    throw new Error('R2 throttled');
  }
  async get(key: string): Promise<StoredFile | null> {
    const r = await fetch(CF + encodeURIComponent(key), { headers: cfh });
    return r.ok ? { body: await r.arrayBuffer(), contentType: r.headers.get('content-type') ?? '' } : null;
  }
  async exists(key: string) { return this.uploaded.has(key) || (await this.get(key)) !== null; }
  async delete() { /* لا حذف في الاستيراد */ }
  readonly uploaded = new Set<string>();
}
const files = new R2Rest();
const origPut = files.put.bind(files);
files.put = async (k, b, c) => { await origPut(k, b, c); files.uploaded.add(k); };

const owner = need('OWNER_UID');
export const s: Services = {
  db: new FirestoreDb(sa.project_id, token),
  identity: new IdentityToolkit(sa.project_id, need('FIREBASE_API_KEY'), token),
  files, pusher: new MemoryPusher(), backupStore: new MemoryBlobs(), backupKey: '', defer: () => undefined,
  verifyToken: async () => ({ sub: owner, auth_time: Math.floor(Date.now() / 1000), iat: 0, exp: 0 }),
  customToken: (uid, c) => customToken(sa, uid, c),
  loginLimiter: new RateLimiter(new MemoryCounter(), 5, 900, 'login'), ipLimiter: new RateLimiter(new MemoryCounter(), 1000, 900, 'ip'),
  now: () => Date.now(), id: () => crypto.randomUUID().replace(/-/g, ''),
};
const app = createApp(ALL_ROUTES);
export const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}, raw?: ArrayBuffer) => {
  const headers: Record<string, string> = { authorization: 'Bearer import', 'x-device': 'import', ...extra };
  if (!raw) headers['content-type'] = 'application/json';
  const res = await app(new Request(`https://import.local${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), s, { allowedOrigins: [] });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

