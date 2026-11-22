import { useEffect, useState } from 'react';
import { formatDate, formatMoney, formatQty, STATUS } from '../lib/format';
import { useSession } from '../lib/session';
import { openPrintable } from '../shop/ShopApp';
import { Icon, LogoMark, type IconName } from '../ui/Icons';
import { Finance } from './Finance';
import { Backups, Promotions, Settings, Support } from './More';
import { Products } from './Products';
import { Shops } from './Shops';
import { Users } from './Users';

type Section = 'dashboard' | 'orders' | 'products' | 'shops' | 'delivery' | 'finance' | 'promotions' | 'reports' | 'users' | 'support' | 'settings' | 'backups';
const SECTIONS: Array<[Section, IconName, string, string[]]> = [
  ['dashboard', 'chart', 'لوحة المعلومات', ['orders.view']],
  ['orders', 'orders', 'الطلبات', ['orders.view']],
  ['products', 'box', 'المنتجات', ['products.create', 'products.update', 'products.availability.update', 'categories.manage']],
  ['shops', 'store', 'المحلات', ['shops.view']],
  ['delivery', 'truck', 'التوصيل', ['delivery.view']],
  ['finance', 'wallet', 'المالية', ['invoices.view', 'payments.create']],
  ['promotions', 'tag', 'العروض', ['promotions.manage']],
  ['reports', 'chart', 'التقارير', ['reports.view']],
  ['users', 'users', 'المستخدمون', ['users.manage']],
  ['support', 'chat', 'الدعم', ['support.manage']],
  ['settings', 'gear', 'الإعدادات', ['settings.manage']],
  ['backups', 'shield', 'النسخ الاحتياطي', ['backups.manage']],
];

export function AdminApp() {
  const { user, can, logout } = useSession();
  const allowed = SECTIONS.filter(([, , , p]) => p.some(can));
  const home = user!.home.split('.')[1] as Section;
  const [sec, setSec] = useState<Section>(allowed.some(([id]) => id === home) ? home : allowed[0]?.[0] ?? 'dashboard');
  // التنقل من أي بطاقة إلى تفاصيلها: القسم + ما يُفتح فيه (فلتر أو عنصر)
  const [focus, setFocus] = useState<Focus>({});
  const go: Go = (to, f = {}) => { if (!allowed.some(([id]) => id === to)) return; setFocus(f); setSec(to); window.scrollTo?.({ top: 0 }); };
  return (
    <div className="admin">
      <aside className="side">
        <div className="brand"><LogoMark size={32} /><b>مورد</b></div>
        <nav aria-label="أقسام الإدارة">{allowed.map(([id, icon, label]) => <button key={id} className={sec === id ? 'on' : ''} onClick={() => { setFocus({}); setSec(id); }}><Icon name={icon} />{label}</button>)}</nav>
        <div className="me"><small>{user!.displayName}</small><button className="icon-btn" aria-label="تسجيل الخروج" onClick={() => void logout()}><Icon name="logout" /></button></div>
      </aside>
      <main className="admin-main">
        {sec === 'dashboard' && <Dashboard go={go} can={(s) => allowed.some(([id]) => id === s)} />}
        {sec === 'orders' && <Orders key={JSON.stringify(focus)} focus={focus} />}
        {sec === 'delivery' && <Delivery />}
        {sec === 'reports' && <Reports />}
        {sec === 'products' && <Products key={JSON.stringify(focus)} focus={focus} />}
        {sec === 'shops' && <Shops key={JSON.stringify(focus)} focus={focus} />}
        {sec === 'finance' && <Finance />}
        {sec === 'promotions' && <Promotions />}
        {sec === 'users' && <Users />}
        {sec === 'support' && <Support />}
        {sec === 'settings' && <Settings />}
        {sec === 'backups' && <Backups />}
      </main>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${30 - (v / max) * 28}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

export type Focus = { filter?: string; open?: string; q?: string };
type Go = (to: Section, f?: Focus) => void;

/** كل مؤشر وكل سطر في اللوحة يفتح تفاصيله: القائمة المفلترة نفسها التي حُسب منها العدد. */
export function Dashboard({ go, can }: { go: Go; can: (s: Section) => boolean }) {
  const { api } = useSession();
  const [d, setD] = useState<any>(null);
  useEffect(() => { void api.get('/dashboard/summary').then(setD); }, [api]);
  if (!d) return <div className="skeleton-grid" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" />)}</div>;
  const k: Array<[string, number | undefined, Section, Focus, boolean?]> = [
    ['طلبات اليوم', d.ordersToday, 'orders', { filter: 'today' }], ['جديدة', d.new, 'orders', { filter: 'new' }], ['قيد المراجعة', d.review, 'orders', { filter: 'review' }],
    ['قيد التجهيز', d.preparing, 'orders', { filter: 'preparing' }], ['جاهزة للتوصيل', d.ready, 'orders', { filter: 'ready' }], ['متأخرة', d.overdue, 'orders', { filter: 'overdue' }],
    ['قيد التوصيل', d.delivering, 'orders', { filter: 'delivering' }], ['مكتملة', d.completed, 'orders', { filter: 'completed' }],
    ['مبيعات اليوم', d.salesToday, 'reports', {}, true], ['المحصّل اليوم', d.collectedToday, 'finance', {}, true], ['المستحق على المحلات', d.totalDue, 'shops', { filter: 'due' }, true],
    ['محلات نشطة', d.activeShops, 'shops', {}], ['منتجات متاحة', d.availableProducts, 'products', { filter: 'available' }], ['غير متوفرة', d.unavailableProducts, 'products', { filter: 'unavailable' }],
  ];
  return (
    <section>
      <h1>لوحة المعلومات</h1>
      <div className="kpis">
        {k.filter(([, v]) => v !== undefined).map(([label, v, to, f, money]) => {
          const body = <><small>{label}</small><b className="num">{money ? formatMoney(v!) : v}</b></>;
          const cls = `kpi${label === 'متأخرة' && v ? ' alert' : ''}`;
          return can(to) ? <button key={label} className={`${cls} tap`} onClick={() => go(to, f)} aria-label={`${label}: ${v} — عرض التفاصيل`}>{body}<Icon name="chevron" flip /></button> : <div key={label} className={cls}>{body}</div>;
        })}
        {can('reports') ? <button className="kpi wide tap" onClick={() => go('reports')} aria-label="الطلبات آخر 7 أيام — فتح التقارير"><small>الطلبات آخر 7 أيام</small><Sparkline values={d.ordersLast7Days} /></button>
          : <div className="kpi wide"><small>الطلبات آخر 7 أيام</small><Sparkline values={d.ordersLast7Days} /></div>}
      </div>
      <div className="two">
        <div className="card"><h3>الأكثر طلباً اليوم</h3>{d.topProducts.length === 0 ? <p className="mute">لا طلبات اليوم بعد.</p> : <ol className="taps">{d.topProducts.map((p: any) => <li key={p.productId ?? p.name}>
          <button className="row-btn" disabled={!can('products')} onClick={() => go('products', { open: p.productId, q: p.name })}><span>{p.name}</span><span className="mute num">{p.count}</span></button></li>)}</ol>}</div>
        <div className="card"><h3>أحدث الطلبات</h3>{d.recent.length === 0 ? <p className="mute">لا طلبات بعد.</p> : <ul className="plain taps">{d.recent.map((o: any) => <li key={o.id}>
          <button className="row-btn" disabled={!can('orders')} onClick={() => go('orders', { filter: 'all', open: o.id })}><span><span className="num">{o.number}</span> {o.shopName}</span><span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span></button></li>)}</ul>}</div>
      </div>
    </section>
  );
}

const FILTERS: Array<[string, string]> = [['today', 'اليوم'], ['all', 'الكل'], ['new', 'الجديدة'], ['review', 'قيد المراجعة'], ['preparing', 'قيد التجهيز'], ['ready', 'جاهزة للتوصيل'], ['delivering', 'قيد التوصيل'], ['completed', 'المكتملة'], ['cancelled', 'الملغاة'], ['overdue', 'المتأخرة']];

function Orders({ focus = {} }: { focus?: Focus }) {
  const { api } = useSession();
  const [filter, setFilter] = useState(focus.filter ?? 'new');
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(focus.open ?? null);
  const load = () => api.get(filter === 'all' ? '/orders' : `/orders?filter=${filter}`).then((r) => setRows(r.orders));
  useEffect(() => { setRows(null); void load(); }, [filter]);
  return (
    <section>
      <h1>الطلبات</h1>
      <div className="chips">{FILTERS.map(([id, label]) => <button key={id} className={filter === id ? 'chip on' : 'chip'} onClick={() => setFilter(id)}>{label}</button>)}</div>
      {open ? <AdminOrder id={open} back={() => { setOpen(null); void load(); }} /> : !rows ? <div className="skeleton" aria-busy="true" /> : rows.length === 0 ? <p className="empty">لا طلبات في هذا التصنيف.</p> : (
        <table className="table"><thead><tr><th>الطلب</th><th>المحل</th><th>الوقت</th><th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th>الموعد</th></tr></thead>
          <tbody>{rows.map((o) => <tr key={o.id} onClick={() => setOpen(o.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(o.id)}>
            <td className="num">{o.number}</td><td>{o.shopName}</td><td>{formatDate(o.createdAt)}</td><td className="num">{o.items}</td><td className="num">{formatMoney(o.total)}</td>
            <td>{o.paymentMethod === 'credit' ? 'آجل' : 'نقدي'}</td><td><span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span></td>
            <td className={o.sla?.overdue ? 'danger-text' : ''}>{o.sla ? formatDate(o.sla.dueAt) : '—'}</td></tr>)}</tbody></table>
      )}
    </section>
  );
}

function AdminOrder({ id, back }: { id: string; back: () => void }) {
  const { api, can } = useSession();
  const [d, setD] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [agent, setAgent] = useState('');
  const [error, setError] = useState('');
  const load = () => api.get(`/orders/${id}`).then(setD);
  useEffect(() => { void load(); }, [id]);
  if (!d) return <div className="skeleton" aria-busy="true" />;
  const o = d.order;
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); setReason(''); await load(); } catch (e: any) { setError(e.message); } };
  return (
    <div className="card">
      <button className="link" onClick={back}><Icon name="chevron" flip /> الطلبات</button>
      <h2 className="num">{o.number} — {o.shopName}</h2>
      <p><span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span> <span className="mute">{o.address?.text} · {o.address?.phone}</span></p>
      <table className="table"><tbody>{o.items.map((l: any) => <tr key={`${l.productId}|${l.unitId}`}><td>{l.name}</td><td>{l.unitName}</td><td className="num">{formatQty(l.qtyMilli)}</td><td className="num">{formatMoney(l.unitPrice)}</td><td className="num">{formatMoney(l.total)}</td></tr>)}</tbody></table>
      <p className="total"><span>الإجمالي</span><b className="num">{formatMoney(o.totals.total)}</b></p>
      {d.actions.length > 0 && <div className="actions">
        <input placeholder="السبب (للرفض والإلغاء)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {d.actions.map((a: any) => <button key={a.to} className={a.to === 'confirmed' || a.to === 'under_review' ? 'btn primary' : a.reason ? 'btn danger' : 'btn'} onClick={() => void act(() => api.post(`/orders/${id}/transition`, { to: a.to, reason }, crypto.randomUUID().replace(/-/g, '')))}>{STATUS[a.to]?.label}</button>)}
      </div>}
      {can('delivery.assign') && ['confirmed', 'preparing', 'ready_for_pickup', 'delivery_failed'].includes(o.status) && <div className="actions">
        <input placeholder="معرّف المندوب" value={agent} onChange={(e) => setAgent(e.target.value)} />
        <button className="btn" onClick={() => void act(() => api.post(`/orders/${id}/assign-agent`, { agentId: agent }))}>إسناد للمندوب</button>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      {o.invoiceId && can('invoices.view') && <button className="btn ghost" onClick={() => void openPrintable(api, `/invoices/${o.invoiceId}/print`)}><Icon name="print" /> الفاتورة</button>}
      <details open><summary>السجل</summary><ul>{d.history.map((h: any, i: number) => <li key={i}>{STATUS[h.to]?.label} — {formatDate(h.at)}{h.reason ? ` — ${h.reason}` : ''}</li>)}</ul></details>
      {d.internal.length > 0 && <details><summary>ملاحظات داخلية</summary><ul>{d.internal.map((n: any, i: number) => <li key={i}>{n.text}</li>)}</ul></details>}
    </div>
  );
}

function Delivery() {
  const { api } = useSession();
  const [d, setD] = useState<any>(null);
  useEffect(() => { void api.get('/delivery/board').then(setD); }, [api]);
  if (!d) return <div className="skeleton" aria-busy="true" />;
  return (
    <section>
      <h1>التوصيل <span className="chip danger">{d.overdue} متأخر</span></h1>
      <div className="two">
        <div className="card"><h3>المندوبون</h3><ul className="plain">{d.agents.map((a: any) => <li key={a.uid}>{a.displayName} <span className="mute num">{a.phone}</span> <span className="chip">{a.activeTasks} مهمة</span></li>)}</ul></div>
        {Object.entries(d.regions).map(([region, list]: [string, any]) => <div key={region} className="card"><h3><Icon name="pin" /> {region}</h3><ul className="plain">{list.map((o: any) => <li key={o.id} className={o.overdue ? 'danger-text' : ''}><span className="num">{o.number}</span> {o.shopName} <span className={`chip tone-${STATUS[o.status]?.tone}`}>{STATUS[o.status]?.label}</span></li>)}</ul></div>)}
      </div>
    </section>
  );
}

function Reports() {
  const { api } = useSession();
  const [list, setList] = useState<any[]>([]);
  const [rep, setRep] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { void api.get('/reports').then((r) => setList(r.reports.filter((x: any) => x.allowed))); }, [api]);
  const q = () => `${from ? `from=${Date.parse(from)}&` : ''}${to ? `to=${Date.parse(to) + 86_400_000}` : ''}`;
  const csv = async (id: string) => {
    const text = await api.request<string>('GET', `/reports/${id}?format=csv&${q()}`, undefined, { raw: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `mawred-${id}.csv`;
    a.click();
  };
  return (
    <section>
      <h1>التقارير</h1>
      <div className="row"><label>من<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>إلى<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
      <div className="chips">{list.map((r) => <button key={r.id} className={rep?.report === r.id ? 'chip on' : 'chip'} onClick={() => void api.get(`/reports/${r.id}?${q()}`).then(setRep)}>{r.title}</button>)}</div>
      {rep && <div className="card">
        <h3>{rep.title}</h3>{rep.note && <p className="mute">{rep.note}</p>}
        <button className="btn ghost" onClick={() => void csv(rep.report)}>تصدير Excel</button>
        <table className="table"><thead><tr>{rep.columns.map(([k, l]: [string, string]) => <th key={k}>{l}</th>)}</tr></thead><tbody>{rep.rows.map((r: any, i: number) => <tr key={i}>{rep.columns.map(([k]: [string, string]) => <td key={k} className="num">{typeof r[k] === 'number' && /amount|net|gross|revenue|cost|profit|balance|discount|credited|collected/.test(k) ? formatMoney(r[k]) : String(r[k] ?? '')}</td>)}</tr>)}</tbody></table>
      </div>}
    </section>
  );
}
