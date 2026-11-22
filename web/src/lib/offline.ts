// العمل بلا نت: نسخة من كل قراءة ناجحة، مفصولة لكل مستخدم (جهاز مشترك = لا تسريب بين الحسابات)
import { useEffect, useState } from 'react';

const PREFIX = 'mawred.c.';
const SKIP = /^\/(auth|files)\//;
type Entry = { at: number; data: unknown };

const key = (uid: string, path: string) => `${PREFIX}${uid}.${path}`;

// طبقة ذاكرة فوق التخزين: فتح أي شاشة سبق فتحها فوري بلا قراءة وتحليل JSON من القرص
const mem = new Map<string, Entry>();

/** للاختبارات ولمسح شامل. */
export function resetMemCache() { mem.clear(); }

export function cachePut(uid: string, path: string, data: unknown) {
  if (SKIP.test(path)) return;
  const entry: Entry = { at: Date.now(), data };
  mem.set(key(uid, path), entry);
  const v = JSON.stringify(entry);
  try { localStorage.setItem(key(uid, path), v); } catch {
    // الامتلاء: احذف أقدم النسخ لهذا المستخدم ثم أعد المحاولة مرة
    const mine = Object.keys(localStorage).filter((k) => k.startsWith(`${PREFIX}${uid}.`)).map((k) => [k, (JSON.parse(localStorage.getItem(k) ?? '{"at":0}') as Entry).at] as const).sort((a, b) => a[1] - b[1]);
    for (const [k] of mine.slice(0, Math.ceil(mine.length / 3))) localStorage.removeItem(k);
    try { localStorage.setItem(key(uid, path), v); } catch { /* تجاوز */ }
  }
}

export function cacheGet<T>(uid: string, path: string): { at: number; data: T } | null {
  const k = key(uid, path);
  const m = mem.get(k);
  if (m) return m as { at: number; data: T };
  try {
    const v = localStorage.getItem(k);
    if (!v) return null;
    const e = JSON.parse(v) as Entry;
    mem.set(k, e);
    return e as { at: number; data: T };
  } catch { return null; }
}

/** يمسح كل ما حُفظ لمستخدم عند خروجه. */
export function clearOffline(uid: string) {
  for (const k of [...mem.keys()]) if (k.startsWith(`${PREFIX}${uid}.`)) mem.delete(k);
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
