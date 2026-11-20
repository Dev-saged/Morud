import fsm from '../../../spec/order-states.json';
import { formatMoney } from '../../../worker/src/domain/money';
import { formatQty } from '../../../worker/src/domain/quantity';

export { formatMoney, formatQty };

export const STATUS = Object.fromEntries(fsm.states.map((s) => [s.id, { label: s.label, tone: s.tone }])) as Record<string, { label: string; tone: string }>;

// مراحل شريط التقدم للمحل
export const STAGES = ['new', 'under_review', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

export function stageIndex(status: string): number {
  const map: Record<string, string> = { awaiting_shop_approval: 'under_review', on_the_way: 'out_for_delivery', financially_completed: 'delivered', returned: 'delivered' };
  return STAGES.indexOf(map[status] ?? status);
}

export function formatDate(ms: number, tz = 'Asia/Gaza'): string {
  return new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} س ${m % 60} د` : `${m} د`;
}
