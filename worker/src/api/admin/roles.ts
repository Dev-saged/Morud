import catalog from '../../../../spec/permissions.json';
import { DEFAULT_ROLES } from '../../domain/permissions';
import { auditWrite, loadRoles, requirePerm, requireUser, type Ctx } from '../context';
import { cleanText, fail, json, readJson, type Router } from '../http';

const SCOPE_FOR_KIND: Record<string, string[]> = { staff: ['staff', 'any'], shop: ['shop', 'any'], agent: ['agent', 'any'] };
const HOMES = ['admin.dashboard', 'admin.orders', 'admin.finance', 'admin.products', 'admin.delivery', 'agent.tasks', 'shop.home'];

async function allPermissions(ctx: Ctx) {
  const extra = ((await ctx.s.db.get('system/permissions'))?.data.extra as Array<{ id: string; scope: string; label: string }>) ?? [];
  return [...catalog.permissions, ...extra];
}

async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!u.permissions.has('roles.manage') && !u.permissions.has('users.manage')) throw fail('FORBIDDEN', 'لا تملك صلاحية عرض الأدوار');
  const defs = await loadRoles(ctx.s.db);
  return json({ roles: [...defs.values()], permissions: await allPermissions(ctx) });
}

async function upsert(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'roles.manage');
  const id = p.id!;
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(id)) throw fail('VALIDATION', 'معرّف الدور: أحرف لاتينية صغيرة وأرقام و _');
  if (id === 'super_admin') throw fail('FORBIDDEN', 'دور مالك النظام محمي');
  const body = await readJson(ctx.req);
  const label = cleanText(body.label, 60, 'اسم الدور');
  const kind = String(body.kind);
  if (!SCOPE_FOR_KIND[kind]) throw fail('VALIDATION', 'نوع الدور غير صالح');
  const home = String(body.home);
  if (!HOMES.includes(home) || !home.startsWith(kind === 'staff' ? 'admin.' : kind === 'shop' ? 'shop.' : 'agent.')) throw fail('VALIDATION', 'الواجهة الرئيسية لا تناسب نوع الدور');
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) throw fail('VALIDATION', 'اختر صلاحيات الدور');
  const perms = await allPermissions(ctx);
  const scope = new Map(perms.map((x) => [x.id, x.scope]));
  const bad = (body.permissions as unknown[]).filter((x) => typeof x !== 'string' || !SCOPE_FOR_KIND[kind]!.includes(scope.get(x) ?? '-'));
  if (bad.length) throw fail('VALIDATION', 'صلاحيات غير معروفة أو لا تناسب نوع الدور', { permissions: bad });
  const before = (await ctx.s.db.get(`roles/${id}`))?.data ?? DEFAULT_ROLES.find((r) => r.id === id) ?? null;
  const data = { label, kind, home, permissions: [...new Set(body.permissions as string[])], updatedAt: ctx.s.now() };
  await ctx.s.db.commit([{ kind: 'set', path: `roles/${id}`, data }, auditWrite(ctx, { action: 'roles.upsert', entity: { kind: 'role', id }, before: before as never, after: data })]);
  return json({ role: { id, ...data } });
}

async function remove(ctx: Ctx, p: Record<string, string>) {
  requirePerm(ctx, 'roles.manage');
  const id = p.id!;
  if (DEFAULT_ROLES.some((r) => r.id === id)) throw fail('FORBIDDEN', 'الأدوار الأساسية لا تُحذف، يمكن تعديلها');
  if ((await ctx.s.db.query({ collection: 'users', where: [['roles', 'array-contains', id]], limit: 1 })).length) throw fail('CONFLICT', 'الدور مُسند لمستخدمين، أزله منهم أولاً');
  const cur = await ctx.s.db.get(`roles/${id}`);
  if (!cur) throw fail('NOT_FOUND', 'الدور غير موجود');
  await ctx.s.db.commit([{ kind: 'delete', path: `roles/${id}` }, auditWrite(ctx, { action: 'roles.delete', entity: { kind: 'role', id }, before: cur.data })]);
  return json({ ok: true });
}

/** إضافة صلاحية جديدة وقت التشغيل دون إعادة بناء التطبيق (SRS 2.4). */
async function addPermission(ctx: Ctx) {
  requirePerm(ctx, 'roles.manage');
  const body = await readJson(ctx.req);
  const id = cleanText(body.id, 60, 'معرّف الصلاحية');
  if (!/^[a-z]+(\.[a-z_]+){1,3}$/.test(id)) throw fail('VALIDATION', 'صيغة الصلاحية: section.action');
  const scope = String(body.scope);
  if (!['staff', 'shop', 'agent', 'any'].includes(scope)) throw fail('VALIDATION', 'نطاق غير صالح');
  const label = cleanText(body.label, 80, 'الوصف');
  if ((await allPermissions(ctx)).some((x) => x.id === id)) throw fail('CONFLICT', 'الصلاحية موجودة');
  const cur = ((await ctx.s.db.get('system/permissions'))?.data.extra as unknown[]) ?? [];
  await ctx.s.db.commit([{ kind: 'set', path: 'system/permissions', data: { extra: [...cur, { id, scope, label }] } }, auditWrite(ctx, { action: 'permissions.add', entity: { kind: 'permission', id }, after: { scope, label } })]);
  return json({ ok: true }, 201);
}

export function roleRoutes(r: Router<Ctx>) {
  r.on('GET', '/admin/roles', list).on('PUT', '/admin/roles/:id', upsert).on('DELETE', '/admin/roles/:id', remove).on('POST', '/admin/permissions', addPermission);
}
