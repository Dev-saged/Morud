// تحديث الموقع: يكتشف الإصدار الجديد (عند الفتح، عند العودة للتبويب، وكل 30 دقيقة)، يجهّزه بالخلفية، ويعرض بطاقة «ما الجديد» مع «حدّث الآن»
import { useEffect, useState } from 'react';
import { Icon } from './Icons';

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

type Remote = { version: string; build: string; headline?: string; items?: string[] };
type State = { phase: 'idle' } | { phase: 'preparing'; remote: Remote } | { phase: 'ready'; remote: Remote; apply: () => void };

/** يسجّل خدمة العمل برقم البناء، فكل نشر جديد = عامل جديد ينتظر موافقة المستخدم. */
export function registerSW(onState: (s: State) => void) {
  if (!('serviceWorker' in navigator)) return;
  let remote: Remote = { version: APP_VERSION, build: APP_BUILD };
  void navigator.serviceWorker.register(`/sw.js?v=${APP_BUILD}`).then((reg) => {
    const ready = (w: ServiceWorker) => onState({ phase: 'ready', remote, apply: () => { w.postMessage('SKIP_WAITING'); } });
    if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w || !navigator.serviceWorker.controller) return;
      onState({ phase: 'preparing', remote });
      w.addEventListener('statechange', () => { if (w.state === 'installed') ready(w); });
    });
    const check = async () => {
      try {
        const r = (await (await fetch('/version.json', { cache: 'no-store' })).json()) as Remote;
        if (r.build !== APP_BUILD) { remote = r; await navigator.serviceWorker.register(`/sw.js?v=${r.build}`); await reg.update(); }
      } catch { /* بلا نت */ }
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
    setInterval(() => void check(), 30 * 60_000);
    void check();
  }).catch(() => undefined);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

export function UpdateToast() {
  const [s, setS] = useState<State>({ phase: 'idle' });
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (import.meta.env.PROD) registerSW(setS); }, []);
  if (s.phase === 'idle' || later) return null;
  const r = s.remote;
  return (
    <aside className="upd" role="status" aria-live="polite">
      <div className="upd-head">
        <span className={`upd-ico${s.phase === 'preparing' ? ' spin' : ''}`}><Icon name={s.phase === 'ready' ? 'sparkle' : 'download'} size={20} /></span>
        <div><b>{s.phase === 'ready' ? `مورد ${r.version} جاهز` : 'نجهّز إصداراً جديداً…'}</b><small>{s.phase === 'ready' ? 'نُزّل بالخلفية؛ التحديث يستغرق ثانية' : 'يتم بالخلفية دون أن يقاطع عملك'}</small></div>
      </div>
      {s.phase === 'preparing' && <div className="upd-bar" aria-hidden="true"><i /></div>}
      {s.phase === 'ready' && (r.headline || r.items?.length) ? <div className="upd-notes">{r.headline && <p>{r.headline}</p>}{r.items && r.items.length > 0 && <ul>{r.items.map((x) => <li key={x}>{x}</li>)}</ul>}</div> : null}
      {s.phase === 'ready' && <div className="upd-actions">
        <button className="btn primary" disabled={busy} onClick={() => { setBusy(true); s.apply(); }}>{busy ? 'يُحدّث…' : 'حدّث الآن'}</button>
        <button className="btn ghost" onClick={() => setLater(true)}>لاحقاً</button>
      </div>}
    </aside>
  );
}
