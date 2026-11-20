import { addWorkingMinutes } from '../domain/sla';
import type { Data, Doc } from '../infra/db';
import { inspectImage } from '../infra/files';
import { getSettings } from './admin/settings';
import { auditWrite, requirePerm, requireUser, type Ctx, type Services } from './context';
import { cleanText, fail, json, readJson, type Router } from './http';
import { deliverJob, queueNotice, usersWithPermission } from './notify';
import { canReadOrder } from './orders';

const ASSIGNABLE = ['confirmed', 'preparing', 'ready_for_pickup', 'delivery_failed', 'out_for_delivery'];
const ACTIVE = ['new', 'under_review', 'awaiting_shop_approval', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'on_the_way', 'delivery_failed'];
const AGENT_VISIBLE = ['ready_for_pickup', 'out_for_delivery', 'on_the_way'];

async function order(ctx: Ctx, id: string): Promise<Doc> {
  const d = await ctx.s.db.get(`orders/${id}`);
  if (!d || !canReadOrder(requireUser(ctx), d.data)) throw fail('NOT_FOUND', 'الطلب غير موجود');
  return d;
}

/** إسناد الطلب لمندوب أو تغييره قبل أن يبدأ الطريق (SRS 8.2). */
async function assignAgent(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'delivery.assign');
  const o = await order(ctx, p.id!);
  const b = await readJson(ctx.req);
  const agentId = String(b.agentId ?? '');
  if (!ASSIGNABLE.includes(String(o.data.status))) throw fail('CONFLICT', 'لا يمكن تغيير المندوب في هذه المرحلة');
  const agent = await ctx.s.db.get(`users/${agentId}`);
  if (!agent || agent.data.status !== 'active' || !((agent.data.roles as string[]) ?? []).includes('delivery_agent')) throw fail('VALIDATION', 'المندوب غير موجود أو غير نشط');
  const seq = b.deliveryOrder === undefined ? null : Number(b.deliveryOrder);
  if (seq !== null && (!Number.isInteger(seq) || seq < 1 || seq > 999)) throw fail('VALIDATION', 'ترتيب التوصيل غير صالح');
  const job = await ctx.s.db.runTransaction(async (tx) => {
    tx.write({ kind: 'update', path: o.path, data: { agentId, deliveryOrder: seq, updatedAt: ctx.s.now() } });
    tx.write(auditWrite(ctx, { action: 'delivery.assign', entity: { kind: 'order', id: o.id }, before: { agentId: o.data.agentId }, after: { agentId, deliveryOrder: seq } }));
    return queueNotice(tx, ctx.s, [agentId], { type: 'delivery.task', title: 'مهمة توصيل جديدة', body: `${o.data.number} — ${o.data.shopName}`, ref: { kind: 'order', id: o.id } }, `delivery.task.${o.id}.${agentId}`);
  });
  if (job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, job));
  return json({ ok: true });
}

async function sequence(ctx: Ctx) {
  requirePerm(ctx, 'delivery.assign');
  const b = await readJson(ctx.req);
  const ids = b.orderIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((x) => typeof x !== 'string')) throw fail('VALIDATION', 'قائمة الطلبات غير صالحة');
  const docs = await ctx.s.db.getMany((ids as string[]).map((id) => `orders/${id}`));
  if (docs.some((d) => !d || d.data.agentId !== b.agentId)) throw fail('VALIDATION', 'كل الطلبات يجب أن تكون مسندة لنفس المندوب');
  await ctx.s.db.commit(docs.map((d, i) => ({ kind: 'update' as const, path: d!.path, data: { deliveryOrder: i + 1 } })));
  return json({ ok: true });
}

/** لوحة التوصيل: الطلبات النشطة حسب المنطقة، المتأخرة، وحمل كل مندوب. */
async function board(ctx: Ctx) {
  requirePerm(ctx, 'delivery.view');
  const rows = await ctx.s.db.query({ collection: 'orders', where: [['status', 'in', ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'on_the_way', 'delivery_failed']]], orderBy: [['createdAt', 'asc']], limit: 500 });
  const regions: Record<string, unknown[]> = {};
  const load: Record<string, number> = {};
  for (const r of rows) {
    const o = r.data;
    const region = String((o.address as Data)?.region ?? 'غير محدد');
    (regions[region] ??= []).push({ id: r.id, number: o.number, shopName: o.shopName, status: o.status, agentId: o.agentId, deliveryOrder: o.deliveryOrder, overdue: (o.sla as Data)?.overdue === true, dueAt: (o.sla as Data)?.dueAt });
    if (o.agentId) load[String(o.agentId)] = (load[String(o.agentId)] ?? 0) + 1;
  }
  const agents = (await ctx.s.db.query({ collection: 'users', where: [['roles', 'array-contains', 'delivery_agent'], ['status', '==', 'active']], limit: 200 }))
    .map((a) => ({ uid: a.id, displayName: a.data.displayName, phone: a.data.phone, vehicle: a.data.vehicle ?? null, activeTasks: load[a.id] ?? 0 }));
  return json({ regions, agents, overdue: rows.filter((r) => (r.data.sla as Data)?.overdue === true).length });
}

/** مهام المندوب: المسند إليه فقط، بالحد الأدنى من البيانات والمبلغ المطلوب تحصيله فقط (SRS 2.3-ز). */
async function agentTasks(ctx: Ctx) {
  const u = requirePerm(ctx, 'delivery.update');
  const rows = await ctx.s.db.query({ collection: 'orders', where: [['agentId', '==', u.uid], ['status', 'in', AGENT_VISIBLE]], limit: 100 });
  rows.sort((a, b) => ((a.data.deliveryOrder as number) ?? 999) - ((b.data.deliveryOrder as number) ?? 999));
  const invoices = await ctx.s.db.getMany(rows.map((r) => (r.data.invoiceId ? `invoices/${r.data.invoiceId}` : 'invoices/__none__')));
  return json({
    tasks: rows.map((r, i) => {
      const o = r.data;
      return {
        id: r.id, number: o.number, status: o.status, shopName: o.shopName, address: o.address, deliveryOrder: o.deliveryOrder,
        items: (o.items as Data[]).map((x) => ({ name: x.name, unitName: x.unitName, qtyMilli: x.qtyMilli })),
        paymentMethod: o.paymentMethod, toCollect: o.paymentMethod === 'cash' ? (invoices[i]?.data.remaining ?? 0) : 0, dueAt: (o.sla as Data)?.dueAt,
      };
    }),
  });
}

/** نقطة موقع أثناء المهمة فقط (on_the_way) — لا تتبع خارج المهمة (SRS 8.3). */
async function track(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'delivery.update');
  const o = await order(ctx, p.id!);
  if (o.data.agentId !== u.uid || o.data.status !== 'on_the_way') throw fail('TRACKING_NOT_ACTIVE', 'التتبع متاح أثناء مهمة التوصيل فقط');
  const b = await readJson(ctx.req, 2048);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail('VALIDATION', 'إحداثيات غير صالحة');
  const t = await ctx.s.db.get(`deliveryTracks/${o.id}`);
  if (!t || t.data.active !== true) throw fail('TRACKING_NOT_ACTIVE', 'التتبع متاح أثناء مهمة التوصيل فقط');
  const points = ((t.data.points as Data[]) ?? []);
  const last = points.at(-1);
  if (last && ctx.s.now() - (last.at as number) < 15_000) return json({ ok: true, skipped: true });
  const next = [...points, { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, acc: Number.isFinite(Number(b.acc)) ? Math.round(Number(b.acc)) : null, at: ctx.s.now() }].slice(-200);
  await ctx.s.db.commit([{ kind: 'update', path: t.path, data: { points: next, lastAt: ctx.s.now() } }]);
  return json({ ok: true });
}

async function getTrack(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'delivery.track.view');
  const t = await ctx.s.db.get(`deliveryTracks/${p.id}`);
  if (!t) throw fail('NOT_FOUND', 'لا يوجد تتبع لهذا الطلب');
  return json({ track: t.data });
}

/** صورة أو توقيع إثبات التسليم: ملفات خاصة لا تُعرض إلا لأصحاب العلاقة. */
async function uploadProof(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'delivery.update');
  const o = await order(ctx, p.id!);
  if (o.data.agentId !== u.uid || !['out_for_delivery', 'on_the_way'].includes(String(o.data.status))) throw fail('FORBIDDEN', 'الرفع للمندوب المسند أثناء التوصيل');
  const kind = ctx.url.searchParams.get('kind');
  if (kind !== 'photo' && kind !== 'signature') throw fail('VALIDATION', 'النوع photo أو signature');
  const buf = await ctx.req.arrayBuffer();
  if (buf.byteLength > 3_000_000) throw fail('PAYLOAD_TOO_LARGE', 'الملف أكبر من 3 ميغابايت');
  const b = new Uint8Array(buf);
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const img = jpeg ? { type: 'jpg' as const } : inspectImage(buf);
  if (!img) throw fail('IMAGE_TYPE', 'الصيغ المقبولة: JPEG أو PNG أو WebP');
  const key = `proofs/${o.id}/${kind}-${ctx.s.id()}.${img.type}`;
  await ctx.s.files.put(key, buf, img.type === 'jpg' ? 'image/jpeg' : `image/${img.type}`);
  return json({ key }, 201);
}

async function getProofFile(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const o = await order(ctx, p.id!);
  const proof = await ctx.s.db.get(`deliveryProofs/${o.id}`);
  const key = p.kind === 'photo' ? proof?.data.photoKey : p.kind === 'signature' ? proof?.data.signatureKey : null;
  if (!key || !String(key).startsWith(`proofs/${o.id}/`)) throw fail('NOT_FOUND', 'الملف غير موجود');
  if (!(u.permissions.has('delivery.view') || u.shopIds.includes(String(o.data.shopId)) || o.data.agentId === u.uid)) throw fail('NOT_FOUND', 'الملف غير موجود');
  const f = await ctx.s.files.get(String(key));
  if (!f) throw fail('NOT_FOUND', 'الملف غير موجود');
  return new Response(f.body, { headers: { 'content-type': f.contentType, 'cache-control': 'private, max-age=300' } });
}

/** تحديد موعد مؤكد يدوياً مع سبب (SRS 7.3): لم يعد تقديرياً. */
async function setDue(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  if (!u.permissions.has('orders.review') && !u.permissions.has('delivery.assign')) throw fail('FORBIDDEN', 'لا تملك تعديل موعد التوصيل');
  const o = await order(ctx, p.id!);
  const b = await readJson(ctx.req);
  const dueAt = Number(b.dueAt);
  if (!Number.isSafeInteger(dueAt) || dueAt <= ctx.s.now()) throw fail('VALIDATION', 'الموعد يجب أن يكون في المستقبل');
  const reason = cleanText(b.reason, 300, 'سبب تحديد الموعد');
  if (!ACTIVE.includes(String(o.data.status))) throw fail('CONFLICT', 'الطلب منتهٍ');
  const sla = { ...(o.data.sla as Data), dueAt, estimated: false, overdue: false, delayReason: reason };
  const shop = await ctx.s.db.get(`shops/${o.data.shopId}`);
  const job = await ctx.s.db.runTransaction(async (tx) => {
    tx.write({ kind: 'update', path: o.path, data: { sla, updatedAt: ctx.s.now() } });
    tx.write(auditWrite(ctx, { action: 'orders.due', entity: { kind: 'order', id: o.id }, before: { sla: o.data.sla }, after: { sla } }));
    return queueNotice(tx, ctx.s, [String(o.data.createdBy), String(shop?.data.ownerUid ?? '')], { type: 'order.due', title: 'تم تحديد موعد وصول طلبك', body: `${o.data.number}: ${reason}`, ref: { kind: 'order', id: o.id } }, `order.due.${o.id}.${dueAt}`);
  });
  if (job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, job));
  return json({ sla });
}

/** Cron كل 5 دقائق: وسم المتأخر، موعد تقديري جديد، تنبيه الإدارة والمحل (SRS 7.3). */
export async function markOverdue(s: Services): Promise<number> {
  const now = s.now();
  const rows = await s.db.query({ collection: 'orders', where: [['sla.overdue', '==', false], ['sla.dueAt', '<', now]], limit: 200 });
  const late = rows.filter((r) => ACTIVE.includes(String(r.data.status)));
  if (!late.length) return 0;
  const ctx: Ctx = { req: new Request('https://cron.local/'), url: new URL('https://cron.local/'), s, requestId: s.id(), ip: 'cron', device: 'cron', workContext: null, user: null };
  const settings = await getSettings(ctx);
  const admins = await usersWithPermission(s.db, 'orders.view');
  const ws = { timezone: String(settings.timezone), workDays: settings.workDays as number[], orderIntakeStart: String(settings.orderIntakeStart), orderIntakeEnd: String(settings.orderIntakeEnd), slaWorkingHours: 2, holidays: (settings.holidays as string[]) ?? [] };
  for (const r of late) {
    const revised = addWorkingMinutes(now, 120, ws).dueAt;
    const shop = await s.db.get(`shops/${r.data.shopId}`);
    const jobs = await s.db.runTransaction(async (tx) => {
      tx.write({ kind: 'update', path: r.path, data: { 'sla': { ...(r.data.sla as Data), overdue: true, overdueAt: now, revisedDueAt: revised } } });
      tx.write(auditWrite(ctx, { action: 'orders.overdue', entity: { kind: 'order', id: r.id }, after: { revisedDueAt: revised } }, 'system'));
      return [
        queueNotice(tx, s, admins, { type: 'order.late', title: `طلب متأخر ${r.data.number}`, body: String(r.data.shopName ?? ''), ref: { kind: 'order', id: r.id } }, `order.late.admin.${r.id}`),
        queueNotice(tx, s, [String(r.data.createdBy), String(shop?.data.ownerUid ?? '')], { type: 'order.late', title: 'نعتذر، طلبك متأخر', body: `${r.data.number}: نعمل على إيصاله بأقرب وقت`, ref: { kind: 'order', id: r.id } }, `order.late.shop.${r.id}`),
      ];
    });
    for (const j of jobs) if (j) await deliverJob(s, s.pusher, j);
  }
  return late.length;
}

export function deliveryRoutes(r: Router<Ctx>) {
  r.on('POST', '/orders/:id/assign-agent', assignAgent).on('POST', '/delivery/sequence', sequence).on('GET', '/delivery/board', board)
    .on('GET', '/agent/tasks', agentTasks).on('POST', '/orders/:id/track', track).on('GET', '/orders/:id/track', getTrack)
    .on('POST', '/orders/:id/proof-upload', uploadProof).on('GET', '/orders/:id/proof/:kind', getProofFile).on('PATCH', '/orders/:id/due', setDue);
}
