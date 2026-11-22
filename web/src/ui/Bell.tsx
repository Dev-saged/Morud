// الجرس: عدد غير المقروء، صندوق الإشعارات، كل إشعار يفتح مرجعه (طلب، كشف حساب، تذكرة)، وتفعيل إشعارات الجهاز
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/format';
import { enablePush, pushState, registerToken, type PushState } from '../lib/push';
import { useSession } from '../lib/session';
import { Icon } from './Icons';
import { APP_VERSION } from './UpdateToast';

export type NoticeRef = { kind: string; id: string };
type N = { id: string; title: string; body: string; ref: NoticeRef; readAt: number | null; createdAt: number; type: string };

export function Bell({ onOpen, light }: { onOpen: (ref: NoticeRef) => void; light?: boolean }) {
  const { api } = useSession();
  const [list, setList] = useState<N[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushState>(pushState());
  const ref = useRef<HTMLDialogElement>(null);
  const load = useCallback(() => api.get<{ notifications: N[]; unread: number }>('/notifications').then((r) => { setList(r.notifications); setUnread(r.unread); }).catch(() => undefined), [api]);
  useEffect(() => {
    void load();
    void registerToken(api, APP_VERSION);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', vis);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'mawred:push') void load();
      if (e.data?.type === 'mawred:open' && e.data.refKind) onOpen({ kind: e.data.refKind, id: e.data.refId });
    };
    // فُتح التطبيق من إشعار: /?open=order:ID
    const q = new URLSearchParams(location.search).get('open');
    if (q && q.includes(':')) { const [kind, id] = q.split(':'); onOpen({ kind: kind!, id: id! }); history.replaceState(null, '', location.pathname); }
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [api, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const d = ref.current; if (open && d && typeof d.showModal === 'function' && !d.open) d.showModal(); }, [open]);
  const pick = async (n: N) => {
    if (!n.readAt) { setUnread((u) => Math.max(0, u - 1)); setList((l) => l?.map((x) => (x.id === n.id ? { ...x, readAt: Date.now() } : x)) ?? null); void api.post(`/notifications/${n.id}/read`, {}).catch(() => undefined); }
    ref.current?.close?.(); setOpen(false); onOpen(n.ref);
  };
  return (
    <>
      <button className={`icon-btn bell${light ? ' light' : ''}`} aria-label={unread ? `الإشعارات، ${unread} غير مقروء` : 'الإشعارات'} onClick={() => { setOpen(true); void load(); }}>
        <Icon name="bell" />{unread > 0 && <span className="bell-badge num">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <dialog ref={ref} className="sheet inbox" aria-label="الإشعارات" onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) ref.current?.close?.(); }}>
          <div className="sheet-body">
            <div className="inbox-head"><h2>الإشعارات</h2>
              {unread > 0 && <button className="btn ghost" onClick={() => { setUnread(0); setList((l) => l?.map((x) => ({ ...x, readAt: x.readAt ?? Date.now() })) ?? null); void api.post('/notifications/read-all', {}).catch(() => undefined); }}>تعليم الكل كمقروء</button>}
              <button className="icon-btn" aria-label="إغلاق" onClick={() => ref.current?.close?.()}><Icon name="close" /></button></div>
            {push === 'default' && <div className="push-ask"><Icon name="bell" /><div><b>فعّل إشعارات الجهاز</b><small>يوصلك تغيّر حالة طلبك فوراً حتى لو الموقع مسكّر</small></div>
              <button className="btn primary" onClick={() => void enablePush(api, APP_VERSION).then(setPush)}>تفعيل</button></div>}
            {push === 'denied' && <p className="mute small">إشعارات الجهاز مرفوضة من إعدادات المتصفح؛ الإشعارات تظهر هنا فقط.</p>}
            {!list ? <div className="skeleton" style={{ height: 120 }} /> : list.length === 0 ? <p className="mute empty-note">لا إشعارات بعد.</p> : (
              <ul className="inbox-list">{list.map((n) => (
                <li key={n.id}><button className={n.readAt ? '' : 'unread'} onClick={() => void pick(n)}>
                  <span className="dot" aria-hidden="true" /><span className="row-main"><b>{n.title}</b><small>{n.body}</small></span><small className="mute num">{formatDate(n.createdAt)}</small>
                </button></li>))}</ul>)}
          </div>
        </dialog>
      )}
    </>
  );
}
