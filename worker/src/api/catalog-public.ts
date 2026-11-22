import type { Data } from '../infra/db';
import { requirePerm, requireUser, type Ctx } from './context';
import { json, type Router } from './http';

/** الكتالوج للتطبيقات (المنتجات المرئية، التصنيفات الظاهرة، الوحدات) — يُخزَّن محلياً للعمل بلا نت. */
async function catalog(ctx: Ctx) {
  const u = requireUser(ctx);
  const staff = u.kinds.has('staff');
  const [products, categories, units] = await Promise.all([
    ctx.s.db.query({ collection: 'products', ...(staff ? {} : { where: [['visible', '==', true]] }), limit: 5000 }),
    ctx.s.db.query({ collection: 'categories', limit: 500 }),
    ctx.s.db.query({ collection: 'units', limit: 200 }),
  ]);
  return json({
    products: products.filter((p) => !p.data.archived).map((p) => { const { searchKeys: _k, createdBy: _c, updatedBy: _u, ...d } = p.data; return { id: p.id, ...d }; }),
    categories: categories.filter((c) => staff || c.data.hidden !== true).map((c) => ({ id: c.id, ...c.data })).sort((a, b) => ((a as Data).order as number) - ((b as Data).order as number)),
    units: units.map((x) => ({ id: x.id, ...x.data })),
    at: ctx.s.now(),
  }, 200, { 'cache-control': 'private, max-age=60' });
}

const DAY = 86_400_000;

/** مؤشرات لوحة الإدارة الخمسة عشر (SRS 11.1). */
async function summary(ctx: Ctx) {
  const u = requirePerm(ctx, 'orders.view');
  const since = ctx.s.now() - DAY;
  const [orders, products, shops] = await Promise.all([
    ctx.s.db.query({ collection: 'orders', where: [['createdAt', '>=', since - 30 * DAY]], limit: 5000 }),
    ctx.s.db.query({ collection: 'products', limit: 5000 }).then((r) => r.filter((p) => p.data.archived !== true)),
    ctx.s.db.query({ collection: 'shops', where: [['status', '==', 'active']], limit: 5000 }),
  ]);
  const today = orders.filter((o) => (o.data.createdAt as number) >= since);
  const by = (s: string[]) => orders.filter((o) => s.includes(String(o.data.status))).length;
  const finance = u.permissions.has('reports.finance');
  let collected = 0;
  let due = 0;
  let sales = 0;
  if (finance) {
    sales = today.filter((o) => o.data.invoiceId).reduce((a, o) => a + ((o.data.totals as Data).total as number), 0);
    collected = (await ctx.s.db.query({ collection: 'payments', where: [['at', '>=', since]], limit: 5000 })).filter((p) => p.data.status === 'posted').reduce((a, p) => a + (p.data.amount as number), 0);
    due = shops.reduce((a, s) => a + Math.max(0, (s.data.balance as number) ?? 0), 0);
  }
  const qty = new Map<string, { productId: string; name: string; count: number }>();
  for (const o of today) for (const l of (o.data.items as Data[]) ?? []) {
    const e = qty.get(String(l.productId)) ?? { productId: String(l.productId), name: String(l.name), count: 0 };
    e.count++;
    qty.set(String(l.productId), e);
  }
  const series = Array.from({ length: 7 }, (_, i) => orders.filter((o) => { const t = o.data.createdAt as number; return t >= ctx.s.now() - (7 - i) * DAY && t < ctx.s.now() - (6 - i) * DAY; }).length);
  return json({
    ordersToday: today.length, new: by(['new']), review: by(['under_review', 'awaiting_shop_approval']), preparing: by(['confirmed', 'preparing']), ready: by(['ready_for_pickup']),
    overdue: orders.filter((o) => (o.data.sla as Data)?.overdue === true && !['cancelled', 'rejected', 'delivered', 'financially_completed'].includes(String(o.data.status))).length,
    delivering: by(['out_for_delivery', 'on_the_way']), completed: by(['delivered', 'financially_completed']),
    ...(finance ? { salesToday: sales, collectedToday: collected, totalDue: due } : {}),
    activeShops: shops.length, availableProducts: products.filter((p) => p.data.available === true).length, unavailableProducts: products.filter((p) => p.data.available !== true).length,
    topProducts: [...qty.values()].sort((a, b) => b.count - a.count).slice(0, 5), ordersLast7Days: series,
    recent: orders.sort((a, b) => (b.data.createdAt as number) - (a.data.createdAt as number)).slice(0, 8).map((o) => ({ id: o.id, number: o.data.number, shopId: o.data.shopId, shopName: o.data.shopName, status: o.data.status, total: (o.data.totals as Data).total })),
  });
}

export function publicCatalogRoutes(r: Router<Ctx>) {
  r.on('GET', '/catalog', catalog).on('GET', '/dashboard/summary', summary);
}
