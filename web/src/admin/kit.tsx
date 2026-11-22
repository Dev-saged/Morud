import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../lib/session';

/** تحميل بيانات مع حالة خطأ وإعادة تحميل. */
/**
 * تحميل بيانات شاشة: تظهر آخر نسخة محفوظة فوراً (بلا انتظار ولا هيكل تحميل)،
 * ثم تُستبدل بالحديثة بصمت عند وصولها. شاشة لم تُفتح من قبل تعرض هيكل التحميل.
 */
export function useLoad<T>(path: string | null) {
  const { api } = useSession();
  const [data, setData] = useState<T | null>(() => (path ? api.cached<T>(path) : null));
  const [error, setError] = useState('');
  const current = useRef(path);
  const reload = useCallback(async () => {
    if (!path) return;
    setError('');
    try {
      const fresh = await api.get<T>(path);
      if (current.current === path) setData(fresh);
    } catch (e: any) { if (current.current === path) setError(e.message); }
  }, [api, path]);
  useEffect(() => {
    current.current = path;
    setData(path ? api.cached<T>(path) : null);
    void reload();
  }, [reload, api, path]);
  return { data, error, reload };
}

/** تنفيذ إجراء مع رسالة نجاح أو خطأ. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok = 'تم الحفظ') => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); return true; } catch (e: any) { setMsg({ ok: false, text: e.message }); return false; } finally { setBusy(false); }
  };
  const view = msg && <p className={msg.ok ? 'ok-text' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>;
  return { busy, run, view, setMsg };
}

/** ₪ نصي ← أغورة صحيحة (بلا float في المسار المالي). */
export function toAgorot(v: string): number {
  const m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(v);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
export const fromAgorot = (a: number) => (a / 100).toFixed(2);

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label>{label}{children}</label>;
}

export function Loading({ error }: { error?: string }) {
  return error ? <p className="error" role="alert">{error}</p> : <div className="skeleton" aria-busy="true" />;
}
