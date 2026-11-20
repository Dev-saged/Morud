// صفحات طباعة عربية RTL للفاتورة وكشف الحساب (الحفظ PDF من المتصفح/المشاركة). كل نص يُهرَّب.
import { formatMoney } from '../domain/money';
import { formatQty } from '../domain/quantity';
import type { Data } from '../infra/db';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const money = (v: unknown) => esc(formatMoney(Number.isSafeInteger(v) ? (v as number) : 0));

const date = (ms: unknown, tz = 'Asia/Gaza') => new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(ms)));

const CSS = `body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;direction:rtl;margin:24px;color:#0B1533}h1{font-size:22px;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1D4ED8;padding-bottom:12px;margin-bottom:16px}
.mut{color:#5b6475;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th{background:#F7F5F0;text-align:right}
th,td{padding:8px;border-bottom:1px solid #e5e2da}.num{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}
.tot{margin-top:12px;width:320px;margin-inline-start:auto}.tot td{border:0;padding:4px 8px}.big{font-weight:700;font-size:16px;color:#1D4ED8}
@media print{body{margin:0}.noprint{display:none}}`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<p class="noprint mut"><button onclick="print()">طباعة / حفظ PDF</button></p></body></html>`;
}

export function invoiceHtml(inv: Data, tz?: string): string {
  const items = (inv.items as Data[]) ?? [];
  const rows = items.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.unitName)}</td><td class="num">${esc(formatQty(l.qtyMilli as number))}</td><td class="num">${money(l.unitPrice as number)}</td><td class="num">${money(l.discount as number)}</td><td class="num">${money(l.total as number)}</td></tr>`).join('');
  const sup = (inv.supplier as Data) ?? {};
  const shop = (inv.shop as Data) ?? {};
  const t = (inv.totals as Data) ?? {};
  return page(`فاتورة ${inv.number}`, `<div class="hd"><div><h1>${esc(sup.name)}</h1><div class="mut">${esc(sup.address)} ${esc(sup.phone)}</div></div>
<div><h1>فاتورة ${inv.status === 'void' ? '(ملغاة)' : ''}</h1><div class="mut num">${esc(inv.number)}</div><div class="mut">${esc(date(inv.issuedAt, tz))}</div><div class="mut">الطلب ${esc(inv.orderNumber)}</div></div></div>
<div><b>${esc(shop.name)}</b> — ${esc(shop.ownerName)}<div class="mut">${esc(shop.city)} · ${esc(shop.address)} · ${esc(shop.phone)}</div></div>
<table><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الخصم</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot"><tr><td>المجموع</td><td class="num">${money(t.subtotal as number)}</td></tr><tr><td>الخصومات</td><td class="num">${money(t.discount as number)}</td></tr>
<tr><td class="big">الإجمالي</td><td class="num big">${money(inv.total as number)}</td></tr><tr><td>المدفوع</td><td class="num">${money(inv.paid as number)}</td></tr>
<tr><td>مرتجعات</td><td class="num">${money((inv.credited as number) ?? 0)}</td></tr><tr><td class="big">المتبقي</td><td class="num big">${money(inv.remaining as number)}</td></tr></table>`);
}

const TYPE: Record<string, string> = { opening: 'رصيد افتتاحي', invoice: 'فاتورة', payment: 'دفعة', adjustment: 'تسوية', credit_note: 'إشعار دائن', refund: 'ردّ مبلغ', reversal: 'حركة عكسية' };

export function statementHtml(shop: Data, st: { opening: number; rows: Array<Data & { running: number }>; debit: number; credit: number; closing: number; due: number; creditBalance: number }, from: number, to: number, tz?: string): string {
  const rows = st.rows.map((r) => `<tr><td>${esc(date(r.at, tz))}</td><td>${esc(TYPE[String(r.type)] ?? r.type)}</td><td>${esc(r.reason ?? '')}</td><td class="num">${(r.amount as number) > 0 ? money(r.amount as number) : ''}</td><td class="num">${(r.amount as number) < 0 ? money(-(r.amount as number)) : ''}</td><td class="num">${money(r.running)}</td></tr>`).join('');
  return page(`كشف حساب ${shop.name}`, `<div class="hd"><div><h1>كشف حساب</h1><div class="mut">${esc(shop.name)} — ${esc(shop.ownerName)}</div></div><div class="mut">${esc(date(from, tz))} — ${esc(date(to, tz))}</div></div>
<table><thead><tr><th>التاريخ</th><th>الحركة</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody><tr><td colspan="5">الرصيد الافتتاحي</td><td class="num">${money(st.opening)}</td></tr>${rows}</tbody></table>
<table class="tot"><tr><td>مجموع المدين</td><td class="num">${money(st.debit)}</td></tr><tr><td>مجموع الدائن</td><td class="num">${money(st.credit)}</td></tr>
<tr><td class="big">المستحق على المحل</td><td class="num big">${money(st.due)}</td></tr><tr><td>رصيد دائن للمحل</td><td class="num">${money(st.creditBalance)}</td></tr></table>`);
}
