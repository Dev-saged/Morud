import { describe, expect, it } from 'vitest';
import { addWorkingMinutes, computeSla, slaProgress, workWindows, zonedToUtc, type WorkSettings } from '../src/domain/sla';

const S: WorkSettings = { timezone: 'Asia/Gaza', workDays: [0, 1, 2, 3, 4, 5, 6], orderIntakeStart: '06:00', orderIntakeEnd: '23:00', slaWorkingHours: 6, holidays: [] };
const local = (y: number, m: number, d: number, h: number, min = 0) => zonedToUtc(y, m, d, h, min, 'Asia/Gaza');
const H = 3_600_000;

describe('المهلة بساعات العمل (SRS 7)', () => {
  it('طلب الساعة 12 ليلاً يبدأ عدّه 6 صباحاً ويستحق 12 ظهراً', () => {
    const r = computeSla(local(2026, 11, 21, 0, 0), S);
    expect(r.clockStartAt).toBe(local(2026, 11, 21, 6));
    expect(r.dueAt).toBe(local(2026, 11, 21, 12));
    expect(r.estimated).toBe(true);
  });
  it('طلب الساعة 9 مساءً: ساعتان اليوم و4 غداً', () => {
    expect(computeSla(local(2026, 11, 20, 21), S).dueAt).toBe(local(2026, 11, 21, 10));
  });
  it('يتخطى العطل وأيام عدم العمل', () => {
    const s = { ...S, holidays: ['2026-11-21'], workDays: [0, 1, 2, 3, 4, 6] }; // الجمعة عطلة
    // الخميس 19 الساعة 22 → ساعة الخميس، الجمعة 20 عطلة أسبوعية، السبت 21 عطلة رسمية، الأحد 22 خمس ساعات
    expect(computeSla(local(2026, 11, 19, 22), s).dueAt).toBe(local(2026, 11, 22, 11));
  });
  it('الإغلاق الاستثنائي يوقف العداد', () => {
    const s = { ...S, closures: [{ from: local(2026, 11, 20, 8), to: local(2026, 11, 20, 10) }] };
    expect(computeSla(local(2026, 11, 20, 7), s).dueAt).toBe(local(2026, 11, 20, 15));
    expect(workWindows(local(2026, 11, 20, 12), { ...S, closures: [{ from: local(2026, 11, 20, 5), to: local(2026, 11, 20, 23, 30) }] })).toEqual([]);
    expect(workWindows(local(2026, 11, 20, 12), { ...S, closures: [{ from: local(2026, 11, 20, 1), to: local(2026, 11, 20, 2) }] })).toHaveLength(1);
  });
  it('يحترم التوقيت الصيفي في غزة', () => {
    const summer = computeSla(local(2026, 7, 1, 7), S);
    expect(summer.dueAt - summer.clockStartAt).toBe(6 * H);
    expect(local(2026, 7, 1, 7)).toBe(Date.UTC(2026, 6, 1, 4)); // UTC+3 صيفاً
    expect(local(2026, 1, 1, 7)).toBe(Date.UTC(2026, 0, 1, 5)); // UTC+2 شتاءً
  });
  it('موعد مؤكد يدوياً ليس تقديرياً', () => {
    const due = local(2026, 11, 20, 18);
    expect(computeSla(local(2026, 11, 20, 9), S, due)).toMatchObject({ dueAt: due, estimated: false });
  });
  it('المؤقت: المنقضي والمتبقي والتأخر', () => {
    const sla = computeSla(local(2026, 11, 20, 0), S);
    expect(slaProgress(sla, local(2026, 11, 20, 5))).toMatchObject({ started: false, elapsed: 0, overdue: false });
    expect(slaProgress(sla, local(2026, 11, 20, 8))).toMatchObject({ elapsed: 2 * H, remaining: 4 * H, overdue: false });
    expect(slaProgress(sla, local(2026, 11, 20, 13))).toMatchObject({ remaining: 0, overdue: true });
  });
  it('إعدادات بلا أيام عمل تُرفض بوضوح', () => {
    expect(() => addWorkingMinutes(Date.UTC(2026, 0, 1), 60, { ...S, workDays: [] })).toThrow();
  });
});
