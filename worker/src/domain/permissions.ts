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

// رموز مختصرة تُوضع في custom claims لتستخدمها Firestore Rules (حد الحجم 1000 بايت)
export const RULE_CLAIMS: Readonly<Record<string, string>> = {
  'orders.view': 'ov', 'shops.view': 'sv', 'invoices.view': 'iv', 'accounts.view': 'av', 'audit.view': 'au',
  'delivery.view': 'dv', 'delivery.track.view': 'dt', 'users.manage': 'um', 'roles.manage': 'rm', 'reports.view': 'rv',
  'products.cost.view': 'pc', 'backups.manage': 'bm', 'support.manage': 'sm', 'settings.manage': 'st',
  'shop.orders.view_all': 'sa', 'shop.invoices.view': 'si', 'shop.statement.view': 'ss',
};

export function ruleClaims(perms: ReadonlySet<string>, kinds: ReadonlySet<string>, shopIds: readonly string[]) {
  return {
    rp: Object.entries(RULE_CLAIMS).filter(([p]) => perms.has(p)).map(([, c]) => c),
    k: [...kinds].sort(),
    sh: shopIds.slice(0, 20),
  };
}

// سياسة كلمة المرور: 8 أحرف على الأقل، حرف ورقم، بحد أقصى 128
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'PASSWORD_TOO_SHORT';
  if (pw.length > 128) return 'PASSWORD_TOO_LONG';
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) return 'PASSWORD_WEAK';
  return null;
}

/** توحيد معرّف الدخول: بريد، هاتف (059… أو +970/972)، أو اسم مستخدم. */
export function loginKey(identifier: string): string | null {
  const s = identifier.trim().toLowerCase().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!s || s.length > 120) return null;
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? `e:${s}` : null;
  const digits = s.replace(/[\s()+-]/g, '');
  if (/^\d{9,15}$/.test(digits)) {
    const local = digits.replace(/^(00)?(970|972)/, '0');
    return /^0\d{8,9}$/.test(local) ? `p:${local}` : null;
  }
  return /^[a-z0-9._-]{3,32}$/.test(s) ? `u:${s}` : null;
}
