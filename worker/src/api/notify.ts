import type { Data, Db, Tx } from '../infra/db';
import type { Pusher } from '../infra/fcm';
import { loadRoles, requireUser, type Ctx, type Services } from './context';
import { fail, json, readJson, type Router } from './http';

export interface Notice {
  type: string; // order.new ، order.status ، invoice.issued ...
  title: string;
  body: string;
  ref: { kind: string; id: string };
  sound?: boolean;
}

/** المستخدمون النشطون الذين يملكون صلاحية معينة عبر أدوارهم (للإشعارات الإدارية). */
export async function usersWithPermission(db: Db, permission: string): Promise<string[]> {
  const defs = await loadRoles(db);
  const roles = [...defs.values()].filter((r) => r.permissions.includes('*') || r.permissions.includes(permission)).map((r) => r.id).slice(0, 30);
  if (!roles.length) return [];
  const rows = await db.query({ collection: 'users', where: [['roles', 'array-contains-any', roles], ['status', '==', 'active']], limit: 300 });
  return rows.map((r) => r.id);
}

/**
 * يكتب الإشعارات داخل نفس المعاملة: صندوق لكل مستخدم + مهمة إرسال واحدة بمفتاح منع تكرار.
 * قاعدة البيانات هي المرجع؛ الإرسال لا يُعدّ دليل استلام (SRS 6.3).
 */
export function queueNotice(tx: Pick<Tx, 'write'>, s: Services, userIds: string[], n: Notice, dedupeKey: string): string | null {
  const targets = [...new Set(userIds)].filter(Boolean);
  if (!targets.length) return null;
  const now = s.now();
  for (const uid of targets) {
    tx.write({ kind: 'set', path: `notifications/${dedupeKey}_${uid}`.replace(/[^A-Za-z0-9_/.-]/g, '_'), data: { userId: uid, type: n.type, title: n.title, body: n.body, ref: n.ref, readAt: null, createdAt: now } });
  }
  const jobId = dedupeKey.replace(/[^A-Za-z0-9_.-]/g, '_');
  tx.write({ kind: 'set', path: `notificationJobs/${jobId}`, data: { targets, payload: { ...n }, status: 'queued', attempts: 0, nextAttemptAt: now, createdAt: now, delivered: [], failed: [] } });
  return jobId;
}

const MAX_ATTEMPTS = 6;

/** يرسل مهمة واحدة لكل أجهزة المستهدفين، يحذف الرموز التالفة، ويجدول إعادة المحاولة بتراجع أسّي. */
export async function deliverJob(s: Services, pusher: Pusher, jobId: string): Promise<void> {
  const job = await s.db.get(`notificationJobs/${jobId}`);
  if (!job || job.data.status === 'sent' || job.data.status === 'dead') return;
  const payload = job.data.payload as Data & { ref: { kind: string; id: string } };
  const done = new Set((job.data.delivered as string[]) ?? []);
  const retry: string[] = [];
  for (const uid of job.data.targets as string[]) {
    if (done.has(uid)) continue;
    const devices = await s.db.query({ collection: `users/${uid}/devices` });
    if (!devices.length) {
      done.add(uid); // لا أجهزة: الإشعار محفوظ في الصندوق الداخلي
      continue;
    }
    let anyOk = false;
    let anyRetry = false;
    for (const d of devices) {
      const r = await pusher.send(String(d.data.token), {
        title: String(payload.title), body: String(payload.body), sound: payload.sound === true,
        data: { type: String(payload.type), refKind: payload.ref.kind, refId: payload.ref.id },
      });
      if (r === 'ok') anyOk = true;
      else if (r === 'invalid') await s.db.commit([{ kind: 'delete', path: d.path }]);
      else anyRetry = true;
    }
    if (anyOk || !anyRetry) done.add(uid);
    else retry.push(uid);
  }
  const attempts = ((job.data.attempts as number) ?? 0) + 1;
  const status = retry.length === 0 ? 'sent' : attempts >= MAX_ATTEMPTS ? 'dead' : 'retry';
  await s.db.commit([{ kind: 'update', path: job.path, data: { status, attempts, delivered: [...done], failed: retry, nextAttemptAt: s.now() + 60_000 * 2 ** attempts, lastAttemptAt: s.now() } }]);
}

/** معالجة المهام المستحقة (يستدعيها Cron كل دقيقة). */
export async function processDueJobs(s: Services, pusher: Pusher, limit = 50): Promise<number> {
  const due = [
    ...(await s.db.query({ collection: 'notificationJobs', where: [['status', '==', 'queued']], limit })),
    ...(await s.db.query({ collection: 'notificationJobs', where: [['status', '==', 'retry'], ['nextAttemptAt', '<=', s.now()]], limit })),
  ];
  for (const j of due) await deliverJob(s, pusher, j.id);
  return due.length;
}

// ===== صندوق الإشعارات والأجهزة =====
async function inbox(ctx: Ctx) {
  const u = requireUser(ctx);
  const rows = await ctx.s.db.query({ collection: 'notifications', where: [['userId', '==', u.uid]], orderBy: [['createdAt', 'desc']], limit: 100 });
  return json({ notifications: rows.map((r) => ({ id: r.id, ...r.data })), unread: rows.filter((r) => !r.data.readAt).length });
}

async function markRead(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const n = await ctx.s.db.get(`notifications/${p.id}`);
  if (!n || n.data.userId !== u.uid) throw fail('NOT_FOUND', 'الإشعار غير موجود');
  await ctx.s.db.commit([{ kind: 'update', path: n.path, data: { readAt: ctx.s.now() } }]);
  return json({ ok: true });
}

async function markAllRead(ctx: Ctx) {
  const u = requireUser(ctx);
  const rows = await ctx.s.db.query({ collection: 'notifications', where: [['userId', '==', u.uid], ['readAt', '==', null]], limit: 400 });
  await ctx.s.db.commit(rows.map((r) => ({ kind: 'update' as const, path: r.path, data: { readAt: ctx.s.now() } })));
  return json({ ok: true, count: rows.length });
}

async function registerDevice(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await readJson(ctx.req, 8192);
  const id = String(b.deviceId ?? '');
  const token = String(b.token ?? '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id) || token.length < 20 || token.length > 4096) throw fail('VALIDATION', 'بيانات الجهاز غير صالحة');
  const platform = ['android', 'web', 'ios'].includes(String(b.platform)) ? String(b.platform) : 'web';
  // الرمز يتبع جهازاً واحداً لمستخدم واحد: الجهاز المشترك ينتقل لآخر من سجّل الدخول
  await ctx.s.db.commit([{ kind: 'set', path: `users/${u.uid}/devices/${id}`, data: { token, platform, appVersion: String(b.appVersion ?? '').slice(0, 20), lastSeenAt: ctx.s.now() } }]);
  return json({ ok: true });
}

async function removeDevice(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  await ctx.s.db.commit([{ kind: 'delete', path: `users/${u.uid}/devices/${p.id}` }]);
  return json({ ok: true });
}

export function notifyRoutes(r: Router<Ctx>) {
  r.on('GET', '/notifications', inbox).on('POST', '/notifications/read-all', markAllRead).on('POST', '/notifications/:id/read', markRead)
    .on('POST', '/devices', registerDevice).on('DELETE', '/devices/:id', removeDevice);
}
