import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultUnit, findUnit, type Product } from '../../../worker/src/domain/catalog';
import { parseQuickOrder, type QuickResult } from '../../../worker/src/domain/quickorder';
import { priceCart } from '../../../worker/src/domain/pricing';
import { matches } from '../../../worker/src/domain/search';
import { slaProgress } from '../../../worker/src/domain/sla';
import { ApiError, type Api } from '../lib/api';
import { cartCount, cartReducer, loadCart, saveCart } from '../lib/cart';
import { formatDate, formatDuration, formatMoney, formatQty, STAGES, STATUS, stageIndex } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon, LogoMark } from '../ui/Icons';
import { useCatalog, type Catalog } from './useCatalog';

type Tab = 'home' | 'cart' | 'orders' | 'account';
const API = import.meta.env.VITE_API_URL ?? '';

export function ShopApp() {
  const { api, user, logout } = useSession();
  const { cat, offline } = useCatalog(api);
  const [cart, dispatch] = useReducer(cartReducer, undefined, loadCart);
  const [tab, setTab] = useState<Tab>('home');
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const badge = useRef<HTMLSpanElement>(null);
  useEffect(() => saveCart(cart), [cart]);
  const shopId = user!.shopIds[0]!;

  const fly = (from: HTMLElement) => {
    // التفاعل التوقيعي: النقطة البرتقالية تقفز إلى السلة
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !badge.current || typeof Element.prototype.animate !== 'function') return;
    const a = from.getBoundingClientRect();
    const b = badge.current.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'fly-dot';
    dot.style.cssText = `left:${a.left + a.width / 2}px;top:${a.top}px`;
    document.body.appendChild(dot);
    dot.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${b.left - a.left - a.width / 2}px,${b.top - a.top}px) scale(.5)` }], { duration: 520, easing: 'cubic-bezier(.22,1.2,.36,1)' }).onfinish = () => dot.remove();
    navigator.vibrate?.(12);
  };

  return (
    <div className="shop">
      <header className="shop-head">
        <LogoMark size={30} light />
        <div><b>مورد</b>{offline && <span className="chip warn">بلا اتصال — آخر نسخة محفوظة</span>}</div>
      </header>
      <main className="shop-main">
        {tab === 'home' && cat && <Home cat={cat} onAdd={(p, u, q, el) => { dispatch({ type: 'add', productId: p, unitId: u, qtyMilli: q }); fly(el); setToast('أُضيف إلى السلة'); }}
          onAddMany={(lines) => { for (const l of lines) dispatch({ type: 'add', productId: l.productId, unitId: l.unitId, qtyMilli: l.qtyMilli }); setToast(`أُضيف ${lines.length} صنف إلى السلة`); }} />}
        {tab === 'cart' && cat && <CartView cat={cat} cart={cart} dispatch={dispatch} shopId={shopId} onDone={(id) => { setTab('orders'); setOpenOrder(id); }} />}
        {tab === 'orders' && (openOrder ? <OrderDetail id={openOrder} back={() => setOpenOrder(null)} /> : <OrderList shopId={shopId} open={setOpenOrder} />)}
        {tab === 'account' && <Account shopId={shopId} onLogout={logout} />}
        {!cat && tab !== 'account' && <div className="skeleton-grid" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>}
      </main>
      {toast && <div className="toast" role="status" onAnimationEnd={() => setToast('')}>{toast}</div>}
      <nav className="bottom-nav" aria-label="التنقل">
        {([['home', 'home', 'الرئيسية'], ['cart', 'cart', 'السلة'], ['orders', 'orders', 'طلباتي'], ['account', 'user', 'حسابي']] as const).map(([t, icon, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setOpenOrder(null); }} aria-current={tab === t ? 'page' : undefined}>
            <span className="ico"><Icon name={icon} />{t === 'cart' && cartCount(cart) > 0 && <span ref={badge} className="dot-badge">{cartCount(cart)}</span>}{t === 'cart' && cartCount(cart) === 0 && <span ref={badge} />}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

const PROBLEM: Record<string, string> = { NOT_FOUND: 'لم أجد هذا الصنف', AMBIGUOUS: 'أكثر من صنف يطابق، اكتب الاسم أوضح', UNIT_NOT_SOLD: 'لا يُباع بهذه الوحدة', UNAVAILABLE: 'غير متوفر حالياً', FRACTION_NOT_ALLOWED: 'يُباع بالعدد الصحيح فقط' };

/** طلب سريع: يكتب صاحب المحل كما يتكلم، والنظام يفهم الكمية والوحدة الافتراضية لكل صنف. */
export function QuickOrder({ cat, onAddMany }: { cat: Catalog; onAddMany: (lines: QuickResult['lines']) => void }) {
  const [text, setText] = useState('');
  const r = useMemo(() => (text.trim() ? parseQuickOrder(text, cat.products as unknown as Product[]) : null), [text, cat]);
  const pName = (id: string) => cat.products.find((p) => p.id === id)?.name ?? id;
  const uName = (id: string) => cat.units.find((u) => u.id === id)?.name ?? id;
  return (
    <details className="card quick">
      <summary><Icon name="orders" /> طلب سريع بالكتابة</summary>
      <p className="mute">اكتب كل صنف في سطر أو افصل بفاصلة: «10 سمك بوري، 2 جبنة، نص كيلو زعتر». الرقم بلا وحدة يُفهم بوحدة الصنف المعتادة.</p>
      <textarea aria-label="نص الطلب السريع" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="10 سمك بوري&#10;2 جبنة بيضاء" />
      {r && <ul className="lines">
        {r.lines.map((l) => <li key={`${l.productId}|${l.unitId}`}><span>{pName(l.productId)}</span><span className="num">{formatQty(l.qtyMilli)} {uName(l.unitId)}{l.assumedUnit && <small className="mute"> (الوحدة المعتادة)</small>}</span></li>)}
        {r.problems.map((x, i) => <li key={`p${i}`} className="danger-text"><span>{x.text}</span><small>{PROBLEM[x.reason]}{x.reason === 'AMBIGUOUS' && x.candidates ? `: ${x.candidates.map(pName).join('، ')}` : ''}</small></li>)}
      </ul>}
      {r && r.lines.length > 0 && <button className="btn primary block" onClick={() => { onAddMany(r.lines); setText(''); }}>أضف {r.lines.length} صنف إلى السلة</button>}
    </details>
  );
}

function Home({ cat, onAdd, onAddMany }: { cat: Catalog; onAdd: (p: string, u: string, q: number, el: HTMLElement) => void; onAddMany: (lines: QuickResult['lines']) => void }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const list = useMemo(() => cat.products.filter((p) => (!category || p.categoryId === category) && (!onlyAvailable || p.available) && matches(q, p)).sort((a, b) => Number(b.available) - Number(a.available) || (a.order ?? 999) - (b.order ?? 999)), [cat, q, category, onlyAvailable]);
  return (
    <>
      <QuickOrder cat={cat} onAddMany={onAddMany} />
      <div className="search"><Icon name="search" /><input type="search" placeholder="ابحث باسم المنتج أو العلامة أو الرمز" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" /></div>
      <div className="chips" role="tablist">
        <button className={!category ? 'chip on' : 'chip'} onClick={() => setCategory(null)}>الكل</button>
        {cat.categories.map((c) => <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}
        <label className="chip"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> المتوفر فقط</label>
      </div>
      {list.length === 0 ? <p className="empty">لا توجد منتجات مطابقة. جرّب كلمة أقصر أو تصنيفاً آخر.</p> : (
        <div className="grid">{list.map((p, i) => <ProductCard key={p.id} p={p} units={cat.units} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onAdd={onAdd} />)}</div>
      )}
    </>
  );
}

function ProductCard({ p, units, onAdd, style }: { p: Catalog['products'][number]; units: Catalog['units']; onAdd: (p: string, u: string, q: number, el: HTMLElement) => void; style?: React.CSSProperties }) {
  const [unitId, setUnit] = useState(defaultUnit(p)?.unitId ?? p.baseUnitId);
  const u = findUnit(p, unitId) ?? p.units[0]!;
  const [qty, setQty] = useState(u.minQtyMilli);
  const name = (id: string) => units.find((x) => x.id === id)?.name ?? id;
  const img = p.images?.[0]?.thumb;
  return (
    <article className={`card product${p.available ? '' : ' off'}`} style={style}>
      <div className="shelf">{img ? <img src={`${API}/files/${img}`} alt="" loading="lazy" /> : <Icon name="box" size={48} />}</div>
      <h3>{p.name}</h3>
      {p.units.length > 1 && <div className="units">{p.units.map((x) => <button key={x.unitId} className={x.unitId === u.unitId ? 'chip on' : 'chip'} onClick={() => { setUnit(x.unitId); setQty(x.minQtyMilli); }}>{name(x.unitId)}</button>)}</div>}
      <div className="price"><b>{formatMoney(u.price)}</b><span className="mute"> / {name(u.unitId)}</span></div>
      {p.available ? (
        <div className="stepper">
          <button aria-label="إنقاص" onClick={() => setQty(Math.max(u.minQtyMilli, qty - u.stepMilli))}><Icon name="minus" /></button>
          <output aria-live="polite">{formatQty(qty)}</output>
          <button aria-label="زيادة" onClick={() => setQty(qty + u.stepMilli)}><Icon name="plus" /></button>
          <button className="add" aria-label={`أضف ${p.name} إلى السلة`} onClick={(e) => onAdd(p.id, u.unitId, qty, e.currentTarget)}><Icon name="plus" /></button>
        </div>
      ) : <p className="chip danger">غير متوفر حالياً</p>}
    </article>
  );
}

function CartView({ cat, cart, dispatch, shopId, onDone }: { cat: Catalog; cart: ReturnType<typeof loadCart>; dispatch: React.Dispatch<Parameters<typeof cartReducer>[1]>; shopId: string; onDone: (id: string) => void }) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState<number | null>(null);
  const products = useMemo(() => new Map(cat.products.map((p) => [p.id, p])), [cat]);
  const preview = priceCart(cart.lines, products, new Map(cat.units.map((u) => [u.id, u.name])), [], Date.now());
  if (cart.lines.length === 0) return <p className="empty">السلة فارغة. أضف منتجات من الرئيسية.</p>;
  const total = preview.ok ? preview.value.total : null;
  async function send(accepted?: number) {
    if (busy) return;
    setBusy(true);
    setError('');
    dispatch({ type: 'begin' });
    const key = cart.pendingKey ?? undefined;
    try {
      const r = await api.post<{ order: { id: string } }>('/orders', { shopId, items: cart.lines, paymentMethod: cart.paymentMethod, notes: cart.notes, seenTotal: accepted ?? total ?? undefined }, key ?? crypto.randomUUID().replace(/-/g, ''));
      dispatch({ type: 'clear' });
      onDone(r.order.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') setChanged(e.details?.total as number);
      else setError(e instanceof ApiError ? e.message : 'تعذّر الإرسال');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>السلة <span className="chip warn">غير مرسلة</span></h2>
      <ul className="lines">{cart.lines.map((l) => {
        const p = products.get(l.productId);
        const line = preview.ok ? preview.value.lines.find((x) => x.productId === l.productId && x.unitId === l.unitId) : undefined;
        return (
          <li key={`${l.productId}|${l.unitId}`}>
            <div><b>{p?.name ?? 'منتج غير متاح'}</b><span className="mute"> {line?.unitName} × {formatQty(l.qtyMilli)}</span></div>
            <div className="row"><span className="num">{line ? formatMoney(line.total) : '—'}</span>
              <button className="icon-btn" aria-label="حذف" onClick={() => dispatch({ type: 'remove', productId: l.productId, unitId: l.unitId })}><Icon name="trash" /></button></div>
          </li>
        );
      })}</ul>
      {!preview.ok && <p className="error">{preview.message} — راجع الأصناف المعلّمة.</p>}
      <fieldset className="pay"><legend>طريقة الدفع</legend>
        <label><input type="radio" checked={cart.paymentMethod === 'cash'} onChange={() => dispatch({ type: 'method', value: 'cash' })} /> نقداً عند التسليم</label>
        <label><input type="radio" checked={cart.paymentMethod === 'credit'} onChange={() => dispatch({ type: 'method', value: 'credit' })} /> آجل على الحساب</label>
      </fieldset>
      <label>ملاحظات<textarea value={cart.notes} onChange={(e) => dispatch({ type: 'notes', value: e.target.value })} rows={2} /></label>
      <div className="total"><span>الإجمالي التقديري</span><b className="num">{total !== null ? formatMoney(total) : '—'}</b></div>
      {changed !== null && (
        <div className="notice" role="alert"><p>تغيّرت الأسعار منذ إعداد السلة. الإجمالي الجديد <b className="num">{formatMoney(changed)}</b>.</p>
          <button className="btn primary" onClick={() => { const v = changed; setChanged(null); void send(v); }}>موافق، أرسل بالسعر الجديد</button></div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy || !preview.ok} onClick={() => void send()}>{busy ? 'جارٍ الإرسال…' : 'تأكيد وإرسال الطلب'}</button>
    </section>
  );
}

interface OrderSummary { id: string; number: string; status: string; createdAt: number; total: number; items: number }

function OrderList({ shopId, open }: { shopId: string; open: (id: string) => void }) {
  const { api } = useSession();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  useEffect(() => { void api.get<{ orders: OrderSummary[] }>(`/shops/${shopId}/orders`).then((r) => setOrders(r.orders)).catch(() => setOrders([])); }, [api, shopId]);
  if (!orders) return <div className="skeleton" aria-busy="true" />;
  if (!orders.length) return <p className="empty">لا طلبات بعد.</p>;
  return <ul className="orders">{orders.map((o) => (
    <li key={o.id}><button onClick={() => open(o.id)}><span><b className="num">{o.number}</b><small className="mute">{formatDate(o.createdAt)}</small></span>
      <span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span><span className="num">{formatMoney(o.total)}</span></button></li>
  ))}</ul>;
}

function OrderDetail({ id, back }: { id: string; back: () => void }) {
  const { api } = useSession();
  const [d, setD] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(Date.now());
  const load = () => api.get(`/orders/${id}`).then(setD);
  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [id]);
  if (!d) return <div className="skeleton" aria-busy="true" />;
  const o = d.order;
  const sla = o.sla;
  const prog = sla ? slaProgress(sla, now) : null;
  const idx = stageIndex(o.status);
  const act = async (to: string, extra: object = {}) => { await api.post(`/orders/${id}/transition`, { to, reason, ...extra }, crypto.randomUUID().replace(/-/g, '')); setReason(''); await load(); };
  return (
    <section>
      <button className="link" onClick={back}><Icon name="chevron" flip /> طلباتي</button>
      <h2 className="num">{o.number}</h2>
      <span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span>
      <ol className="progress" aria-label="مراحل الطلب">{STAGES.map((s, i) => <li key={s} className={i <= idx ? 'done' : ''}>{STATUS[s]?.label}</li>)}</ol>
      {prog && !['delivered', 'financially_completed', 'cancelled', 'rejected'].includes(o.status) && (
        <div className="timer">
          <Icon name="clock" />
          <div><b>{prog.overdue ? 'متأخر' : `متبقٍ ${formatDuration(prog.remaining)}`}</b>
            <small className="mute"> الموعد {sla.estimated ? 'التقديري' : 'المؤكد'} {formatDate(sla.dueAt)} · بدأ العد {formatDate(sla.clockStartAt)} · أُرسل {formatDate(sla.submittedAt)}{prog.started ? ` · مضى ${formatDuration(prog.elapsed)}` : ''}</small></div>
        </div>
      )}
      <ul className="lines">{o.items.map((l: any) => <li key={`${l.productId}|${l.unitId}`}><span>{l.name} <small className="mute">{l.unitName} × {formatQty(l.qtyMilli)}</small></span><span className="num">{formatMoney(l.total)}</span></li>)}</ul>
      <div className="total"><span>الإجمالي</span><b className="num">{formatMoney(o.totals.total)}</b></div>
      {d.changes?.[0]?.status === 'pending' && <div className="notice"><b>تعديل من الإدارة:</b> {d.changes[0].reason}<p>الإجمالي الجديد <b className="num">{formatMoney(d.changes[0].after.total)}</b></p></div>}
      {d.actions.length > 0 && (
        <div className="actions">
          {d.actions.some((a: any) => a.reason) && <input placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />}
          {d.actions.map((a: any) => <button key={a.to} className={a.to === 'confirmed' ? 'btn primary' : 'btn'} onClick={() => void act(a.to)}>{a.to === 'confirmed' ? 'موافقة على التعديل' : a.to === 'under_review' ? 'رفض التعديل' : a.to === 'cancelled' ? 'إلغاء الطلب' : STATUS[a.to]?.label}</button>)}
        </div>
      )}
      {o.invoiceId && <button className="btn ghost" onClick={() => void openPrintable(api, `/invoices/${o.invoiceId}/print`)}><Icon name="print" /> الفاتورة</button>}
      <details><summary>سجل الطلب</summary><ul>{d.history.map((h: any, i: number) => <li key={i}>{STATUS[h.to]?.label} — {formatDate(h.at)}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ul></details>
    </section>
  );
}

function Account({ shopId, onLogout }: { shopId: string; onLogout: () => Promise<void> }) {
  const { api, user, can } = useSession();
  const [st, setSt] = useState<any>(null);
  useEffect(() => { if (can('shop.statement.view')) void api.get(`/shops/${shopId}/statement`).then(setSt).catch(() => setSt(null)); }, [api, shopId]);
  return (
    <section>
      <h2>{user!.displayName}</h2>
      {st && (
        <div className="kpis">
          <div className="kpi"><small>المستحق عليك</small><b className="num danger-text">{formatMoney(st.statement.due)}</b></div>
          <div className="kpi"><small>رصيد دائن لك</small><b className="num ok-text">{formatMoney(st.statement.creditBalance)}</b></div>
          {st.credit.enabled && <div className="kpi"><small>المتاح من الحد الائتماني</small><b className="num">{formatMoney(Math.max(0, st.credit.available))}</b></div>}
          <button className="btn ghost" onClick={() => void openPrintable(api, `/shops/${shopId}/statement/print`)}><Icon name="print" /> كشف الحساب</button>
        </div>
      )}
      <button className="btn danger block" onClick={() => void onLogout()}><Icon name="logout" /> تسجيل الخروج</button>
    </section>
  );
}

/** صفحات الطباعة تتطلب الجلسة: تُجلب بالرمز وتُفتح كملف محلي للطباعة/الحفظ PDF/المشاركة. */
export async function openPrintable(api: Api, path: string) {
  const html = await api.request<string>('GET', path, undefined, { raw: true });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
