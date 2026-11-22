import { useState, type FormEvent } from 'react';
import { ApiError } from './lib/api';
import { rememberedLogin, useSession } from './lib/session';
import { Icon, LogoMark } from './ui/Icons';

/** شاشة الدخول الموحدة لكل المستخدمين (SRS 2.1). */
export function Login() {
  const { login, loginMfa, api } = useSession();
  const saved = rememberedLogin();
  const [identifier, setId] = useState(saved.identifier);
  const [remember, setRemember] = useState(saved.remember);
  const [password, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent' | 'mfa'>('login');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api.post('/auth/forgot', { identifier });
        setMode('sent');
      } else if (mode === 'mfa') {
        await loginMfa(ticket, code, identifier.trim(), remember);
      } else {
        const r = await login(identifier.trim(), password, remember);
        if (r?.mfaTicket) { setTicket(r.mfaTicket); setCode(''); setMode('mfa'); }
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_EXPIRED') { setMode('login'); setPw(''); }
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
        <p className="mute">{mode === 'login' ? 'ادخل باسم المستخدم أو رقم الهاتف أو البريد' : mode === 'mfa' ? 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة' : 'أدخل معرّفك لاستعادة كلمة المرور'}</p>
        {mode === 'mfa' ? (
          <form onSubmit={submit}>
            <label>رمز التحقق<input className="otp num" value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); }} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus required aria-describedby="otp-hint" /></label>
            <small id="otp-hint" className="mute">الرمز يتغير كل 30 ثانية. تأكد أن وقت الهاتف تلقائي.</small>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? 'جارٍ التحقق…' : 'تأكيد'}</button>
          </form>
        ) : mode === 'sent' ? (
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
