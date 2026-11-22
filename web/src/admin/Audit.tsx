import { useEffect, useState } from 'react';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon } from '../ui/Icons';
import { useLoad } from './kit';

/** أسماء العمليات بالعربي: من عدّل السعر، من سجّل الدفعة، من ألغى الطلب (SRS 11.3). */
export const ACTIONS: Record<string, string> = {
  'auth.login': 'تسجيل دخول', 'auth.password.change': 'تغيير كلمة المرور', 'auth.sessions.revoke': 'إنهاء الجلسات', 'auth.mfa.enable': 'تفعيل التحقق بخطوتين', 'auth.mfa.disable': 'إيقاف التحقق بخطوتين',
  'orders.submit': 'إرسال طلب', 'orders.transition': 'تغيير حالة طلب', 'orders.change.request': 'تعديل طلب', 'orders.assign': 'تحويل طلب لموظف', 'orders.due': 'تعديل موعد طلب', 'orders.overdue': 'طلب متأخر',
  'delivery.assign': 'إسناد لمندوب',
  'products.create': 'إضافة منتج', 'products.update': 'تعديل منتج', 'products.price': 'تعديل سعر', 'products.availability': 'تغيير توفر', 'products.archive': 'أرشفة منتج', 'files.upload': 'رفع صورة',
  'categories.create': 'إضافة تصنيف', 'categories.update': 'تعديل تصنيف', 'categories.delete': 'حذف تصنيف', 'units.upsert': 'حفظ وحدة', 'units.delete': 'حذف وحدة',
  'invoices.issue': 'إصدار فاتورة', 'invoices.void': 'إلغاء فاتورة', 'invoices.return': 'مرتجع', 'payments.create': 'تسجيل دفعة', 'payments.reverse': 'عكس دفعة', 'ledger.adjust': 'تسوية رصيد',
  'promotions.create': 'إضافة عرض', 'promotions.update': 'تعديل عرض',
  'shops.create': 'إنشاء محل', 'shops.update': 'تعديل محل', 'shops.profile': 'تعديل بيانات محل', 'shops.members.update': 'تعديل موظفي محل',
  'users.create': 'إنشاء مستخدم', 'users.suspend': 'إيقاف مستخدم', 'users.activate': 'تفعيل مستخدم', 'shops.suspend': 'إيقاف محل', 'shops.activate': 'تفعيل محل', 'users.update': 'تعديل مستخدم', 'users.password.reset': 'إعادة تعيين كلمة مرور', 'users.sessions.revoke': 'إنهاء جلسات مستخدم',
  'roles.upsert': 'حفظ دور', 'roles.delete': 'حذف دور', 'permissions.add': 'إضافة صلاحية', 'settings.update': 'تعديل الإعدادات',
  'support.create': 'فتح تذكرة دعم', 'support.update': 'تحديث تذكرة',
};
const KINDS: Record<string, string> = { order: 'طلب', product: 'منتج', payment: 'دفعة', invoice: 'فاتورة', shop: 'محل', user: 'مستخدم', category: 'تصنيف', unit: 'وحدة', promotion: 'عرض', role: 'دور', login: 'دخول', file: 'ملف', ticket: 'تذكرة', settings: 'إعدادات', permission: 'صلاحية' };

interface Log { id: string; at: number; action: string; actor: string; actorId: string; entity: { kind: string; id: string }; result: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; ip: string; device: string }

/** الحقول التي تغيّرت فقط، بقيمها قبل وبعد. */
function changes(b: Log['before'], a: Log['after']): Array<[string, unknown, unknown]> {
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
  const out: Array<[string, unknown, unknown]> = [];
  for (const k of keys) {
    if (['updatedAt', 'createdAt', 'searchKeys', 'version'].includes(k)) continue;
    const x = b?.[k]; const y = a?.[k];
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push([k, x, y]);
  }
  return out;
}
const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v));

/** سجل العمليات: من فعل ماذا ومتى، مع ما تغيّر بالضبط. */
export function Audit() {
  const { api } = useSession();
  const users = useLoad<{ users: Array<{ uid: string; displayName: string }> }>('/admin/users');
  const [filter, setFilter] = useState<{ k: 'actor' | 'action' | 'entity' | ''; v: string }>({ k: '', v: '' });
  const [entity, setEntity] = useState('');
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = (before?: number) => {
    const q = new URLSearchParams();
    if (filter.k && filter.v) q.set(filter.k, filter.v);
    if (before) q.set('before', String(before));
    const s = q.toString();
    return `/admin/audit${s ? `?${s}` : ''}`;
  };
  const load = async (more = false) => {
    setBusy(true); setError('');
    try {
      const r = await api.get<{ logs: Log[]; next: number | null }>(path(more ? next ?? undefined : undefined));
      setLogs((prev) => (more && prev ? [...prev, ...r.logs] : r.logs));
      setNext(r.next);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { setLogs(api.cached<{ logs: Log[] }>(path())?.logs ?? null); void load(); }, [filter.k, filter.v]);
  return (
    <section>
      <h1>سجل العمليات</h1>
      <div className="row wrap">
        <label>الموظف<select value={filter.k === 'actor' ? filter.v : ''} onChange={(e) => setFilter(e.target.value ? { k: 'actor', v: e.target.value } : { k: '', v: '' })}>
          <option value="">الكل</option>
          {(users.data?.users ?? []).map((u) => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
          <option value="system">النظام (تلقائي)</option>
        </select></label>
        <label>العملية<select value={filter.k === 'action' ? filter.v : ''} onChange={(e) => setFilter(e.target.value ? { k: 'action', v: e.target.value } : { k: '', v: '' })}>
          <option value="">الكل</option>
          {Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setFilter(entity.trim() ? { k: 'entity', v: entity.trim() } : { k: '', v: '' }); }}>
          <label>معرّف عنصر<input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="طلب أو منتج أو محل" dir="ltr" /></label>
          <button className="btn" type="submit"><Icon name="search" /> بحث</button>
        </form>
      </div>
      <p className="mute small">فلتر واحد في كل مرة. الأحدث أولاً.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!logs ? <div className="skeleton" aria-busy="true" /> : logs.length === 0 ? <p className="empty">لا توجد عمليات مطابقة.</p> : (
        <ul className="audit">{logs.map((l) => {
          const diff = changes(l.before, l.after);
          return (
            <li key={l.id} className={l.result !== 'ok' ? 'denied' : ''}>
              <div className="audit-head">
                <b>{ACTIONS[l.action] ?? l.action}</b>
                <span>{l.actor}</span>
                <button className="link num" onClick={() => setFilter({ k: 'entity', v: l.entity.id })} title="كل عمليات هذا العنصر">{KINDS[l.entity.kind] ?? l.entity.kind} {l.entity.id.slice(0, 10)}</button>
                <time className="mute num">{formatDate(l.at)}</time>
                {l.result !== 'ok' && <span className="chip danger">{l.result === 'denied' ? 'مرفوض' : 'فشل'}</span>}
              </div>
              {diff.length > 0 && <details><summary>ما تغيّر ({diff.length})</summary>
                <table className="table"><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>
                  <tbody>{diff.map(([k, b, a]) => <tr key={k}><td>{k}</td><td className="num">{show(b)}</td><td className="num">{show(a)}</td></tr>)}</tbody></table>
                <p className="mute small num" dir="ltr">{l.ip} · {l.device}</p>
              </details>}
            </li>
          );
        })}</ul>
      )}
      {next && <button className="btn block" disabled={busy} onClick={() => void load(true)}>{busy ? 'جارٍ التحميل…' : 'عرض الأقدم'}</button>}
    </section>
  );
}
