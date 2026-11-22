// صندوق الصادر: طلب أُنشئ بلا نت يُحفظ بمفتاحه الثابت ويُرسل تلقائياً عند عودة الاتصال (لا يتكرر أبداً)
import { useCallback, useEffect, useState } from 'react';
import { ApiError, type Api } from './api';

export interface Queued {
  key: string;
  body: { shopId: string; items: unknown[]; paymentMethod: string; notes: string; seenTotal?: number };
  at: number;
  items: number;
  total: number | null;
  error?: string;
}
export type Notify = (title: string, body: string) => void;

const slot = (uid: string) => `mawred.outbox.${uid}`;
export function readOutbox(uid: string): Queued[] {
  try { const v = JSON.parse(localStorage.getItem(slot(uid)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(uid: string, q: Queued[]) {
  try { if (q.length) localStorage.setItem(slot(uid), JSON.stringify(q)); else localStorage.removeItem(slot(uid)); } catch { /* */ }
  window.dispatchEvent(new Event('mawred:outbox'));
}
export function enqueue(uid: string, q: Queued) {
  write(uid, [...readOutbox(uid).filter((x) => x.key !== q.key), q]);
}
export function dropQueued(uid: string, key: string) {
  write(uid, readOutbox(uid).filter((x) => x.key !== key));
}

let flushing = false;
/** يرسل كل طلب معلّق بنفس مفتاحه؛ انقطاع جديد يبقيه، ورفض الخادم يعلّمه للمراجعة بدل الضياع. */
export async function flushOutbox(api: Api, uid: string, notify: Notify): Promise<{ sent: string[]; failed: number }> {
  if (flushing) return { sent: [], failed: 0 };
  flushing = true;
  const sent: string[] = [];
  let failed = 0;
  try {
    for (const q of readOutbox(uid)) {
      if (q.error) continue;
      try {
        const r = await api.post<{ order: { id: string; number?: string } }>('/orders', q.body, q.key);
        dropQueued(uid, q.key);
        sent.push(r.order.id);
        notify('أُرسل طلبك', `طلبك المحفوظ (${q.items} صنف) وصل للمورد${r.order.number ? ` برقم ${r.order.number}` : ''}.`);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'NETWORK') break;
        failed++;
        write(uid, readOutbox(uid).map((x) => (x.key === q.key ? { ...x, error: e instanceof ApiError ? e.message : 'تعذّر الإرسال' } : x)));
        notify('طلب يحتاج مراجعة', 'لم يُقبل طلبك المحفوظ. افتح «طلباتي» لمراجعته.');
      }
    }
  } finally { flushing = false; }
  return { sent, failed };
}

/** إشعار نظام إن سمح المستخدم، وإلا يكفي التنبيه داخل التطبيق. */
export const systemNotify: Notify = (title, body) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const opts = { body, icon: '/icon-192.png', badge: '/icon-192.png', lang: 'ar', dir: 'rtl' as const, tag: 'mawred-outbox' };
  if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then((r) => { if (r) void r.showNotification(title, opts); else new Notification(title, opts); }).catch(() => undefined);
  else new Notification(title, opts);
};

/** يُطلب الإذن لحظة الحاجة فقط (عند حفظ أول طلب بلا نت). */
export function askNotifyPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
}

/** يراقب الصادر: عند الفتح، عند عودة الشبكة، وكل 30 ثانية ما دام هناك معلّق. */
export function useOutbox(api: Api, uid: string, onSent: (msg: string) => void) {
  const [queue, setQueue] = useState(() => readOutbox(uid));
  const flush = useCallback(async () => {
    if (!readOutbox(uid).some((q) => !q.error)) return;
    const r = await flushOutbox(api, uid, (t, b) => { systemNotify(t, b); onSent(t); });
    void r;
  }, [api, uid, onSent]);
  useEffect(() => {
    const sync = () => setQueue(readOutbox(uid));
    window.addEventListener('mawred:outbox', sync);
    window.addEventListener('online', flush);
    void flush();
    const t = setInterval(() => { if (navigator.onLine !== false) void flush(); }, 30_000);
    return () => { window.removeEventListener('mawred:outbox', sync); window.removeEventListener('online', flush); clearInterval(t); };
  }, [uid, flush]);
  return { queue, flush };
}
