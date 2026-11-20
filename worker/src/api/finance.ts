import { reverseEntry, statement, type LedgerEntry } from '../domain/ledger';
import type { Data, Doc, Tx } from '../infra/db';
import { getSettings } from './admin/settings';
import { auditWrite, idempotent, requirePerm, requireUser, type AuthUser, type Ctx, type Services } from './context';
import { postLedger, postPayment } from './finance-core';
import { cleanText, fail, json, readJson, type Router } from './http';
import { deliverJob, queueNotice } from './notify';
import { invoiceHtml, statementHtml } from './print';

function canSeeShopFinance(u: AuthUser, shopId: string, staffPerm: string, shopPerm: string) {
  return (u.kinds.has('staff') && u.permissions.has(staffPerm)) || (u.shopIds.includes(shopId) && u.permissions.has(shopPerm));
}

/**
 * الطلبات المسلّمة التي سُددت فواتيرها تصبح «مكتملة مالياً» (انتقال النظام).
 * تُمرَّر الفواتير المسددة من نتيجة التخصيص لأن قراءات المعاملة لا ترى كتاباتها المعلّقة.
 */
async function settleOrders(tx: Tx, ctx: Ctx, settled: Array<{ invoiceId: string; orderId: string }>) {
  for (const { orderId } of settled) {
    const order = await tx.get(`orders/${orderId}`);
    if (!order || !['delivered', 'returned'].includes(String(order.data.status))) continue;
    tx.write({ kind: 'update', path: order.path, data: { status: 'financially_completed', settledAt: ctx.s.now(), updatedAt: ctx.s.now() } });
    tx.write({ kind: 'create', path: `orders/${order.id}/history/${ctx.s.id()}`, data: { from: order.data.status, to: 'financially_completed', by: 'system', actor: 'system', at: ctx.s.now() } });
  }
}

async function shopOwnerIds(tx: Tx, shopId: string): Promise<string[]> {
  const shop = await tx.get(`shops/${shopId}`);
  return shop?.data.ownerUid ? [String(shop.data.ownerUid)] : [];
}

/** تسجيل دفعة أو تحصيل من المكتب (SRS 9.3) بمنع تكرار. */
async function createPayment(ctx: Ctx) {
  requirePerm(ctx, 'payments.create');
  const b = await readJson(ctx.req);
  const shopId = cleanText(b.shopId, 40, 'المحل');
  const amount = Number(b.amount);
  const method = String(b.method ?? 'cash');
  const settings = await getSettings(ctx);
  if (!((settings.paymentMethods as Array<{ id: string; enabled: boolean }>) ?? []).some((m) => m.id === method && m.enabled)) throw fail('VALIDATION', 'طريقة الدفع غير مفعّلة');
  const { value, replayed } = await idempotent(ctx, 'payments.create', async (tx) => {
    if (!(await tx.get(`shops/${shopId}`))) throw fail('NOT_FOUND', 'المحل غير موجود');
    const r = await postPayment(tx, ctx, {
      shopId, amount, method, source: 'office', notes: cleanText(b.notes, 500, 'ملاحظات', false),
      ...(typeof b.invoiceId === 'string' ? { invoiceId: b.invoiceId } : {}), ...(typeof b.proofKey === 'string' ? { proofKey: b.proofKey } : {}),
    });
    await settleOrders(tx, ctx, r.settled);
    const job = queueNotice(tx, ctx.s, await shopOwnerIds(tx, shopId), { type: 'payment.posted', title: 'تم تسجيل دفعة وتحديث رصيدك', body: `${r.number}`, ref: { kind: 'payment', id: r.id } }, `payment.${r.id}`);
    return { ...r, job };
  });
  if (!replayed && value.job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, value.job));
  const { job: _j, ...out } = value;
  return json({ payment: out, replayed }, replayed ? 200 : 201);
}

/** عكس دفعة بسبب: حركة عكسية، إعادة فتح الفواتير، وعودة الطلب المسوّى إلى «تم التسليم» (SRS 9.6). */
async function reversePayment(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'payments.reverse');
  const reason = cleanText((await readJson(ctx.req)).reason, 300, 'سبب العكس');
  const { value } = await idempotent(ctx, `payments.reverse.${p.id}`, async (tx) => {
    const pay = await tx.get(`payments/${p.id}`);
    if (!pay) throw fail('NOT_FOUND', 'الدفعة غير موجودة');
    if (pay.data.status === 'reversed') throw fail('ALREADY_REVERSED', 'الدفعة معكوسة سابقاً');
    const entries = await tx.query({ collection: 'ledger', where: [['shopId', '==', pay.data.shopId]], limit: 5000 });
    const target = entries.find((e) => e.data.type === 'payment' && (e.data.ref as Data)?.id === pay.id);
    if (!target) throw fail('NOT_FOUND', 'قيد الدفعة غير موجود');
    const all = entries.map((e) => ({ id: e.id, ...(e.data as Omit<LedgerEntry, 'id'>) }));
    const rev = reverseEntry({ id: target.id, ...(target.data as Omit<LedgerEntry, 'id'>) }, all, ctx.s.id(), ctx.s.now(), reason);
    if (!rev.ok) throw fail(rev.code, rev.message);
    postLedger(tx, ctx, [rev.value]);
    for (const a of (pay.data.allocations as Array<{ invoiceId: string; amount: number }>) ?? []) {
      const inv = await tx.get(`invoices/${a.invoiceId}`);
      if (!inv) continue;
      const paid = (inv.data.paid as number) - a.amount;
      const remaining = Math.max(0, (inv.data.total as number) - paid - ((inv.data.credited as number) ?? 0));
      if (inv.data.status !== 'void') tx.write({ kind: 'update', path: inv.path, data: { paid, remaining, status: paid <= 0 ? 'open' : remaining === 0 ? 'paid' : 'partial' } });
      const order = await tx.get(`orders/${inv.data.orderId}`);
      if (order?.data.status === 'financially_completed' && remaining > 0) {
        tx.write({ kind: 'update', path: order.path, data: { status: 'delivered', updatedAt: ctx.s.now() } });
        tx.write({ kind: 'create', path: `orders/${order.id}/history/${ctx.s.id()}`, data: { from: 'financially_completed', to: 'delivered', by: 'system', actor: 'system', reason: `عكس الدفعة ${pay.data.number}: ${reason}`, at: ctx.s.now() } });
      }
    }
    tx.write({ kind: 'update', path: pay.path, data: { status: 'reversed', reversedAt: ctx.s.now(), reversedBy: ctx.user!.uid, reverseReason: reason } });
    tx.write(auditWrite(ctx, { action: 'payments.reverse', entity: { kind: 'payment', id: pay.id }, before: { status: 'posted', amount: pay.data.amount }, after: { status: 'reversed', reason } }));
    return { ok: true };
  });
  return json(value);
}

/** تسوية مالية موثقة: موجب = مدين على المحل، سالب = دائن له. */
async function adjust(ctx: Ctx) {
  requirePerm(ctx, 'accounts.adjust');
  const b = await readJson(ctx.req);
  const shopId = cleanText(b.shopId, 40, 'المحل');
  const amount = Number(b.amount);
  if (!Number.isSafeInteger(amount) || amount === 0) throw fail('VALIDATION', 'قيمة التسوية بالأغورة وغير صفرية');
  const reason = cleanText(b.reason, 300, 'سبب التسوية');
  const { value } = await idempotent(ctx, 'ledger.adjust', async (tx) => {
    if (!(await tx.get(`shops/${shopId}`))) throw fail('NOT_FOUND', 'المحل غير موجود');
    const id = ctx.s.id();
    postLedger(tx, ctx, [{ id, shopId, type: b.opening === true ? 'opening' : 'adjustment', amount, reason, ref: { kind: 'manual', id }, at: ctx.s.now() }]);
    tx.write(auditWrite(ctx, { action: 'ledger.adjust', entity: { kind: 'shop', id: shopId }, after: { amount, reason, opening: b.opening === true } }));
    const job = queueNotice(tx, ctx.s, await shopOwnerIds(tx, shopId), { type: 'account.updated', title: 'تم تحديث رصيدك', body: reason, ref: { kind: 'shop', id: shopId } }, `adjust.${id}`);
    return { id, job };
  });
  if (value.job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, value.job));
  return json({ id: value.id }, 201);
}

async function buildStatement(ctx: Ctx, shopId: string) {
  const u = requireUser(ctx);
  if (!canSeeShopFinance(u, shopId, 'accounts.view', 'shop.statement.view')) throw fail('FORBIDDEN', 'لا يمكنك الاطلاع على كشف هذا الحساب');
  const shop = await ctx.s.db.get(`shops/${shopId}`);
  if (!shop) throw fail('NOT_FOUND', 'المحل غير موجود');
  const from = Number(ctx.url.searchParams.get('from') ?? 0);
  const to = Number(ctx.url.searchParams.get('to') ?? ctx.s.now() + 1);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) throw fail('VALIDATION', 'الفترة غير صالحة');
  const type = ctx.url.searchParams.get('type');
  const rows = await ctx.s.db.query({ collection: 'ledger', where: [['shopId', '==', shopId]], orderBy: [['at', 'asc']], limit: 10000 });
  let st = statement(rows.map((r) => ({ id: r.id, ...(r.data as Omit<LedgerEntry, 'id'>) })), from, to);
  if (type) st = { ...st, rows: st.rows.filter((r) => r.type === type) };
  const credit = (shop.data.credit as { enabled: boolean; limit: number }) ?? { enabled: false, limit: 0 };
  return { shop, st, from, to, credit: { ...credit, available: credit.limit - st.closing } };
}

async function getStatement(ctx: Ctx, p: Record<string, string>) {
  const { shop, st, credit } = await buildStatement(ctx, p.id!);
  return json({ shop: { id: shop.id, name: shop.data.name }, statement: st, credit });
}

async function printStatement(ctx: Ctx, p: Record<string, string>) {
  const { shop, st, from, to } = await buildStatement(ctx, p.id!);
  const s = await getSettings(ctx);
  return new Response(statementHtml(shop.data, st, from, to, String(s.timezone)), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
}

async function loadInvoice(ctx: Ctx, id: string): Promise<Doc> {
  const inv = await ctx.s.db.get(`invoices/${id}`);
  if (!inv || !canSeeShopFinance(requireUser(ctx), String(inv.data.shopId), 'invoices.view', 'shop.invoices.view')) throw fail('NOT_FOUND', 'الفاتورة غير موجودة');
  return inv;
}

async function getInvoice(ctx: Ctx, p: Record<string, string>) {
  const inv = await loadInvoice(ctx, p.id!);
  const adjustments = await ctx.s.db.query({ collection: `invoices/${inv.id}/adjustments`, orderBy: [['at', 'asc']] });
  return json({ invoice: { id: inv.id, ...inv.data }, adjustments: adjustments.map((a) => a.data) });
}

async function printInvoice(ctx: Ctx, p: Record<string, string>) {
  const inv = await loadInvoice(ctx, p.id!);
  const s = await getSettings(ctx);
  return new Response(invoiceHtml(inv.data, String(s.timezone)), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
}

async function listInvoices(ctx: Ctx) {
  requirePerm(ctx, 'invoices.view');
  const where: Array<[string, '==', unknown]> = [];
  for (const k of ['status', 'shopId']) {
    const v = ctx.url.searchParams.get(k);
    if (v) where.push([k, '==', v]);
  }
  const rows = await ctx.s.db.query({ collection: 'invoices', where, orderBy: [['issuedAt', 'desc']], limit: 200 });
  return json({ invoices: rows.map((r) => ({ id: r.id, number: r.data.number, shopId: r.data.shopId, shopName: (r.data.shop as Data)?.name, total: r.data.total, paid: r.data.paid, remaining: r.data.remaining, status: r.data.status, issuedAt: r.data.issuedAt })) });
}

async function shopInvoices(ctx: Ctx, p: Record<string, string>) {
  if (!canSeeShopFinance(requireUser(ctx), p.id!, 'invoices.view', 'shop.invoices.view')) throw fail('FORBIDDEN', 'لا يمكنك الاطلاع على فواتير هذا المحل');
  const rows = await ctx.s.db.query({ collection: 'invoices', where: [['shopId', '==', p.id]], orderBy: [['issuedAt', 'desc']], limit: 200 });
  return json({ invoices: rows.map((r) => ({ id: r.id, number: r.data.number, total: r.data.total, paid: r.data.paid, remaining: r.data.remaining, status: r.data.status, issuedAt: r.data.issuedAt })) });
}

async function shopPayments(ctx: Ctx, p: Record<string, string>) {
  if (!canSeeShopFinance(requireUser(ctx), p.id!, 'accounts.view', 'shop.statement.view')) throw fail('FORBIDDEN', 'لا يمكنك الاطلاع على دفعات هذا المحل');
  const rows = await ctx.s.db.query({ collection: 'payments', where: [['shopId', '==', p.id]], orderBy: [['at', 'desc']], limit: 200 });
  return json({ payments: rows.map((r) => ({ id: r.id, ...r.data })) });
}

/** Cron يومي احتياطي: تسوية الطلبات المسلّمة المسددة إن فاتت لحظة الدفع. */
export async function settleSweep(s: Services): Promise<number> {
  const rows = await s.db.query({ collection: 'orders', where: [['status', 'in', ['delivered', 'returned']]], limit: 500 });
  const ctx: Ctx = { req: new Request('https://cron.local/'), url: new URL('https://cron.local/'), s, requestId: s.id(), ip: 'cron', device: 'cron', workContext: null, user: null };
  let n = 0;
  for (const r of rows) {
    if (!r.data.invoiceId) continue;
    const inv = await s.db.get(`invoices/${r.data.invoiceId}`);
    if (!inv || inv.data.remaining !== 0 || inv.data.status === 'void') continue;
    await s.db.runTransaction((tx) => settleOrders(tx, ctx, [{ invoiceId: inv.id, orderId: r.id }]));
    if ((await s.db.get(r.path))?.data.status === 'financially_completed') n++;
  }
  return n;
}

export function financeRoutes(r: Router<Ctx>) {
  r.on('POST', '/payments', createPayment).on('POST', '/payments/:id/reverse', reversePayment).on('POST', '/ledger/adjustments', adjust)
    .on('GET', '/shops/:id/statement', getStatement).on('GET', '/shops/:id/statement/print', printStatement)
    .on('GET', '/invoices', listInvoices).on('GET', '/invoices/:id', getInvoice).on('GET', '/invoices/:id/print', printInvoice)
    .on('GET', '/shops/:id/invoices', shopInvoices).on('GET', '/shops/:id/payments', shopPayments);
}
