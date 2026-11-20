import seed from '../../../../spec/seed.json';
import type { Data, Db } from '../../infra/db';
import { auditWrite, requirePerm, requireUser, type Ctx } from '../context';
import { cleanText, fail, json, readJson, type Router } from '../http';

export const DEFAULT_SETTINGS = seed.settings as Data;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadSettings(db: Db): Promise<Data> {
  return { ...DEFAULT_SETTINGS, ...((await db.get('settings/system'))?.data ?? {}) };
}

export function getSettings(ctx: Ctx): Promise<Data> {
  return loadSettings(ctx.s.db);
}

/** تحقق صارم من الإعدادات العامة (SRS 7.1 و13). */
export function validateSettings(b: Data): Data {
  const out: Data = {};
  const has = (k: string) => b[k] !== undefined;
  if (has('platformName')) out.platformName = cleanText(b.platformName, 60, 'اسم المنصة');
  if (has('supplier')) {
    const s = b.supplier as Data;
    if (!s || typeof s !== 'object') throw fail('VALIDATION', 'بيانات المورد غير صالحة');
    out.supplier = { name: cleanText(s.name, 100, 'اسم المورد'), phone: cleanText(s.phone, 30, 'هاتف المورد', false), address: cleanText(s.address, 200, 'عنوان المورد', false), taxId: cleanText(s.taxId, 40, 'الرقم الضريبي', false) };
  }
  if (has('workDays')) {
    const d = b.workDays;
    if (!Array.isArray(d) || d.length === 0 || d.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) throw fail('VALIDATION', 'أيام العمل غير صالحة');
    out.workDays = [...new Set(d as number[])].sort();
  }
  for (const k of ['orderIntakeStart', 'orderIntakeEnd', 'deliveryStart', 'deliveryEnd']) {
    if (has(k)) {
      if (typeof b[k] !== 'string' || !TIME.test(b[k] as string)) throw fail('VALIDATION', 'صيغة الوقت HH:MM', { field: k });
      out[k] = b[k];
    }
  }
  const start = (out.orderIntakeStart ?? DEFAULT_SETTINGS.orderIntakeStart) as string;
  const end = (out.orderIntakeEnd ?? DEFAULT_SETTINGS.orderIntakeEnd) as string;
  if ((has('orderIntakeStart') || has('orderIntakeEnd')) && start >= end) throw fail('VALIDATION', 'بداية استقبال الطلبات يجب أن تسبق نهايتها');
  if (has('slaWorkingHours')) {
    const h = b.slaWorkingHours;
    if (typeof h !== 'number' || h < 0.5 || h > 168) throw fail('VALIDATION', 'مهلة التوصيل بين نصف ساعة و168 ساعة عمل');
    out.slaWorkingHours = h;
  }
  if (has('defaultPrepMinutes')) {
    if (!Number.isInteger(b.defaultPrepMinutes) || (b.defaultPrepMinutes as number) < 0 || (b.defaultPrepMinutes as number) > 1440) throw fail('VALIDATION', 'مدة التجهيز غير صالحة');
    out.defaultPrepMinutes = b.defaultPrepMinutes;
  }
  if (has('holidays')) {
    if (!Array.isArray(b.holidays) || b.holidays.length > 400 || b.holidays.some((x) => typeof x !== 'string' || !DATE.test(x))) throw fail('VALIDATION', 'العطلات بصيغة YYYY-MM-DD');
    out.holidays = [...new Set(b.holidays as string[])].sort();
  }
  if (has('closures')) {
    const c = b.closures;
    if (!Array.isArray(c) || c.length > 100 || c.some((x) => !x || typeof x !== 'object' || !Number.isSafeInteger((x as Data).from) || !Number.isSafeInteger((x as Data).to) || ((x as Data).from as number) >= ((x as Data).to as number))) {
      throw fail('VALIDATION', 'فترات الإغلاق غير صالحة');
    }
    out.closures = (c as Data[]).map((x) => ({ from: x.from, to: x.to, reason: cleanText(x.reason, 200, 'سبب الإغلاق', false) }));
  }
  if (has('paymentMethods')) {
    const pm = b.paymentMethods;
    if (!Array.isArray(pm) || pm.length === 0 || pm.length > 10) throw fail('VALIDATION', 'طرق الدفع غير صالحة');
    out.paymentMethods = (pm as Data[]).map((m) => {
      if (!m || typeof m.id !== 'string' || !/^[a-z_]{2,30}$/.test(m.id)) throw fail('VALIDATION', 'معرّف طريقة الدفع غير صالح');
      return { id: m.id, label: cleanText(m.label, 40, 'اسم طريقة الدفع'), enabled: m.enabled === true };
    });
    if (!(out.paymentMethods as Data[]).some((m) => m.id === 'cash' && m.enabled)) throw fail('VALIDATION', 'الدفع النقدي يجب أن يبقى مفعّلاً');
  }
  if (has('currency')) {
    if (typeof b.currency !== 'string' || !/^[A-Z]{3}$/.test(b.currency)) throw fail('VALIDATION', 'رمز العملة غير صالح');
    out.currency = b.currency;
  }
  if (has('currencyDecimals')) {
    if (b.currencyDecimals !== 2) throw fail('VALIDATION', 'النظام يعمل بمنزلتين عشريتين (أغورة)');
    out.currencyDecimals = 2;
  }
  if (has('timezone')) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: String(b.timezone) });
    } catch {
      throw fail('VALIDATION', 'المنطقة الزمنية غير صالحة');
    }
    out.timezone = b.timezone;
  }
  for (const k of ['creditBlocksDeferredOrders', 'newOrderSound']) if (has(k)) out[k] = b[k] === true;
  if (has('creditWarnPercent')) {
    if (!Number.isInteger(b.creditWarnPercent) || (b.creditWarnPercent as number) < 1 || (b.creditWarnPercent as number) > 100) throw fail('VALIDATION', 'نسبة التنبيه 1–100');
    out.creditWarnPercent = b.creditWarnPercent;
  }
  if (has('backupRetentionDays')) {
    if (!Number.isInteger(b.backupRetentionDays) || (b.backupRetentionDays as number) < 7 || (b.backupRetentionDays as number) > 365) throw fail('VALIDATION', 'الاحتفاظ بالنسخ 7–365 يوماً');
    out.backupRetentionDays = b.backupRetentionDays;
  }
  if (has('shopCancelStates')) {
    const allowed = ['new', 'under_review', 'awaiting_shop_approval'];
    if (!Array.isArray(b.shopCancelStates) || b.shopCancelStates.some((x) => !allowed.includes(x as string))) throw fail('VALIDATION', 'حالات إلغاء المحل غير صالحة');
    out.shopCancelStates = b.shopCancelStates;
  }
  for (const k of ['cancellationPolicy', 'returnsPolicy']) if (has(k)) out[k] = cleanText(b[k], 2000, k, false);
  const unknown = Object.keys(b).filter((k) => !(k in out));
  if (unknown.length) throw fail('VALIDATION', 'حقول غير معروفة', { fields: unknown });
  return out;
}

async function read(ctx: Ctx) {
  requireUser(ctx);
  return json({ settings: await getSettings(ctx) });
}

async function update(ctx: Ctx) {
  requirePerm(ctx, 'settings.manage');
  const patch = validateSettings(await readJson(ctx.req));
  const before = await getSettings(ctx);
  await ctx.s.db.commit([
    { kind: 'set', path: 'settings/system', data: { ...patch, updatedAt: ctx.s.now(), updatedBy: ctx.user!.uid }, merge: true },
    auditWrite(ctx, { action: 'settings.update', entity: { kind: 'settings', id: 'system' }, before, after: patch }),
  ]);
  return json({ settings: { ...before, ...patch } });
}

export function settingsRoutes(r: Router<Ctx>) {
  r.on('GET', '/settings', read).on('PATCH', '/admin/settings', update);
}
