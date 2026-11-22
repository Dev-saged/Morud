import type { Data } from '../infra/db';
import { requirePerm, requireUser, type Ctx, type Services } from './context';
import { json, type Router } from './http';

/** الكتالوج للتطبيقات (المنتجات المرئية، التصنيفات الظاهرة، الوحدات) — يُخزَّن محلياً للعمل بلا نت. */
/** يُستدعى بعد أي تعديل على المنتجات أو التصنيفات أو الوحدات فيبطل كاش الكتالوج لكل النسخ. */
export async function bumpCatalog(x: Ctx | Services) {
  const s = 's' in x ? x.s : x;
  await s.cache?.put('catver', `${s.now()}-${s.id().slice(0, 8)}`).catch(() => undefined);
}

/** الأكثر طلباً خلال 30 يوماً (SRS 4.1): يُحسب كل ساعة من المهام المجدولة ويُقرأ مع الكتالوج. */
export async function computePopular(s: Services): Promise<string[]> {
  const orders = await s.db.query({ collection: 'orders', where: [['createdAt', '>=', s.now() - 30 * DAY]], limit: 5000 });
  const n = new Map<string, number>();
  for (const o of orders) {
    if (['cancelled', 'rejected'].includes(String(o.data.status))) continue;
    for (const l of (o.data.items as Data[]) ?? []) n.set(String(l.productId), (n.get(String(l.productId)) ?? 0) + 1);
  }
  const popular = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
  const prev = (await s.db.get('system/stats'))?.data.popular as string[] | undefined;
  if (JSON.stringify(prev ?? []) !== JSON.stringify(popular)) {
    await s.db.commit([{ kind: 'set', path: 'system/stats', data: { popular, at: s.now() } }]);
    await bumpCatalog(s);
  }
  return popular;
}

async function catalog(ctx: Ctx) {
  const u = requireUser(ctx);
  const staff = u.kinds.has('staff');
  const headers = { 'cache-control': 'private, max-age=60', 'content-type': 'application/json; charset=utf-8' };
  const ver = (await ctx.s.cache?.get('catver').catch(() => null)) ?? '0';
  const key = `cat:${staff ? 's' : 'p'}:${ver}`;
  const hit = ctx.s.cache ? await ctx.s.cache.get(key).catch(() => null) : null;
  if (hit) return new Response(hit, { status: 200, headers });
  const body = JSON.stringify(await buildCatalog(ctx, staff, ver));
  if (ctx.s.cache) ctx.s.defer(ctx.s.cache.put(key, body, { expirationTtl: 3600 }).catch(() => undefined));
  return new Response(body, { status: 200, headers });
}

async function buildCatalog(ctx: Ctx, staff: boolean, ver: string) {
  const [products, categories, units, promos, stats] = await Promise.all([
    ctx.s.db.query({ collection: 'products', ...(staff ? {} : { where: [['visible', '==', true]] }), limit: 5000 }),
    ctx.s.db.query({ collection: 'categories', limit: 500 }),
    ctx.s.db.query({ collection: 'units', limit: 200 }),
    ctx.s.db.query({ collection: 'promotions', where: [['active', '==', true]], limit: 300 }),
    ctx.s.db.get('system/stats'),
  ]);
  const now = ctx.s.now();
  // العروض الفعّالة بشروطها كاملة: التطبيق يعرضها ويحسب بها الإجمالي المتوقع، والخادم يعيد الحساب عند الإرسال
  const promotions = promos.map((r) => ({ id: r.id, ...r.data })).filter((p) => {
    const d = p as Data;
    return (d.endsAt as number) > now && (d.usageLimit === undefined || (d.usedCount as number ?? 0) < (d.usageLimit as number));
  }).map((p) => { const { createdBy: _c, updatedBy: _u, ...d } = p as Data; return d; });
  return {
    ver,
    products: products.filter((p) => !p.data.archived).map((p) => { const { searchKeys: _k, createdBy: _c, updatedBy: _u, ...d } = p.data; return { id: p.id, ...d }; }),
    categories: categories.filter((c) => staff || c.data.hidden !== true).map((c) => ({ id: c.id, ...c.data })).sort((a, b) => ((a as Data).order as number) - ((b as Data).order as number)),
    units: units.map((x) => ({ id: x.id, ...x.data })),
    promotions,
    popular: (stats?.data.popular as string[] | undefined) ?? [],
    at: ctx.s.now(),
  };
}

const DAY = 86_400_000;

/** مؤشرات لوحة الإدارة الخمسة عشر (SRS 11.1). */
async function summary(ctx: Ctx) {
  const u = requirePerm(ctx, 'orders.view');
  const since = ctx.s.now() - DAY;
  const finance = u.permissions.has('reports.finance');
  // كل القراءات بالتوازي: زمن اللوحة = أبطأ قراءة واحدة لا مجموعها
  const [orders, products, shops, payments] = await Promise.all([
    ctx.s.db.query({ collection: 'orders', where: [['createdAt', '>=', since - 30 * DAY]], limit: 5000 }),
    ctx.s.db.query({ collection: 'products', limit: 5000 }).then((r) => r.filter((p) => p.data.archived !== true)),
    ctx.s.db.query({ collection: 'shops', where: [['status', '==', 'active']], limit: 5000 }),
    finance ? ctx.s.db.query({ collection: 'payments', where: [['at', '>=', since]], limit: 5000 }) : Promise.resolve([]),
  ]);
  const today = orders.filter((o) => (o.data.createdAt as number) >= since);
  const by = (s: string[]) => orders.filter((o) => s.includes(String(o.data.status))).length;
  let collected = 0;
  let due = 0;
  let sales = 0;
  if (finance) {
    sales = today.filter((o) => o.data.invoiceId).reduce((a, o) => a + ((o.data.totals as Data).total as number), 0);
    collected = payments.filter((p) => p.data.status === 'posted').reduce((a, p) => a + (p.data.amount as number), 0);
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
