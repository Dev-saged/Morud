import type { Product } from '../domain/catalog';
import { availableTransitions, checkTransition, type Actor } from '../domain/fsm';
import { creditCheck } from '../domain/ledger';
import { detectPriceChange, priceCart, type CartItem, type PricedCart } from '../domain/pricing';
import type { Promotion } from '../domain/promotions';
import { computeSla, type WorkSettings } from '../domain/sla';
import type { Data, Doc, Tx } from '../infra/db';
import { getSettings } from './admin/settings';
import { auditWrite, idempotent, requirePerm, requireUser, type AuthUser, type Ctx } from './context';
import { issueInvoice, nextNumber, postPayment, returnCredit, voidInvoice, type ReturnLine } from './finance-core';
import { cleanText, fail, json, readJson, type Router } from './http';
import { queueNotice, usersWithPermission, deliverJob } from './notify';

const SHOP_MSG: Record<string, string> = {
  under_review: 'طلبك قيد المراجعة', awaiting_shop_approval: 'هناك تعديل على طلبك يحتاج موافقتك', confirmed: 'تم تأكيد طلبك وإصدار فاتورته',
  preparing: 'طلبك قيد التجهيز', ready_for_pickup: 'طلبك جاهز للتسليم للمندوب', out_for_delivery: 'خرج طلبك للتوصيل', on_the_way: 'المندوب في الطريق إليك',
  delivered: 'تم تسليم طلبك', cancelled: 'تم إلغاء طلبك', rejected: 'تم رفض طلبك', delivery_failed: 'تعذّر تسليم طلبك', returned: 'تم تسجيل مرتجع على طلبك',
};
const ADMIN_EVENTS = new Set(['cancelled', 'delivery_failed', 'returned', 'confirmed_by_shop', 'declined_by_shop']);

function parseItems(v: unknown): CartItem[] {
  if (!Array.isArray(v)) throw fail('VALIDATION', 'الأصناف مطلوبة');
  return v.map((x: Data) => {
    if (!x || typeof x.productId !== 'string' || typeof x.unitId !== 'string' || !Number.isSafeInteger(x.qtyMilli)) throw fail('VALIDATION', 'صنف غير صالح في السلة');
    return { productId: x.productId, unitId: x.unitId, qtyMilli: x.qtyMilli as number, ...(x.note ? { note: cleanText(x.note, 300, 'ملاحظة الصنف', false) } : {}) };
  });
}

async function catalogFor(ctx: Ctx, items: CartItem[], tx?: Tx) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const docs = tx ? await Promise.all(ids.map((id) => tx.get(`products/${id}`))) : await ctx.s.db.getMany(ids.map((id) => `products/${id}`));
  const products = new Map<string, Product>();
  for (const d of docs) if (d) products.set(d.id, { id: d.id, ...(d.data as Omit<Product, 'id'>) });
  const units = await ctx.s.db.query({ collection: 'units' });
  const unitNames = new Map(units.map((u) => [u.id, String(u.data.name)]));
  const promos = (await ctx.s.db.query({ collection: 'promotions', where: [['active', '==', true]] })).map((d) => ({ id: d.id, ...(d.data as Omit<Promotion, 'id'>) }));
  return { products, unitNames, promos };
}

async function price(ctx: Ctx, items: CartItem[], tx?: Tx): Promise<PricedCart> {
  const { products, unitNames, promos } = await catalogFor(ctx, items, tx);
  const r = priceCart(items, products, unitNames, promos, ctx.s.now());
  if (!r.ok) throw fail(r.code, r.message, r.details);
  return r.value;
}

function workSettings(s: Data): WorkSettings {
  return { timezone: String(s.timezone), workDays: s.workDays as number[], orderIntakeStart: String(s.orderIntakeStart), orderIntakeEnd: String(s.orderIntakeEnd), slaWorkingHours: s.slaWorkingHours as number, holidays: (s.holidays as string[]) ?? [], closures: (s.closures as WorkSettings['closures']) ?? [] };
}

function shopRecipients(order: Data, shop: Data | undefined): string[] {
  return [String(order.createdBy), ...(shop?.ownerUid ? [String(shop.ownerUid)] : [])];
}

/** تسعير مسبق للسلة (للعرض قبل الإرسال) — نفس منطق الخادم تماماً. */
async function quote(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!u.permissions.has('shop.orders.draft') && !u.permissions.has('shop.orders.submit')) throw fail('FORBIDDEN', 'لا تملك إعداد الطلبات');
  const b = await readJson(ctx.req);
  return json({ cart: await price(ctx, parseItems(b.items)) });
}

/** إرسال الطلب (SRS 4.5): المحل من صلاحيات المستخدم، الأسعار من الخادم، رقم فريد، ومنع التكرار. */
async function submit(ctx: Ctx) {
  const u = requirePerm(ctx, 'shop.orders.submit');
  const b = await readJson(ctx.req);
  const shopId = String(b.shopId ?? u.shopIds[0] ?? '');
  if (!u.shopIds.includes(shopId)) throw fail('FORBIDDEN', 'لا يمكنك الطلب لمحل آخر');
  const items = parseItems(b.items);
  const method = String(b.paymentMethod ?? 'cash');
  const notes = cleanText(b.notes, 1000, 'الملاحظات', false);
  const seenTotal = b.seenTotal === undefined ? undefined : Number(b.seenTotal);
  const draftId = typeof b.draftId === 'string' ? b.draftId : null;
  const settings = await getSettings(ctx);
  const { value, replayed } = await idempotent(ctx, 'orders.submit', async (tx) => {
    const shop = await tx.get(`shops/${shopId}`);
    if (!shop) throw fail('NOT_FOUND', 'المحل غير موجود');
    if (shop.data.status !== 'active') throw fail('SHOP_SUSPENDED', 'حساب المحل موقوف، تواصل مع الإدارة');
    if (!((shop.data.paymentTerms as string[]) ?? ['cash']).includes(method)) throw fail('PAYMENT_METHOD_NOT_ALLOWED', 'طريقة الدفع غير مسموحة لهذا المحل');
    const priced = await price(ctx, items, tx);
    const changed = detectPriceChange(seenTotal, priced);
    if (!changed.ok) throw fail(changed.code, changed.message, changed.details);
    const credit = (shop.data.credit as { enabled: boolean; limit: number }) ?? { enabled: false, limit: 0 };
    const cc = creditCheck({ method, enabled: credit.enabled, limit: credit.limit, balance: (shop.data.balance as number) ?? 0, orderTotal: priced.total, blocksDeferred: settings.creditBlocksDeferredOrders !== false, warnPercent: (settings.creditWarnPercent as number) ?? 80 });
    if (method === 'credit' && !credit.enabled) throw fail('CREDIT_NOT_ENABLED', 'الدفع الآجل غير مفعّل لهذا المحل');
    if (cc.decision === 'block') throw fail('CREDIT_LIMIT', 'الطلب الآجل يتجاوز الحد الائتماني؛ يمكنك الطلب نقداً', { available: cc.available });
    const id = ctx.s.id();
    const number = await nextNumber(tx, ctx, 'O');
    const sla = computeSla(ctx.s.now(), workSettings(settings));
    const data: Data = {
      number, shopId, shopName: shop.data.name, address: { text: shop.data.address, city: shop.data.city, region: shop.data.region, geo: shop.data.geo ?? null, phone: shop.data.phone },
      createdBy: u.uid, status: 'new', items: priced.lines, totals: { subtotal: priced.subtotal, discount: priced.discount, total: priced.total },
      promotionsApplied: [...new Set(priced.lines.map((l) => l.promotionId).filter(Boolean))], paymentMethod: method, notes,
      sla: { ...sla, overdue: false }, assignedTo: null, agentId: null, deliveryOrder: null, invoiceId: null, creditWarning: cc.decision === 'warn',
      createdAt: ctx.s.now(), updatedAt: ctx.s.now(), version: 1,
    };
    tx.write({ kind: 'create', path: `orders/${id}`, data });
    tx.write({ kind: 'create', path: `orders/${id}/history/${ctx.s.id()}`, data: { from: null, to: 'new', by: u.uid, roleContext: ctx.workContext, at: ctx.s.now() } });
    for (const pid of data.promotionsApplied as string[]) tx.write({ kind: 'increment', path: `promotions/${pid}`, field: 'usedCount', by: 1 });
    if (draftId) tx.write({ kind: 'delete', path: `drafts/${draftId}` });
    tx.write(auditWrite(ctx, { action: 'orders.submit', entity: { kind: 'order', id }, after: { number, total: priced.total, method } }));
    const admins = await usersWithPermission(ctx.s.db, 'orders.view');
    const j1 = queueNotice(tx, ctx.s, admins, { type: 'order.new', title: `طلب جديد ${number}`, body: `${shop.data.name} — ${priced.lines.length} صنف`, ref: { kind: 'order', id }, sound: settings.newOrderSound !== false }, `order.new.${id}`);
    const j2 = queueNotice(tx, ctx.s, [u.uid], { type: 'order.status', title: 'تم استلام طلبك', body: `رقم الطلب ${number}`, ref: { kind: 'order', id } }, `order.received.${id}`);
    return { id, number, status: 'new', totals: data.totals, sla: data.sla, creditWarning: data.creditWarning, jobs: [j1, j2].filter(Boolean) as string[] };
  });
  if (!replayed) for (const j of value.jobs) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, j));
  const { jobs: _jobs, ...out } = value;
  return json({ order: out, replayed }, replayed ? 200 : 201);
}

function actorFor(u: AuthUser, order: Data, to: string, from: string): Actor | null {
  const kinds: Actor[] = [];
  if (u.kinds.has('staff')) kinds.push('staff');
  if (u.kinds.has('shop') && u.shopIds.includes(String(order.shopId))) kinds.push('shop');
  if (u.kinds.has('agent') && order.agentId === u.uid) kinds.push('agent');
  for (const k of kinds) if (availableTransitions(from, k, u.permissions).some((t) => t.to === to)) return k;
  return kinds[0] ?? null;
}

export function canReadOrder(u: AuthUser, o: Data): boolean {
  if (u.kinds.has('staff') && u.permissions.has('orders.view')) return true;
  if (u.shopIds.includes(String(o.shopId)) && (u.permissions.has('shop.orders.view_all') || o.createdBy === u.uid)) return true;
  return u.kinds.has('agent') && o.agentId === u.uid;
}

async function loadOrder(ctx: Ctx, id: string, tx?: Tx): Promise<Doc> {
  const d = tx ? await tx.get(`orders/${id}`) : await ctx.s.db.get(`orders/${id}`);
  if (!d) throw fail('NOT_FOUND', 'الطلب غير موجود');
  if (!canReadOrder(requireUser(ctx), d.data)) throw fail('NOT_FOUND', 'الطلب غير موجود');
  return d;
}

/** انتقال حالة الطلب: آلة الحالات + الشروط من البيانات الفعلية + الآثار المالية في نفس المعاملة. */
async function transition(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const b = await readJson(ctx.req);
  const to = String(b.to ?? '');
  const reason = typeof b.reason === 'string' ? cleanText(b.reason, 500, 'السبب', false) : '';
  const settings = await getSettings(ctx);
  const { value } = await idempotent(ctx, `orders.transition.${p.id}`, async (tx) => {
    const order = await loadOrder(ctx, p.id!, tx);
    const o = order.data;
    const from = String(o.status);
    const actor = actorFor(u, o, to, from);
    if (!actor) throw fail('FORBIDDEN', 'لا يمكنك التصرف في هذا الطلب');
    if (actor === 'shop' && to === 'cancelled' && !((settings.shopCancelStates as string[]) ?? []).includes(from)) throw fail('CANCEL_NOT_ALLOWED', 'لا يمكن إلغاء الطلب في هذه المرحلة، تواصل مع الإدارة');
    const pendingChange = (await tx.query({ collection: `orders/${order.id}/changes`, where: [['status', '==', 'pending']], limit: 1 }))[0];
    const shop = await tx.get(`shops/${o.shopId}`);
    let itemsAvailable = true;
    if (to === 'confirmed') {
      const items = (pendingChange && b.approve !== false ? (pendingChange.data.after as Data).lines : o.items) as Array<{ productId: string }>;
      const docs = await Promise.all([...new Set(items.map((i) => i.productId))].map((id) => tx.get(`products/${id}`)));
      itemsAvailable = docs.every((d) => d && d.data.available === true && d.data.visible === true && !d.data.archived);
    }
    const credit = (shop?.data.credit as { enabled: boolean; limit: number }) ?? { enabled: false, limit: 0 };
    const total = ((pendingChange?.data.after as Data)?.total as number) ?? (o.totals as Data).total as number;
    const cc = creditCheck({ method: String(o.paymentMethod), enabled: credit.enabled, limit: credit.limit, balance: (shop?.data.balance as number) ?? 0, orderTotal: total, blocksDeferred: settings.creditBlocksDeferredOrders !== false, warnPercent: 80 });
    const invoice = o.invoiceId ? await tx.get(`invoices/${o.invoiceId}`) : null;
    const proof = b.proof as Data | undefined;
    const guards = {
      items_available: itemsAvailable, credit_limit_ok: cc.decision !== 'block', agent_assigned: !!o.agentId, assigned_to_actor: o.agentId === u.uid,
      proof_present: !!proof && typeof proof.receiverName === 'string' && proof.receiverName.trim().length >= 2,
      invoice_settled: !!invoice && (invoice.data.remaining as number) === 0, change_request_pending: !!pendingChange,
    };
    // الموافقة والرفض على التعديل يمرّان عبر نفس الانتقال: approve=false يعني رفض المحل
    const r = checkTransition({ from, to, actor, permissions: u.permissions, reason, guards });
    if (!r.ok) throw fail(r.code === 'FORBIDDEN' ? 'FORBIDDEN' : r.code, r.message, r.details);
    const patch: Data = { status: to, updatedAt: ctx.s.now(), version: ((o.version as number) ?? 1) + 1 };
    const effects = r.value.effects ?? [];
    let invoiceId = o.invoiceId as string | null;
    if (effects.includes('apply_change_request') && pendingChange) {
      const after = pendingChange.data.after as Data;
      patch.items = after.lines;
      patch.totals = { subtotal: after.subtotal, discount: after.discount, total: after.total };
      tx.write({ kind: 'update', path: pendingChange.path, data: { status: 'approved', decidedBy: u.uid, decidedAt: ctx.s.now() } });
      if (invoiceId) {
        await voidInvoice(tx, ctx, invoiceId, 'keep_credit', `استبدال الفاتورة بعد تعديل الطلب: ${pendingChange.data.reason}`);
        invoiceId = null;
      }
    }
    if (effects.includes('decline_change_request') && pendingChange) {
      tx.write({ kind: 'update', path: pendingChange.path, data: { status: 'declined', decidedBy: u.uid, decidedAt: ctx.s.now(), declineReason: reason } });
    }
    if (effects.includes('issue_invoice') && !invoiceId) {
      invoiceId = await issueInvoice(tx, ctx, { ...order, data: { ...o, ...patch } }, settings);
      patch.invoiceId = invoiceId;
    }
    if (effects.includes('reverse_financials') && invoiceId) {
      await voidInvoice(tx, ctx, invoiceId, b.refund === true ? 'refund' : 'keep_credit', reason || 'إلغاء الطلب');
    }
    if (effects.includes('issue_credit_note')) {
      if (!invoiceId) throw fail('VALIDATION', 'لا توجد فاتورة لهذا الطلب');
      const lines = (Array.isArray(b.returnLines) ? b.returnLines : (o.items as ReturnLine[]).map((i) => ({ productId: i.productId, unitId: i.unitId, qtyMilli: i.qtyMilli }))) as ReturnLine[];
      patch.returnAmount = ((o.returnAmount as number) ?? 0) + (await returnCredit(tx, ctx, invoiceId, lines, reason));
    }
    if (effects.includes('start_tracking')) tx.write({ kind: 'set', path: `deliveryTracks/${order.id}`, data: { agentId: u.uid, shopId: o.shopId, active: true, points: [], startedAt: ctx.s.now() } });
    if (effects.includes('stop_tracking')) tx.write({ kind: 'set', path: `deliveryTracks/${order.id}`, data: { agentId: o.agentId, shopId: o.shopId, active: false, stoppedAt: ctx.s.now() }, merge: true });
    if (to === 'delivered' && proof) {
      const collected = proof.collectedAmount === undefined ? 0 : Number(proof.collectedAmount);
      if (collected && (!Number.isSafeInteger(collected) || collected < 0)) throw fail('VALIDATION', 'المبلغ المحصل بالأغورة');
      if (collected > 0 && !u.permissions.has('delivery.collect')) throw fail('FORBIDDEN', 'لا تملك صلاحية التحصيل النقدي');
      tx.write({ kind: 'set', path: `deliveryProofs/${order.id}`, data: {
        agentId: u.uid, shopId: o.shopId, receiverName: cleanText(proof.receiverName, 80, 'اسم المستلم'), note: cleanText(proof.note, 500, 'ملاحظات المندوب', false),
        photoKey: typeof proof.photoKey === 'string' ? proof.photoKey : null, signatureKey: typeof proof.signatureKey === 'string' ? proof.signatureKey : null,
        approxGeo: proof.geo ?? null, collected, at: ctx.s.now(),
      } });
      if (collected > 0) await postPayment(tx, ctx, { shopId: String(o.shopId), amount: collected, method: 'cash', source: 'delivery', orderId: order.id, ...(invoiceId ? { invoiceId } : {}) });
      patch.deliveredAt = ctx.s.now();
    }
    if (to === 'delivery_failed') patch.failure = { reason, at: ctx.s.now(), by: u.uid };
    if (to === 'cancelled' || to === 'rejected') patch.closure = { reason, by: u.uid, actor, at: ctx.s.now() };
    if (actor === 'staff' && !o.assignedTo && u.kinds.has('staff')) patch.assignedTo = u.uid;
    tx.write({ kind: 'update', path: order.path, data: patch });
    tx.write({ kind: 'create', path: `orders/${order.id}/history/${ctx.s.id()}`, data: { from, to, by: u.uid, actor, roleContext: ctx.workContext, reason: reason || null, at: ctx.s.now() } });
    tx.write(auditWrite(ctx, { action: 'orders.transition', entity: { kind: 'order', id: order.id }, before: { status: from }, after: { status: to, reason: reason || null, effects } }));
    const jobs: string[] = [];
    const sMsg = SHOP_MSG[to];
    if (sMsg && actor !== 'shop') {
      const j = queueNotice(tx, ctx.s, shopRecipients(o, shop?.data), { type: 'order.status', title: sMsg, body: `الطلب ${o.number}`, ref: { kind: 'order', id: order.id } }, `order.${to}.${order.id}.${patch.version}`);
      if (j) jobs.push(j);
    }
    const adminEvent = actor === 'shop' && to === 'confirmed' ? 'confirmed_by_shop' : actor === 'shop' && to === 'under_review' ? 'declined_by_shop' : to;
    if (ADMIN_EVENTS.has(adminEvent) && (actor !== 'staff' || to === 'returned')) {
      const label = { cancelled: 'ألغى المحل الطلب', delivery_failed: 'تعذّر تسليم الطلب', returned: 'مرتجع على الطلب', confirmed_by_shop: 'وافق المحل على التعديل', declined_by_shop: 'رفض المحل التعديل' }[adminEvent as 'cancelled'];
      const j = queueNotice(tx, ctx.s, await usersWithPermission(ctx.s.db, 'orders.view'), { type: 'order.alert', title: `${label} ${o.number}`, body: reason || String(o.shopName ?? ''), ref: { kind: 'order', id: order.id } }, `order.admin.${adminEvent}.${order.id}.${patch.version}`);
      if (j) jobs.push(j);
    }
    return { id: order.id, status: to, invoiceId, jobs };
  });
  for (const j of value.jobs) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, j));
  return json({ order: { id: value.id, status: value.status, invoiceId: value.invoiceId } });
}

/** طلب تعديل من الإدارة (SRS 5.4): لا حذف ولا استبدال بصمت؛ نسخة قبل وبعد وسبب وموافقة المحل. */
async function requestChange(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'orders.edit');
  const b = await readJson(ctx.req);
  const reason = cleanText(b.reason, 500, 'سبب التعديل');
  const items = parseItems(b.items);
  const { value } = await idempotent(ctx, `orders.change.${p.id}`, async (tx) => {
    const order = await loadOrder(ctx, p.id!, tx);
    const o = order.data;
    const r = checkTransition({ from: String(o.status), to: 'awaiting_shop_approval', actor: 'staff', permissions: u.permissions, reason, guards: {} });
    if (!r.ok) throw fail(r.code, r.message, r.details);
    if ((await tx.query({ collection: `orders/${order.id}/changes`, where: [['status', '==', 'pending']], limit: 1 })).length) throw fail('CONFLICT', 'يوجد تعديل بانتظار الموافقة');
    const after = await price(ctx, items, tx);
    const cid = ctx.s.id();
    tx.write({ kind: 'create', path: `orders/${order.id}/changes/${cid}`, data: { before: { lines: o.items, ...(o.totals as Data) }, after: { lines: after.lines, subtotal: after.subtotal, discount: after.discount, total: after.total }, reason, status: 'pending', by: u.uid, at: ctx.s.now() } });
    const version = ((o.version as number) ?? 1) + 1;
    tx.write({ kind: 'update', path: order.path, data: { status: 'awaiting_shop_approval', updatedAt: ctx.s.now(), version } });
    tx.write({ kind: 'create', path: `orders/${order.id}/history/${ctx.s.id()}`, data: { from: o.status, to: 'awaiting_shop_approval', by: u.uid, actor: 'staff', reason, at: ctx.s.now() } });
    tx.write(auditWrite(ctx, { action: 'orders.change.request', entity: { kind: 'order', id: order.id }, before: { total: (o.totals as Data).total }, after: { total: after.total, reason } }));
    const shop = await tx.get(`shops/${o.shopId}`);
    const j = queueNotice(tx, ctx.s, shopRecipients(o, shop?.data), { type: 'order.approval', title: SHOP_MSG.awaiting_shop_approval!, body: `${o.number}: ${reason}`, ref: { kind: 'order', id: order.id } }, `order.change.${order.id}.${cid}`);
    return { changeId: cid, total: after.total, job: j };
  });
  if (value.job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, value.job));
  return json({ changeId: value.changeId, total: value.total }, 201);
}

async function addNote(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'orders.notes');
  const order = await loadOrder(ctx, p.id!);
  const text = cleanText((await readJson(ctx.req)).text, 1000, 'الملاحظة');
  await ctx.s.db.commit([{ kind: 'create', path: `orders/${order.id}/internal/${ctx.s.id()}`, data: { text, by: u.uid, at: ctx.s.now() } }]);
  return json({ ok: true }, 201);
}

async function assign(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'orders.review');
  const order = await loadOrder(ctx, p.id!);
  const uid = String((await readJson(ctx.req)).employeeUid ?? '');
  const emp = await ctx.s.db.get(`users/${uid}`);
  if (!emp || emp.data.status !== 'active') throw fail('VALIDATION', 'الموظف غير موجود أو غير نشط');
  await ctx.s.db.commit([{ kind: 'update', path: order.path, data: { assignedTo: uid, updatedAt: ctx.s.now() } }, auditWrite(ctx, { action: 'orders.assign', entity: { kind: 'order', id: order.id }, before: { assignedTo: order.data.assignedTo }, after: { assignedTo: uid } })]);
  return json({ ok: true });
}

async function getOrder(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const order = await loadOrder(ctx, p.id!);
  const [history, changes] = await Promise.all([
    ctx.s.db.query({ collection: `orders/${order.id}/history`, orderBy: [['at', 'asc']] }),
    ctx.s.db.query({ collection: `orders/${order.id}/changes`, orderBy: [['at', 'desc']] }),
  ]);
  const staff = u.kinds.has('staff') && u.permissions.has('orders.view');
  const internal = staff ? await ctx.s.db.query({ collection: `orders/${order.id}/internal`, orderBy: [['at', 'asc']] }) : [];
  const actor = actorFor(u, order.data, '', String(order.data.status));
  return json({
    order: { id: order.id, ...order.data },
    history: history.map((h) => h.data), changes: changes.map((c) => ({ id: c.id, ...c.data })), internal: internal.map((n) => n.data),
    actions: actor ? availableTransitions(String(order.data.status), actor, u.permissions).map((t) => ({ to: t.to, reason: !!t.reason })) : [],
  });
}

const FILTERS: Record<string, string[]> = {
  new: ['new'], review: ['under_review', 'awaiting_shop_approval'], preparing: ['confirmed', 'preparing'], ready: ['ready_for_pickup'],
  delivering: ['out_for_delivery', 'on_the_way'], completed: ['delivered', 'financially_completed'], cancelled: ['cancelled', 'rejected'], failed: ['delivery_failed', 'returned'],
};

/** لوحة الطلبات للإدارة بالفلاتر الثمانية + المتأخرة (SRS 5.2). */
async function listOrders(ctx: Ctx) {
  requirePerm(ctx, 'orders.view');
  const f = ctx.url.searchParams.get('filter');
  const where: Array<[string, '==' | 'in' | '>=', unknown]> = [];
  if (f === 'overdue') where.push(['sla.overdue', '==', true]);
  else if (f === 'today') where.push(['createdAt', '>=', ctx.s.now() - 86_400_000]);
  else if (f && FILTERS[f]) where.push(['status', 'in', FILTERS[f]]);
  const shopId = ctx.url.searchParams.get('shopId');
  if (shopId) where.push(['shopId', '==', shopId]);
  const agentId = ctx.url.searchParams.get('agentId');
  if (agentId) where.push(['agentId', '==', agentId]);
  const rows = await ctx.s.db.query({ collection: 'orders', where, orderBy: [['createdAt', 'desc']], limit: 100 });
  // المتأخرة كما تعدّها اللوحة: المفتوحة فقط (المغلقة لا تُعد تأخيراً قائماً)
  const open = f === 'overdue' ? rows.filter((r) => !CLOSED.includes(String(r.data.status))) : rows;
  return json({ orders: open.map((r) => summary(r)) });
}
const CLOSED = ['cancelled', 'rejected', 'delivered', 'financially_completed'];

function summary(r: Doc) {
  const o = r.data;
  return { id: r.id, number: o.number, shopId: o.shopId, shopName: o.shopName, status: o.status, createdAt: o.createdAt, items: (o.items as unknown[]).length, total: (o.totals as Data).total, paymentMethod: o.paymentMethod, sla: o.sla, assignedTo: o.assignedTo, agentId: o.agentId };
}

async function shopOrders(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  if (!u.shopIds.includes(p.id!)) throw fail('FORBIDDEN', 'لا يمكنك الوصول إلى طلبات هذا المحل');
  const where: Array<[string, '==', unknown]> = [['shopId', '==', p.id]];
  if (!u.permissions.has('shop.orders.view_all')) where.push(['createdBy', '==', u.uid]);
  const rows = await ctx.s.db.query({ collection: 'orders', where, orderBy: [['createdAt', 'desc']], limit: 100 });
  return json({ orders: rows.map((r) => summary(r)) });
}

// ===== المسودات (SRS 2.3-ط) =====
async function saveDraft(ctx: Ctx, p: Record<string, string>) {
  const u = requirePerm(ctx, 'shop.orders.draft');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(p.id!)) throw fail('VALIDATION', 'معرّف المسودة غير صالح');
  const b = await readJson(ctx.req);
  const shopId = String(b.shopId ?? u.shopIds[0] ?? '');
  if (!u.shopIds.includes(shopId)) throw fail('FORBIDDEN', 'لا يمكنك حفظ مسودة لمحل آخر');
  const items = parseItems(b.items);
  if (items.length > 300) throw fail('VALIDATION', 'عدد الأصناف أكبر من المسموح');
  const cur = await ctx.s.db.get(`drafts/${p.id}`);
  if (cur && cur.data.shopId !== shopId) throw fail('FORBIDDEN', 'المسودة لمحل آخر');
  await ctx.s.db.commit([{ kind: 'set', path: `drafts/${p.id}`, data: { shopId, createdBy: cur?.data.createdBy ?? u.uid, updatedBy: u.uid, items, note: cleanText(b.note, 500, 'ملاحظة', false), updatedAt: ctx.s.now() } }]);
  return json({ ok: true });
}

async function listDrafts(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  if (!u.shopIds.includes(p.id!)) throw fail('FORBIDDEN', 'لا يمكنك الوصول إلى مسودات هذا المحل');
  const rows = await ctx.s.db.query({ collection: 'drafts', where: [['shopId', '==', p.id]], orderBy: [['updatedAt', 'desc']], limit: 50 });
  return json({ drafts: rows.map((r) => ({ id: r.id, ...r.data })) });
}

async function deleteDraft(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const d = await ctx.s.db.get(`drafts/${p.id}`);
  if (!d || !u.shopIds.includes(String(d.data.shopId))) throw fail('NOT_FOUND', 'المسودة غير موجودة');
  await ctx.s.db.commit([{ kind: 'delete', path: d.path }]);
  return json({ ok: true });
}

export function orderRoutes(r: Router<Ctx>) {
  r.on('POST', '/orders/quote', quote).on('POST', '/orders', submit).on('GET', '/orders', listOrders).on('GET', '/orders/:id', getOrder)
    .on('POST', '/orders/:id/transition', transition).on('POST', '/orders/:id/changes', requestChange).on('POST', '/orders/:id/notes', addNote)
    .on('POST', '/orders/:id/assign', assign).on('GET', '/shops/:id/orders', shopOrders)
    .on('PUT', '/drafts/:id', saveDraft).on('DELETE', '/drafts/:id', deleteDraft).on('GET', '/shops/:id/drafts', listDrafts);
}
