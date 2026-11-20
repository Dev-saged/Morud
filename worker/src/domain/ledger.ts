import { assertAgorot, type Agorot } from './money';
import { err, ok, type Result } from './result';

// موجب = مستحق على المحل (مدين) ، سالب = لصالح المحل (دائن)
export type LedgerType = 'opening' | 'invoice' | 'payment' | 'adjustment' | 'credit_note' | 'refund' | 'reversal';

export interface LedgerEntry {
  id: string;
  shopId: string;
  type: LedgerType;
  amount: Agorot;
  ref?: { kind: 'invoice' | 'payment' | 'order' | 'manual'; id: string };
  reversesId?: string;
  reason?: string;
  at: number;
}

export function balance(entries: readonly LedgerEntry[]): Agorot {
  let b = 0;
  for (const e of entries) b += assertAgorot(e.amount);
  return b;
}

/** عكس حركة معتمدة بحركة مضادة؛ الأصل يبقى. لا يُعكس العكس ولا تُعكس الحركة مرتين. */
export function reverseEntry(target: LedgerEntry, all: readonly LedgerEntry[], id: string, at: number, reason: string): Result<LedgerEntry> {
  if (target.type === 'reversal') return err('CANNOT_REVERSE_REVERSAL', 'لا يمكن عكس حركة عكسية');
  if (all.some((e) => e.reversesId === target.id)) return err('ALREADY_REVERSED', 'هذه الحركة معكوسة سابقاً');
  if (reason.trim().length < 3) return err('REASON_REQUIRED', 'سبب التصحيح مطلوب');
  return ok({ id, shopId: target.shopId, type: 'reversal', amount: -target.amount, reversesId: target.id, reason, at, ...(target.ref ? { ref: target.ref } : {}) });
}

export interface OpenInvoice {
  id: string;
  remaining: Agorot;
  issuedAt: number;
}

export interface Allocation {
  invoiceId: string;
  amount: Agorot;
}

/** توزيع دفعة على الفواتير المفتوحة من الأقدم؛ الزائد يبقى رصيداً دائناً للمحل (لا يضيع). */
export function allocatePayment(amount: Agorot, invoices: readonly OpenInvoice[], target?: string): Result<{ allocations: Allocation[]; unallocated: Agorot }> {
  assertAgorot(amount);
  if (amount <= 0) return err('AMOUNT_NOT_POSITIVE', 'قيمة الدفعة يجب أن تكون أكبر من صفر');
  const ordered = [...invoices].filter((i) => i.remaining > 0).sort((a, b) => a.issuedAt - b.issuedAt || a.id.localeCompare(b.id));
  if (target) {
    const idx = ordered.findIndex((i) => i.id === target);
    if (idx < 0) return err('INVOICE_NOT_OPEN', 'الفاتورة المحددة مسددة أو غير موجودة');
    ordered.unshift(...ordered.splice(idx, 1));
  }
  let left = amount;
  const allocations: Allocation[] = [];
  for (const inv of ordered) {
    if (left === 0) break;
    const a = Math.min(left, inv.remaining);
    allocations.push({ invoiceId: inv.id, amount: a });
    left -= a;
  }
  return ok({ allocations, unallocated: left });
}

export type InvoiceStatus = 'open' | 'partial' | 'paid' | 'void';

export function invoiceStatus(total: Agorot, paid: Agorot, voided = false): InvoiceStatus {
  if (voided) return 'void';
  if (paid <= 0) return 'open';
  return paid >= total ? 'paid' : 'partial';
}

export interface CreditInput {
  method: 'cash' | 'credit' | string;
  enabled: boolean;
  limit: Agorot;
  balance: Agorot;
  orderTotal: Agorot;
  blocksDeferred: boolean;
  warnPercent: number;
}

/** الحد الائتماني يقيّد الآجل فقط؛ النقدي لا يُرفض أبداً (SRS 9.5). */
export function creditCheck(c: CreditInput): { decision: 'ok' | 'warn' | 'block'; available: Agorot } {
  const available = c.limit - c.balance;
  if (c.method !== 'credit' || !c.enabled) return { decision: 'ok', available };
  const after = c.balance + c.orderTotal;
  if (after > c.limit) return { decision: c.blocksDeferred ? 'block' : 'warn', available };
  if (c.limit > 0 && after * 100 >= c.limit * c.warnPercent) return { decision: 'warn', available };
  return { decision: 'ok', available };
}

export interface CancelInput {
  shopId: string;
  invoiceId: string;
  invoiceTotal: Agorot;
  paid: Agorot;
  mode: 'keep_credit' | 'refund';
  ids: () => string;
  at: number;
  reason: string;
}

/**
 * أثر إلغاء طلب له فاتورة: إشعار دائن بكامل الفاتورة (يلغي الدين)، والمدفوع يبقى رصيداً دائناً أو يُردّ نقداً.
 * الحركات الأصلية لا تُلمس (SRS 19.3 سيناريو 5).
 */
export function cancellationEntries(c: CancelInput): Result<LedgerEntry[]> {
  if (c.reason.trim().length < 3) return err('REASON_REQUIRED', 'سبب الإلغاء مطلوب');
  const out: LedgerEntry[] = [
    { id: c.ids(), shopId: c.shopId, type: 'credit_note', amount: -c.invoiceTotal, ref: { kind: 'invoice', id: c.invoiceId }, reason: c.reason, at: c.at },
  ];
  if (c.mode === 'refund' && c.paid > 0) {
    out.push({ id: c.ids(), shopId: c.shopId, type: 'refund', amount: c.paid, ref: { kind: 'invoice', id: c.invoiceId }, reason: c.reason, at: c.at });
  }
  return ok(out);
}

/** كشف الحساب: رصيد افتتاحي للفترة + الحركات بأرصدة تراكمية. */
export function statement(entries: readonly LedgerEntry[], from: number, to: number) {
  const sorted = [...entries].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const opening = balance(sorted.filter((e) => e.at < from));
  let running = opening;
  const rows = sorted.filter((e) => e.at >= from && e.at < to).map((e) => ({ ...e, running: (running += e.amount) }));
  const debit = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const credit = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  return { opening, rows, debit, credit, closing: running, due: Math.max(running, 0), creditBalance: Math.max(-running, 0) };
}
