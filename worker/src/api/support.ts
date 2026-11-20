import { auditWrite, requirePerm, requireUser, type Ctx } from './context';
import { cleanText, fail, json, readJson, type Router } from './http';
import { deliverJob, queueNotice, usersWithPermission } from './notify';

const TYPES = ['complaint', 'inquiry', 'problem', 'password_reset'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

/** الدعم والشكاوى (SRS 11.2-20 و6.1): تذكرة موثقة تصل للمخولين. */
async function create(ctx: Ctx) {
  const u = requirePerm(ctx, 'support.create');
  const b = await readJson(ctx.req);
  const type = String(b.type ?? 'inquiry');
  if (!TYPES.includes(type) || type === 'password_reset') throw fail('VALIDATION', 'نوع التذكرة غير صالح');
  const orderId = typeof b.orderId === 'string' ? b.orderId : null;
  const id = ctx.s.id();
  const data = { type, subject: cleanText(b.subject, 120, 'العنوان'), body: cleanText(b.body, 3000, 'التفاصيل'), orderId, by: u.uid, shopId: u.shopIds[0] ?? null, status: 'open', replies: [], createdAt: ctx.s.now() };
  const job = await ctx.s.db.runTransaction(async (tx) => {
    tx.write({ kind: 'create', path: `supportTickets/${id}`, data });
    tx.write(auditWrite(ctx, { action: 'support.create', entity: { kind: 'ticket', id }, after: { type, orderId } }));
    return queueNotice(tx, ctx.s, await usersWithPermission(ctx.s.db, 'support.manage'), { type: 'support.new', title: type === 'complaint' ? 'شكوى جديدة' : 'تذكرة دعم جديدة', body: data.subject, ref: { kind: 'ticket', id } }, `support.${id}`);
  });
  if (job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, job));
  return json({ id }, 201);
}

async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const all = u.permissions.has('support.manage');
  const status = ctx.url.searchParams.get('status');
  const where: Array<[string, '==', unknown]> = all ? [] : [['by', '==', u.uid]];
  if (status) where.push(['status', '==', status]);
  const rows = await ctx.s.db.query({ collection: 'supportTickets', where, orderBy: [['createdAt', 'desc']], limit: 200 });
  return json({ tickets: rows.map((r) => ({ id: r.id, ...r.data })) });
}

async function update(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'support.manage');
  const t = await ctx.s.db.get(`supportTickets/${p.id}`);
  if (!t) throw fail('NOT_FOUND', 'التذكرة غير موجودة');
  const b = await readJson(ctx.req);
  const patch: Record<string, unknown> = { updatedAt: ctx.s.now() };
  if (b.status !== undefined) {
    if (!STATUSES.includes(String(b.status))) throw fail('VALIDATION', 'الحالة غير صالحة');
    patch.status = b.status;
  }
  if (b.assignedTo !== undefined) patch.assignedTo = String(b.assignedTo);
  const reply = b.reply !== undefined ? cleanText(b.reply, 2000, 'الرد') : null;
  if (reply) patch.replies = [...((t.data.replies as unknown[]) ?? []), { by: u.uid, text: reply, at: ctx.s.now() }];
  const job = await ctx.s.db.runTransaction(async (tx) => {
    tx.write({ kind: 'update', path: t.path, data: patch });
    tx.write(auditWrite(ctx, { action: 'support.update', entity: { kind: 'ticket', id: t.id }, before: { status: t.data.status }, after: { status: patch.status ?? t.data.status, reply: !!reply } }));
    return reply ? queueNotice(tx, ctx.s, [String(t.data.by)], { type: 'support.reply', title: 'رد على تذكرتك', body: reply.slice(0, 120), ref: { kind: 'ticket', id: t.id } }, `support.reply.${t.id}.${ctx.s.now()}`) : null;
  });
  if (job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, job));
  return json({ ok: true });
}

export function supportRoutes(r: Router<Ctx>) {
  r.on('POST', '/support', create).on('GET', '/support', list).on('PATCH', '/admin/support/:id', update);
}
