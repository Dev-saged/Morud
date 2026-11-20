// حساب المهلة بساعات العمل بتوقيت المنطقة (افتراضياً Asia/Gaza) — التخزين UTC دائماً
export interface WorkSettings {
  timezone: string;
  workDays: number[]; // 0 = الأحد
  orderIntakeStart: string; // "06:00"
  orderIntakeEnd: string; // "23:00"
  slaWorkingHours: number;
  holidays: string[]; // "YYYY-MM-DD" محلي
  closures?: Array<{ from: number; to: number }>; // إغلاق استثنائي UTC ms
}

const MIN = 60_000;

function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday!);
  return { y: +o.year!, m: +o.month!, d: +o.day!, h: +o.hour!, min: +o.minute!, wd };
}

// تحويل وقت محلي إلى UTC مع مراعاة التوقيت الصيفي
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = parts(t, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    const diff = asUtc - guess;
    if (diff === 0) break;
    t -= diff;
  }
  return t;
}

const hm = (s: string) => s.split(':').map(Number) as [number, number];
const dateKey = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** نوافذ العمل [start, end) بتوقيت UTC لليوم المحلي الذي يحتوي اللحظة ms، بعد طرح الإغلاقات. */
export function workWindows(ms: number, s: WorkSettings): Array<[number, number]> {
  const p = parts(ms, s.timezone);
  if (!s.workDays.includes(p.wd) || s.holidays.includes(dateKey(p.y, p.m, p.d))) return [];
  const [sh, sm] = hm(s.orderIntakeStart);
  const [eh, em] = hm(s.orderIntakeEnd);
  let windows: Array<[number, number]> = [[zonedToUtc(p.y, p.m, p.d, sh, sm, s.timezone), zonedToUtc(p.y, p.m, p.d, eh, em, s.timezone)]];
  for (const c of s.closures ?? []) {
    windows = windows.flatMap(([a, b]): Array<[number, number]> => {
      if (c.to <= a || c.from >= b) return [[a, b]];
      const out: Array<[number, number]> = [];
      if (c.from > a) out.push([a, c.from]);
      if (c.to < b) out.push([c.to, b]);
      return out;
    });
  }
  return windows;
}

function nextLocalDay(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const n = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return zonedToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 0, 0, tz);
}

/** يضيف دقائق عمل بدءاً من لحظة ما، ويعيد أول لحظة عمل (بدء العد) ولحظة الاستحقاق. */
export function addWorkingMinutes(from: number, minutes: number, s: WorkSettings): { clockStartAt: number; dueAt: number } {
  let cursor = from;
  let left = minutes;
  let clockStartAt: number | undefined;
  for (let guard = 0; guard < 800; guard++) {
    for (const [a, b] of workWindows(cursor, s)) {
      if (b <= cursor) continue;
      const start = Math.max(a, cursor);
      clockStartAt ??= start;
      const avail = (b - start) / MIN;
      if (left <= avail) return { clockStartAt, dueAt: start + left * MIN };
      left -= avail;
      cursor = b;
    }
    cursor = nextLocalDay(cursor, s.timezone);
  }
  throw new Error('لا توجد ساعات عمل في الإعدادات خلال سنتين');
}

export interface SlaState {
  submittedAt: number;
  clockStartAt: number;
  dueAt: number;
  estimated: boolean;
}

export function computeSla(submittedAt: number, s: WorkSettings, confirmedDueAt?: number): SlaState {
  const r = addWorkingMinutes(submittedAt, Math.round(s.slaWorkingHours * 60), s);
  return confirmedDueAt
    ? { submittedAt, clockStartAt: r.clockStartAt, dueAt: confirmedDueAt, estimated: false }
    : { submittedAt, ...r, estimated: true };
}

/** للمؤقت في واجهة المحل: المتبقي والمنقضي (ms) وهل تأخر. */
export function slaProgress(sla: SlaState, now: number) {
  return {
    elapsed: Math.max(0, now - sla.clockStartAt),
    remaining: Math.max(0, sla.dueAt - now),
    overdue: now > sla.dueAt,
    started: now >= sla.clockStartAt,
  };
}
