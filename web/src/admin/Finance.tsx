import { useState } from 'react';
import { formatDate, formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import { openPrintable } from '../shop/ShopApp';
import { Field, Loading, toAgorot, useAction, useLoad } from './kit';

const INV_STATUS: Record<string, string> = { open: 'غير مدفوعة', partial: 'مدفوعة جزئياً', paid: 'مدفوعة', void: 'ملغاة' };

export function Finance() {
  const { can } = useSession();
  const [tab, setTab] = useState<'payment' | 'invoices' | 'adjust'>(can('payments.create') ? 'payment' : 'invoices');
  const shops = useLoad<{ shops: Array<{ id: string; name: string; balance: number }> }>('/admin/shops');
  return (
    <section>
      <h1>المالية</h1>
      <div className="chips">
        {can('payments.create') && <button className={tab === 'payment' ? 'chip on' : 'chip'} onClick={() => setTab('payment')}>تسجيل دفعة</button>}
        <button className={tab === 'invoices' ? 'chip on' : 'chip'} onClick={() => setTab('invoices')}>الفواتير</button>
        {can('accounts.adjust') && <button className={tab === 'adjust' ? 'chip on' : 'chip'} onClick={() => setTab('adjust')}>تسوية يدوية</button>}
      </div>
      {!shops.data ? <Loading error={shops.error} /> : tab === 'payment' ? <Payment shops={shops.data.shops} reload={shops.reload} /> : tab === 'adjust' ? <Adjust shops={shops.data.shops} /> : <Invoices />}
    </section>
  );
}

function ShopPick({ shops, value, onChange }: { shops: Array<{ id: string; name: string; balance: number }>; value: string; onChange: (v: string) => void }) {
  return <Field label="المحل"><select value={value} onChange={(e) => onChange(e.target.value)} required><option value="">اختر المحل</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatMoney(s.balance)}</option>)}</select></Field>;
}

function Payment({ shops, reload }: { shops: Array<{ id: string; name: string; balance: number }>; reload: () => Promise<void> }) {
  const { api, can } = useSession();
  const act = useAction();
  const [f, setF] = useState({ shopId: '', amount: '', method: 'cash', notes: '' });
  const [key, setKey] = useState(() => crypto.randomUUID().replace(/-/g, ''));
  const pays = useLoad<{ payments: any[] }>(f.shopId ? `/shops/${f.shopId}/payments` : null);
  const [reason, setReason] = useState('');
  const submit = () => act.run(async () => {
    const amount = toAgorot(f.amount);
    if (!(amount > 0)) throw new Error('أدخل مبلغاً صحيحاً');
    await api.post('/payments', { shopId: f.shopId, amount, method: f.method, notes: f.notes }, key);
    setKey(crypto.randomUUID().replace(/-/g, ''));
    setF({ ...f, amount: '', notes: '' });
    await Promise.all([reload(), pays.reload()]);
  }, 'سُجّلت الدفعة وتوزّعت على أقدم الفواتير');
  return <div className="two">
    <form className="card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <ShopPick shops={shops} value={f.shopId} onChange={(v) => setF({ ...f, shopId: v })} />
      <Field label="المبلغ (₪)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
      <Field label="الطريقة"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="cash">نقداً</option><option value="bank_transfer">تحويل بنكي</option></select></Field>
      <Field label="ملاحظات"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {act.view}
      <button className="btn primary block" disabled={act.busy || !f.shopId}>تسجيل الدفعة</button>
    </form>
    {f.shopId && <div className="card"><h3>دفعات المحل</h3>{!pays.data ? <Loading error={pays.error} /> : <ul className="plain">{pays.data.payments.map((p) => <li key={p.id} className="row">
      <span className="num">{p.number}</span><b className="num">{formatMoney(p.amount)}</b><small className="mute">{formatDate(p.at)}</small>{p.status === 'reversed' && <span className="chip tone-danger">معكوسة</span>}
      {can('payments.reverse') && p.status !== 'reversed' && <button className="link danger-text" onClick={() => void act.run(() => api.post(`/payments/${p.id}/reverse`, { reason: reason || 'تصحيح' }).then(() => Promise.all([reload(), pays.reload()])), 'عُكست الدفعة بحركة عكسية')}>عكس</button>}</li>)}</ul>}
      {can('payments.reverse') && <Field label="سبب العكس"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}</div>}
  </div>;
}

function Adjust({ shops }: { shops: Array<{ id: string; name: string; balance: number }> }) {
  const { api } = useSession();
  const act = useAction();
  const [f, setF] = useState({ shopId: '', amount: '', dir: 'debit', reason: '', opening: false });
  return <form className="card" onSubmit={(e) => { e.preventDefault(); void act.run(async () => {
    const a = toAgorot(f.amount);
    if (!(a > 0)) throw new Error('أدخل مبلغاً صحيحاً');
    await api.post('/ledger/adjustments', { shopId: f.shopId, amount: f.dir === 'debit' ? a : -a, reason: f.reason, opening: f.opening }, crypto.randomUUID().replace(/-/g, ''));
    setF({ ...f, amount: '', reason: '' });
  }, 'سُجّلت التسوية في الدفتر'); }}>
    <p className="mute">الدفتر لا يُعدَّل؛ كل تصحيح حركة جديدة بسبب واضح وتظهر في كشف المحل.</p>
    <ShopPick shops={shops} value={f.shopId} onChange={(v) => setF({ ...f, shopId: v })} />
    <div className="row"><Field label="المبلغ (₪)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
      <Field label="الاتجاه"><select value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })}><option value="debit">على المحل (مدين)</option><option value="credit">للمحل (دائن)</option></select></Field></div>
    <Field label="السبب"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required /></Field>
    <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={f.opening} onChange={(e) => setF({ ...f, opening: e.target.checked })} />رصيد افتتاحي</label>
    {act.view}
    <button className="btn primary" disabled={act.busy || !f.shopId}>تسجيل التسوية</button>
  </form>;
}

function Invoices() {
  const { api } = useSession();
  const [status, setStatus] = useState('');
  const { data, error } = useLoad<{ invoices: any[] }>(`/invoices${status ? `?status=${status}` : ''}`);
  return <>
    <div className="chips"><button className={!status ? 'chip on' : 'chip'} onClick={() => setStatus('')}>الكل</button>{Object.entries(INV_STATUS).map(([k, l]) => <button key={k} className={status === k ? 'chip on' : 'chip'} onClick={() => setStatus(k)}>{l}</button>)}</div>
    {!data ? <Loading error={error} /> : data.invoices.length === 0 ? <p className="empty">لا فواتير.</p> : <table className="table"><thead><tr><th>الفاتورة</th><th>المحل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th></th></tr></thead>
      <tbody>{data.invoices.map((i) => <tr key={i.id}><td className="num">{i.number}</td><td>{i.shopName}</td><td>{formatDate(i.issuedAt)}</td><td className="num">{formatMoney(i.total)}</td><td className="num">{formatMoney(i.paid)}</td><td className="num">{formatMoney(i.remaining)}</td><td>{INV_STATUS[i.status] ?? i.status}</td>
        <td><button className="link" onClick={() => void openPrintable(api, `/invoices/${i.id}/print`)}>طباعة</button></td></tr>)}</tbody></table>}
  </>;
}
