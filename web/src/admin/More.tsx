import { useState } from 'react';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { Field, Loading, toAgorot, useAction, useLoad } from './kit';

// ===== العروض =====
const PROMO_TYPES: Record<string, string> = { item_percent: 'خصم نسبة على صنف', item_amount: 'خصم مبلغ على الوحدة', qty_percent: 'خصم عند كمية', bxgy: 'اشترِ واحصل', bundle_percent: 'خصم مجموعة' };
const day = (s: string) => Date.parse(`${s}T00:00:00`);

export function Promotions() {
  const { api } = useSession();
  const promos = useLoad<{ promotions: any[] }>('/promotions');
  const cat = useLoad<{ products: Array<{ id: string; name: string }> }>('/catalog');
  const act = useAction();
  const [f, setF] = useState({ name: '', type: 'item_percent', productIds: [] as string[], start: '', end: '', percent: '10', amount: '', minQty: '1', buy: '2', get: '1', min: '', terms: '' });
  if (!promos.data || !cat.data) return <Loading error={promos.error || cat.error} />;
  const names = new Map(cat.data.products.map((p) => [p.id, p.name]));
  const create = () => act.run(async () => {
    const body: Record<string, unknown> = { name: f.name, type: f.type, productIds: f.productIds, startsAt: day(f.start), endsAt: day(f.end) + 86_400_000, terms: f.terms, minPurchase: f.min ? toAgorot(f.min) : 0 };
    if (['item_percent', 'qty_percent', 'bundle_percent'].includes(f.type)) body.percentBp = Math.round(Number(f.percent) * 100);
    if (f.type === 'item_amount') body.amountPerUnit = toAgorot(f.amount);
    if (f.type === 'qty_percent') body.minQtyMilli = Math.round(Number(f.minQty) * 1000);
    if (f.type === 'bxgy') { body.buyQty = Number(f.buy); body.getQty = Number(f.get); }
    await api.post('/admin/promotions', body, crypto.randomUUID().replace(/-/g, ''));
    await promos.reload();
  }, 'أُنشئ العرض');
  return (
    <section>
      <h1>العروض</h1>
      <div className="two">
        <form className="card" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <Field label="اسم العرض"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="النوع"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(PROMO_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="المنتجات المشمولة"><select multiple size={6} value={f.productIds} onChange={(e) => setF({ ...f, productIds: [...e.target.selectedOptions].map((o) => o.value) })}>{cat.data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="row"><Field label="من"><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></Field><Field label="إلى"><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required /></Field></div>
          {['item_percent', 'qty_percent', 'bundle_percent'].includes(f.type) && <Field label="نسبة الخصم %"><input inputMode="decimal" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>}
          {f.type === 'item_amount' && <Field label="الخصم لكل وحدة (₪)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>}
          {f.type === 'qty_percent' && <Field label="الكمية الدنيا"><input inputMode="decimal" value={f.minQty} onChange={(e) => setF({ ...f, minQty: e.target.value })} /></Field>}
          {f.type === 'bxgy' && <div className="row"><Field label="اشترِ"><input inputMode="numeric" value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} /></Field><Field label="واحصل على"><input inputMode="numeric" value={f.get} onChange={(e) => setF({ ...f, get: e.target.value })} /></Field></div>}
          <Field label="حد أدنى للشراء (₪، اختياري)"><input inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Field label="الشروط"><textarea rows={2} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
          {act.view}
          <button className="btn primary" disabled={act.busy}>إنشاء العرض</button>
        </form>
        <div className="card"><h3>العروض الحالية</h3>{promos.data.promotions.length === 0 ? <p className="empty">لا عروض.</p> : <ul className="plain">{promos.data.promotions.map((p) => <li key={p.id} className="row">
          <span style={{ flex: 1 }}><b>{p.name}</b> <small className="mute">{PROMO_TYPES[p.type]} · {formatDate(p.startsAt)} — {formatDate(p.endsAt)}</small><br /><small>{p.productIds.map((id: string) => names.get(id) ?? id).join('، ')}</small></span>
          <button className={`chip ${p.active ? 'tone-success' : ''}`} onClick={() => void act.run(() => api.patch(`/admin/promotions/${p.id}`, { active: !p.active }).then(promos.reload))}>{p.active ? 'مفعّل' : 'متوقف'}</button></li>)}</ul>}</div>
      </div>
    </section>
  );
}

// ===== الإعدادات =====
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function Settings() {
  const { api } = useSession();
  const { data, error, reload } = useLoad<{ settings: any }>('/settings');
  const act = useAction();
  const [s, setS] = useState<any>(null);
  const [holiday, setHoliday] = useState('');
  if (!data) return <Loading error={error} />;
  const v = s ?? data.settings;
  const set = (k: string, val: unknown) => setS({ ...v, [k]: val });
  const save = () => act.run(async () => {
    const { platformName, workDays, orderIntakeStart, orderIntakeEnd, deliveryStart, deliveryEnd, slaWorkingHours, defaultPrepMinutes, holidays, paymentMethods, creditWarnPercent, backupRetentionDays, supplier } = v;
    await api.patch('/admin/settings', { platformName, workDays, orderIntakeStart, orderIntakeEnd, deliveryStart, deliveryEnd, slaWorkingHours: Number(slaWorkingHours), defaultPrepMinutes: Number(defaultPrepMinutes), holidays, paymentMethods, creditWarnPercent: Number(creditWarnPercent), backupRetentionDays: Number(backupRetentionDays), ...(supplier ? { supplier } : {}) });
    setS(null); await reload();
  });
  return (
    <section>
      <h1>الإعدادات</h1>
      <div className="two">
        <div className="card">
          <h3>أيام العمل والعطلة الأسبوعية</h3>
          <div className="chips" style={{ flexWrap: 'wrap' }}>{DAYS.map((d, i) => <button key={d} aria-pressed={v.workDays.includes(i)} className={v.workDays.includes(i) ? 'chip on' : 'chip'} onClick={() => set('workDays', v.workDays.includes(i) ? v.workDays.filter((x: number) => x !== i) : [...v.workDays, i])}>{d}</button>)}</div>
          <div className="row">
            <Field label="بداية استقبال الطلبات"><input type="time" value={v.orderIntakeStart} onChange={(e) => set('orderIntakeStart', e.target.value)} /></Field>
            <Field label="نهاية الاستقبال"><input type="time" value={v.orderIntakeEnd} onChange={(e) => set('orderIntakeEnd', e.target.value)} /></Field>
          </div>
          <div className="row">
            <Field label="بداية التوصيل"><input type="time" value={v.deliveryStart} onChange={(e) => set('deliveryStart', e.target.value)} /></Field>
            <Field label="نهاية التوصيل"><input type="time" value={v.deliveryEnd} onChange={(e) => set('deliveryEnd', e.target.value)} /></Field>
          </div>
          <h3>العطلات الرسمية</h3>
          <div className="row"><input type="date" aria-label="تاريخ العطلة" value={holiday} onChange={(e) => setHoliday(e.target.value)} style={{ width: 'auto' }} /><button className="btn" onClick={() => { if (holiday) { set('holidays', [...new Set([...v.holidays, holiday])].sort()); setHoliday(''); } }}>إضافة</button></div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>{v.holidays.map((h: string) => <button key={h} className="chip" aria-label={`إزالة ${h}`} onClick={() => set('holidays', v.holidays.filter((x: string) => x !== h))}><span className="num">{h}</span> ×</button>)}</div>
        </div>
        <div className="card">
          <Field label="اسم المنصة"><input value={v.platformName} onChange={(e) => set('platformName', e.target.value)} /></Field>
          <Field label="مدة التوصيل المستهدفة (ساعات عمل)"><input inputMode="numeric" value={v.slaWorkingHours} onChange={(e) => set('slaWorkingHours', e.target.value)} /></Field>
          <Field label="مدة التجهيز الافتراضية (دقيقة)"><input inputMode="numeric" value={v.defaultPrepMinutes} onChange={(e) => set('defaultPrepMinutes', e.target.value)} /></Field>
          <Field label="تنبيه الائتمان عند (%)"><input inputMode="numeric" value={v.creditWarnPercent} onChange={(e) => set('creditWarnPercent', e.target.value)} /></Field>
          <Field label="الاحتفاظ بالنسخ الاحتياطية (يوم)"><input inputMode="numeric" value={v.backupRetentionDays} onChange={(e) => set('backupRetentionDays', e.target.value)} /></Field>
          <h3>طرق الدفع</h3>
          {v.paymentMethods.map((m: any, i: number) => <label key={m.id} className="row" style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={m.enabled} onChange={(e) => set('paymentMethods', v.paymentMethods.map((x: any, j: number) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />{m.label}</label>)}
        </div>
      </div>
      {act.view}
      <div className="actions"><button className="btn primary" disabled={act.busy || !s} onClick={() => void save()}>حفظ الإعدادات</button>{s && <button className="btn ghost" onClick={() => setS(null)}>تراجع</button>}</div>
    </section>
  );
}

// ===== النسخ الاحتياطي =====
export function Backups() {
  const { api } = useSession();
  const { data, error, reload } = useLoad<{ backups: any[] }>('/admin/backups');
  const act = useAction();
  if (!data) return <Loading error={error} />;
  return (
    <section>
      <h1>النسخ الاحتياطي</h1>
      <p className="mute">نسخة يومية مشفرة تلقائياً الساعة 01:00. الاستعادة تتم من بيئة اختبار أولاً حسب دليل التشغيل.</p>
      <button className="btn primary" disabled={act.busy} onClick={() => void act.run(() => api.post('/admin/backups/run').then(reload), 'اكتملت النسخة')}>نسخة الآن</button>
      {act.view}
      <table className="table"><thead><tr><th>الوقت</th><th>المستندات</th><th>الحجم</th><th>الحالة</th></tr></thead>
        <tbody>{data.backups.map((b) => <tr key={b.id}><td>{formatDate(b.at)}</td><td className="num">{b.docs ?? '—'}</td><td className="num">{b.bytes ? `${Math.round(b.bytes / 1024)} KB` : '—'}</td><td className={b.status === 'ok' ? 'ok-text' : 'danger-text'}>{b.status === 'ok' ? 'ناجحة' : b.error ?? 'فشلت'}</td></tr>)}</tbody></table>
    </section>
  );
}

// ===== الدعم =====
const T_STATUS: Record<string, string> = { open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'محلولة', closed: 'مغلقة' };

export function Support() {
  const { api } = useSession();
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useLoad<{ tickets: any[] }>(`/support?status=${status}`);
  const act = useAction();
  const [reply, setReply] = useState<Record<string, string>>({});
  return (
    <section>
      <h1>الدعم الفني</h1>
      <div className="chips">{Object.entries(T_STATUS).map(([k, l]) => <button key={k} className={status === k ? 'chip on' : 'chip'} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {act.view}
      {!data ? <Loading error={error} /> : data.tickets.length === 0 ? <p className="empty">لا تذاكر.</p> : data.tickets.map((t) => <div key={t.id} className="card" style={{ marginBottom: 12 }}>
        <h3>{t.subject} <small className="mute">{formatDate(t.createdAt)}</small></h3><p>{t.body}</p>
        {t.replies?.map((r: any, i: number) => <p key={i} className="notice">{r.text}</p>)}
        <div className="actions"><input aria-label="الرد" placeholder="اكتب رداً" value={reply[t.id] ?? ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
          <button className="btn primary" onClick={() => void act.run(() => api.patch(`/admin/support/${t.id}`, { reply: reply[t.id], status: 'in_progress' }).then(() => { setReply({ ...reply, [t.id]: '' }); return reload(); }), 'أُرسل الرد')}>رد</button>
          <button className="btn" onClick={() => void act.run(() => api.patch(`/admin/support/${t.id}`, { status: 'resolved' }).then(reload))}>تم الحل</button></div>
      </div>)}
    </section>
  );
}
