import { useState } from 'react';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon } from '../ui/Icons';
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
  const [adding, setAdding] = useState(false);
  const [pq, setPq] = useState('');
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
    setAdding(false);
    setF({ ...f, name: '', productIds: [], terms: '' });
  }, 'أُنشئ العرض');
  const now = Date.now();
  const toggleP = (id: string) => setF({ ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id] });
  const shown = cat.data.products.filter((p) => !pq.trim() || p.name.includes(pq.trim()));
  return (
    <section className="promos">
      <div className="team-tools"><h1>العروض والخصومات</h1>{!adding && <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> عرض جديد</button>}</div>
      {act.view}
      {adding && (
        <form className="card form-block" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="team-tools"><h3>عرض جديد</h3><button type="button" className="btn ghost" onClick={() => setAdding(false)}>إلغاء</button></div>
          <div className="two">
            <Field label="اسم العرض"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="مثال: أسبوع الأجبان" /></Field>
            <Field label="النوع"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(PROMO_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="يبدأ"><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required /></Field>
            <Field label="ينتهي"><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required /></Field>
            {['item_percent', 'qty_percent', 'bundle_percent'].includes(f.type) && <Field label="نسبة الخصم %"><input inputMode="decimal" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>}
            {f.type === 'item_amount' && <Field label="الخصم لكل وحدة (₪)"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>}
            {f.type === 'qty_percent' && <Field label="الكمية الدنيا"><input inputMode="decimal" value={f.minQty} onChange={(e) => setF({ ...f, minQty: e.target.value })} /></Field>}
            {f.type === 'bxgy' && <><Field label="اشترِ"><input inputMode="numeric" value={f.buy} onChange={(e) => setF({ ...f, buy: e.target.value })} /></Field><Field label="واحصل على"><input inputMode="numeric" value={f.get} onChange={(e) => setF({ ...f, get: e.target.value })} /></Field></>}
            <Field label="حد أدنى للشراء (₪، اختياري)"><input inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          </div>
          <h4>المنتجات المشمولة <span className="count num">{f.productIds.length}</span></h4>
          {f.productIds.length > 0 && <div className="chips wrap">{f.productIds.map((id) => <button type="button" key={id} className="chip on" onClick={() => toggleP(id)}>{names.get(id) ?? id} <Icon name="close" size={14} /></button>)}</div>}
          <div className="search"><Icon name="search" /><input type="search" aria-label="بحث المنتجات" placeholder="ابحث عن منتج لإضافته" value={pq} onChange={(e) => setPq(e.target.value)} /></div>
          <div className="pick-list">{shown.map((p) => <label key={p.id} className={`perm-row check${f.productIds.includes(p.id) ? ' has' : ''}`}><input type="checkbox" checked={f.productIds.includes(p.id)} onChange={() => toggleP(p.id)} /><span>{p.name}</span></label>)}</div>
          <Field label="الشروط (تظهر للمحلات)"><textarea rows={2} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
          <button className="btn primary block" disabled={act.busy || !f.name.trim() || f.productIds.length === 0 || !f.start || !f.end}>إنشاء العرض</button>
        </form>
      )}
      {promos.data.promotions.length === 0 ? <p className="empty">لا عروض بعد. أنشئ أول عرض وسيظهر للمحلات في الرئيسية فوراً.</p> : (
        <ul className="promo-list">{promos.data.promotions.map((p) => {
          const live = p.active && p.startsAt <= now && p.endsAt > now;
          return (
            <li key={p.id} className="card">
              <div className="promo-top">
                <span className="promo-title"><b>{p.name}</b><small className="mute">{PROMO_TYPES[p.type]} · {formatDate(p.startsAt)} — {formatDate(p.endsAt)}</small></span>
                <span className={`chip ${live ? 'tone-success' : p.endsAt <= now ? 'tone-danger' : ''}`}>{live ? 'يعمل الآن' : p.endsAt <= now ? 'منتهٍ' : p.active ? 'مجدول' : 'متوقف'}</span>
              </div>
              <p className="small">{p.productIds.map((id: string) => names.get(id) ?? id).join('، ')}</p>
              <Toggle title="مفعّل" hint="إيقافه يخفيه عن المحلات فوراً" on={p.active} set={() => void act.run(() => api.patch(`/admin/promotions/${p.id}`, { active: !p.active }).then(promos.reload))} />
            </li>
          );
        })}</ul>
      )}
    </section>
  );
}

// ===== الإعدادات =====
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** مفتاح تشغيل/إيقاف بعنوان وشرح سطر واحد. */
export function Toggle({ title, hint, on, set }: { title: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="switch-row">
      <span><b>{title}</b>{hint && <small className="mute">{hint}</small>}</span>
      <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => set(e.target.checked)} aria-checked={on} />
    </label>
  );
}

const SET_KEYS = ['platformName', 'workDays', 'orderIntakeStart', 'orderIntakeEnd', 'deliveryStart', 'deliveryEnd', 'slaWorkingHours', 'defaultPrepMinutes', 'holidays', 'paymentMethods', 'creditWarnPercent', 'backupRetentionDays', 'supplier', 'creditBlocksDeferredOrders', 'newOrderSound', 'mfaFeature'] as const;
const NUMS = new Set(['slaWorkingHours', 'defaultPrepMinutes', 'creditWarnPercent', 'backupRetentionDays']);

export function Settings() {
  const { api, refresh } = useSession();
  const { data, error, reload } = useLoad<{ settings: any }>('/settings');
  const act = useAction();
  const [s, setS] = useState<any>(null);
  const [holiday, setHoliday] = useState('');
  if (!data) return <Loading error={error} />;
  const v = s ?? data.settings;
  const set = (k: string, val: unknown) => setS({ ...v, [k]: val });
  const sup = v.supplier ?? { name: '', phone: '', address: '', taxId: '' };
  const setSup = (k: string, val: string) => set('supplier', { ...sup, [k]: val });
  const save = () => act.run(async () => {
    const body: Record<string, unknown> = {};
    // يُرسل ما تغيّر فقط
    for (const k of SET_KEYS) if (s && JSON.stringify(s[k]) !== JSON.stringify(data.settings[k]) && s[k] !== undefined) body[k] = NUMS.has(k) ? Number(s[k]) : s[k];
    await api.patch('/admin/settings', body);
    setS(null); await reload();
    if ('mfaFeature' in body) await refresh();
  }, 'حُفظت الإعدادات');
  return (
    <section className="settings">
      <h1>الإعدادات</h1>
      <div className="settings-grid">
        <section className="card form-block">
          <h3><Icon name="home" size={18} /> المنصة والمورد</h3>
          <Field label="اسم المنصة"><input value={v.platformName} onChange={(e) => set('platformName', e.target.value)} /></Field>
          <div className="two">
            <Field label="اسم المورد على الفواتير"><input value={sup.name} onChange={(e) => setSup('name', e.target.value)} /></Field>
            <Field label="هاتف المورد"><input dir="ltr" inputMode="tel" value={sup.phone ?? ''} onChange={(e) => setSup('phone', e.target.value)} /></Field>
            <Field label="العنوان"><input value={sup.address ?? ''} onChange={(e) => setSup('address', e.target.value)} /></Field>
            <Field label="الرقم الضريبي (اختياري)"><input dir="ltr" value={sup.taxId ?? ''} onChange={(e) => setSup('taxId', e.target.value)} /></Field>
          </div>
        </section>

        <section className="card form-block">
          <h3><Icon name="clock" size={18} /> أيام وأوقات العمل</h3>
          <div className="chips wrap">{DAYS.map((d, i) => <button key={d} aria-pressed={v.workDays.includes(i)} className={v.workDays.includes(i) ? 'chip on' : 'chip'} onClick={() => set('workDays', v.workDays.includes(i) ? v.workDays.filter((x: number) => x !== i) : [...v.workDays, i])}>{d}</button>)}</div>
          <div className="two">
            <Field label="بداية استقبال الطلبات"><input type="time" value={v.orderIntakeStart} onChange={(e) => set('orderIntakeStart', e.target.value)} /></Field>
            <Field label="نهاية الاستقبال"><input type="time" value={v.orderIntakeEnd} onChange={(e) => set('orderIntakeEnd', e.target.value)} /></Field>
            <Field label="بداية التوصيل"><input type="time" value={v.deliveryStart} onChange={(e) => set('deliveryStart', e.target.value)} /></Field>
            <Field label="نهاية التوصيل"><input type="time" value={v.deliveryEnd} onChange={(e) => set('deliveryEnd', e.target.value)} /></Field>
          </div>
          <h4>العطلات الرسمية</h4>
          <div className="row"><input type="date" aria-label="تاريخ العطلة" value={holiday} onChange={(e) => setHoliday(e.target.value)} /><button className="btn" disabled={!holiday} onClick={() => { set('holidays', [...new Set([...v.holidays, holiday])].sort()); setHoliday(''); }}><Icon name="plus" /> إضافة</button></div>
          {v.holidays.length > 0 ? <div className="chips wrap">{v.holidays.map((h: string) => <button key={h} className="chip" aria-label={`إزالة ${h}`} onClick={() => set('holidays', v.holidays.filter((x: string) => x !== h))}><span className="num">{h}</span> <Icon name="close" size={14} /></button>)}</div> : <p className="mute small">لا عطلات مسجلة.</p>}
        </section>

        <section className="card form-block">
          <h3><Icon name="truck" size={18} /> الطلبات والتوصيل</h3>
          <div className="two">
            <Field label="مدة التوصيل المستهدفة (ساعات عمل)"><input inputMode="decimal" value={v.slaWorkingHours} onChange={(e) => set('slaWorkingHours', e.target.value)} /></Field>
            <Field label="مدة التجهيز الافتراضية (دقيقة)"><input inputMode="numeric" value={v.defaultPrepMinutes} onChange={(e) => set('defaultPrepMinutes', e.target.value)} /></Field>
          </div>
          <Toggle title="صوت عند وصول طلب جديد" hint="تنبيه مسموع لموظفي الطلبات" on={v.newOrderSound !== false} set={(x) => set('newOrderSound', x)} />
        </section>

        <section className="card form-block">
          <h3><Icon name="wallet" size={18} /> المالية والدفع</h3>
          <h4>طرق الدفع المتاحة للمحلات</h4>
          {v.paymentMethods.map((m: any, i: number) => <Toggle key={m.id} title={m.label} hint={m.id === 'cash' ? 'النقدي يبقى مفعّلاً دائماً' : undefined} on={m.enabled} set={(x) => { if (m.id !== 'cash') set('paymentMethods', v.paymentMethods.map((y: any, j: number) => (j === i ? { ...y, enabled: x } : y))); }} />)}
          <Field label="تنبيه الائتمان عند استهلاك (%)"><input inputMode="numeric" value={v.creditWarnPercent} onChange={(e) => set('creditWarnPercent', e.target.value)} /></Field>
          <Toggle title="منع الطلب الآجل عند تجاوز حد الائتمان" hint="المحل يستطيع الطلب نقداً فقط حتى يسدد" on={v.creditBlocksDeferredOrders !== false} set={(x) => set('creditBlocksDeferredOrders', x)} />
        </section>

        <section className="card form-block">
          <h3><Icon name="shield" size={18} /> الأمان والنسخ</h3>
          <Toggle title="التحقق بخطوتين" hint="عند التشغيل يستطيع كل مستخدم تفعيله لحسابه من «أمان حسابي»، ويُطلب رمز من تطبيق المصادقة عند الدخول. الإيقاف يلغي طلب الرمز للجميع فوراً." on={v.mfaFeature === true} set={(x) => set('mfaFeature', x)} />
          <Field label="الاحتفاظ بالنسخ الاحتياطية (يوم)"><input inputMode="numeric" value={v.backupRetentionDays} onChange={(e) => set('backupRetentionDays', e.target.value)} /></Field>
        </section>
      </div>
      {act.view}
      <div className="sticky-actions"><button className="btn primary block" disabled={act.busy || !s} onClick={() => void save()}>حفظ الإعدادات</button>{s && <button className="btn ghost" onClick={() => setS(null)}>تراجع</button>}</div>
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
