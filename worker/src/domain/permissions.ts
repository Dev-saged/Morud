import catalog from '../../../spec/permissions.json';
import rolesSpec from '../../../spec/roles.json';

export type PermissionId = string;
export interface RoleDef {
  id: string;
  label: string;
  kind: 'staff' | 'shop' | 'agent';
  home: string;
  permissions: string[];
  protected?: boolean;
}

export const PERMISSIONS: ReadonlySet<string> = new Set(catalog.permissions.map((p) => p.id));
export const DEFAULT_ROLES: readonly RoleDef[] = rolesSpec.roles as RoleDef[];

export interface Grants {
  roles: string[];
  grant?: string[];
  deny?: string[];
}

/** الصلاحيات الفعلية = اتحاد صلاحيات الأدوار + المنح − الحجب. «*» تعني الكتالوج كاملاً (مع ما يُضاف وقت التشغيل). */
export function effectivePermissions(g: Grants, roleDefs: ReadonlyMap<string, RoleDef>, extra: Iterable<string> = []): Set<string> {
  const all = new Set<string>([...PERMISSIONS, ...extra]);
  const out = new Set<string>();
  for (const id of g.roles) {
    const r = roleDefs.get(id);
    if (!r) continue;
    for (const p of r.permissions) {
      if (p === '*') all.forEach((x) => out.add(x));
      else if (all.has(p)) out.add(p);
    }
  }
  for (const p of g.grant ?? []) if (all.has(p)) out.add(p);
  for (const p of g.deny ?? []) out.delete(p);
  return out;
}

const HOME_PRIORITY = ['admin.dashboard', 'admin.orders', 'admin.finance', 'admin.products', 'admin.delivery', 'agent.tasks', 'shop.home'];

/** الواجهة التي يُوجَّه إليها المستخدم بعد الدخول، مع قائمة السياقات المتاحة إن تعددت. */
export function resolveHome(roleIds: readonly string[], roleDefs: ReadonlyMap<string, RoleDef>): { home: string; contexts: string[] } {
  const homes = [...new Set(roleIds.map((r) => roleDefs.get(r)?.home).filter((h): h is string => !!h))];
  homes.sort((a, b) => HOME_PRIORITY.indexOf(a) - HOME_PRIORITY.indexOf(b));
  return { home: homes[0] ?? 'none', contexts: homes };
}

export function roleMap(roles: readonly RoleDef[] = DEFAULT_ROLES): Map<string, RoleDef> {
  return new Map(roles.map((r) => [r.id, r]));
}
