import type { Data, Doc } from '../infra/db';
import { requireUser, type Ctx } from './context';
import { fail, json, type Router } from './http';

const DAY = 86_400_000;
const OPEN = ['new', 'under_review', 'awaiting_shop_approval', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'on_the_way', 'delivery_failed'];
const total = (o: Doc) => ((o.data.totals as Data)?.total as number) ?? 0;

/** لوحة لكل دور غير الإدارة: صاحب المحل يرى محله، والمندوب يرى مهامه اليوم. نفس البطاقات قابلة للنقر في التطبيقات. */
async function mine(ctx: Ctx) {
  const u = requireUser(ctx);
  const now = ctx.s.now();
  if (u.kinds.has('agent')) {
    const rows = await ctx.s.db.query({ collection: 'orders', where: [['agentId', '==', u.uid]], limit: 1000 });
    const today = rows.filter((o) => ((o.data.deliveredAt as number) ?? 0) >= now - DAY);
    const proofs = today.length ? (await ctx.s.db.getMany(today.map((o) => `deliveryProofs/${o.id}`))) : [];
    return json({
      area: 'agent',
      pending: rows.filter((o) => o.data.status === 'ready_for_pickup').length,
      onRoad: rows.filter((o) => ['out_for_delivery', 'on_the_way'].includes(String(o.data.status))).length,
      deliveredToday: today.length,
      failed: rows.filter((o) => o.data.status === 'delivery_failed').length,
      collectedToday: proofs.reduce((a, p) => a + (((p?.data.collected as number) ?? 0)), 0),
    });
  }
  const shopId = ctx.url.searchParams.get('shopId') ?? u.shopIds[0];
  if (!shopId || !u.shopIds.includes(shopId)) throw fail('FORBIDDEN', 'لا يمكنك الوصول إلى هذا المحل');
  const where: Array<[string, '==' | '>=', unknown]> = [['shopId', '==', shopId], ['createdAt', '>=', now - 30 * DAY]];
  if (!u.permissions.has('shop.orders.view_all')) where.push(['createdBy', '==', u.uid]);
  const [orders, shop] = await Promise.all([ctx.s.db.query({ collection: 'orders', where, orderBy: [['createdAt', 'desc']], limit: 2000 }), ctx.s.db.get(`shops/${shopId}`)]);
  const live = orders.filter((o) => !['cancelled', 'rejected'].includes(String(o.data.status)));
  const last = [...orders].sort((a, b) => (b.data.createdAt as number) - (a.data.createdAt as number))[0];
  const qty = new Map<string, { productId: string; name: string; unitId: string; count: number }>();
  for (const o of live) for (const l of (o.data.items as Data[]) ?? []) {
    const k = String(l.productId);
    const e = qty.get(k) ?? { productId: k, name: String(l.name), unitId: String(l.unitId), count: 0 };
    e.count++; qty.set(k, e);
  }
  const balance = (shop?.data.balance as number) ?? 0;
  const credit = (shop?.data.credit as Data) ?? {};
  const limit = (credit.limit as number) ?? 0;
  const finance = u.permissions.has('shop.statement.view');
  return json({
    area: 'shop',
    open: orders.filter((o) => OPEN.includes(String(o.data.status))).length,
    ordersMonth: live.length,
    spendMonth: live.reduce((a, o) => a + total(o), 0),
    spendLast7Days: Array.from({ length: 7 }, (_, i) => live.filter((o) => { const t = o.data.createdAt as number; return t >= now - (7 - i) * DAY && t < now - (6 - i) * DAY; }).reduce((a, o) => a + total(o), 0)),
    ...(finance ? { due: Math.max(0, balance), creditAvailable: credit.enabled ? Math.max(0, limit - Math.max(0, balance)) : null } : {}),
    last: last ? { id: last.id, number: last.data.number, status: last.data.status, total: total(last), createdAt: last.data.createdAt } : null,
    reorder: [...qty.values()].sort((a, b) => b.count - a.count).slice(0, 6),
  });
}

export function meRoutes(r: Router<Ctx>) {
  r.on('GET', '/me/summary', mine);
}
