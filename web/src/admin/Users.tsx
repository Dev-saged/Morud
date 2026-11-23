import { useMemo, useState } from 'react';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon } from '../ui/Icons';
import { Field, Loading, useAction, useLoad } from './kit';

const HOME_LABEL: Record<string, string> = { 'admin.dashboard': 'لوحة المعلومات', 'admin.orders': 'الطلبات', 'admin.finance': 'المالية', 'admin.products': 'المنتجات', 'admin.delivery': 'التوصيل', 'agent.tasks': 'مهام المندوب', 'shop.home': 'واجهة المحل' };
const KIND_LABEL: Record<string, string> = { staff: 'إدارة', agent: 'مندوب', shop: 'محل' };
/** مجموعات الصلاحيات حسب أول جزء من معرّفها، بالترتيب الذي يفكر به المدير. */
export const PERM_GROUPS: Array<[string, string, string[]]> = [
  ['orders', 'الطلبات', ['orders']],
  ['catalog', 'المنتجات والعروض', ['products', 'categories', 'units', 'promotions']],
  ['shops', 'المحلات', ['shops']],
  ['finance', 'المالية', ['invoices', 'payments', 'accounts', 'reports']],
  ['delivery', 'التوصيل', ['delivery']],
  ['team', 'الفريق والنظام', ['users', 'roles', 'settings', 'audit', 'backups', 'notifications', 'support']],
  ['shop', 'واجهة المحل', ['shop']],
];
const SCOPES: Record<string, string[]> = { staff: ['staff', 'any'], agent: ['agent', 'any'], shop: ['shop', 'any'] };

type Role = { id: string; label: string; kind: string; home: string; permissions: string[]; protected?: boolean };
type Perm = { id: string; scope: string; label: string };
type User = { uid: string; displayName: string; username: string; phone: string | null; email: string | null; status: string; roles: string[]; grant: string[]; deny: string[]; lastLoginAt: number | null };

export function groupPerms(perms: Perm[]): Array<{ id: string; label: string; perms: Perm[] }> {
  const out = PERM_GROUPS.map(([id, label, prefixes]) => ({ id, label, perms: perms.filter((p) => prefixes.includes(p.id.split('.')[0]!)) })).filter((g) => g.perms.length);
  const rest = perms.filter((p) => !out.some((g) => g.perms.includes(p)));
  return rest.length ? [...out, { id: 'other', label: 'أخرى', perms: rest }] : out;
}
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

export function Users() {
  const { can } = useSession();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const roles = useLoad<{ roles: Role[]; permissions: Perm[] }>('/admin/roles');
  const users = useLoad<{ users: User[] }>('/admin/users');
  const staffCount = users.data?.users.length;
  return (
    <section className="team">
      <header className="team-head">
        <h1>المستخدمون والصلاحيات</h1>
        <div className="seg-tabs" role="tablist" aria-label="الأقسام">
          <button role="tab" aria-selected={tab === 'users'} className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}><Icon name="user" /> المستخدمون{staffCount !== undefined && <span className="count num">{staffCount}</span>}</button>
          {can('roles.manage') && <button role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}><Icon name="shield" /> الأدوار<span className="wide-only"> والصلاحيات</span>{roles.data && <span className="count num">{roles.data.roles.length}</span>}</button>}
        </div>
      </header>
      {!roles.data ? <Loading error={roles.error} /> : tab === 'users'
        ? <UserList roles={roles.data.roles} perms={roles.data.permissions} all={users.data?.users ?? null} error={users.error} reload={users.reload} />
        : <RoleEditor roles={roles.data.roles} perms={roles.data.permissions} users={users.data?.users ?? []} reload={roles.reload} />}
    </section>
  );
}

function UserList({ roles, perms, all, error, reload }: { roles: Role[]; perms: Perm[]; all: User[] | null; error: string; reload: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [open, setOpen] = useState<User | 'new' | null>(null);
  const label = new Map(roles.map((r) => [r.id, r.label]));
  const staffRoles = roles.filter((r) => r.kind !== 'shop');
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (all ?? []).filter((u) => (!role || u.roles.includes(role)) && (status === 'all' || u.status === status) && (!n || `${u.displayName} ${u.username} ${u.phone ?? ''}`.toLowerCase().includes(n)));
  }, [all, q, role, status]);
  if (open) return <UserForm user={open === 'new' ? null : open} roles={roles} perms={perms} done={() => { setOpen(null); void reload(); }} />;
  const suspended = (all ?? []).filter((u) => u.status !== 'active').length;
  return <>
    <div className="team-tools">
      <div className="search"><Icon name="search" /><input type="search" aria-label="بحث المستخدمين" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو اسم المستخدم أو الهاتف" /></div>
      <button className="btn primary" onClick={() => setOpen('new')}><Icon name="plus" /> مستخدم جديد</button>
    </div>
    <div className="chips" role="group" aria-label="تصفية حسب الدور">
      <button className={!role ? 'chip on' : 'chip'} onClick={() => setRole(null)}>كل الأدوار</button>
      {staffRoles.map((r) => { const n = (all ?? []).filter((u) => u.roles.includes(r.id)).length; return n ? <button key={r.id} className={role === r.id ? 'chip on' : 'chip'} onClick={() => setRole(role === r.id ? null : r.id)}>{r.label} <span className="num mute">{n}</span></button> : null; })}
      {suspended > 0 && <button className={status === 'suspended' ? 'chip on danger' : 'chip danger'} onClick={() => setStatus(status === 'suspended' ? 'all' : 'suspended')}>موقوف <span className="num">{suspended}</span></button>}
    </div>
    {!all ? <Loading error={error} /> : list.length === 0 ? <p className="empty">لا يوجد مستخدمون مطابقون.</p> : (
      <ul className="people">{list.map((u) => (
        <li key={u.uid}>
          <button className={`person tap${u.status !== 'active' ? ' off' : ''}`} onClick={() => setOpen(u)} aria-label={`${u.displayName}، ${u.roles.map((r) => label.get(r) ?? r).join(' و')}`}>
            <span className="avatar" aria-hidden="true">{initials(u.displayName)}</span>
            <span className="person-main">
              <b>{u.displayName}</b>
              <small className="mute num" dir="ltr">@{u.username}</small>
              <span className="role-tags">{u.roles.map((r) => <span key={r} className="role-tag">{label.get(r) ?? r}</span>)}</span>
            </span>
            <span className="person-side">
              <span className={`chip ${u.status === 'active' ? 'tone-success' : 'tone-danger'}`}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span>
              <small className="mute">{u.lastLoginAt ? `آخر دخول ${formatDate(u.lastLoginAt)}` : 'لم يدخل بعد'}</small>
            </span>
          </button>
        </li>
      ))}</ul>
    )}
  </>;
}

/** حالة الصلاحية للمستخدم: من دوره، أو ممنوحة له خصيصاً، أو محجوبة عنه رغم دوره. */
function PermState({ p, fromRole, f, set }: { p: Perm; fromRole: boolean; f: { grant: string[]; deny: string[] }; set: (v: 'role' | 'grant' | 'deny') => void }) {
  const v = f.deny.includes(p.id) ? 'deny' : f.grant.includes(p.id) ? 'grant' : 'role';
  const effective = v === 'grant' || (v === 'role' && fromRole);
  return (
    <div className={`perm-row${effective ? ' has' : ''}`}>
      <span className="perm-name"><Icon name={effective ? 'check' : 'close'} /> {p.label}</span>
      <span className="tri" role="radiogroup" aria-label={p.label}>
        <button role="radio" aria-checked={v === 'role'} className={v === 'role' ? 'on' : ''} onClick={() => set('role')}>{fromRole ? 'من الدور' : 'بلا'}</button>
        {!fromRole && <button role="radio" aria-checked={v === 'grant'} className={v === 'grant' ? 'on ok' : ''} onClick={() => set('grant')}>منح</button>}
        {fromRole && <button role="radio" aria-checked={v === 'deny'} className={v === 'deny' ? 'on bad' : ''} onClick={() => set('deny')}>حجب</button>}
      </span>
    </div>
  );
}

function UserForm({ user, roles, perms, done }: { user: User | null; roles: Role[]; perms: Perm[]; done: () => void }) {
  const { api, user: me } = useSession();
  const act = useAction();
  const [f, setF] = useState({ displayName: user?.displayName ?? '', username: user?.username ?? '', phone: user?.phone ?? '', email: user?.email ?? '', roles: user?.roles ?? [], grant: user?.grant ?? [], deny: user?.deny ?? [] });
  const [temp, setTemp] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const staffRoles = roles.filter((r) => r.kind !== 'shop');
  const chosen = roles.filter((r) => f.roles.includes(r.id));
  const kinds = new Set(chosen.map((r) => r.kind));
  const fromRoles = new Set(chosen.flatMap((r) => r.permissions));
  const all = fromRoles.has('*');
  const scoped = useMemo(() => perms.filter((p) => [...kinds].some((k) => (SCOPES[k] ?? []).includes(p.scope))), [perms, f.roles]);
  const custom = f.grant.length + f.deny.length;
  const toggleRole = (id: string) => setF((s) => ({ ...s, roles: s.roles.includes(id) ? s.roles.filter((x) => x !== id) : [...s.roles, id] }));
  const setPerm = (id: string, v: 'role' | 'grant' | 'deny') => setF((s) => ({ ...s, grant: v === 'grant' ? [...new Set([...s.grant, id])] : s.grant.filter((x) => x !== id), deny: v === 'deny' ? [...new Set([...s.deny, id])] : s.deny.filter((x) => x !== id) }));
  const save = () => act.run(async () => {
    const body = { displayName: f.displayName, username: f.username, phone: f.phone || null, email: f.email || null, roles: f.roles, grant: f.grant, deny: f.deny };
    if (user) { await api.patch(`/admin/users/${user.uid}`, body); done(); }
    else { const r = await api.post<{ tempPassword: string | null }>('/admin/users', { ...body, shopIds: [] }, crypto.randomUUID().replace(/-/g, '')); setTemp(r.tempPassword ?? ''); }
  });
  if (temp !== null) return (
    <div className="card done-card">
      <Icon name="check" size={40} />
      <h2>{user ? 'أُعيد تعيين كلمة المرور' : 'تم إنشاء الحساب'}</h2>
      {temp && <><p>كلمة المرور المؤقتة تظهر مرة واحدة فقط. أعطها للموظف وسيُطلب منه تغييرها عند أول دخول.</p><p className="temp-pass num" dir="ltr">{temp}</p>
        <button className="btn" onClick={() => void navigator.clipboard?.writeText(temp)}><Icon name="copy" /> نسخ</button></>}
      <button className="btn primary" onClick={done}>تم</button>
    </div>
  );
  const self = user?.uid === me?.uid;
  return (
    <div className="user-form">
      <button className="link" onClick={done}><Icon name="chevron" flip /> كل المستخدمين</button>
      <header className="user-head">
        <span className="avatar lg" aria-hidden="true">{initials(f.displayName || '؟')}</span>
        <div><h2>{user ? user.displayName : 'مستخدم جديد'}</h2>{user && <p className="mute">{user.status === 'active' ? 'نشط' : 'موقوف'} · {user.lastLoginAt ? `آخر دخول ${formatDate(user.lastLoginAt)}` : 'لم يدخل بعد'}</p>}</div>
      </header>

      <section className="card form-block">
        <h3>البيانات الأساسية</h3>
        <div className="two">
          <Field label="الاسم"><input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
          <Field label="اسم المستخدم (لاتيني)"><input dir="ltr" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="الهاتف"><input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="البريد (اختياري)"><input dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
      </section>

      <section className="card form-block">
        <h3>الدور الوظيفي</h3>
        <p className="mute small">اختر دوراً أو أكثر. الصلاحيات تُجمع من كل الأدوار المختارة.</p>
        <div className="role-picks">{staffRoles.map((r) => (
          <button key={r.id} aria-pressed={f.roles.includes(r.id)} className={`role-pick tap${f.roles.includes(r.id) ? ' on' : ''}`} onClick={() => toggleRole(r.id)} disabled={self && r.id === 'super_admin'}>
            <span className="tick" aria-hidden="true">{f.roles.includes(r.id) && <Icon name="check" size={16} />}</span>
            <b>{r.label}</b>
            <small className="mute">{r.permissions.includes('*') ? 'كل الصلاحيات' : `${r.permissions.length} صلاحية`} · يبدأ في {HOME_LABEL[r.home] ?? r.home}</small>
          </button>
        ))}</div>
      </section>

      {scoped.length > 0 && !all && (
        <details className="card form-block" open={custom > 0}>
          <summary><h3>تخصيص صلاحيات هذا المستخدم{custom > 0 && <span className="count num">{custom}</span>}</h3><small className="mute">امنحه صلاحية ليست في دوره أو احجب صلاحية منه</small></summary>
          {groupPerms(scoped).map((g) => (
            <fieldset key={g.id} className="perm-group"><legend>{g.label}</legend>
              {g.perms.map((p) => <PermState key={p.id} p={p} fromRole={fromRoles.has(p.id)} f={f} set={(v) => setPerm(p.id, v)} />)}
            </fieldset>
          ))}
        </details>
      )}

      {act.view}
      <div className="sticky-actions"><button className="btn primary block" disabled={act.busy || !f.displayName.trim() || !f.username.trim() || f.roles.length === 0} onClick={() => void save()}>{user ? 'حفظ التعديلات' : 'إنشاء الحساب'}</button></div>

      {user && !self && (
        <section className="card form-block danger-zone">
          <h3>إدارة الحساب</h3>
          <div className="actions">
            <button className="btn" onClick={() => void act.run(async () => { const r = await api.post<{ tempPassword: string }>(`/admin/users/${user.uid}/reset-password`); setTemp(r.tempPassword); })}><Icon name="lock" /> إعادة تعيين كلمة المرور</button>
            <button className="btn" onClick={() => void act.run(() => api.post(`/admin/users/${user.uid}/revoke-sessions`), 'خرج من كل أجهزته')}><Icon name="logout" /> إخراجه من كل الأجهزة</button>
          </div>
          <div className="row">
            <input placeholder={user.status === 'active' ? 'سبب الإيقاف' : 'سبب التفعيل (اختياري)'} value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className={user.status === 'active' ? 'btn danger' : 'btn'} disabled={user.status === 'active' && !reason.trim()} onClick={() => void act.run(() => api.post(`/admin/users/${user.uid}/status`, { status: user.status === 'active' ? 'suspended' : 'active', reason }).then(done))}>{user.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'}</button>
          </div>
        </section>
      )}
    </div>
  );
}

function RoleEditor({ roles, perms, users, reload }: { roles: Role[]; perms: Perm[]; users: User[]; reload: () => Promise<void> }) {
  const { api } = useSession();
  const act = useAction();
  const [sel, setSel] = useState<(Role & { isNew?: boolean }) | null>(null);
  const [q, setQ] = useState('');
  const count = (id: string) => users.filter((u) => u.roles.includes(id)).length;
  if (!sel) return <>
    <div className="team-tools"><p className="mute">كل دور مجموعة صلاحيات. عدّل الدور مرة فيتغيّر لكل من يحمله.</p><button className="btn primary" onClick={() => setSel({ id: '', label: '', kind: 'staff', home: 'admin.dashboard', permissions: [], isNew: true })}><Icon name="plus" /> دور جديد</button></div>
    {(['staff', 'agent', 'shop'] as const).map((k) => (
      <section key={k} className="role-section">
        <h2 className="rail-title">{k === 'staff' ? 'أدوار الإدارة' : k === 'agent' ? 'التوصيل' : 'المحلات'}</h2>
        <div className="role-cards">{roles.filter((r) => r.kind === k).map((r) => (
          <button key={r.id} className="role-card tap" onClick={() => setSel({ ...r })} disabled={r.protected} aria-label={`${r.label}${r.protected ? '، محمي' : ''}`}>
            <span className="role-card-top"><b>{r.label}</b>{r.protected && <Icon name="lock" size={16} />}</span>
            <span className="role-meter" aria-hidden="true"><i style={{ width: `${r.permissions.includes('*') ? 100 : Math.round((r.permissions.length / Math.max(1, perms.filter((p) => (SCOPES[k] ?? []).includes(p.scope)).length)) * 100)}%` }} /></span>
            <small className="mute">{r.permissions.includes('*') ? 'كل الصلاحيات' : `${r.permissions.length} صلاحية`}{k !== 'shop' && ` · ${count(r.id)} مستخدم`}</small>
          </button>
        ))}</div>
      </section>
    ))}
  </>;
  const available = perms.filter((p) => (SCOPES[sel.kind] ?? []).includes(p.scope));
  const groups = groupPerms(available.filter((p) => !q.trim() || p.label.includes(q.trim())));
  const has = new Set(sel.permissions);
  const setMany = (ids: string[], on: boolean) => setSel({ ...sel, permissions: on ? [...new Set([...sel.permissions, ...ids])] : sel.permissions.filter((x) => !ids.includes(x)) });
  const homes = [...new Set(roles.filter((r) => r.kind === sel.kind).map((r) => r.home))];
  return (
    <div className="user-form">
      <button className="link" onClick={() => setSel(null)}><Icon name="chevron" flip /> كل الأدوار</button>
      <header className="user-head"><span className="avatar lg" aria-hidden="true"><Icon name="shield" /></span><div><h2>{sel.isNew ? 'دور جديد' : sel.label}</h2><p className="mute">{has.size} من {available.length} صلاحية{!sel.isNew && sel.kind !== 'shop' && ` · ${count(sel.id)} مستخدم يحمله`}</p></div></header>
      <section className="card form-block">
        <div className="two">
          <Field label="اسم الدور"><input value={sel.label} onChange={(e) => setSel({ ...sel, label: e.target.value })} placeholder="مثال: مشرف المستودع" /></Field>
          <Field label="المعرّف (لاتيني، لا يتغيّر)"><input dir="ltr" value={sel.id} disabled={!sel.isNew} onChange={(e) => setSel({ ...sel, id: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') })} placeholder="warehouse_lead" /></Field>
          <Field label="النوع"><select value={sel.kind} disabled={!sel.isNew} onChange={(e) => setSel({ ...sel, kind: e.target.value, permissions: [], home: roles.find((r) => r.kind === e.target.value)?.home ?? sel.home })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="الواجهة بعد الدخول"><select value={sel.home} onChange={(e) => setSel({ ...sel, home: e.target.value })}>{homes.map((h) => <option key={h} value={h}>{HOME_LABEL[h] ?? h}</option>)}</select></Field>
        </div>
      </section>
      <section className="card form-block">
        <div className="team-tools"><h3>الصلاحيات</h3><div className="search"><Icon name="search" /><input type="search" aria-label="بحث الصلاحيات" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن صلاحية" /></div></div>
        {groups.map((g) => {
          const ids = g.perms.map((p) => p.id);
          const n = ids.filter((id) => has.has(id)).length;
          return (
            <fieldset key={g.id} className="perm-group">
              <legend>{g.label} <span className="num mute">{n}/{ids.length}</span></legend>
              <button className="link small" onClick={() => setMany(ids, n < ids.length)}>{n < ids.length ? 'تحديد الكل' : 'إلغاء الكل'}</button>
              {g.perms.map((p) => (
                <label key={p.id} className={`perm-row check${has.has(p.id) ? ' has' : ''}`}>
                  <input type="checkbox" checked={has.has(p.id)} onChange={() => setMany([p.id], !has.has(p.id))} />
                  <span>{p.label}</span>
                </label>
              ))}
            </fieldset>
          );
        })}
      </section>
      {act.view}
      <div className="sticky-actions row">
        <button className="btn primary block" disabled={act.busy || !sel.label.trim() || !/^[a-z_]{3,40}$/.test(sel.id)} onClick={() => void act.run(() => api.put(`/admin/roles/${sel.id}`, { label: sel.label, kind: sel.kind, home: sel.home, permissions: sel.permissions }).then(reload).then(() => setSel(null)), 'حُفظ الدور')}>حفظ الدور</button>
        {!sel.isNew && <button className="btn danger" disabled={act.busy || count(sel.id) > 0} title={count(sel.id) > 0 ? 'انقل مستخدميه لدور آخر أولاً' : undefined} onClick={() => void act.run(() => api.del(`/admin/roles/${sel.id}`).then(() => { setSel(null); return reload(); }), 'حُذف الدور')}>حذف</button>}
      </div>
    </div>
  );
}
