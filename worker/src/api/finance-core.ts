import { allocatePayment, cancellationEntries, invoiceStatus, type LedgerEntry } from '../domain/ledger';
import { divRoundHalfUp, lineTotal } from '../domain/money';
import { formatNumber, type Series } from '../domain/numbering';
import type { OrderLine } from '../domain/pricing';
import type { Data, Doc, Tx, Write } from '../infra/db';
import { auditWrite, type Ctx } from './context';
import { fail } from './http';

/** رقم متسلسل فريد لكل سنة داخل المعاملة. */
export async function nextNumber(tx: Tx, ctx: Ctx, series: Series): Promise<string> {
  const year = new Date(ctx.s.now()).getUTCFullYear();
  const path = `counters/${series}-${year}`;
  const cur = await tx.get(path);
  const seq = ((cur?.data.next as number) ?? 1);
  tx.write({ kind: 'set', path, data: { next: seq + 1 } });
  return formatNumber(series, year, seq);
}

function ledgerWrite(e: LedgerEntry, by: string, roleContext: string | null): Write {
  return { kind: 'create', path: `ledger/${e.id}`, data: { ...e, by, roleContext } };
}

/** يقيّد حركات الدفتر ويحدّث رصيد المحل المخزّن في نفس المعاملة. */
export function postLedger(tx: Pick<Tx, 'write'>, ctx: Ctx, entries: LedgerEntry[]) {
  let delta = 0;
  for (const e of entries) {
    tx.write(ledgerWrite(e, ctx.user?.uid ?? 'system', ctx.workContext));
    delta += e.amount;
  }
  if (entries.length && delta !== 0) tx.write({ kind: 'increment', path: `shops/${entries[0]!.shopId}`, field: 'balance', by: delta });
}

/** إصدار الفاتورة عند التأكيد: لقطة ثابتة لا تتأثر بتغيير الأسعار لاحقاً (SRS 9.1). */
export async function issueInvoice(tx: Tx, ctx: Ctx, order: Doc, settings: Data): Promise<string> {
  const o = order.data;
  const shop = await tx.get(`shops/${o.shopId}`);
  if (!shop) throw fail('NOT_FOUND', 'المحل غير موجود');
  const id = ctx.s.id();
  const number = await nextNumber(tx, ctx, 'I');
  const totals = o.totals as { subtotal: number; discount: number; total: number };
  const data: Data = {
    number, orderId: order.id, orderNumber: o.number, shopId: o.shopId,
    supplier: settings.supplier ?? { name: settings.platformName ?? 'مورد' },
    shop: { name: shop.data.name, ownerName: shop.data.ownerName, phone: shop.data.phone, address: shop.data.address, city: shop.data.city },
    items: o.items, totals, total: totals.total, paid: 0, credited: 0, remaining: totals.total, status: 'open',
    paymentMethod: o.paymentMethod, currency: settings.currency ?? 'ILS', issuedAt: ctx.s.now(), issuedBy: ctx.user?.uid ?? 'system', returned: {},
  };
  tx.write({ kind: 'create', path: `invoices/${id}`, data });
  postLedger(tx, ctx, [{ id: ctx.s.id(), shopId: String(o.shopId), type: 'invoice', amount: totals.total, ref: { kind: 'invoice', id }, at: ctx.s.now() }]);
  tx.write(auditWrite(ctx, { action: 'invoices.issue', entity: { kind: 'invoice', id }, after: { number, total: totals.total, orderId: order.id } }));
  return id;
}

/** إلغاء فاتورة (إلغاء طلب بعد التأكيد): إشعار دائن كامل، والمدفوع يبقى رصيداً دائناً أو يُرد. */
export async function voidInvoice(tx: Tx, ctx: Ctx, invoiceId: string, mode: 'keep_credit' | 'refund', reason: string) {
  const inv = await tx.get(`invoices/${invoiceId}`);
  if (!inv) throw fail('NOT_FOUND', 'الفاتورة غير موجودة');
  if (inv.data.status === 'void') return;
  const total = inv.data.total as number;
  const credited = (inv.data.credited as number) ?? 0;
  const r = cancellationEntries({ shopId: String(inv.data.shopId), invoiceId, invoiceTotal: total - credited, paid: inv.data.paid as number, mode, ids: () => ctx.s.id(), at: ctx.s.now(), reason });
  if (!r.ok) throw fail(r.code, r.message);
  postLedger(tx, ctx, r.value);
  tx.write({ kind: 'update', path: inv.path, data: { status: 'void', remaining: 0, voidedAt: ctx.s.now(), voidReason: reason, voidMode: mode } });
  tx.write({ kind: 'create', path: `invoices/${invoiceId}/adjustments/${ctx.s.id()}`, data: { type: 'void', amount: -(total - credited), reason, mode, at: ctx.s.now(), by: ctx.user?.uid ?? 'system' } });
  tx.write(auditWrite(ctx, { action: 'invoices.void', entity: { kind: 'invoice', id: invoiceId }, before: { status: inv.data.status, paid: inv.data.paid }, after: { status: 'void', mode, reason } }));
}

export interface ReturnLine {
  productId: string;
  unitId: string;
  qtyMilli: number;
}

/** مرتجع جزئي أو كلي: إشعار دائن بسعر الفاتورة الأصلي مع حصته من الخصم، ولا يتجاوز المفوتر. */
export async function returnCredit(tx: Tx, ctx: Ctx, invoiceId: string, lines: ReturnLine[], reason: string): Promise<number> {
  const inv = await tx.get(`invoices/${invoiceId}`);
  if (!inv || inv.data.status === 'void') throw fail('NOT_FOUND', 'الفاتورة غير موجودة أو ملغاة');
  if (!Array.isArray(lines) || lines.length === 0) throw fail('VALIDATION', 'حدد أصناف المرتجع');
  const items = inv.data.items as OrderLine[];
  const returned = { ...((inv.data.returned as Record<string, number>) ?? {}) };
  let amount = 0;
  for (const l of lines) {
    const it = items.find((x) => x.productId === l.productId && x.unitId === l.unitId);
    if (!it) throw fail('VALIDATION', 'صنف غير موجود في الفاتورة');
    const key = `${l.productId}|${l.unitId}`;
    if (!Number.isSafeInteger(l.qtyMilli) || l.qtyMilli <= 0 || (returned[key] ?? 0) + l.qtyMilli > it.qtyMilli) throw fail('VALIDATION', 'كمية المرتجع أكبر من المفوتر');
    returned[key] = (returned[key] ?? 0) + l.qtyMilli;
    const gross = lineTotal(l.qtyMilli, it.unitPrice);
    amount += gross - divRoundHalfUp(it.discount * l.qtyMilli, it.qtyMilli);
  }
  const credited = ((inv.data.credited as number) ?? 0) + amount;
  const paid = inv.data.paid as number;
  const total = inv.data.total as number;
  const remaining = Math.max(0, total - paid - credited);
  postLedger(tx, ctx, [{ id: ctx.s.id(), shopId: String(inv.data.shopId), type: 'credit_note', amount: -amount, ref: { kind: 'invoice', id: invoiceId }, reason, at: ctx.s.now() }]);
  tx.write({ kind: 'update', path: inv.path, data: { credited, remaining, returned, status: remaining === 0 ? 'paid' : invoiceStatus(total - credited, paid) } });
  tx.write({ kind: 'create', path: `invoices/${invoiceId}/adjustments/${ctx.s.id()}`, data: { type: 'return', amount: -amount, lines, reason, at: ctx.s.now(), by: ctx.user?.uid ?? 'system' } });
  tx.write(auditWrite(ctx, { action: 'invoices.return', entity: { kind: 'invoice', id: invoiceId }, after: { amount, lines, reason } }));
  return amount;
}

export interface PaymentInput {
  shopId: string;
  amount: number;
  method: string;
  invoiceId?: string;
  notes?: string;
  proofKey?: string;
  source: 'office' | 'delivery';
  orderId?: string;
}

/** تسجيل دفعة: توزيع على الفواتير المفتوحة من الأقدم، والزائد رصيد دائن (SRS 9.3–9.4). */
export async function postPayment(tx: Tx, ctx: Ctx, p: PaymentInput): Promise<{ id: string; number: string; allocations: Array<{ invoiceId: string; amount: number }>; unallocated: number }> {
  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) throw fail('VALIDATION', 'قيمة الدفعة بالأغورة وأكبر من صفر');
  const open = (await tx.query({ collection: 'invoices', where: [['shopId', '==', p.shopId], ['status', 'in', ['open', 'partial']]], limit: 200 }))
    .map((d) => ({ id: d.id, remaining: d.data.remaining as number, issuedAt: d.data.issuedAt as number, doc: d }));
  const a = allocatePayment(p.amount, open, p.invoiceId);
  if (!a.ok) throw fail(a.code, a.message);
  const id = ctx.s.id();
  const number = await nextNumber(tx, ctx, 'P');
  for (const al of a.value.allocations) {
    const inv = open.find((x) => x.id === al.invoiceId)!.doc;
    const paid = (inv.data.paid as number) + al.amount;
    const total = inv.data.total as number;
    const credited = (inv.data.credited as number) ?? 0;
    const remaining = Math.max(0, total - paid - credited);
    tx.write({ kind: 'update', path: inv.path, data: { paid, remaining, status: remaining === 0 ? 'paid' : 'partial' } });
  }
  tx.write({
    kind: 'create', path: `payments/${id}`,
    data: { number, shopId: p.shopId, amount: p.amount, method: p.method, allocations: a.value.allocations, unallocated: a.value.unallocated, source: p.source, orderId: p.orderId ?? null, notes: p.notes ?? '', proofKey: p.proofKey ?? null, status: 'posted', by: ctx.user?.uid ?? 'system', at: ctx.s.now() },
  });
  postLedger(tx, ctx, [{ id: ctx.s.id(), shopId: p.shopId, type: 'payment', amount: -p.amount, ref: { kind: 'payment', id }, at: ctx.s.now() }]);
  tx.write(auditWrite(ctx, { action: 'payments.create', entity: { kind: 'payment', id }, after: { number, amount: p.amount, method: p.method, allocations: a.value.allocations } }));
  return { id, number, ...a.value };
}
