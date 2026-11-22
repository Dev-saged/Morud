// العمل بلا نت: نسخة من كل قراءة ناجحة، مفصولة لكل مستخدم (جهاز مشترك = لا تسريب بين الحسابات)
import { useEffect, useState } from 'react';

const PREFIX = 'mawred.c.';
const SKIP = /^\/(auth|files)\//;
type Entry = { at: number; data: unknown };

const key = (uid: string, path: string) => `${PREFIX}${uid}.${path}`;

export function cachePut(uid: string, path: string, data: unknown) {
  if (SKIP.test(path)) return;
  const v = JSON.stringify({ at: Date.now(), data } satisfies Entry);
  try { localStorage.setItem(key(uid, path), v); } catch {
    // الامتلاء: احذف أقدم النسخ لهذا المستخدم ثم أعد المحاولة مرة
    const mine = Object.keys(localStorage).filter((k) => k.startsWith(`${PREFIX}${uid}.`)).map((k) => [k, (JSON.parse(localStorage.getItem(k) ?? '{"at":0}') as Entry).at] as const).sort((a, b) => a[1] - b[1]);
    for (const [k] of mine.slice(0, Math.ceil(mine.length / 3))) localStorage.removeItem(k);
    try { localStorage.setItem(key(uid, path), v); } catch { /* تجاوز */ }
  }
}

export function cacheGet<T>(uid: string, path: string): { at: number; data: T } | null {
  try {
    const v = localStorage.getItem(key(uid, path));
    return v ? (JSON.parse(v) as { at: number; data: T }) : null;
  } catch { return null; }
}

/** يمسح كل ما حُفظ لمستخدم عند خروجه. */
export function clearOffline(uid: string) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${PREFIX}${uid}.`)) localStorage.removeItem(k);
    localStorage.removeItem('mawred.user.v1');
  } catch { /* تخزين غير متاح */ }
}

// حالة الاتصال: آخر وقت عُرضت فيه بيانات محفوظة بدل الحية
let staleSince: number | null = null;
const listeners = new Set<(v: number | null) => void>();
export function markStale(at: number | null) {
  if (staleSince === at) return;
  staleSince = at;
  for (const l of listeners) l(at);
}

/** «بلا اتصال — آخر تحديث …» يظهر في أي شاشة تعرض بيانات محفوظة. */
export function useStale(): number | null {
  const [v, setV] = useState(staleSince);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}

export function cacheUser(u: unknown) { try { localStorage.setItem('mawred.user.v1', JSON.stringify(u)); } catch { /* */ } }
export function cachedUser<T>(): T | null { try { return JSON.parse(localStorage.getItem('mawred.user.v1') ?? 'null') as T | null; } catch { return null; } }
