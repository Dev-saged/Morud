import type { Data, Db, Write } from '../infra/db';
import { loadSettings } from './admin/settings';
import { requirePerm, type Ctx, type Services } from './context';
import { fail, json, type Router } from './http';
import { deliverJob, queueNotice, usersWithPermission } from './notify';

// كل المجموعات (الجذرية والفرعية) التي تُنسخ؛ أي مجموعة جديدة تُضاف هنا وفي اختبار التطابق
export const COLLECTIONS = [
  'users', 'devices', 'logins', 'roles', 'system', 'settings', 'shops', 'members', 'private', 'categories', 'units', 'products', 'skus',
  'promotions', 'orders', 'history', 'changes', 'internal', 'drafts', 'invoices', 'adjustments', 'ledger', 'payments', 'counters',
  'deliveryTracks', 'deliveryProofs', 'notifications', 'notificationJobs', 'auditLogs', 'supportTickets', 'backupLogs',
];

const MAGIC = new TextEncoder().encode('MWB1');

function replacer(_k: string, v: unknown) {
  return v instanceof Date ? { __date: v.toISOString() } : v;
}
function reviver(_k: string, v: unknown) {
  return v && typeof v === 'object' && '__date' in (v as Data) ? new Date((v as { __date: string }).__date) : v;
}

async function aesKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('BACKUP_KEY يجب أن يكون 32 بايت بصيغة base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeBackup(lines: string, keyB64: string): Promise<Uint8Array> {
  const gz = await pipe(new TextEncoder().encode(lines), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), gz as BufferSource));
  const out = new Uint8Array(MAGIC.length + iv.length + ct.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(ct, MAGIC.length + iv.length);
  return out;
}

export async function decodeBackup(bytes: Uint8Array, keyB64: string): Promise<Array<{ path: string; data: Data }>> {
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'MWB1') throw new Error('ملف نسخة غير صالح');
  const iv = bytes.slice(4, 16);
  const gz = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), bytes.slice(16) as BufferSource));
  const text = new TextDecoder().decode(await pipe(gz, new DecompressionStream('gzip')));
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l, reviver) as { path: string; data: Data });
}

async function dumpAll(db: Db): Promise<{ lines: string; count: number }> {
  const parts: string[] = [];
  let count = 0;
  for (const c of COLLECTIONS) {
    let after: string | null = null;
    for (;;) {
      const page = await db.dump(c, after, 500);
      for (const d of page) {
        parts.push(JSON.stringify({ path: d.path, data: d.data }, replacer));
        count++;
      }
      if (page.length < 500) break;
      after = page[page.length - 1]!.path;
    }
  }
  return { lines: parts.join('\n'), count };
}

async function sha256(b: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** نسخة يومية مشفرة خارج قاعدة البيانات + سجل + تنظيف حسب مدة الاحتفاظ + تنبيه عند الفشل (SRS 18). */
export async function runBackup(s: Services): Promise<{ ok: boolean; key?: string; docs?: number; error?: string }> {
  const id = s.id();
  const day = new Date(s.now()).toISOString().slice(0, 10);
  const key = `backups/${day}-${id.slice(0, 8)}.mwb`;
  try {
    const { lines, count } = await dumpAll(s.db);
    const bytes = await encodeBackup(lines, s.backupKey);
    await s.backupStore.put(key, bytes);
    await s.db.commit([{ kind: 'create', path: `backupLogs/${id}`, data: { at: s.now(), key, docs: count, bytes: bytes.length, sha256: await sha256(bytes), status: 'ok' } }]);
    const settings = await loadSettings(s.db);
    const keepMs = ((settings.backupRetentionDays as number) ?? 30) * 86_400_000;
    for (const o of await s.backupStore.list('backups/')) if (s.now() - o.uploaded > keepMs) await s.backupStore.delete(o.key);
    return { ok: true, key, docs: count };
  } catch (e) {
    const error = String(e).slice(0, 300);
    const job = await s.db.runTransaction(async (tx) => {
      tx.write({ kind: 'create', path: `backupLogs/${id}`, data: { at: s.now(), key, status: 'failed', error } });
      return queueNotice(tx, s, await usersWithPermission(s.db, 'backups.manage'), { type: 'backup.failed', title: 'فشل النسخ الاحتياطي اليومي', body: error, ref: { kind: 'backup', id } }, `backup.failed.${id}`);
    });
    if (job) await deliverJob(s, s.pusher, job);
    return { ok: false, error };
  }
}

/** استعادة نسخة إلى قاعدة بيانات (فارغة أو staging) على دفعات. */
export async function restoreBackup(db: Db, bytes: Uint8Array, keyB64: string): Promise<number> {
  const docs = await decodeBackup(bytes, keyB64);
  for (let i = 0; i < docs.length; i += 400) {
    await db.commit(docs.slice(i, i + 400).map((d): Write => ({ kind: 'set', path: d.path, data: d.data })));
  }
  return docs.length;
}

async function list(ctx: Ctx) {
  requirePerm(ctx, 'backups.manage');
  const rows = await ctx.s.db.query({ collection: 'backupLogs', orderBy: [['at', 'desc']], limit: 60 });
  return json({ backups: rows.map((r) => ({ id: r.id, ...r.data })) });
}

async function runNow(ctx: Ctx) {
  requirePerm(ctx, 'backups.manage');
  const r = await runBackup(ctx.s);
  if (!r.ok) throw fail('BACKUP_FAILED', 'فشل النسخ الاحتياطي', { error: r.error }, 500);
  return json(r, 201);
}

export function backupRoutes(r: Router<Ctx>) {
  r.on('GET', '/admin/backups', list).on('POST', '/admin/backups/run', runNow);
}
