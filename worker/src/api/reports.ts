import { lineTotal } from '../domain/money';
import type { Data, Doc } from '../infra/db';
import { getSettings } from './admin/settings';
import { requireUser, type Ctx } from './context';
import { fail, json, type Router } from './http';
import { esc } from './print';

type Row = Record<string, string | number | null>;
interface Report {
  title: string;
  perms: string[];
  run(ctx: Ctx, f: Filters): Promise<{ columns: Array<[string, string]>; rows: Row[]; note?: string }>;
}
interface Filters {
  from: number;
  to: number;
  shopId: string | null;
  categoryId: string | null;
  status: string | null;
  tz: string;
}

/** الفترة تُطبّق داخل الاستعلام نفسه: لا تحميل لكل السجلات ثم فلترتها، ولا نتائج ناقصة حين تكبر البيانات. */
const range = (field: string, f: Filters): Array<[string, '>=' | '<', number]> => [[field, '>=', f.from], [field, '<', f.to]];
const inRange = (t: unknown, f: Filters) => typeof t === 'number' && t >= f.from && t < f.to;

async function invoices(ctx: Ctx, f: Filters): Promise<Doc[]> {
  const rows = await ctx.s.db.query({ collection: 'invoices', where: [...(f.shopId ? [['shopId', '==', f.shopId] as [string, '==', string]] : []), ...range('issuedAt', f)], limit: 20000 });
  return rows.filter((r) => r.data.status !== 'void' && inRange(r.data.issuedAt, f));
}

function bucket(ms: number, kind: 'day' | 'week' | 'month', tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (kind === 'month') return `${p.year}-${p.month}`;
  if (kind === 'day') return `${p.year}-${p.month}-${p.day}`;
  // الأسبوع يبدأ السبت
  const wd = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(p.weekday!);
  const d = new Date(Date.UTC(+p.year!, +p.month! - 1, +p.day! - wd));
  return `أسبوع ${d.toISOString().slice(0, 10)}`;
}

function sales(kind: 'day' | 'week' | 'month'): Report['run'] {
  return async (ctx, f) => {
    const m = new Map<string, { count: number; gross: number; discount: number; credited: number; net: number }>();
    for (const inv of await invoices(ctx, f)) {
      const k = bucket(inv.data.issuedAt as number, kind, f.tz);
      const t = (inv.data.totals as Data) ?? {};
      const e = m.get(k) ?? { count: 0, gross: 0, discount: 0, credited: 0, net: 0 };
      e.count++;
      e.gross += (t.subtotal as number) ?? 0;
      e.discount += (t.discount as number) ?? 0;
      e.credited += (inv.data.credited as number) ?? 0;
      e.net += (inv.data.total as number) - ((inv.data.credited as number) ?? 0);
      m.set(k, e);
    }
    return {
      columns: [['period', 'الفترة'], ['count', 'عدد الفواتير'], ['gross', 'المبيعات قبل الخصم'], ['discount', 'الخصومات'], ['credited', 'المرتجعات'], ['net', 'صافي المبيعات']],
      rows: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, ...v })),
      note: 'المبيعات ليست أرباحاً؛ الربح يتطلب تكلفة شراء فعلية.',
    };
  };
}

async function productStats(ctx: Ctx, f: Filters) {
  const m = new Map<string, { name: string; qtyMilli: number; revenue: number; units: Record<string, number> }>();
  for (const inv of await invoices(ctx, f)) {
    for (const l of (inv.data.items as Data[]) ?? []) {
      const e = m.get(String(l.productId)) ?? { name: String(l.name), qtyMilli: 0, revenue: 0, units: {} };
      const base = Math.round(((l.qtyMilli as number) * (l.factorToBase as number)) / 1000);
      e.qtyMilli += base;
      e.revenue += l.total as number;
      m.set(String(l.productId), e);
    }
  }
  if (f.categoryId) {
    const docs = await ctx.s.db.getMany([...m.keys()].map((id) => `products/${id}`));
    for (const d of docs) if (d && d.data.categoryId !== f.categoryId) m.delete(d.id);
  }
  return m;
}

const REPORTS: Record<string, Report> = {
  'sales-daily': { title: 'المبيعات اليومية', perms: ['reports.finance'], run: sales('day') },
  'sales-weekly': { title: 'المبيعات الأسبوعية', perms: ['reports.finance'], run: sales('week') },
  'sales-monthly': { title: 'المبيعات الشهرية', perms: ['reports.finance'], run: sales('month') },
  'orders-by-status': {
    title: 'الطلبات حسب الحالة', perms: ['reports.view'],
    run: async (ctx, f) => {
      const rows = (await ctx.s.db.query({ collection: 'orders', where: [...(f.shopId ? [['shopId', '==', f.shopId] as [string, '==', string]] : []), ...range('createdAt', f)], limit: 20000 })).filter((r) => inRange(r.data.createdAt, f));
      const m = new Map<string, number>();
      for (const r of rows) m.set(String(r.data.status), (m.get(String(r.data.status)) ?? 0) + 1);
      return { columns: [['status', 'الحالة'], ['count', 'العدد']], rows: [...m.entries()].map(([status, count]) => ({ status, count })) };
    },
  },
  'top-shops': {
    title: 'المحلات الأكثر شراءً', perms: ['reports.finance'],
    run: async (ctx, f) => {
      const m = new Map<string, { shop: string; invoices: number; net: number }>();
      for (const inv of await invoices(ctx, f)) {
        const e = m.get(String(inv.data.shopId)) ?? { shop: String((inv.data.shop as Data)?.name ?? inv.data.shopId), invoices: 0, net: 0 };
        e.invoices++;
        e.net += (inv.data.total as number) - ((inv.data.credited as number) ?? 0);
        m.set(String(inv.data.shopId), e);
      }
      return { columns: [['shop', 'المحل'], ['invoices', 'الفواتير'], ['net', 'صافي المشتريات']], rows: [...m.values()].sort((a, b) => b.net - a.net) };
    },
  },
  'top-products': {
    title: 'المنتجات الأكثر طلباً', perms: ['reports.view'],
    run: async (ctx, f) => ({ columns: [['name', 'المنتج'], ['qtyMilli', 'الكمية (وحدة أساسية ×1000)'], ['revenue', 'الإيراد']], rows: [...(await productStats(ctx, f)).values()].sort((a, b) => b.qtyMilli - a.qtyMilli).map(({ units: _u, ...r }) => r) }),
  },
  'least-products': {
    title: 'المنتجات الأقل طلباً', perms: ['reports.view'],
    run: async (ctx, f) => {
      const stats = await productStats(ctx, f);
      const all = (await ctx.s.db.query({ collection: 'products', where: [['archived', '==', false]], limit: 5000 })).filter((p) => !f.categoryId || p.data.categoryId === f.categoryId);
      return { columns: [['name', 'المنتج'], ['qtyMilli', 'الكمية (وحدة أساسية ×1000)']], rows: all.map((p) => ({ name: String(p.data.name), qtyMilli: stats.get(p.id)?.qtyMilli ?? 0 })).sort((a, b) => a.qtyMilli - b.qtyMilli) };
    },
  },
  'unavailable-products': {
    title: 'المنتجات غير المتوفرة', perms: ['reports.view'],
    run: async (ctx, f) => ({
      columns: [['name', 'المنتج'], ['sku', 'الرمز'], ['categoryId', 'التصنيف']],
      rows: (await ctx.s.db.query({ collection: 'products', where: [['available', '==', false]], limit: 5000 })).filter((p) => !p.data.archived && (!f.categoryId || p.data.categoryId === f.categoryId)).map((p) => ({ name: String(p.data.name), sku: String(p.data.sku), categoryId: String(p.data.categoryId) })),
    }),
  },
  profit: {
    title: 'الأرباح (بتكلفة فعلية)', perms: ['reports.finance', 'products.cost.view'],
    run: async (ctx, f) => {
      const stats = await productStats(ctx, f);
      const costs = await ctx.s.db.getMany([...stats.keys()].map((id) => `products/${id}/private/cost`));
      const rows: Row[] = [...stats.entries()].map(([, v], i) => {
        const cost = costs[i]?.data.cost as number | undefined;
        if (cost === undefined) return { name: v.name, revenue: v.revenue, cost: null, profit: null };
        const c = lineTotal(v.qtyMilli, cost);
        return { name: v.name, revenue: v.revenue, cost: c, profit: v.revenue - c };
      });
      return { columns: [['name', 'المنتج'], ['revenue', 'الإيراد'], ['cost', 'التكلفة'], ['profit', 'الربح']], rows, note: 'المنتجات بلا تكلفة مسجلة تظهر فارغة ولا تدخل في الربح؛ المصاريف التشغيلية غير مشمولة.' };
    },
  },
  collections: {
    title: 'المبالغ المحصلة', perms: ['reports.finance'],
    run: async (ctx, f) => {
      const rows = (await ctx.s.db.query({ collection: 'payments', where: [...(f.shopId ? [['shopId', '==', f.shopId] as [string, '==', string]] : []), ...range('at', f)], limit: 20000 })).filter((p) => p.data.status === 'posted' && inRange(p.data.at, f));
      const m = new Map<string, { method: string; source: string; count: number; amount: number }>();
      for (const p of rows) {
        const k = `${p.data.method}|${p.data.source}`;
        const e = m.get(k) ?? { method: String(p.data.method), source: String(p.data.source), count: 0, amount: 0 };
        e.count++;
        e.amount += p.data.amount as number;
        m.set(k, e);
      }
      return { columns: [['method', 'الطريقة'], ['source', 'المصدر'], ['count', 'العدد'], ['amount', 'المبلغ']], rows: [...m.values()] };
    },
  },
  debts: {
    title: 'الديون المستحقة', perms: ['reports.finance'],
    run: async (ctx) => ({
      columns: [['shop', 'المحل'], ['phone', 'الهاتف'], ['balance', 'المستحق'], ['limit', 'الحد الائتماني']],
      rows: (await ctx.s.db.query({ collection: 'shops', where: [['balance', '>', 0]], limit: 5000 })).map((s) => ({ shop: String(s.data.name), phone: String(s.data.phone ?? ''), balance: s.data.balance as number, limit: ((s.data.credit as Data)?.limit as number) ?? 0 })).sort((a, b) => b.balance - a.balance),
    }),
  },
  payments: {
    title: 'الدفعات', perms: ['reports.finance'],
    run: async (ctx, f) => ({
      columns: [['number', 'الرقم'], ['shopId', 'المحل'], ['amount', 'المبلغ'], ['method', 'الطريقة'], ['status', 'الحالة'], ['at', 'التاريخ']],
      rows: (await ctx.s.db.query({ collection: 'payments', where: [...(f.shopId ? [['shopId', '==', f.shopId] as [string, '==', string]] : []), ...range('at', f)], limit: 20000 })).filter((p) => inRange(p.data.at, f)).map((p) => ({ number: String(p.data.number), shopId: String(p.data.shopId), amount: p.data.amount as number, method: String(p.data.method), status: String(p.data.status), at: p.data.at as number })),
    }),
  },
  agents: {
    title: 'المندوبون', perms: ['reports.view'],
    run: async (ctx, f) => {
      const orders = (await ctx.s.db.query({ collection: 'orders', where: range('createdAt', f), limit: 20000 })).filter((o) => o.data.agentId && inRange(o.data.createdAt, f));
      const proofs = await ctx.s.db.getMany(orders.map((o) => `deliveryProofs/${o.id}`));
      const m = new Map<string, { agentId: string; delivered: number; failed: number; collected: number }>();
      orders.forEach((o, i) => {
        const e = m.get(String(o.data.agentId)) ?? { agentId: String(o.data.agentId), delivered: 0, failed: 0, collected: 0 };
        if (['delivered', 'financially_completed', 'returned'].includes(String(o.data.status))) e.delivered++;
        if (o.data.failure) e.failed++;
        e.collected += (proofs[i]?.data.collected as number) ?? 0;
        m.set(e.agentId, e);
      });
      return { columns: [['agentId', 'المندوب'], ['delivered', 'المسلّم'], ['failed', 'المتعذر'], ['collected', 'المحصّل']], rows: [...m.values()] };
    },
  },
  'delivery-delays': {
    title: 'التأخير في التوصيل', perms: ['reports.view'],
    run: async (ctx, f) => ({
      columns: [['number', 'الطلب'], ['shopName', 'المحل'], ['status', 'الحالة'], ['dueAt', 'الموعد'], ['reason', 'سبب التأخير']],
      rows: (await ctx.s.db.query({ collection: 'orders', where: [['sla.overdue', '==', true], ...range('createdAt', f)], limit: 20000 })).filter((o) => inRange(o.data.createdAt, f)).map((o) => ({ number: String(o.data.number), shopName: String(o.data.shopName), status: String(o.data.status), dueAt: (o.data.sla as Data).dueAt as number, reason: String((o.data.sla as Data).delayReason ?? '') })),
    }),
  },
  cancellations: {
    title: 'إلغاء الطلبات', perms: ['reports.view'],
    run: async (ctx, f) => ({
      columns: [['number', 'الطلب'], ['shopName', 'المحل'], ['status', 'الحالة'], ['actor', 'بواسطة'], ['reason', 'السبب']],
      rows: (await ctx.s.db.query({ collection: 'orders', where: [['status', 'in', ['cancelled', 'rejected']], ...range('createdAt', f)], limit: 20000 })).filter((o) => inRange(o.data.createdAt, f)).map((o) => ({ number: String(o.data.number), shopName: String(o.data.shopName), status: String(o.data.status), actor: String((o.data.closure as Data)?.actor ?? ''), reason: String((o.data.closure as Data)?.reason ?? '') })),
    }),
  },
  returns: {
    title: 'المرتجعات', perms: ['reports.finance'],
    run: async (ctx, f) => ({
      columns: [['number', 'الفاتورة'], ['shop', 'المحل'], ['credited', 'قيمة المرتجع']],
      rows: (await invoices(ctx, f)).filter((i) => ((i.data.credited as number) ?? 0) > 0).map((i) => ({ number: String(i.data.number), shop: String((i.data.shop as Data)?.name ?? ''), credited: i.data.credited as number })),
    }),
  },
  'staff-activity': {
    title: 'نشاط الموظفين', perms: ['reports.view', 'audit.view'],
    run: async (ctx, f) => {
      const logs = (await ctx.s.db.query({ collection: 'auditLogs', where: range('at', f), limit: 20000 })).filter((l) => inRange(l.data.at, f) && l.data.actorId !== 'anonymous');
      const m = new Map<string, { actorId: string; action: string; count: number }>();
      for (const l of logs) {
        const k = `${l.data.actorId}|${l.data.action}`;
        const e = m.get(k) ?? { actorId: String(l.data.actorId), action: String(l.data.action), count: 0 };
        e.count++;
        m.set(k, e);
      }
      const ids = [...new Set([...m.values()].map((e) => e.actorId).filter((id) => id !== 'system'))];
      const docs = ids.length ? await ctx.s.db.getMany(ids.map((id) => `users/${id}`)) : [];
      const names = new Map(ids.map((id, i) => [id, String(docs[i]?.data.displayName ?? id)]));
      return { columns: [['actorId', 'الموظف'], ['action', 'العملية'], ['count', 'العدد']], rows: [...m.values()].map((e) => ({ ...e, actorId: e.actorId === 'system' ? 'النظام' : names.get(e.actorId) ?? e.actorId })).sort((a, b) => b.count - a.count) };
    },
  },
};

export const REPORT_NAMES = Object.keys(REPORTS);

function csv(columns: Array<[string, string]>, rows: Row[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // منع حقن الصيغ في Excel
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + [columns.map(([, l]) => cell(l)).join(','), ...rows.map((r) => columns.map(([k]) => cell(r[k])).join(','))].join('\n');
}

async function run(ctx: Ctx, p: Record<string, string>) {
  const u = requireUser(ctx);
  const rep = REPORTS[p.name!];
  if (!rep) throw fail('NOT_FOUND', 'التقرير غير موجود');
  const missing = rep.perms.filter((x) => !u.permissions.has(x));
  if (missing.length) throw fail('FORBIDDEN', 'لا تملك صلاحية هذا التقرير', { missing });
  const q = ctx.url.searchParams;
  const from = Number(q.get('from') ?? 0);
  const to = Number(q.get('to') ?? ctx.s.now() + 1);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) throw fail('VALIDATION', 'الفترة غير صالحة');
  const settings = await getSettings(ctx);
  const out = await rep.run(ctx, { from, to, shopId: q.get('shopId'), categoryId: q.get('categoryId'), status: q.get('status'), tz: String(settings.timezone) });
  const rows = q.get('status') && out.columns.some(([k]) => k === 'status') ? out.rows.filter((r) => r.status === q.get('status')) : out.rows;
  const format = q.get('format') ?? 'json';
  if (format === 'csv') return new Response(csv(out.columns, rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="mawred-${p.name}.csv"`, 'cache-control': 'private, no-store' } });
  if (format === 'html') {
    const body = `<h1>${esc(rep.title)}</h1>${out.note ? `<p class="mut">${esc(out.note)}</p>` : ''}<table><thead><tr>${out.columns.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${out.columns.map(([k]) => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(rep.title)}</title><style>body{font-family:Tahoma,sans-serif;direction:rtl;margin:24px}table{width:100%;border-collapse:collapse}th,td{padding:6px;border-bottom:1px solid #ddd;text-align:right}.mut{color:#666}</style></head><body>${body}<button onclick="print()">طباعة / حفظ PDF</button></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
  }
  return json({ report: p.name, title: rep.title, columns: out.columns, rows, ...(out.note ? { note: out.note } : {}) });
}

async function catalog(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ reports: Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title, allowed: r.perms.every((x) => u.permissions.has(x)) })) });
}

export function reportRoutes(r: Router<Ctx>) {
  r.on('GET', '/reports', catalog).on('GET', '/reports/:name', run);
}
