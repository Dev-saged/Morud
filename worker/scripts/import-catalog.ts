// استيراد كتالوج مبدئي عبر كود الخادم الحقيقي (تحقق + تدقيق + منع تكرار) إلى الإنتاج.
// تشغيل: SERVICE_ACCOUNT=... FIREBASE_API_KEY=... CF_TOKEN=... CF_ACCOUNT=... OWNER_UID=... npx tsx scripts/import-catalog.ts ../catalog/seed.json ../catalog/images
import { createHash } from 'node:crypto';
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
const [seedPath, imagesDir] = process.argv.slice(2);
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
const s: Services = {
  db: new FirestoreDb(sa.project_id, token),
  identity: new IdentityToolkit(sa.project_id, need('FIREBASE_API_KEY'), token),
  files, pusher: new MemoryPusher(), backupStore: new MemoryBlobs(), backupKey: '', defer: () => undefined,
  verifyToken: async () => ({ sub: owner, auth_time: Math.floor(Date.now() / 1000), iat: 0, exp: 0 }),
  customToken: (uid, c) => customToken(sa, uid, c),
  loginLimiter: new RateLimiter(new MemoryCounter(), 5, 900, 'login'), ipLimiter: new RateLimiter(new MemoryCounter(), 1000, 900, 'ip'),
  now: () => Date.now(), id: () => crypto.randomUUID().replace(/-/g, ''),
};
const app = createApp(ALL_ROUTES);
const call = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}, raw?: ArrayBuffer) => {
  const headers: Record<string, string> = { authorization: 'Bearer import', 'x-device': 'import', ...extra };
  if (!raw) headers['content-type'] = 'application/json';
  const res = await app(new Request(`https://import.local${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), s, { allowedOrigins: [] });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
};

const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as { products: any[] };
let created = 0, skipped = 0, failed = 0;
for (const p of seed.products) {
  try {
    const png = readFileSync(`${imagesDir}/${p.sku}.png`);
    const up = await call('POST', '/admin/uploads/product-image', undefined, { 'content-type': 'image/png' }, png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer);
    if (up.status !== 201) throw new Error(`upload ${up.status} ${JSON.stringify(up.body)}`);
    const { icon, priceSource, ...fields } = p;
    const desc = [p.description, priceSource === 'unicef' ? 'السعر مرجعي من مسح أسعار UNICEF لأسواق غزة (أغسطس 2026)' : 'السعر تقديري — راجعه قبل النشر'].filter(Boolean).join(' · ');
    const r = await call('POST', '/admin/products', { ...fields, description: desc, visible: false, available: true, images: [{ key: up.body.key, thumb: up.body.key }] }, { 'idempotency-key': createHash('sha256').update(`mawred-seed-v1:${p.sku}`).digest('hex').slice(0, 32) });
    if (r.status === 201) created++;
    else if (r.status === 409) skipped++;
    else throw new Error(`product ${r.status} ${JSON.stringify(r.body)}`);
    process.stdout.write(r.status === 201 ? '.' : 's');
  } catch (e) {
    failed++;
    console.error(`\n${p.sku}: ${(e as Error).message}`);
  }
}
console.log(`\nأُنشئ ${created}، موجود مسبقاً ${skipped}، فشل ${failed}`);
