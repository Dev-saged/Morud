import { useState, type FormEvent } from 'react';
import { ApiError } from './lib/api';
import { rememberedLogin, useSession } from './lib/session';
import { Icon, LogoMark } from './ui/Icons';

/** شاشة الدخول الموحدة لكل المستخدمين (SRS 2.1). */
export function Login() {
  const { login, api } = useSession();
  const saved = rememberedLogin();
  const [identifier, setId] = useState(saved.identifier);
  const [remember, setRemember] = useState(saved.remember);
  const [password, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api.post('/auth/forgot', { identifier });
        setMode('sent');
      } else await login(identifier.trim(), password, remember);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر الدخول، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <LogoMark size={64} />
        <h1>مورد</h1>
        <p className="mute">{mode === 'login' ? 'ادخل باسم المستخدم أو رقم الهاتف أو البريد' : 'أدخل معرّفك لاستعادة كلمة المرور'}</p>
        {mode === 'sent' ? (
          <p className="ok-text" role="status">إن كان الحساب موجوداً فسيصلك رابط الاستعادة أو تتواصل معك الإدارة.</p>
        ) : (
          <form onSubmit={submit}>
            <label>المعرّف<input value={identifier} onChange={(e) => setId(e.target.value)} autoComplete="username" inputMode="text" required /></label>
            {mode === 'login' && (
              <label>كلمة المرور
                <span className="pw">
                  <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
                  <button type="button" className="icon-btn" aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} onClick={() => setShow(!show)}><Icon name="eye" /></button>
                </span>
              </label>
            )}
            {mode === 'login' && <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> تذكرني على هذا الجهاز</label>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy}>{busy ? 'جارٍ التحقق…' : mode === 'login' ? 'دخول' : 'إرسال'}</button>
          </form>
        )}
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setError(''); }}>{mode === 'login' ? 'نسيت كلمة المرور؟' : 'العودة للدخول'}</button>
      </div>
    </main>
  );
}

export function ChangePassword() {
  const { api, adopt } = useSession();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="login">
      <form className="login-card" onSubmit={async (e) => {
        e.preventDefault();
        try { const r = await api.post<{ customToken: string }>('/auth/change-password', { newPassword: pw }); await adopt(r.customToken); } catch (err) { setError(err instanceof ApiError ? err.message : 'تعذّر الحفظ'); }
      }}>
        <h1>كلمة مرور جديدة</h1>
        <p className="mute">كلمة المرور الحالية مؤقتة. اختر كلمة من 8 أحرف على الأقل تحتوي حرفاً ورقماً، وتبقى داخلاً بعدها.</p>
        <label>كلمة المرور الجديدة<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block">حفظ</button>
      </form>
    </main>
  );
}
