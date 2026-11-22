import { validateProduct, type Product, type ProductUnit, type Unit } from '../../domain/catalog';
import { searchKeys } from '../../domain/search';
import type { Data, Write } from '../../infra/db';
import { inspectImage } from '../../infra/files';
import { auditWrite, idempotent, requirePerm, requireUser, type Ctx } from '../context';
import { cleanText, fail, json, readJson, type Router } from '../http';
import { bumpCatalog } from '../catalog-public';

const ID = /^[a-z0-9_-]{2,40}$/;

async function unitsMap(ctx: Ctx): Promise<Map<string, Unit>> {
  const rows = await ctx.s.db.query({ collection: 'units' });
  return new Map(rows.map((r) => [r.id, { id: r.id, name: String(r.data.name), kind: r.data.kind as Unit['kind'], allowFraction: r.data.allowFraction === true }]));
}

// ===== التصنيفات =====
function parseCategory(b: Data, partial: boolean): Data {
  const out: Data = {};
  if (!partial || b.name !== undefined) out.name = cleanText(b.name, 60, 'اسم التصنيف');
  if (b.parentId !== undefined) out.parentId = b.parentId === null ? null : cleanText(b.parentId, 40, 'التصنيف الأب');
  if (b.order !== undefined) {
    if (!Number.isInteger(b.order)) throw fail('VALIDATION', 'الترتيب عدد صحيح');
    out.order = b.order;
  }
  if (b.icon !== undefined) out.icon = cleanText(b.icon, 40, 'الأيقونة', false);
  if (b.imageKey !== undefined) out.imageKey = b.imageKey === null ? null : cleanText(b.imageKey, 120, 'الصورة');
  if (b.hidden !== undefined) out.hidden = b.hidden === true;
  return out;
}

async function createCategory(ctx: Ctx) {
  requirePerm(ctx, 'categories.manage');
  const b = await readJson(ctx.req);
  const id = b.id ? cleanText(b.id, 40, 'المعرّف') : ctx.s.id();
  if (!ID.test(id)) throw fail('VALIDATION', 'معرّف التصنيف غير صالح');
  const data = { order: 999, hidden: false, parentId: null, icon: '', ...parseCategory(b, false), createdAt: ctx.s.now() };
  if (data.parentId && !(await ctx.s.db.get(`categories/${data.parentId}`))) throw fail('VALIDATION', 'التصنيف الأب غير موجود');
  await ctx.s.db.commit([{ kind: 'create', path: `categories/${id}`, data }, auditWrite(ctx, { action: 'categories.create', entity: { kind: 'category', id }, after: data })]);
  await bumpCatalog(ctx);
  return json({ category: { id, ...data } }, 201);
}

async function updateCategory(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'categories.manage');
  const cur = await ctx.s.db.get(`categories/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'التصنيف غير موجود');
  const patch = parseCategory(await readJson(ctx.req), true);
  if (patch.parentId === cur.id) throw fail('VALIDATION', 'لا يكون التصنيف أباً لنفسه');
  await ctx.s.db.commit([{ kind: 'update', path: `categories/${cur.id}`, data: { ...patch, updatedAt: ctx.s.now() } }, auditWrite(ctx, { action: 'categories.update', entity: { kind: 'category', id: cur.id }, before: cur.data, after: patch })]);
  await bumpCatalog(ctx);
  return json({ category: { id: cur.id, ...cur.data, ...patch } });
}

/** حذف آمن: لا يُحذف تصنيف له منتجات إلا بنقلها إلى تصنيف آخر، ولا تصنيف له فروع. */
async function deleteCategory(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'categories.manage');
  const cur = await ctx.s.db.get(`categories/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'التصنيف غير موجود');
  if ((await ctx.s.db.query({ collection: 'categories', where: [['parentId', '==', cur.id]], limit: 1 })).length) throw fail('CONFLICT', 'للتصنيف تصنيفات فرعية، انقلها أولاً');
  const moveTo = ctx.url.searchParams.get('moveTo');
  const products = await ctx.s.db.query({ collection: 'products', where: [['categoryId', '==', cur.id]], limit: 450 });
  if (products.length && !moveTo) throw fail('CONFLICT', 'التصنيف مرتبط بمنتجات؛ اختر تصنيفاً تنقلها إليه', { products: products.length });
  if (moveTo && !(await ctx.s.db.get(`categories/${moveTo}`))) throw fail('VALIDATION', 'التصنيف الهدف غير موجود');
  if (products.length >= 450) throw fail('CONFLICT', 'عدد المنتجات كبير؛ انقلها على دفعات من شاشة المنتجات');
  await ctx.s.db.commit([
    ...products.map((pr): Write => ({ kind: 'update', path: pr.path, data: { categoryId: moveTo, updatedAt: ctx.s.now() } })),
    { kind: 'delete', path: `categories/${cur.id}` },
    auditWrite(ctx, { action: 'categories.delete', entity: { kind: 'category', id: cur.id }, before: cur.data, after: { movedProducts: products.length, moveTo } }),
  ]);
  await bumpCatalog(ctx);
  return json({ ok: true, moved: products.length });
}

// ===== الوحدات =====
async function upsertUnit(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'units.manage');
  if (!ID.test(p.id!)) throw fail('VALIDATION', 'معرّف الوحدة غير صالح');
  const b = await readJson(ctx.req);
  const kind = String(b.kind);
  if (!['count', 'weight', 'volume'].includes(kind)) throw fail('VALIDATION', 'نوع الوحدة: count أو weight أو volume');
  const data = { name: cleanText(b.name, 30, 'اسم الوحدة'), kind, allowFraction: kind !== 'count' && b.allowFraction === true, updatedAt: ctx.s.now() };
  const before = (await ctx.s.db.get(`units/${p.id}`))?.data ?? null;
  await ctx.s.db.commit([{ kind: 'set', path: `units/${p.id}`, data }, auditWrite(ctx, { action: 'units.upsert', entity: { kind: 'unit', id: p.id! }, before, after: data })]);
  await bumpCatalog(ctx);
  return json({ unit: { id: p.id, ...data } });
}

async function deleteUnit(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'units.manage');
  const cur = await ctx.s.db.get(`units/${p.id}`);
  if (!cur) throw fail('NOT_FOUND', 'الوحدة غير موجودة');
  if ((await ctx.s.db.query({ collection: 'products', where: [['unitIds', 'array-contains', cur.id]], limit: 1 })).length) throw fail('CONFLICT', 'الوحدة مستخدمة في منتجات');
  await ctx.s.db.commit([{ kind: 'delete', path: `units/${cur.id}` }, auditWrite(ctx, { action: 'units.delete', entity: { kind: 'unit', id: cur.id }, before: cur.data })]);
  await bumpCatalog(ctx);
  return json({ ok: true });
}

// ===== المنتجات =====
function parseUnits(v: unknown): ProductUnit[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 10) throw fail('VALIDATION', 'وحدات البيع مطلوبة (1–10)');
  return v.map((u: Data) => {
    for (const k of ['factorToBase', 'price', 'minQtyMilli', 'stepMilli']) if (!Number.isSafeInteger(u?.[k])) throw fail('VALIDATION', `قيمة ${k} يجب أن تكون عدداً صحيحاً`);
    return { unitId: String(u.unitId), factorToBase: u.factorToBase as number, price: u.price as number, minQtyMilli: u.minQtyMilli as number, stepMilli: u.stepMilli as number, allowFraction: u.allowFraction === true };
  });
}

function parseImages(v: unknown): Array<{ key: string; thumb: string }> {
  if (!Array.isArray(v) || v.length > 8) throw fail('VALIDATION', 'الصور: حتى 8');
  return v.map((x: Data) => {
    const key = String(x?.key ?? '');
    const thumb = String(x?.thumb ?? '');
    if (!/^products\/[a-z0-9]{8,40}\.(png|webp)$/.test(key) || !/^products\/[a-z0-9]{8,40}\.(png|webp)$/.test(thumb)) throw fail('VALIDATION', 'مفتاح صورة غير صالح');
    return { key, thumb };
  });
}

function strArr(v: unknown, field: string, max: number, len = 60): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw fail('VALIDATION', `الحقل «${field}» غير صالح`);
  return [...new Set(v.map((x) => cleanText(x, len, field)))];
}

function productDoc(p: Product, extra: Data): Data {
  return { ...p, ...extra, unitIds: p.units.map((u) => u.unitId), searchKeys: searchKeys(p) };
}

async function assertImagesExist(ctx: Ctx, images: Array<{ key: string; thumb: string }>) {
  for (const i of images) for (const k of [i.key, i.thumb]) if (!(await ctx.s.files.exists(k))) throw fail('VALIDATION', 'صورة غير مرفوعة', { key: k });
}

async function createProduct(ctx: Ctx) {
  const actor = requirePerm(ctx, 'products.create');
  const b = await readJson(ctx.req);
  const units = await unitsMap(ctx);
  const p: Product = {
    id: ctx.s.id(), name: cleanText(b.name, 120, 'اسم المنتج'), altNames: strArr(b.altNames, 'الأسماء البديلة', 10), sku: cleanText(b.sku, 40, 'رمز المنتج').toUpperCase(),
    barcodes: strArr(b.barcodes, 'الباركود', 10, 30), categoryId: cleanText(b.categoryId, 40, 'التصنيف'), baseUnitId: cleanText(b.baseUnitId, 40, 'الوحدة الأساسية'),
    units: parseUnits(b.units), available: b.available !== false, visible: b.visible !== false,
    ...(b.brand ? { brand: cleanText(b.brand, 60, 'العلامة التجارية') } : {}),
    ...(b.defaultUnitId ? { defaultUnitId: cleanText(b.defaultUnitId, 40, 'وحدة الطلب الافتراضية') } : {}),
  };
  const problems = validateProduct(p, units);
  if (problems.length) throw fail('VALIDATION', 'بيانات المنتج غير مكتملة', { problems });
  if (!(await ctx.s.db.get(`categories/${p.categoryId}`))) throw fail('VALIDATION', 'التصنيف غير موجود');
  const images = parseImages(b.images ?? []);
  await assertImagesExist(ctx, images);
  const extra: Data = {
    description: cleanText(b.description, 2000, 'الوصف', false), images, order: Number.isInteger(b.order) ? b.order : 999, featured: b.featured === true,
    archived: false, createdAt: ctx.s.now(), createdBy: actor.uid,
  };
  const { value } = await idempotent(ctx, 'products.create', async (tx) => {
    if (await tx.get(`skus/${p.sku}`)) throw fail('CONFLICT', 'رمز المنتج مستخدم لمنتج آخر');
    const doc = productDoc(p, extra);
    tx.write({ kind: 'create', path: `products/${p.id}`, data: doc });
    tx.write({ kind: 'create', path: `skus/${p.sku}`, data: { productId: p.id } });
    if (b.cost !== undefined && actor.permissions.has('products.cost.view')) {
      if (!Number.isSafeInteger(b.cost) || (b.cost as number) < 0) throw fail('VALIDATION', 'التكلفة بالأغورة');
      tx.write({ kind: 'set', path: `products/${p.id}/private/cost`, data: { cost: b.cost, updatedAt: ctx.s.now() } });
    }
    tx.write(auditWrite(ctx, { action: 'products.create', entity: { kind: 'product', id: p.id }, after: doc }));
    return { id: p.id };
  });
  await bumpCatalog(ctx);
  return json(value, 201);
}

/** التعديل يفصل الصلاحيات: السعر يحتاج products.price.update، والتوفر products.availability.update (SRS 2.3-د و3.5). */
async function updateProduct(ctx: Ctx, params: Record<string, string>) {
  const u = requireUser(ctx);
  const cur = await ctx.s.db.get(`products/${params.id}`);
  if (!cur || cur.data.archived) throw fail('NOT_FOUND', 'المنتج غير موجود');
  const b = await readJson(ctx.req);
  const before = cur.data as unknown as Product & Data;
  const keys = Object.keys(b);
  const priceChanged = b.units !== undefined && JSON.stringify(parseUnits(b.units).map((x) => [x.unitId, x.price])) !== JSON.stringify(before.units.map((x) => [x.unitId, x.price]));
  const availabilityOnly = keys.every((k) => k === 'available');
  if (availabilityOnly) requirePerm(ctx, 'products.availability.update');
  else {
    requirePerm(ctx, 'products.update');
    if (b.available !== undefined && b.available !== before.available) requirePerm(ctx, 'products.availability.update');
    if (priceChanged) requirePerm(ctx, 'products.price.update');
  }
  const next: Product = {
    id: cur.id,
    name: b.name !== undefined ? cleanText(b.name, 120, 'اسم المنتج') : before.name,
    altNames: b.altNames !== undefined ? strArr(b.altNames, 'الأسماء البديلة', 10) : before.altNames,
    sku: b.sku !== undefined ? cleanText(b.sku, 40, 'رمز المنتج').toUpperCase() : before.sku,
    barcodes: b.barcodes !== undefined ? strArr(b.barcodes, 'الباركود', 10, 30) : before.barcodes,
    categoryId: b.categoryId !== undefined ? cleanText(b.categoryId, 40, 'التصنيف') : before.categoryId,
    baseUnitId: b.baseUnitId !== undefined ? cleanText(b.baseUnitId, 40, 'الوحدة الأساسية') : before.baseUnitId,
    units: b.units !== undefined ? parseUnits(b.units) : before.units,
    available: b.available !== undefined ? b.available === true : before.available,
    visible: b.visible !== undefined ? b.visible === true : before.visible,
    ...(b.brand !== undefined ? (b.brand ? { brand: cleanText(b.brand, 60, 'العلامة التجارية') } : {}) : before.brand ? { brand: before.brand } : {}),
    ...(b.defaultUnitId !== undefined ? (b.defaultUnitId ? { defaultUnitId: cleanText(b.defaultUnitId, 40, 'وحدة الطلب الافتراضية') } : {}) : before.defaultUnitId ? { defaultUnitId: before.defaultUnitId } : {}),
  };
  const problems = validateProduct(next, await unitsMap(ctx));
  if (problems.length) throw fail('VALIDATION', 'بيانات المنتج غير مكتملة', { problems });
  if (next.categoryId !== before.categoryId && !(await ctx.s.db.get(`categories/${next.categoryId}`))) throw fail('VALIDATION', 'التصنيف غير موجود');
  const extra: Data = { updatedAt: ctx.s.now(), updatedBy: u.uid };
  if (b.description !== undefined) extra.description = cleanText(b.description, 2000, 'الوصف', false);
  if (b.images !== undefined) {
    extra.images = parseImages(b.images);
    await assertImagesExist(ctx, extra.images as Array<{ key: string; thumb: string }>);
  }
  if (b.order !== undefined) extra.order = Number.isInteger(b.order) ? b.order : 999;
  if (b.featured !== undefined) extra.featured = b.featured === true;
  const doc = productDoc(next, extra);
  await ctx.s.db.runTransaction(async (tx) => {
    if (next.sku !== before.sku) {
      if (await tx.get(`skus/${next.sku}`)) throw fail('CONFLICT', 'رمز المنتج مستخدم لمنتج آخر');
      tx.write({ kind: 'delete', path: `skus/${before.sku}` });
      tx.write({ kind: 'create', path: `skus/${next.sku}`, data: { productId: cur.id } });
    }
    if (b.cost !== undefined) {
      if (!u.permissions.has('products.cost.view')) throw fail('FORBIDDEN', 'تعديل التكلفة يتطلب صلاحية التكلفة');
      if (!Number.isSafeInteger(b.cost) || (b.cost as number) < 0) throw fail('VALIDATION', 'التكلفة بالأغورة');
      tx.write({ kind: 'set', path: `products/${cur.id}/private/cost`, data: { cost: b.cost, updatedAt: ctx.s.now() } });
    }
    tx.write({ kind: 'update', path: `products/${cur.id}`, data: doc });
    tx.write(auditWrite(ctx, { action: priceChanged ? 'products.price' : availabilityOnly ? 'products.availability' : 'products.update', entity: { kind: 'product', id: cur.id }, before: cur.data, after: doc }));
  });
  await bumpCatalog(ctx);
  return json({ product: { ...doc } });
}

async function archiveProduct(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'products.delete');
  const cur = await ctx.s.db.get(`products/${p.id}`);
  if (!cur || cur.data.archived) throw fail('NOT_FOUND', 'المنتج غير موجود');
  await ctx.s.db.commit([
    { kind: 'update', path: `products/${cur.id}`, data: { archived: true, visible: false, available: false, archivedAt: ctx.s.now() } },
    { kind: 'delete', path: `skus/${cur.data.sku}` },
    auditWrite(ctx, { action: 'products.archive', entity: { kind: 'product', id: cur.id }, before: cur.data }),
  ]);
  await bumpCatalog(ctx);
  return json({ ok: true });
}

// ===== الصور =====
/** رفع صورة منتج: PNG/WebP بخلفية شفافة فقط، ≤ 5MB، 64–4096px. تظهر للجميع فور ربطها بالمنتج. */
async function uploadProductImage(ctx: Ctx) {
  requirePerm(ctx, 'products.update');
  const len = Number(ctx.req.headers.get('content-length') ?? 0);
  if (len > 5_000_000) throw fail('PAYLOAD_TOO_LARGE', 'حجم الصورة أكبر من 5 ميغابايت');
  const buf = await ctx.req.arrayBuffer();
  if (buf.byteLength > 5_000_000) throw fail('PAYLOAD_TOO_LARGE', 'حجم الصورة أكبر من 5 ميغابايت');
  const info = inspectImage(buf);
  if (!info) throw fail('IMAGE_TYPE', 'الصيغ المقبولة: PNG أو WebP');
  if (!info.alpha) throw fail('IMAGE_NOT_CUTOUT', 'الصورة يجب أن تكون مفرّغة بخلفية شفافة');
  if (info.width < 64 || info.height < 64 || info.width > 4096 || info.height > 4096) throw fail('IMAGE_SIZE', 'أبعاد الصورة بين 64 و4096 بكسل');
  const key = `products/${ctx.s.id()}.${info.type}`;
  await ctx.s.files.put(key, buf, info.type === 'png' ? 'image/png' : 'image/webp');
  await ctx.s.db.commit([auditWrite(ctx, { action: 'files.upload', entity: { kind: 'file', id: key }, after: { width: info.width, height: info.height, bytes: buf.byteLength } })]);
  return json({ key, width: info.width, height: info.height }, 201);
}

async function serveProductImage(ctx: Ctx, p: Record<string, string>) {
  if (!/^[a-z0-9]{8,40}\.(png|webp)$/.test(p.name!)) throw fail('NOT_FOUND', 'الملف غير موجود');
  const f = await ctx.s.files.get(`products/${p.name}`);
  if (!f) throw fail('NOT_FOUND', 'الملف غير موجود');
  return new Response(f.body, { headers: { 'content-type': f.contentType, 'cache-control': 'public, max-age=31536000, immutable' } });
}

export function catalogRoutes(r: Router<Ctx>) {
  r.on('POST', '/admin/categories', createCategory).on('PATCH', '/admin/categories/:id', updateCategory).on('DELETE', '/admin/categories/:id', deleteCategory)
    .on('PUT', '/admin/units/:id', upsertUnit).on('DELETE', '/admin/units/:id', deleteUnit)
    .on('POST', '/admin/products', createProduct).on('PATCH', '/admin/products/:id', updateProduct).on('DELETE', '/admin/products/:id', archiveProduct)
    .on('POST', '/admin/uploads/product-image', uploadProductImage).on('GET', '/files/products/:name', serveProductImage);
}
