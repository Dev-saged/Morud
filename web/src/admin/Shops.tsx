import type { Focus } from './AdminApp';
import { useState } from 'react';
import { formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import { openPrintable } from '../shop/ShopApp';
import { Icon } from '../ui/Icons';
import { Field, fromAgorot, Loading, toAgorot, useAction, useLoad } from './kit';

type Shop = { id: string; name: string; ownerName: string; phone: string; phoneAlt?: string; region: string; city: string; address: string; status: string; balance: number; paymentTerms?: string[]; credit?: { enabled: boolean; limit: number }; adminNotes?: string; allowMemberManagement?: boolean };

export function Shops({ focus = {} }: { focus?: Focus }) {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | 'new' | null>(focus.open ?? null);
  const [dueOnly, setDueOnly] = useState(focus.filter === 'due');
  const { data: raw, error, reload } = useLoad<{ shops: Shop[] }>(`/admin/shops?q=${encodeURIComponent(q)}`);
  const data = raw && dueOnly ? { shops: raw.shops.filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance) } : raw;
  if (open === 'new') return <ShopForm done={() => { setOpen(null); void reload(); }} />;
  if (open) return <ShopDetail id={open} back={() => { setOpen(null); void reload(); }} />;
  return (
    <section>
      <h1>المحلات</h1>
      <div className="row"><div className="search" style={{ flex: 1 }}><Icon name="search" /><input aria-label="بحث المحلات" placeholder="الاسم أو الهاتف أو المدينة" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {can('shops.create') && <button className="btn primary" onClick={() => setOpen('new')}>محل جديد</button>}</div>
      <div className="chips"><button className={!dueOnly ? 'chip on' : 'chip'} onClick={() => setDueOnly(false)}>الكل</button><button className={dueOnly ? 'chip on' : 'chip'} onClick={() => setDueOnly(true)}>عليها مستحقات</button></div>
      {!data ? <Loading error={error} /> : data.shops.length === 0 ? <p className="empty">لا محلات.</p> : (
        <table className="table"><thead><tr><th>المحل</th><th>صاحبه</th><th>الهاتف</th><th>المدينة</th><th>الرصيد</th><th>الحالة</th></tr></thead>
          <tbody>{data.shops.map((s) => <tr key={s.id} tabIndex={0} onClick={() => setOpen(s.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(s.id)}>
            <td>{s.name}</td><td>{s.ownerName}</td><td className="num">{s.phone}</td><td>{s.city}</td>
            <td className={`num ${s.balance > 0 ? 'danger-text' : ''}`}>{formatMoney(s.balance)}</td><td><span className={`chip ${s.status === 'active' ? 'tone-success' : 'tone-danger'}`}>{s.status === 'active' ? 'نشط' : 'موقوف'}</span></td></tr>)}</tbody></table>
      )}
    </section>
  );
}

function ShopFields({ f, set }: { f: Record<string, string>; set: (k: string, v: string) => void }) {
  return <div className="two">
    {([['name', 'اسم المحل'], ['ownerName', 'اسم صاحب المحل'], ['phone', 'الهاتف الأساسي'], ['phoneAlt', 'هاتف بديل'], ['region', 'المنطقة'], ['city', 'المدينة'], ['address', 'العنوان التفصيلي']] as const).map(([k, l]) =>
      <Field key={k} label={l}><input value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...(k.startsWith('phone') ? { inputMode: 'tel' as const, dir: 'ltr' } : {})} /></Field>)}
  </div>;
}

function ShopForm({ done }: { done: () => void }) {
  const { api, can } = useSession();
  const act = useAction();
  const [f, setF] = useState<Record<string, string>>({ username: '' });
  const [credit, setCredit] = useState({ enabled: false, limit: '0' });
  const [result, setResult] = useState<{ tempPassword: string | null; username: string } | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  if (result) return <div className="card"><h2>تم إنشاء المحل وحساب صاحبه</h2>
    <p>اسم الدخول: <b className="num">{result.username}</b> أو رقم الهاتف</p>
    {result.tempPassword && <p className="notice">كلمة المرور المؤقتة (تظهر مرة واحدة): <b className="num">{result.tempPassword}</b><br />سيُطلب من صاحب المحل تغييرها عند أول دخول.</p>}
    <button className="btn primary" onClick={done}>تم</button></div>;
  const save = () => act.run(async () => {
    const body: Record<string, unknown> = { name: f.name, ownerName: f.ownerName, phone: f.phone, phoneAlt: f.phoneAlt, region: f.region, city: f.city, address: f.address, adminNotes: f.adminNotes, owner: { username: f.username } };
    if (can('shops.credit.manage')) { body.paymentTerms = credit.enabled ? ['cash', 'credit'] : ['cash']; body.credit = { enabled: credit.enabled, limit: toAgorot(credit.limit) }; }
    const r = await api.post<{ tempPassword: string | null }>('/admin/shops', body, crypto.randomUUID().replace(/-/g, ''));
    setResult({ tempPassword: r.tempPassword, username: f.username! });
  });
  return (
    <div className="card">
      <button className="link" onClick={done}><Icon name="chevron" flip /> المحلات</button>
      <h2>محل جديد</h2>
      <ShopFields f={f} set={set} />
      <Field label="اسم المستخدم لصاحب المحل (لاتيني)"><input dir="ltr" value={f.username} onChange={(e) => set('username', e.target.value)} /></Field>
      <Field label="ملاحظات إدارية (لا يراها المحل)"><textarea rows={2} value={f.adminNotes ?? ''} onChange={(e) => set('adminNotes', e.target.value)} /></Field>
      {can('shops.credit.manage') && <div className="row"><label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={credit.enabled} onChange={(e) => setCredit({ ...credit, enabled: e.target.checked })} />يسمح بالآجل</label>
        {credit.enabled && <Field label="الحد الائتماني (₪)"><input inputMode="decimal" value={credit.limit} onChange={(e) => setCredit({ ...credit, limit: e.target.value })} /></Field>}</div>}
      {act.view}
      <button className="btn primary" disabled={act.busy} onClick={() => void save()}>إنشاء المحل</button>
    </div>
  );
}

function ShopDetail({ id, back }: { id: string; back: () => void }) {
  const { api, can } = useSession();
  const shop = useLoad<{ shop: Shop }>(`/shops/${id}`);
  const st = useLoad<any>(can('accounts.view') ? `/shops/${id}/statement` : null);
  const act = useAction();
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [reason, setReason] = useState('');
  if (!shop.data) return <Loading error={shop.error} />;
  const s = shop.data.shop;
  return (
    <div className="card">
      <button className="link" onClick={back}><Icon name="chevron" flip /> المحلات</button>
      <h2>{s.name} <span className={`chip ${s.status === 'active' ? 'tone-success' : 'tone-danger'}`}>{s.status === 'active' ? 'نشط' : 'موقوف'}</span></h2>
      <p className="mute">{s.ownerName} · <span className="num">{s.phone}</span> · {s.city} — {s.address}</p>
      {s.adminNotes && <p className="notice">{s.adminNotes}</p>}
      {edit ? <>
        <ShopFields f={edit} set={(k, v) => setEdit({ ...edit, [k]: v })} />
        <Field label="ملاحظات إدارية"><textarea rows={2} value={edit.adminNotes ?? ''} onChange={(e) => setEdit({ ...edit, adminNotes: e.target.value })} /></Field>
        {can('shops.credit.manage') && <Field label="الحد الائتماني (₪) — 0 يعني نقدي فقط"><input inputMode="decimal" value={edit.limit ?? ''} onChange={(e) => setEdit({ ...edit, limit: e.target.value })} /></Field>}
        <div className="actions"><button className="btn primary" onClick={() => void act.run(async () => {
          const { limit, ...rest } = edit;
          const body: Record<string, unknown> = { ...rest };
          if (can('shops.credit.manage')) { const l = toAgorot(limit ?? '0'); body.credit = { enabled: l > 0, limit: l }; body.paymentTerms = l > 0 ? ['cash', 'credit'] : ['cash']; }
          await api.patch(`/admin/shops/${id}`, body); setEdit(null); await shop.reload();
        })}>حفظ</button><button className="btn ghost" onClick={() => setEdit(null)}>إلغاء</button></div>
      </> : <div className="actions">
        {can('shops.update') && <button className="btn" onClick={() => setEdit({ name: s.name, ownerName: s.ownerName, phone: s.phone, phoneAlt: s.phoneAlt ?? '', region: s.region, city: s.city, address: s.address, adminNotes: s.adminNotes ?? '', limit: fromAgorot(s.credit?.limit ?? 0) })}>تعديل البيانات</button>}
        {can('shops.suspend') && <><input placeholder="سبب الإيقاف أو التفعيل" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className={s.status === 'active' ? 'btn danger' : 'btn'} onClick={() => void act.run(() => api.post(`/admin/shops/${id}/status`, { status: s.status === 'active' ? 'suspended' : 'active', reason }).then(shop.reload))}>{s.status === 'active' ? 'إيقاف المحل' : 'تفعيل المحل'}</button></>}
      </div>}
      {act.view}
      {st.data && <>
        <div className="kpis">
          <div className="kpi"><small>المستحق</small><b className="num danger-text">{formatMoney(st.data.statement.due)}</b></div>
          <div className="kpi"><small>رصيد دائن</small><b className="num ok-text">{formatMoney(st.data.statement.creditBalance)}</b></div>
          {st.data.credit?.enabled && <div className="kpi"><small>المتاح من الحد</small><b className="num">{formatMoney(st.data.credit.available)}</b></div>}
        </div>
        <button className="btn ghost" onClick={() => void openPrintable(api, `/shops/${id}/statement/print`)}><Icon name="print" /> كشف الحساب</button>
      </>}
    </div>
  );
}
