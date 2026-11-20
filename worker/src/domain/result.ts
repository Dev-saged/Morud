// نتيجة موحدة: لا استثناءات في منطق الأعمال، كل فشل له رمز ثابت تفهمه الواجهات
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; code: string; message: string; details?: Record<string, unknown> };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (code: string, message: string, details?: Record<string, unknown>): Err =>
  details ? { ok: false, code, message, details } : { ok: false, code, message };
