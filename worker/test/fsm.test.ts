import { describe, expect, it } from 'vitest';
import { availableTransitions, checkTransition } from '../src/domain/fsm';
import { effectivePermissions, resolveHome, roleMap } from '../src/domain/permissions';

const roles = roleMap();
const perms = (...r: string[]) => effectivePermissions({ roles: r }, roles);

describe('الصلاحيات الفعلية', () => {
  it('مالك النظام يملك كل شيء بما فيه المضاف وقت التشغيل', () => {
    const p = effectivePermissions({ roles: ['super_admin'] }, roles, ['reports.custom']);
    expect(p.has('settings.manage') && p.has('reports.custom')).toBe(true);
  });
  it('اتحاد الأدوار + منح − حجب، وتجاهل غير المعروف', () => {
    const p = effectivePermissions({ roles: ['orders_employee', 'accountant', 'ghost'], grant: ['delivery.assign', 'fake.perm'], deny: ['payments.reverse'] }, roles);
    expect(p.has('orders.confirm') && p.has('payments.create') && p.has('delivery.assign')).toBe(true);
    expect(p.has('payments.reverse') || p.has('fake.perm')).toBe(false);
  });
  it('التوجيه بعد الدخول وسياقات متعددة', () => {
    expect(resolveHome(['shop_owner'], roles)).toEqual({ home: 'shop.home', contexts: ['shop.home'] });
    expect(resolveHome(['delivery_manager', 'accountant'], roles)).toEqual({ home: 'admin.finance', contexts: ['admin.finance', 'admin.delivery'] });
    expect(resolveHome([], roles).home).toBe('none');
  });
});

describe('آلة حالات الطلب على الخادم', () => {
  const g = { items_available: true, credit_limit_ok: true, agent_assigned: true, assigned_to_actor: true, proof_present: true, invoice_settled: true, change_request_pending: true };
  it('موظف الطلبات يؤكد طلباً قيد المراجعة ويُصدر الفاتورة', () => {
    const r = checkTransition({ from: 'under_review', to: 'confirmed', actor: 'staff', permissions: perms('orders_employee'), guards: g });
    expect(r.ok && r.value.effects).toContain('issue_invoice');
  });
  it('لا تخطي للمراحل', () => {
    expect(checkTransition({ from: 'new', to: 'delivered', actor: 'staff', permissions: perms('super_admin'), guards: g })).toMatchObject({ code: 'TRANSITION_NOT_ALLOWED' });
  });
  it('الحالة النهائية مغلقة', () => {
    expect(checkTransition({ from: 'cancelled', to: 'new', actor: 'staff', permissions: perms('super_admin'), guards: g })).toMatchObject({ code: 'ORDER_CLOSED' });
  });
  it('الفاعل الخطأ والصلاحية الناقصة', () => {
    expect(checkTransition({ from: 'out_for_delivery', to: 'delivered', actor: 'staff', permissions: perms('super_admin'), guards: g })).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' });
    expect(checkTransition({ from: 'under_review', to: 'confirmed', actor: 'staff', permissions: perms('accountant'), guards: g })).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('السبب إلزامي للرفض والإلغاء', () => {
    const base = { from: 'new', to: 'rejected', actor: 'staff' as const, permissions: perms('orders_employee'), guards: g };
    expect(checkTransition(base)).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(checkTransition({ ...base, reason: 'لا' })).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(checkTransition({ ...base, reason: 'منتجات غير متوفرة' }).ok).toBe(true);
  });
  it('الشروط: لا إخراج بلا مندوب، ولا تسليم بلا إثبات', () => {
    expect(checkTransition({ from: 'ready_for_pickup', to: 'out_for_delivery', actor: 'staff', permissions: perms('delivery_manager'), guards: { ...g, agent_assigned: false } })).toMatchObject({ code: 'GUARD_FAILED', details: { guards: ['agent_assigned'] } });
    expect(checkTransition({ from: 'on_the_way', to: 'delivered', actor: 'agent', permissions: perms('delivery_agent'), guards: { assigned_to_actor: true } })).toMatchObject({ code: 'GUARD_FAILED' });
  });
  it('الأزرار المتاحة حسب الدور فقط', () => {
    expect(availableTransitions('new', 'shop', perms('shop_owner')).map((t) => t.to)).toEqual(['cancelled']);
    expect(availableTransitions('new', 'shop', perms('shop_employee'))).toEqual([]);
    expect(availableTransitions('under_review', 'staff', perms('accountant'))).toEqual([]);
  });
});
