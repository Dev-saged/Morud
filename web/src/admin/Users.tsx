import { useMemo, useState } from 'react';
import { formatDate } from '../lib/format';
import { useSession } from '../lib/session';
import { Icon } from '../ui/Icons';
import { Field, Loading, useAction, useLoad } from './kit';

const HOME_LABEL: Record<string, string> = { 'admin.dashboard': 'لوحة المعلومات', 'admin.orders': 'الطلبات', 'admin.finance': 'المالية', 'admin.products': 'المنتجات', 'admin.delivery': 'التوصيل', 'agent.tasks': 'مهام المندوب', 'shop.home': 'واجهة المحل' };

type Role = { id: string; label: string; kind: string; home: string; permissions: string[]; protected?: boolean };
type Perm = { id: string; scope: string; label: string };
type User = { uid: string; displayName: string; username: string; phone: string | null; email: string | null; status: string; roles: string[]; grant: string[]; deny: string[]; lastLoginAt: number | null };

export function Users() {
  const { can } = useSession();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const roles = useLoad<{ roles: Role[]; permissions: Perm[] }>('/admin/roles');
  return (
    <section>
      <h1>المستخدمون والصلاحيات</h1>
      <div className="chips"><button className={tab === 'users' ? 'chip on' : 'chip'} onClick={() => setTab('users')}>المستخدمون</button>{can('roles.manage') && <button className={tab === 'roles' ? 'chip on' : 'chip'} onClick={() => setTab('roles')}>الأدوار</button>}</div>
      {!roles.data ? <Loading error={roles.error} /> : tab === 'users' ? <UserList roles={roles.data.roles} perms={roles.data.permissions} /> : <RoleEditor roles={roles.data.roles} perms={roles.data.permissions} reload={roles.reload} />}
    </section>
  );
}

function UserList({ roles, perms }: { roles: Role[]; perms: Perm[] }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<User | 'new' | null>(null);
  const { data, error, reload } = useLoad<{ users: User[] }>(`/admin/users?q=${encodeURIComponent(q)}`);
  const label = new Map(roles.map((r) => [r.id, r.label]));
  if (open) return <UserForm user={open === 'new' ? null : open} roles={roles} perms={perms} done={() => { setOpen(null); void reload(); }} />;
  return <>
    <div className="row"><div className="search" style={{ flex: 1 }}><Icon name="search" /><input aria-label="بحث المستخدمين" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الاسم أو المعرّف" /></div><button className="btn primary" onClick={() => setOpen('new')}>مستخدم جديد</button></div>
    {!data ? <Loading error={error} /> : <table className="table"><thead><tr><th>الاسم</th><th>المعرّف</th><th>الأدوار</th><th>آخر دخول</th><th>الحالة</th></tr></thead>
      <tbody>{data.users.map((u) => <tr key={u.uid} tabIndex={0} onClick={() => setOpen(u)} onKeyDown={(e) => e.key === 'Enter' && setOpen(u)}>
        <td>{u.displayName}</td><td className="num">{u.username}</td><td>{u.roles.map((r) => label.get(r) ?? r).join('، ')}</td><td>{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
        <td><span className={`chip ${u.status === 'active' ? 'tone-success' : 'tone-danger'}`}>{u.status === 'active' ? 'نشط' : 'موقوف'}</span></td></tr>)}</tbody></table>}
  </>;
}

function UserForm({ user, roles, perms, done }: { user: User | null; roles: Role[]; perms: Perm[]; done: () => void }) {
  const { api } = useSession();
  const act = useAction();
  const [f, setF] = useState({ displayName: user?.displayName ?? '', username: user?.username ?? '', phone: user?.phone ?? '', email: user?.email ?? '', roles: user?.roles ?? [], grant: user?.grant ?? [], deny: user?.deny ?? [] });
  const [temp, setTemp] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const staffRoles = roles.filter((r) => r.kind !== 'shop');
  const kinds = new Set(roles.filter((r) => f.roles.includes(r.id)).map((r) => r.kind));
  const scoped = useMemo(() => perms.filter((p) => (kinds.has('staff') && p.scope === 'staff') || (kinds.has('agent') && p.scope === 'agent')), [perms, f.roles]);
  const toggle = (k: 'roles' | 'grant' | 'deny', id: string) => setF((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));
  const save = () => act.run(async () => {
    const body = { displayName: f.displayName, username: f.username, phone: f.phone || null, email: f.email || null, roles: f.roles, grant: f.grant, deny: f.deny };
    if (user) { await api.patch(`/admin/users/${user.uid}`, body); done(); }
    else { const r = await api.post<{ tempPassword: string | null }>('/admin/users', { ...body, shopIds: [] }, crypto.randomUUID().replace(/-/g, '')); setTemp(r.tempPassword ?? ''); }
  });
  if (temp !== null) return <div className="card"><h2>تم إنشاء الحساب</h2>{temp && <p className="notice">كلمة المرور المؤقتة (تظهر مرة واحدة): <b className="num">{temp}</b></p>}<button className="btn primary" onClick={done}>تم</button></div>;
  return (
    <div className="card">
      <button className="link" onClick={done}><Icon name="chevron" flip /> المستخدمون</button>
      <h2>{user ? user.displayName : 'مستخدم جديد'}</h2>
      <div className="two">
        <Field label="الاسم"><input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
        <Field label="اسم المستخدم (لاتيني)"><input dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="الهاتف"><input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="البريد"><input dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <h3>الأدوار</h3>
      <div className="chips" style={{ flexWrap: 'wrap' }}>{staffRoles.map((r) => <button key={r.id} aria-pressed={f.roles.includes(r.id)} className={f.roles.includes(r.id) ? 'chip on' : 'chip'} onClick={() => toggle('roles', r.id)}>{r.label}</button>)}</div>
      {scoped.length > 0 && <details><summary>صلاحيات إضافية أو محجوبة لهذا المستخدم</summary>
        <table className="table"><thead><tr><th>الصلاحية</th><th>منح</th><th>حجب</th></tr></thead><tbody>{scoped.map((p) => <tr key={p.id}><td>{p.label}</td>
          <td><input type="checkbox" aria-label={`منح ${p.label}`} style={{ width: 'auto' }} checked={f.grant.includes(p.id)} onChange={() => toggle('grant', p.id)} /></td>
          <td><input type="checkbox" aria-label={`حجب ${p.label}`} style={{ width: 'auto' }} checked={f.deny.includes(p.id)} onChange={() => toggle('deny', p.id)} /></td></tr>)}</tbody></table></details>}
      {act.view}
      <div className="actions"><button className="btn primary" disabled={act.busy} onClick={() => void save()}>{user ? 'حفظ التعديلات' : 'إنشاء الحساب'}</button></div>
      {user && <div className="actions">
        <button className="btn" onClick={() => void act.run(async () => { const r = await api.post<{ tempPassword: string }>(`/admin/users/${user.uid}/reset-password`); setTemp(r.tempPassword); }, 'أعيد تعيين كلمة المرور')}>إعادة تعيين كلمة المرور</button>
        <button className="btn" onClick={() => void act.run(() => api.post(`/admin/users/${user.uid}/revoke-sessions`), 'تم إنهاء جميع الجلسات')}>إنهاء الجلسات</button>
        <input placeholder="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className={user.status === 'active' ? 'btn danger' : 'btn'} onClick={() => void act.run(() => api.post(`/admin/users/${user.uid}/status`, { status: user.status === 'active' ? 'suspended' : 'active', reason }).then(done))}>{user.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'}</button>
      </div>}
    </div>
  );
}

function RoleEditor({ roles, perms, reload }: { roles: Role[]; perms: Perm[]; reload: () => Promise<void> }) {
  const { api } = useSession();
  const act = useAction();
  const [sel, setSel] = useState<Role | null>(null);
  const scopeFor: Record<string, string[]> = { staff: ['staff'], agent: ['agent'], shop: ['shop', 'shared'] };
  return <div className="two">
    <div className="card"><h3>الأدوار</h3><ul className="plain">{roles.map((r) => <li key={r.id}><button className="link" disabled={r.protected} onClick={() => setSel({ ...r })}>{r.label}</button> <small className="mute">{r.permissions.length} صلاحية</small></li>)}</ul>
      <button className="btn ghost" onClick={() => setSel({ id: '', label: '', kind: 'staff', home: 'admin.dashboard', permissions: [] })}>دور جديد</button></div>
    {sel && <div className="card">
      <Field label="المعرّف (لاتيني)"><input dir="ltr" value={sel.id} disabled={roles.some((r) => r.id === sel.id && sel.label !== '')} onChange={(e) => setSel({ ...sel, id: e.target.value })} /></Field>
      <Field label="اسم الدور"><input value={sel.label} onChange={(e) => setSel({ ...sel, label: e.target.value })} /></Field>
      <div className="row">
        <Field label="النوع"><select value={sel.kind} onChange={(e) => setSel({ ...sel, kind: e.target.value, permissions: [], home: [...new Set(roles.filter((r) => r.kind === e.target.value).map((r) => r.home))][0] ?? sel.home })}><option value="staff">إدارة</option><option value="agent">مندوب</option><option value="shop">محل</option></select></Field>
        <Field label="الواجهة بعد الدخول"><select value={sel.home} onChange={(e) => setSel({ ...sel, home: e.target.value })}>{[...new Set(roles.filter((r) => r.kind === sel.kind).map((r) => r.home))].map((h) => <option key={h} value={h}>{HOME_LABEL[h] ?? h}</option>)}</select></Field>
      </div>
      <p className="mute">{perms.filter((p) => (scopeFor[sel.kind] ?? []).includes(p.scope)).length} صلاحية متاحة لهذا النوع</p>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>{perms.filter((p) => (scopeFor[sel.kind] ?? []).includes(p.scope)).map((p) => <label key={p.id} className="row" style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={sel.permissions.includes(p.id)} onChange={() => setSel({ ...sel, permissions: sel.permissions.includes(p.id) ? sel.permissions.filter((x) => x !== p.id) : [...sel.permissions, p.id] })} />{p.label}</label>)}</div>
      {act.view}
      <div className="actions"><button className="btn primary" onClick={() => void act.run(() => api.put(`/admin/roles/${sel.id}`, { label: sel.label, kind: sel.kind, home: sel.home, permissions: sel.permissions }).then(reload), 'حُفظ الدور')}>حفظ الدور</button>
        {roles.some((r) => r.id === sel.id) && <button className="btn danger" onClick={() => void act.run(() => api.del(`/admin/roles/${sel.id}`).then(() => { setSel(null); return reload(); }), 'حُذف الدور')}>حذف</button>}</div>
    </div>}
  </div>;
}
