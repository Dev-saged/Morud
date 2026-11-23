// استعادة طوارئ إلى الإنتاج من نسخة مشفرة في R2.
// افتراضياً تجربة فقط (تنزيل + تحقق البصمة + فك التشفير + عدّ) بلا أي كتابة.
// للتنفيذ الفعلي: RESTORE_CONFIRM=نعم — تُؤخذ أولاً نسخة أمان من الوضع الحالي ثم تُكتب السجلات.
// تشغيل: SERVICE_ACCOUNT=... CF_TOKEN=... CF_ACCOUNT=... BACKUP_KEY=... OWNER_UID=... FIREBASE_API_KEY=... [BACKUP=backups/xxx.mwb] npx tsx scripts/restore.ts
import { createHash } from 'node:crypto';
import { s } from './prod-app';
import { decodeBackup, dumpAll, encodeBackup, restoreBackup } from '../src/api/backup';

const R2 = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/r2/buckets/mawred-backups/objects/`;
const auth = { authorization: `Bearer ${process.env.CF_TOKEN}` };
const key64 = process.env.BACKUP_KEY ?? (console.error('BACKUP_KEY مطلوب'), process.exit(1));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const logs = await s.db.query({ collection: 'backupLogs', orderBy: [['at', 'desc']], limit: 60 });
const log = process.env.BACKUP ? logs.find((l) => l.data.key === process.env.BACKUP) : logs.find((l) => l.data.status === 'ok');
if (!log) throw new Error(process.env.BACKUP ? `النسخة ${process.env.BACKUP} غير موجودة في السجل` : 'لا توجد نسخ ناجحة');
const key = String(log.data.key);
const res = await fetch(R2 + encodeURIComponent(key), { headers: auth });
if (!res.ok) throw new Error(`تنزيل النسخة فشل: ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
if (sha(bytes) !== log.data.sha256) throw new Error('البصمة غير مطابقة: الملف تالف أو معدّل، أوقفت الاستعادة');
const docs = await decodeBackup(bytes, key64);
const byCol = new Map<string, number>();
for (const d of docs) byCol.set(d.path.split('/')[0]!, (byCol.get(d.path.split('/')[0]!) ?? 0) + 1);
console.log(`النسخة ${key} من ${new Date(Number(log.data.at)).toISOString()}: ${docs.length} سجلاً، البصمة مطابقة`);
console.log([...byCol].map(([c, n]) => `${c}=${n}`).join(' '));

if (process.env.RESTORE_CONFIRM !== 'نعم') {
  console.log('تجربة فقط: لم يُكتب شيء. للتنفيذ أعد التشغيل مع RESTORE_CONFIRM=نعم');
  process.exit(0);
}

// نسخة أمان من الوضع الحالي قبل أي كتابة (تبقى حتى لو فشلت الاستعادة)
const { lines, count } = await dumpAll(s.db);
const safety = await encodeBackup(lines, key64);
const safetyKey = `backups/pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.mwb`;
const up = await fetch(R2 + encodeURIComponent(safetyKey), { method: 'PUT', headers: auth, body: safety as unknown as BodyInit });
if (!up.ok) throw new Error(`تعذر حفظ نسخة الأمان (${up.status})، أوقفت الاستعادة`);
await s.db.commit([{ kind: 'create', path: `backupLogs/${s.id()}`, data: { at: s.now(), key: safetyKey, docs: count, bytes: safety.length, sha256: sha(safety), status: 'ok', reason: 'pre-restore' } }]);
console.log(`نسخة الأمان: ${safetyKey} (${count} سجلاً)`);

const t0 = Date.now();
const n = await restoreBackup(s.db, bytes, key64);
await s.db.commit([{ kind: 'create', path: `auditLogs/${s.id()}`, data: { actorId: process.env.OWNER_UID ?? 'system', roleContext: 'script.restore', action: 'backup.restore', entity: { kind: 'backup', id: key }, affectedUserId: null, before: null, after: { docs: n, safety: safetyKey }, ip: 'script', device: 'script', requestId: s.id(), result: 'ok', at: s.now() } }]);
console.log(`استُعيد ${n} سجلاً في ${Math.round((Date.now() - t0) / 1000)} ث. السجلات الأحدث من النسخة لم تُحذف.`);
console.log('بعدها: افتح أي حساب للتأكد، ثم شغّل npx tsx scripts/health.ts');
