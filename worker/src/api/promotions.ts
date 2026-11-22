import type { Promotion, PromotionType } from '../domain/promotions';
import type { Data } from '../infra/db';
import { auditWrite, idempotent, requirePerm, requireUser, type Ctx } from './context';
import { cleanText, fail, json, readJson, type Router } from './http';
import { deliverJob, queueNotice } from './notify';
import { bumpCatalog } from './catalog-public';

const TYPES: PromotionType[] = ['item_percent', 'item_amount', 'qty_percent', 'bxgy', 'bundle_percent'];
const int = (v: unknown, min: number, max: number, field: string) => {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) throw fail('VALIDATION', `قيمة «${field}» غير صالحة`, { field });
  return v as number;
};

/** تحقق العرض حسب نوعه (SRS 10): لا عرض بلا منتجات أو بفترة معكوسة أو بقيم مستحيلة. */
async function parsePromotion(ctx: Ctx, b: Data, base?: Data): Promise<Data> {
  const m = { ...(base ?? {}), ...b };
  const type = String(m.type) as PromotionType;
  if (!TYPES.includes(type)) throw fail('VALIDATION', 'نوع العرض غير صالح');
  const productIds = m.productIds;
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > 200 || productIds.some((x) => typeof x !== 'string')) throw fail('VALIDATION', 'حدد المنتجات المشمولة');
  if (type === 'bundle_percent' && productIds.length < 2) throw fail('VALIDATION', 'عرض المجموعة يحتاج منتجين على الأقل');
  const found = await ctx.s.db.getMany((productIds as string[]).map((id) => `products/${id}`));
  const missing = (productIds as string[]).filter((_, i) => !found[i] || found[i]!.data.archived);
  if (missing.length) throw fail('VALIDATION', 'منتجات غير موجودة', { productIds: missing });
  const out: Data = {
    name: cleanText(m.name, 80, 'اسم العرض'), description: cleanText(m.description, 500, 'الوصف', false), terms: cleanText(m.terms, 1000, 'الشروط', false),
    type, productIds: [...new Set(productIds as string[])], startsAt: int(m.startsAt, 1, Number.MAX_SAFE_INTEGER, 'البداية'), endsAt: int(m.endsAt, 1, Number.MAX_SAFE_INTEGER, 'النهاية'),
    minPurchase: m.minPurchase === undefined || m.minPurchase === null ? 0 : int(m.minPurchase, 0, 1e10, 'الحد الأدنى للشراء'),
    active: m.active !== false, imageKey: m.imageKey ?? null,
  };
  if ((out.endsAt as number) <= (out.startsAt as number)) throw fail('VALIDATION', 'نهاية العرض يجب أن تكون بعد بدايته');
  if (m.maxDiscount !== undefined && m.maxDiscount !== null) out.maxDiscount = int(m.maxDiscount, 1, 1e10, 'الحد الأقصى للخصم');
  if (m.usageLimit !== undefined && m.usageLimit !== null) out.usageLimit = int(m.usageLimit, 1, 1e9, 'عدد مرات الاستخدام');
  if (Array.isArray(m.unitIds) && m.unitIds.length) out.unitIds = m.unitIds.map(String);
  if (type === 'item_percent' || type === 'qty_percent' || type === 'bundle_percent') out.percentBp = int(m.percentBp, 1, 10000, 'نسبة الخصم');
  if (type === 'item_amount') out.amountPerUnit = int(m.amountPerUnit, 1, 1e9, 'قيمة الخصم');
  if (type === 'qty_percent') out.minQtyMilli = int(m.minQtyMilli, 1, 1e9, 'الكمية الدنيا');
  if (type === 'bxgy') {
    out.buyQty = int(m.buyQty, 1, 1000, 'اشترِ');
    out.getQty = int(m.getQty, 1, 1000, 'احصل على');
  }
  if (out.imageKey !== null) {
    if (typeof out.imageKey !== 'string' || !/^products\/[a-z0-9]{8,40}\.(png|webp)$/.test(out.imageKey) || !(await ctx.s.files.exists(out.imageKey))) throw fail('VALIDATION', 'صورة العرض غير مرفوعة');
  }
  return out;
}

async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const staff = u.permissions.has('promotions.manage');
  const rows = await ctx.s.db.query({ collection: 'promotions', ...(staff ? {} : { where: [['active', '==', true]] }), limit: 300 });
  const now = ctx.s.now();
  const items = rows.map((r) => ({ id: r.id, ...(r.data as Omit<Promotion, 'id'>) })).filter((p) => staff || (p.startsAt <= now && p.endsAt > now && (p.usageLimit === undefined || p.usedCount < p.usageLimit)));
  return json({ promotions: items });
}

async function create(ctx: Ctx) {
  requirePerm(ctx, 'promotions.manage');
  const data = await parsePromotion(ctx, await readJson(ctx.req));
  const owners = (await ctx.s.db.query({ collection: 'users', where: [['roles', 'array-contains', 'shop_owner'], ['status', '==', 'active']], limit: 1000 })).map((u) => u.id);
  const { value } = await idempotent(ctx, 'promotions.create', async (tx) => {
    const id = ctx.s.id();
    tx.write({ kind: 'create', path: `promotions/${id}`, data: { ...data, usedCount: 0, createdAt: ctx.s.now(), createdBy: ctx.user!.uid } });
    tx.write(auditWrite(ctx, { action: 'promotions.create', entity: { kind: 'promotion', id }, after: data }));
    const job = data.active ? queueNotice(tx, ctx.s, owners, { type: 'promotion.new', title: 'هناك عرض جديد', body: String(data.name), ref: { kind: 'promotion', id } }, `promotion.${id}`) : null;
    return { id, job };
  });
  if (value.job) ctx.s.defer(deliverJob(ctx.s, ctx.s.pusher, value.job));
  await bumpCatalog(ctx);
  return json({ id: value.id }, 201);
}

async function update(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'promotions.manage');
  const cur = await ctx.s.db.get(`promotions/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'العرض غير موجود');
  const data = await parsePromotion(ctx, await readJson(ctx.req), cur.data);
  await ctx.s.db.commit([{ kind: 'update', path: cur.path, data: { ...data, updatedAt: ctx.s.now() } }, auditWrite(ctx, { action: 'promotions.update', entity: { kind: 'promotion', id: cur.id }, before: cur.data, after: data })]);
  await bumpCatalog(ctx);
  return json({ promotion: { id: cur.id, ...cur.data, ...data } });
}

export function promotionRoutes(r: Router<Ctx>) {
  r.on('GET', '/promotions', list).on('POST', '/admin/promotions', create).on('PATCH', '/admin/promotions/:id', update);
}
