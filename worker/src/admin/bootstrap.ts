import seed from '../../../spec/seed.json';
import { createAccount, parseAccount, type AccountInput } from '../api/admin/accounts';
import type { Ctx, Services } from '../api/context';
import { fail } from '../api/http';

/**
 * التهيئة الأولى الآمنة: البيانات الأولية (التصنيفات، الوحدات، الإعدادات) + حساب مالك النظام الأول.
 * تعمل مرة واحدة فقط (وثيقة system/bootstrap تُنشأ بشرط عدم الوجود).
 */
export async function bootstrap(s: Services, owner: { username: string; displayName: string; phone?: string; email?: string; password?: string }) {
  if (await s.db.get('system/bootstrap')) throw fail('ALREADY_BOOTSTRAPPED', 'النظام مهيأ مسبقاً');
  // التحقق قبل كتابة علامة التهيئة، حتى لا يبقى النظام مهيأً بلا مالك
  const acc = parseAccount({ ...owner, roles: ['super_admin'], grant: [], deny: [], shopIds: [], expiresAt: null }) as AccountInput;
  const ctx: Ctx = { req: new Request('https://bootstrap.local/'), url: new URL('https://bootstrap.local/'), s, requestId: s.id(), ip: 'cli', device: 'bootstrap', workContext: null, user: null };
  await s.db.runTransaction(async (tx) => {
    if (await tx.get('system/bootstrap')) throw fail('ALREADY_BOOTSTRAPPED', 'النظام مهيأ مسبقاً');
    tx.write({ kind: 'create', path: 'system/bootstrap', data: { at: s.now(), by: owner.username } });
    for (const c of seed.categories) tx.write({ kind: 'set', path: `categories/${c.id}`, data: { name: c.name, order: c.order, parentId: null, hidden: false, icon: c.id, createdAt: s.now() } });
    for (const u of seed.units) tx.write({ kind: 'set', path: `units/${u.id}`, data: { name: u.name, kind: u.kind, allowFraction: u.allowFraction } });
    tx.write({ kind: 'set', path: 'settings/system', data: { ...seed.settings, supplier: { name: 'مورد', phone: '', address: '', taxId: '' } } });
  });
  return createAccount(ctx, acc);
}
