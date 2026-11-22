// تمرين استعادة حقيقي: تنزيل آخر نسخة من R2، التحقق من البصمة، فك التشفير، الاستعادة في قاعدة معزولة، ومقارنتها بالإنتاج.
// تشغيل: SERVICE_ACCOUNT=... CF_TOKEN=... CF_ACCOUNT=... BACKUP_KEY=... OWNER_UID=... FIREBASE_API_KEY=... npx tsx scripts/restore-drill.ts
import { createHash } from 'node:crypto';
import { s } from './prod-app';
import { restoreBackup } from '../src/api/backup';
import { MemoryDb } from '../src/infra/memory-db';

const log = (await s.db.query({ collection: 'backupLogs', orderBy: [['at', 'desc']], limit: 1 }))[0];
if (!log) throw new Error('لا توجد نسخ');
const key = String(log.data.key);
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/r2/buckets/mawred-backups/objects/${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${process.env.CF_TOKEN}` } });
if (!res.ok) throw new Error(`تنزيل ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
const sha = createHash('sha256').update(bytes).digest('hex');
console.log(`النسخة ${key}: ${bytes.length} بايت، البصمة ${sha === log.data.sha256 ? 'مطابقة' : 'غير مطابقة!'}`);
const t0 = Date.now();
const fresh = new MemoryDb();
const n = await restoreBackup(fresh, bytes, process.env.BACKUP_KEY!);
console.log(`استُعيد ${n} سجلاً في ${Date.now() - t0} مللي ثانية`);
const cols = ['users', 'shops', 'products', 'categories', 'units', 'orders', 'roles', 'settings', 'logins', 'ledger', 'invoices'];
let mismatch = 0;
for (const c of cols) {
  const prod = (await s.db.query({ collection: c, limit: 2000 })).length;
  const rest = (await fresh.query({ collection: c, limit: 2000 })).length;
  if (prod !== rest) mismatch++;
  console.log(`${c.padEnd(11)} إنتاج ${String(prod).padStart(4)} | مستعاد ${String(rest).padStart(4)} ${prod === rest ? '✓' : '≠'}`);
}
// عيّنة عميقة: منتج كامل بصوره ووحداته وأسعاره
const p = (await s.db.query({ collection: 'products', limit: 1 }))[0]!;
const r = await fresh.get(p.path);
console.log(`عيّنة ${p.data.sku}: ${JSON.stringify(r?.data.units) === JSON.stringify(p.data.units) && JSON.stringify(r?.data.images) === JSON.stringify(p.data.images) ? 'مطابقة تماماً' : 'مختلفة'}`);
console.log(mismatch ? `فروقات: ${mismatch} (قد تكون بيانات أُضيفت بعد النسخة)` : 'الاستعادة مطابقة للإنتاج');
