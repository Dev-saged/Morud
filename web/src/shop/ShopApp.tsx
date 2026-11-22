import { memo, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultUnit, findUnit, type Product } from '../../../worker/src/domain/catalog';
import { parseQuickOrder, type QuickResult } from '../../../worker/src/domain/quickorder';
import { priceCart } from '../../../worker/src/domain/pricing';
import { matches } from '../../../worker/src/domain/search';
import { slaProgress } from '../../../worker/src/domain/sla';
import { ApiError, type Api } from '../lib/api';
import { cartCount, cartReducer, loadCart, saveCart } from '../lib/cart';
import { formatDate, formatDuration, formatMoney, formatQty, STAGES, STATUS, stageIndex } from '../lib/format';
import { useSession } from '../lib/session';
import { openPrintable } from '../lib/print';
import { askNotifyPermission, dropQueued, enqueue, useOutbox, type Queued } from '../lib/outbox';
import { Icon, LogoMark } from '../ui/Icons';
import { Hero, Ring, Tile } from '../ui/Desk';
import { Bell } from '../ui/Bell';
import { SecurityCard } from '../ui/Security';
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
  const onSent = useCallback((m: string) => setToast(m), []);
  const { queue, flush } = useOutbox(api, user!.uid, onSent);

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

  // دوال ثابتة: بطاقات المنتجات لا يُعاد رسمها كلها مع كل تغيير في السلة
  const flyRef = useRef(fly);
  flyRef.current = fly;
  const onAdd = useCallback((p: string, u: string, q: number, el: HTMLElement) => { dispatch({ type: 'add', productId: p, unitId: u, qtyMilli: q }); flyRef.current(el); setToast('أُضيف إلى السلة'); }, []);
  const onAddMany = useCallback((lines: QuickResult['lines']) => { for (const l of lines) dispatch({ type: 'add', productId: l.productId, unitId: l.unitId, qtyMilli: l.qtyMilli }); setToast(`أُضيف ${lines.length} صنف إلى السلة`); }, []);

  return (
    <div className="shop">
      <header className="shop-head">
        <LogoMark size={30} light />
        <div><b>مورد</b>{offline && <span className="chip warn">بلا اتصال — آخر نسخة محفوظة</span>}</div>
        <Bell light onOpen={(r) => { if (r.kind === 'order') { setTab('orders'); setOpenOrder(r.id); } else if (r.kind === 'shop' || r.kind === 'ticket') setTab('account'); else setTab('home'); }} />
      </header>
      <main className="shop-main">
        {cat && <div hidden={tab !== 'home'}><ShopDesk cat={cat} shopId={shopId} pending={queue.length} openOrders={() => { setTab('orders'); setOpenOrder(null); }} openOrder={(id) => { setTab('orders'); setOpenOrder(id); }} openAccount={() => setTab('account')}
          reorder={(p, u, q) => { dispatch({ type: 'add', productId: p, unitId: u, qtyMilli: q }); setToast('أُضيف إلى السلة'); }} />
        <Home cat={cat} onAdd={onAdd} onAddMany={onAddMany} /></div>}
        {tab === 'cart' && cat && <CartView cat={cat} cart={cart} dispatch={dispatch} shopId={shopId} onDone={(id) => { setTab('orders'); setOpenOrder(id); }} onQueued={() => { setTab('orders'); setToast('حُفظ الطلب وسيُرسل تلقائياً عند عودة النت'); }} />}
        {tab === 'orders' && (openOrder ? <OrderDetail id={openOrder} back={() => setOpenOrder(null)} /> : <>
          {queue.length > 0 && <Outbox queue={queue} uid={user!.uid} flush={flush} restore={(q) => { for (const l of q.body.items as Array<{ productId: string; unitId: string; qtyMilli: number }>) dispatch({ type: 'add', ...l }); dropQueued(user!.uid, q.key); setTab('cart'); }} />}
          <OrderList key={queue.length} shopId={shopId} open={setOpenOrder} /></>)}
        {tab === 'account' && <Account shopId={shopId} onLogout={logout} />}
        {!cat && tab !== 'account' && <div className="skeleton-grid" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>}
      </main>
      {toast && <div className="toast" role="status" onAnimationEnd={() => setToast('')}>{toast}</div>}
      <nav className="bottom-nav" aria-label="التنقل">
        {([['home', 'home', 'الرئيسية'], ['cart', 'cart', 'السلة'], ['orders', 'orders', 'طلباتي'], ['account', 'user', 'حسابي']] as const).map(([t, icon, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setOpenOrder(null); }} aria-current={tab === t ? 'page' : undefined}>
            <span className="ico"><Icon name={icon} />{t === 'orders' && queue.length > 0 && <span className="dot-badge wait">{queue.length}</span>}{t === 'cart' && cartCount(cart) > 0 && <span ref={badge} className="dot-badge">{cartCount(cart)}</span>}{t === 'cart' && cartCount(cart) === 0 && <span ref={badge} />}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

interface MySummary { open: number; ordersMonth: number; spendMonth: number; spendLast7Days: number[]; due?: number; creditAvailable?: number | null; last: { id: string; number: string; status: string; total: number; createdAt: number } | null; reorder: Array<{ productId: string; name: string; unitId: string; count: number }> }

/** لوحة صاحب المحل: المستحق والحد المتاح، الطلبات المفتوحة، مصروف الشهر، آخر طلب وتقدّمه، و«اطلب مجدداً» بنقرة. */
function ShopDesk({ cat, shopId, pending, openOrders, openOrder, openAccount, reorder }: { cat: Catalog; shopId: string; pending: number; openOrders: () => void; openOrder: (id: string) => void; openAccount: () => void; reorder: (p: string, u: string, q: number) => void }) {
  const { api, user } = useSession();
  const [m, setM] = useState<MySummary | null>(null);
  useEffect(() => { void api.get<MySummary>(`/me/summary?shopId=${shopId}`).then(setM).catch(() => undefined); }, [api, shopId]);
  const products = useMemo(() => new Map(cat.products.map((p) => [p.id, p])), [cat]);
  const limitTotal = m?.creditAvailable != null && m.due !== undefined ? m.creditAvailable + m.due : 0;
  const stage = m?.last ? stageIndex(m.last.status) : -1;
  return (
    <section className="desk">
      <Hero name={user!.displayName} title={m ? (m.open ? `عندك ${m.open} طلب مفتوح` : 'جاهز لطلبك القادم؟') : undefined}>
        {m && m.due !== undefined && <div className="hero-stats">
          <div><small>المستحق عليك</small><b className="num">{formatMoney(m.due)}</b></div>
          {m.creditAvailable != null && <div className="row"><Ring value={limitTotal ? m.creditAvailable / limitTotal : 0} label={`${limitTotal ? Math.round((m.creditAvailable / limitTotal) * 100) : 0}٪`} /><div><small>المتاح من الحد</small><b className="num" style={{ fontSize: '1.2rem' }}>{formatMoney(m.creditAvailable)}</b></div></div>}
        </div>}
      </Hero>
      {m && <div className="tiles">
        <Tile icon="orders" label="طلبات مفتوحة" value={m.open} hint={pending ? `+${pending} بانتظار النت` : 'اضغط للمتابعة'} tone={pending ? 'accent' : 'primary'} onClick={openOrders} />
        <Tile icon="chart" label="مصروف 30 يوماً" value={formatMoney(m.spendMonth)} hint={`${m.ordersMonth} طلب`} spark={m.spendLast7Days} onClick={m.due !== undefined ? openAccount : undefined} />
        {m.last && <button className="tile tap" onClick={() => openOrder(m.last!.id)} aria-label={`آخر طلب ${m.last.number}`}>
          <span className="tile-ico t-ok"><Icon name="truck" size={20} /></span>
          <span className="tile-text"><small>آخر طلب · <span className="num">{m.last.number}</span></small><b>{STATUS[m.last.status]?.label ?? m.last.status}</b>
            {stage >= 0 && <span className="progress-line" aria-hidden="true">{STAGES.map((_, i) => <i key={i} className={i <= stage ? 'on' : ''} />)}</span>}</span>
          <Icon name="chevron" size={14} flip className="tile-go" /></button>}
      </div>}
      {m && m.reorder.length > 0 && <div className="panel"><h3><span><Icon name="repeat" size={18} /> اطلب مجدداً</span><small className="mute">بنقرة، بوحدتك المعتادة</small></h3>
        <div className="reorder">{m.reorder.map((r) => {
          const p = products.get(r.productId);
          if (!p || !p.available) return null;
          const u = findUnit(p, r.unitId) ?? defaultUnit(p) ?? p.units[0]!;
          return <button key={r.productId} onClick={() => reorder(p.id, u.unitId, u.minQtyMilli)}><Icon name="plus" size={16} />{p.name}<small className="mute">{cat.units.find((x) => x.id === u.unitId)?.name}</small></button>;
        })}</div></div>}
    </section>
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

/** وصف قصير للعرض يظهر على البطاقة وفي شريط العروض. */
export function promoLabel(p: NonNullable<Catalog['promotions']>[number]): string {
  const pct = p.percentBp ? `${(p.percentBp / 100).toLocaleString('ar-EG')}٪` : '';
  switch (p.type) {
    case 'item_percent': return `خصم ${pct}`;
    case 'item_amount': return `خصم ${formatMoney(p.amountPerUnit ?? 0)} للوحدة`;
    case 'qty_percent': return `${pct} عند ${formatQty(p.minQtyMilli ?? 0)} فأكثر`;
    case 'bxgy': return `اشترِ ${p.buyQty} واحصل على ${p.getQty}`;
    case 'bundle_percent': return `${pct} على المجموعة`;
    default: return 'عرض';
  }
}

type CatProduct = Catalog['products'][number];

function Home({ cat, onAdd, onAddMany }: { cat: Catalog; onAdd: (p: string, u: string, q: number, el: HTMLElement) => void; onAddMany: (lines: QuickResult['lines']) => void }) {
  const [q, setQ] = useState('');
  // الكتابة في البحث فورية؛ فلترة المنتجات تلحقها دون أن تعطّل لوحة المفاتيح
  const query = useDeferredValue(q);
  const [category, setCategory] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [promoFilter, setPromoFilter] = useState<string | null>(null);
  const now = Date.now();
  const promos = useMemo(() => (cat.promotions ?? []).filter((p) => p.startsAt <= now && p.endsAt > now), [cat, Math.floor(now / 60_000)]);
  const promoOf = useMemo(() => { const m = new Map<string, string>(); for (const p of promos) for (const id of p.productIds) if (!m.has(id)) m.set(id, promoLabel(p)); return m; }, [promos]);
  const byId = useMemo(() => new Map(cat.products.map((p) => [p.id, p])), [cat]);
  const activePromo = promos.find((p) => p.id === promoFilter) ?? null;
  const list = useMemo(() => cat.products.filter((p) => (!category || p.categoryId === category) && (!onlyAvailable || p.available) && (!activePromo || activePromo.productIds.includes(p.id)) && matches(query, p)).sort((a, b) => Number(b.available) - Number(a.available) || (a.order ?? 999) - (b.order ?? 999)), [cat, query, category, onlyAvailable, activePromo]);
  const browsing = !query && !category && !activePromo;
  const featured = useMemo(() => cat.products.filter((p) => p.featured && p.available).slice(0, 12), [cat]);
  const popular = useMemo(() => (cat.popular ?? []).map((id) => byId.get(id)).filter((p): p is CatProduct => !!p && p.available), [cat, byId]);
  const rail = (title: string, items: CatProduct[]) => items.length > 0 && (
    <section className="rail-block" aria-label={title}>
      <h2 className="rail-title">{title}</h2>
      <div className="rail">{items.map((p) => <ProductCard key={p.id} p={p} units={cat.units} promo={promoOf.get(p.id)} onAdd={onAdd} />)}</div>
    </section>
  );
  return (
    <>
      <QuickOrder cat={cat} onAddMany={onAddMany} />
      <div className="search"><Icon name="search" /><input type="search" placeholder="ابحث باسم المنتج أو العلامة أو الرمز" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" /></div>
      <div className="chips" role="tablist">
        <button className={!category ? 'chip on' : 'chip'} onClick={() => setCategory(null)}>الكل</button>
        {cat.categories.map((c) => <button key={c.id} className={category === c.id ? 'chip on' : 'chip'} onClick={() => setCategory(c.id)}>{c.name}</button>)}
        <label className="chip"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> المتوفر فقط</label>
      </div>
      {promos.length > 0 && !query && (
        <section className="offers" aria-label="العروض والخصومات">
          {promos.map((p) => (
            <button key={p.id} className={`offer tap${promoFilter === p.id ? ' on' : ''}`} onClick={() => setPromoFilter(promoFilter === p.id ? null : p.id)} aria-pressed={promoFilter === p.id}>
              <Icon name="tag" /><span><b>{p.name}</b><small>{promoLabel(p)} · حتى {formatDate(p.endsAt)}</small></span>
            </button>
          ))}
        </section>
      )}
      {browsing && rail('منتجات مميزة', featured)}
      {browsing && rail('الأكثر طلباً', popular)}
      {browsing && (featured.length > 0 || popular.length > 0) && <h2 className="rail-title">كل المنتجات</h2>}
      {activePromo && <p className="mute">منتجات عرض «{activePromo.name}» — {activePromo.productIds.length} صنف. {activePromo.terms}</p>}
      {list.length === 0 ? <p className="empty">لا توجد منتجات مطابقة. جرّب كلمة أقصر أو تصنيفاً آخر.</p> : (
        <div className="grid">{list.map((p, i) => <ProductCard key={p.id} p={p} units={cat.units} promo={promoOf.get(p.id)} delay={Math.min(i, 12) * 30} onAdd={onAdd} />)}</div>
      )}
    </>
  );
}

const ProductCard = memo(function ProductCard({ p, units, onAdd, delay, promo }: { p: Catalog['products'][number]; units: Catalog['units']; onAdd: (p: string, u: string, q: number, el: HTMLElement) => void; delay?: number; promo?: string }) {
  const [unitId, setUnit] = useState(defaultUnit(p)?.unitId ?? p.baseUnitId);
  const u = findUnit(p, unitId) ?? p.units[0]!;
  const [qty, setQty] = useState(u.minQtyMilli);
  const name = (id: string) => units.find((x) => x.id === id)?.name ?? id;
  const img = p.images?.[0]?.thumb;
  const [details, setDetails] = useState(false);
  return (
    <article className={`card product${p.available ? '' : ' off'}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {promo && <span className="promo-badge">{promo}</span>}
      <button className="shelf tap" onClick={() => setDetails(true)} aria-label={`تفاصيل ${p.name}`}>{img ? <img src={`${API}/files/${img}`} alt="" loading="lazy" /> : <Icon name="box" size={48} />}</button>
      <h3><button className="name-btn" onClick={() => setDetails(true)}>{p.name}</button></h3>
      {details && <ProductSheet p={p} name={name} close={() => setDetails(false)} />}
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
});

function CartView({ cat, cart, dispatch, shopId, onDone, onQueued }: { cat: Catalog; cart: ReturnType<typeof loadCart>; dispatch: React.Dispatch<Parameters<typeof cartReducer>[1]>; shopId: string; onDone: (id: string) => void; onQueued: () => void }) {
  const { api, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState<number | null>(null);
  const products = useMemo(() => new Map(cat.products.map((p) => [p.id, p])), [cat]);
  // نفس محرك الخادم ونفس العروض الفعالة: الإجمالي المعروض هو ما سيُعتمد، فلا «تغيّرت الأسعار» كاذبة
  const preview = priceCart(cart.lines, products, new Map(cat.units.map((u) => [u.id, u.name])), cat.promotions ?? [], Date.now());
  if (cart.lines.length === 0) return <p className="empty">السلة فارغة. أضف منتجات من الرئيسية.</p>;
  const total = preview.ok ? preview.value.total : null;
  async function send(accepted?: number) {
    if (busy) return;
    setBusy(true);
    setError('');
    dispatch({ type: 'begin' });
    const key = cart.pendingKey ?? crypto.randomUUID().replace(/-/g, '');
    const body = { shopId, items: cart.lines, paymentMethod: cart.paymentMethod, notes: cart.notes, seenTotal: accepted ?? total ?? undefined };
    try {
      const r = await api.post<{ order: { id: string } }>('/orders', body, key);
      dispatch({ type: 'clear' });
      onDone(r.order.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NETWORK') {
        // بلا نت: نفس المفتاح يُحفظ مع الطلب، فلو وصل الأول فعلاً لا يُنشأ ثانٍ
        enqueue(user!.uid, { key, body, at: Date.now(), items: cart.lines.length, total });
        askNotifyPermission();
        dispatch({ type: 'clear' });
        onQueued();
      } else if (e instanceof ApiError && e.code === 'PRICE_CHANGED') setChanged(e.details?.total as number);
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
      {preview.ok && preview.value.discount > 0 && <>
        <div className="total sub"><span>قبل الخصم</span><span className="num">{formatMoney(preview.value.subtotal)}</span></div>
        <div className="total sub ok-text"><span>خصم العروض</span><span className="num">− {formatMoney(preview.value.discount)}</span></div>
      </>}
      <div className="total"><span>الإجمالي</span><b className="num">{total !== null ? formatMoney(total) : '—'}</b></div>
      {changed !== null && (
        <div className="notice" role="alert"><p>تغيّرت الأسعار منذ إعداد السلة. الإجمالي الجديد <b className="num">{formatMoney(changed)}</b>.</p>
          <button className="btn primary" onClick={() => { const v = changed; setChanged(null); void send(v); }}>موافق، أرسل بالسعر الجديد</button></div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy || !preview.ok} onClick={() => void send()}>{busy ? 'جارٍ الإرسال…' : 'تأكيد وإرسال الطلب'}</button>
      <p className="mute small">بلا نت؟ أرسل عادي: يُحفظ الطلب ويصل وحده عند عودة الاتصال، وبيجيك إشعار.</p>
    </section>
  );
}

/** الطلبات المحفوظة بانتظار النت، وما رفضه الخادم بانتظار المراجعة. */
function Outbox({ queue, uid, flush, restore }: { queue: Queued[]; uid: string; flush: () => Promise<void>; restore: (q: Queued) => void }) {
  return (
    <section className="outbox" aria-label="طلبات بانتظار الإرسال">
      <h3>بانتظار الإرسال <span className="chip warn">{queue.length}</span></h3>
      <ul className="orders">{queue.map((q) => (
        <li key={q.key} className={q.error ? 'bad' : ''}>
          <div><b>{q.items} صنف</b><small className="mute"> · {formatDate(q.at)}</small>{q.total !== null && <span className="num"> · {formatMoney(q.total)}</span>}
            {q.error ? <p className="error">{q.error}</p> : <p className="mute">يُرسل تلقائياً عند عودة النت</p>}</div>
          <div className="row">
            {q.error ? <button className="btn" onClick={() => restore(q)}>رجّعه للسلة</button> : <button className="btn" onClick={() => void flush()}>أرسل الآن</button>}
            <button className="icon-btn" aria-label="إلغاء الطلب المحفوظ" onClick={() => dropQueued(uid, q.key)}><Icon name="trash" /></button>
          </div>
        </li>
      ))}</ul>
    </section>
  );
}

type Credit = { sku: string; src: string; title: string; page: string; license: string; licenseUrl: string; author: string };
let creditsCache: Promise<Credit[]> | null = null;
/** إسناد الصور الحرة (CC BY-SA وغيرها) كما تشترط رخصها. */
export function loadCredits(): Promise<Credit[]> {
  creditsCache ??= fetch('/credits.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return creditsCache;
}

/** تفاصيل المنتج: صورة كبيرة، كل الوحدات وأسعارها وقواعد الكمية، والوصف. */
function ProductSheet({ p, name, close }: { p: Catalog['products'][number]; name: (id: string) => string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && typeof d.showModal === 'function' && !d.open) d.showModal();
  }, []);
  const big = p.images?.[0]?.key;
  const def = defaultUnit(p)?.unitId;
  const [credit, setCredit] = useState<Credit | null>(null);
  useEffect(() => { void loadCredits().then((c) => setCredit(c.find((x) => x.sku === p.sku) ?? null)); }, [p.sku]);
  return (
    <dialog ref={ref} className="sheet" onClose={close} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-label={p.name} open={typeof HTMLDialogElement === 'undefined' ? true : undefined}>
      <div className="sheet-body">
        <button className="icon-btn sheet-x" aria-label="إغلاق" onClick={() => (ref.current?.open ? ref.current.close() : close())}><Icon name="close" /></button>
        <div className="sheet-img">{big ? <img src={`${API}/files/${big}`} alt={p.name} /> : <Icon name="box" size={72} />}</div>
        <h2>{p.name}</h2>
        <p><span className={`chip ${p.available ? 'tone-success' : 'tone-danger'}`}>{p.available ? 'متوفر' : 'غير متوفر حالياً'}</span>{p.brand && <span className="mute"> · {p.brand}</span>}</p>
        <table className="table"><thead><tr><th>الوحدة</th><th>السعر</th><th>أقل كمية</th></tr></thead>
          <tbody>{p.units.map((u) => <tr key={u.unitId}><td>{name(u.unitId)}{u.unitId === def && p.units.length > 1 && <span className="chip">الأكثر طلباً</span>}</td><td className="num">{formatMoney(u.price)}</td><td className="num">{formatQty(u.minQtyMilli)}{u.allowFraction ? ' (يقبل الكسور)' : ''}</td></tr>)}</tbody></table>
        {p.description && <p className="mute">{p.description}</p>}
        {credit && <p className="credit">الصورة: <a href={credit.page} target="_blank" rel="noreferrer">{credit.author || credit.src}</a> · <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a></p>}
      </div>
    </dialog>
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
  const [d, setD] = useState<any>(() => api.cached(`/orders/${id}`));
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/orders/${id}`).then((v) => { setD(v); setError(''); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, [id]);
  if (!d) return error ? <section><button className="link" onClick={back}><Icon name="chevron" flip /> طلباتي</button><p className="error" role="alert">{error}</p><button className="btn" onClick={() => void load()}>إعادة المحاولة</button></section> : <div className="skeleton" aria-busy="true" />;
  const o = d.order;
  const sla = o.sla;
  const prog = sla ? slaProgress(sla, now) : null;
  const idx = stageIndex(o.status);
  const act = async (to: string, extra: object = {}) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.post(`/orders/${id}/transition`, { to, reason, ...extra }, crypto.randomUUID().replace(/-/g, '')); setReason(''); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
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
          {d.actions.map((a: any) => <button key={a.to} disabled={busy} className={a.to === 'confirmed' ? 'btn primary' : 'btn'} onClick={() => void act(a.to)}>{a.to === 'confirmed' ? 'موافقة على التعديل' : a.to === 'under_review' ? 'رفض التعديل' : a.to === 'cancelled' ? 'إلغاء الطلب' : STATUS[a.to]?.label}</button>)}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
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
      <SecurityCard />
      <button className="btn danger block" onClick={() => void onLogout()}><Icon name="logout" /> تسجيل الخروج</button>
    </section>
  );
}

/** صفحات الطباعة تتطلب الجلسة: تُجلب بالرمز وتُفتح كملف محلي للطباعة/الحفظ PDF/المشاركة. */
