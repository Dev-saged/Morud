import { useEffect, useState } from 'react';
import { formatMoney, formatQty, STATUS } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon, LogoMark } from '../ui/Icons';
import { Hero, Tile } from '../ui/Desk';
import { Bell } from '../ui/Bell';

/** واجهة المندوب: مهامه بالترتيب، الملاحة، والتسليم بإثبات والمبلغ المطلوب فقط. */
export function AgentApp() {
  const { api, logout, user } = useSession();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [m, setM] = useState<{ pending: number; onRoad: number; deliveredToday: number; failed: number; collectedToday: number } | null>(null);
  const [receiver, setReceiver] = useState('');
  const [collected, setCollected] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const load = () => Promise.all([api.get('/agent/tasks').then((r) => setTasks(r.tasks)), api.get('/me/summary').then(setM).catch(() => undefined)]);
  useEffect(() => { void load(); }, [api]);
  const move = async (id: string, to: string, extra: object = {}) => {
    setError('');
    try { await api.post(`/orders/${id}/transition`, { to, ...extra }, crypto.randomUUID().replace(/-/g, '')); await load(); } catch (e: any) { setError(e.message); }
  };
  const t = tasks?.[0];
  return (
    <div className="shop">
      <header className="shop-head"><LogoMark size={30} light /><b>مهام التوصيل</b><Bell light onOpen={() => void load()} /><button className="icon-btn" aria-label="تسجيل الخروج" onClick={() => void logout()}><Icon name="logout" /></button></header>
      <main className="shop-main">
        <Hero name={user!.displayName} title={tasks ? (tasks.length ? `أمامك ${tasks.length} مهمة` : 'لا مهام الآن، يوم موفق') : undefined}>
          {m && <div className="hero-stats"><div><small>سُلّم اليوم</small><b className="num">{m.deliveredToday}</b></div><div><small>حُصّل اليوم</small><b className="num">{formatMoney(m.collectedToday)}</b></div></div>}
        </Hero>
        {m && <div className="tiles">
          <Tile icon="box" label="بانتظار الاستلام" value={m.pending} />
          <Tile icon="truck" label="في الطريق" value={m.onRoad} tone="accent" />
          <Tile icon="alert" label="تعذّر تسليمها" value={m.failed} tone={m.failed ? 'danger' : 'mute'} alert={m.failed > 0} />
        </div>}
        {!tasks ? <div className="skeleton" aria-busy="true" /> : !t ? <p className="empty">لا مهام حالياً.</p> : (
          <section className="card">
            <h2>{t.shopName} <span className={`chip tone-${STATUS[t.status]?.tone}`}>{STATUS[t.status]?.label}</span></h2>
            <p className="mute">{t.address?.text} · {t.address?.city}</p>
            <div className="row">
              <a className="btn" href={`tel:${t.address?.phone}`}><Icon name="phone" /> اتصال</a>
              {t.address?.geo && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${t.address.geo.lat},${t.address.geo.lng}`} target="_blank" rel="noreferrer"><Icon name="pin" /> الملاحة</a>}
            </div>
            <ul className="lines">{t.items.map((l: any, i: number) => <li key={i}>{l.name} <small className="mute">{l.unitName} × {formatQty(l.qtyMilli)}</small></li>)}</ul>
            {t.toCollect > 0 && <p className="total"><span>المطلوب تحصيله نقداً</span><b className="num">{formatMoney(t.toCollect)}</b></p>}
            {t.status === 'out_for_delivery' && <button className="btn primary block" onClick={() => void move(t.id, 'on_the_way')}>بدء الطريق</button>}
            {(t.status === 'on_the_way' || t.status === 'out_for_delivery') && (
              <form className="proof" onSubmit={(e) => { e.preventDefault(); void move(t.id, 'delivered', { proof: { receiverName: receiver, collectedAmount: Math.round(Number(collected || 0) * 100) } }); }}>
                <label>اسم المستلم<input value={receiver} onChange={(e) => setReceiver(e.target.value)} required minLength={2} /></label>
                <label>المبلغ المحصّل (₪)<input inputMode="decimal" value={collected} onChange={(e) => setCollected(e.target.value)} /></label>
                <button className="btn primary block">تأكيد التسليم</button>
              </form>
            )}
            <details><summary>تعذّر التسليم</summary>
              <input placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn danger" onClick={() => void move(t.id, 'delivery_failed', { reason })}>تسجيل التعذّر</button>
            </details>
            {error && <p className="error" role="alert">{error}</p>}
          </section>
        )}
        {tasks && tasks.length > 1 && <p className="mute">بعدها {tasks.length - 1} مهمة أخرى.</p>}
      </main>
    </div>
  );
}
