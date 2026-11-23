// المساعدة والدعم: دليل الاستخدام حسب الدور (من spec/guide.json) + تذاكر الدعم للمستخدم نفسه
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import guide from '../../../spec/guide.json';
import { formatDate } from '../lib/format';
import { normalizeArabic } from '../../../worker/src/domain/search';
import { useSession } from '../lib/session';
import { Icon, type IconName } from './Icons';

export type GuideRole = 'shop' | 'admin' | 'agent';
type Topic = { id: string; icon: string; title: string; steps: string[]; tip?: string; perms?: string[] };

/** موضوعات الدليل المسموحة: موضوع الإدارة يظهر إن امتلك المستخدم واحدة من صلاحياته. */
export function guideTopics(role: GuideRole, can: (p: string) => boolean): Topic[] {
  return (guide.roles[role] as Topic[]).filter((t) => !t.perms?.length || t.perms.some(can));
}

export function HelpCenter({ role, focusTicket }: { role: GuideRole; focusTicket?: boolean }) {
  const { can } = useSession();
  const [tab, setTab] = useState<'guide' | 'support'>(focusTicket ? 'support' : 'guide');
  const support = can('support.create');
  return (
    <div className="help">
      {support && (
        <div className="seg-tabs" role="tablist" aria-label="المساعدة">
          <button role="tab" aria-selected={tab === 'guide'} className={tab === 'guide' ? 'on' : ''} onClick={() => setTab('guide')}><Icon name="list" size={18} /> دليل الاستخدام</button>
          <button role="tab" aria-selected={tab === 'support'} className={tab === 'support' ? 'on' : ''} onClick={() => setTab('support')}><Icon name="chat" size={18} /> تواصل مع الدعم</button>
        </div>
      )}
      {tab === 'guide' || !support ? <Guide role={role} /> : <MyTickets />}
    </div>
  );
}

function Guide({ role }: { role: GuideRole }) {
  const { can } = useSession();
  const topics = useMemo(() => guideTopics(role, can), [role, can]);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const shown = useMemo(() => {
    const n = normalizeArabic(dq.trim());
    if (!n) return topics;
    return topics.filter((t) => normalizeArabic([t.title, ...t.steps, t.tip ?? ''].join(' ')).includes(n));
  }, [topics, dq]);
  return (
    <div className="guide">
      <label className="guide-search"><Icon name="search" size={18} /><input type="search" aria-label="ابحث في الدليل" placeholder="ابحث في الدليل: سلة، دفعة، عرض…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {shown.length === 0 && <p className="empty">لا يوجد موضوع بهذه الكلمة. جرّب كلمة أخرى أو تواصل مع الدعم.</p>}
      <div className="guide-list">
        {shown.map((t, i) => (
          <details key={t.id} className="guide-topic" open={!!dq.trim() || (i === 0 && !dq)}>
            <summary><span className="guide-ico"><Icon name={t.icon as IconName} size={20} /></span><b>{t.title}</b><Icon name="chevron" size={18} /></summary>
            <ol>{t.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
            {t.tip && <p className="guide-tip"><Icon name="sparkle" size={16} /> {t.tip}</p>}
          </details>
        ))}
      </div>
    </div>
  );
}

const TYPES: Array<[string, string]> = [['inquiry', 'استفسار'], ['problem', 'مشكلة'], ['complaint', 'شكوى']];
const T_STATUS: Record<string, [string, string]> = { open: ['مفتوحة', 'warn'], in_progress: ['قيد المعالجة', 'warn'], resolved: ['محلولة', 'ok'], closed: ['مغلقة', 'mute'] };
type Ticket = { id: string; type: string; subject: string; body: string; status: string; createdAt: number; replies?: Array<{ text: string; at: number }> };

function MyTickets() {
  const { api } = useSession();
  const [list, setList] = useState<Ticket[] | null>(() => api.cached<{ tickets: Ticket[] }>('/support')?.tickets ?? null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ type: 'inquiry', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.get<{ tickets: Ticket[] }>('/support').then((r) => { setList(r.tickets); setError(''); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [api]);
  const send = async () => {
    if (f.subject.trim().length < 3 || f.body.trim().length < 3) { setMsg({ ok: false, text: 'اكتب عنواناً وتفاصيل واضحة' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api.post('/support', { type: f.type, subject: f.subject.trim(), body: f.body.trim() }, crypto.randomUUID().replace(/-/g, ''));
      setF({ type: f.type, subject: '', body: '' });
      setMsg({ ok: true, text: 'وصلت رسالتك للإدارة، وسيصلك الرد بإشعار' });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  return (
    <div className="tickets">
      <form className="panel ticket-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <h3>رسالة جديدة</h3>
        <div className="chips" role="radiogroup" aria-label="نوع الرسالة">
          {TYPES.map(([k, l]) => <button type="button" role="radio" aria-checked={f.type === k} key={k} className={f.type === k ? 'chip on' : 'chip'} onClick={() => setF({ ...f, type: k })}>{l}</button>)}
        </div>
        <label>العنوان<input maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="مثلاً: نقص في طلب أمس" /></label>
        <label>التفاصيل<textarea rows={4} maxLength={3000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="اكتب ما حدث ورقم الطلب إن وُجد" /></label>
        {msg && <p className={msg.ok ? 'ok-text' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
      </form>
      <h3 className="tickets-title">رسائلي</h3>
      {error && !list && <p className="error" role="alert">{error}</p>}
      {!list && !error && <div className="skeleton" aria-busy="true" />}
      {list?.length === 0 && <p className="empty">لا رسائل بعد.</p>}
      {list?.map((t) => (
        <article key={t.id} className="ticket">
          <header><b>{t.subject}</b><span className={`chip ${T_STATUS[t.status]?.[1] ?? ''}`}>{T_STATUS[t.status]?.[0] ?? t.status}</span></header>
          <small className="mute">{TYPES.find(([k]) => k === t.type)?.[1]} · {formatDate(t.createdAt)}</small>
          <p>{t.body}</p>
          {t.replies?.map((r, i) => <p key={i} className="ticket-reply"><Icon name="chat" size={16} /> <span>{r.text}</span></p>)}
        </article>
      ))}
    </div>
  );
}
