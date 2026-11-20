import spec from '../../../spec/order-states.json';
import { err, ok, type Result } from './result';

export type OrderStatus = (typeof spec.states)[number]['id'];
export type Actor = 'staff' | 'shop' | 'agent' | 'system';
export interface Transition {
  from: string;
  to: string;
  actor: Actor;
  permission?: string;
  reason?: boolean;
  guards?: string[];
  effects?: string[];
}

export const STATES = spec.states;
export const TRANSITIONS: readonly Transition[] = spec.transitions as Transition[];
export const TERMINAL = new Set(spec.states.filter((s) => 'terminal' in s && s.terminal).map((s) => s.id));

export interface TransitionRequest {
  from: string;
  to: string;
  actor: Actor;
  permissions: ReadonlySet<string>;
  reason?: string;
  guards: Readonly<Record<string, boolean>>; // يحسبها الخادم من البيانات الفعلية
}

/** يتحقق من انتقال حالة الطلب: مسموح؟ من الفاعل الصحيح؟ بالصلاحية؟ بسبب؟ وكل الشروط متحققة؟ */
export function checkTransition(req: TransitionRequest): Result<Transition> {
  if (TERMINAL.has(req.from)) return err('ORDER_CLOSED', 'الطلب في حالة نهائية لا يمكن تغييرها');
  const candidates = TRANSITIONS.filter((t) => t.from === req.from && t.to === req.to);
  if (candidates.length === 0) return err('TRANSITION_NOT_ALLOWED', 'هذا الانتقال غير مسموح في دورة الطلب', { from: req.from, to: req.to });
  const t = candidates.find((c) => c.actor === req.actor);
  if (!t) return err('ACTOR_NOT_ALLOWED', 'ليس لك تنفيذ هذا الانتقال');
  if (t.permission && !req.permissions.has(t.permission)) return err('FORBIDDEN', 'لا تملك الصلاحية اللازمة', { permission: t.permission });
  if (t.reason && !(req.reason && req.reason.trim().length >= 3)) return err('REASON_REQUIRED', 'يجب ذكر سبب واضح لهذا الإجراء');
  const failed = (t.guards ?? []).filter((g) => req.guards[g] !== true);
  if (failed.length) return err('GUARD_FAILED', 'شروط الانتقال غير مكتملة', { guards: failed });
  return ok(t);
}

/** الانتقالات المتاحة لمستخدم من حالة معينة — لعرض الأزرار الحقيقية فقط في الواجهة. */
export function availableTransitions(from: string, actor: Actor, permissions: ReadonlySet<string>): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && t.actor === actor && (!t.permission || permissions.has(t.permission)));
}
