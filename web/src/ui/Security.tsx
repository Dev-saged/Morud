// أمان الحساب: تفعيل التحقق بخطوتين برمز QR (أو المفتاح يدوياً)، وإيقافه برمز صحيح
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { Icon } from './Icons';

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }, [text]);
  return <div className="qr" role="img" aria-label="رمز QR لإضافة الحساب في تطبيق المصادقة" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function SecurityCard() {
  const { api, user, refresh } = useSession();
  const on = user?.mfaEnabled === true;
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg({});
    try { await f(); setMsg({ ok }); setCode(''); setSetup(null); await refresh(); } catch (e) { setMsg({ err: e instanceof ApiError ? e.message : 'تعذّر التنفيذ' }); } finally { setBusy(false); }
  };
  const codeInput = <input className="otp num" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-label="رمز التحقق" />;
  return (
    <section className="panel security">
      <h3><span><Icon name="shield" size={18} /> التحقق بخطوتين</span><span className={`chip ${on ? 'tone-success' : ''}`}>{on ? 'مفعّل' : 'غير مفعّل'}</span></h3>
      <p className="mute">بعد كلمة المرور يُطلب رمز من تطبيق المصادقة على هاتفك (Google Authenticator أو Microsoft Authenticator)، فلا يدخل أحد حتى لو عرف كلمة المرور.</p>
      {!on && !setup && <button className="btn primary" disabled={busy} onClick={() => void api.post<{ secret: string; uri: string }>('/auth/mfa/setup', {}).then(setSetup).catch((e) => setMsg({ err: e instanceof ApiError ? e.message : 'تعذّر البدء' }))}>تفعيل</button>}
      {setup && <div className="mfa-setup">
        <ol>
          <li>افتح تطبيق المصادقة واختر «إضافة حساب» ثم امسح الرمز. على نفس الهاتف: <a href={setup.uri}>افتح في التطبيق</a></li>
          <li>أو أدخل المفتاح يدوياً: <code className="num" dir="ltr">{setup.secret}</code></li>
          <li>اكتب الرمز الظاهر في التطبيق لتأكيد الربط:</li>
        </ol>
        <Qr text={setup.uri} />
        <div className="row">{codeInput}<button className="btn primary" disabled={busy || code.length !== 6} onClick={() => void act(() => api.post('/auth/mfa/enable', { code }), 'فُعّل التحقق بخطوتين')}>تأكيد</button></div>
      </div>}
      {on && <div className="row">{codeInput}<button className="btn" disabled={busy || code.length !== 6} onClick={() => void act(() => api.post('/auth/mfa/disable', { code }), 'أُوقف التحقق بخطوتين')}>إيقاف</button></div>}
      {msg.ok && <p className="ok-text" role="status">{msg.ok}</p>}
      {msg.err && <p className="error" role="alert">{msg.err}</p>}
    </section>
  );
}
