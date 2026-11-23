import { useEffect, useState } from 'react';
import { Icon, LogoMark } from './Icons';

export type IosBrowser = 'safari' | 'chrome' | 'other';

/** آيفون/آيباد بكل متصفحاته (منذ iOS 16.4 يمكن الإضافة للشاشة من كروم وإيدج أيضاً)، وغير مثبّت. */
export function iosBrowser(ua: string, standalone: boolean, touchMac = false): IosBrowser | null {
  const ios = /iPhone|iPad|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua));
  if (!ios || standalone) return null;
  if (/CriOS|EdgiOS/.test(ua)) return 'chrome';
  if (/FxiOS|OPiOS/.test(ua)) return 'other';
  return /Safari/.test(ua) ? 'safari' : 'other';
}

/** للتوافق مع الاختبارات القديمة. */
export function isIosSafari(ua: string, standalone: boolean): boolean {
  return iosBrowser(ua, standalone) === 'safari';
}

const KEY = 'mawred.install.snooze';
const SNOOZE = 3 * 86_400_000;
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const touchMac = () => navigator.maxTouchPoints > 1;

type BIP = Event & { prompt(): Promise<void>; userChoice?: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

/** هل يمكن عرض تثبيت على هذا الجهاز الآن (آيفون بخطوات، أو أندرويد/كمبيوتر بزر)؟ */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const ios = typeof navigator !== 'undefined' ? iosBrowser(navigator.userAgent, isStandalone(), touchMac()) : null;
  return { ios, native: deferred, installed: typeof window !== 'undefined' && isStandalone(), available: !!ios || !!deferred };
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="i-step"><span className="i-num num">{n}</span><span>{children}</span></li>;
}

/** الخطوات المصوّرة لكل متصفح آيفون. */
export function IosSteps({ browser }: { browser: IosBrowser }) {
  const ipad = /iPad/.test(navigator.userAgent) || (touchMac() && /Macintosh/.test(navigator.userAgent));
  return (
    <ol className="i-steps">
      {browser === 'other'
        ? <Step n={1}>افتح هذا الرابط في <b>Safari</b> (انسخه من زر المشاركة)، ثم اتبع الخطوات هناك.</Step>
        : <Step n={1}>اضغط زر المشاركة <span className="i-key"><Icon name="share" size={18} /></span> {browser === 'chrome' ? 'بجانب شريط العنوان في الأعلى' : ipad ? 'في الشريط العلوي' : 'في الشريط السفلي'}.</Step>}
      {browser !== 'other' && <>
        <Step n={2}>مرّر للأسفل واختر <span className="i-key"><Icon name="plus" size={16} /> إضافة إلى الشاشة الرئيسية</span></Step>
        <Step n={3}>اضغط <b>إضافة</b> في الأعلى. سيظهر مورد على شاشتك كتطبيق، يفتح مباشرة بلا شريط متصفح.</Step>
      </>}
    </ol>
  );
}

/**
 * نافذة التثبيت: تظهر لزائر آيفون من شاشة الدخول نفسها بعد ثوانٍ، ولأندرويد عند توفر زر التثبيت.
 * «لاحقاً» تؤجلها 3 أيام فقط، ويبقى «تثبيت التطبيق» متاحاً دائماً من الحساب.
 */
export function InstallPrompt({ delayMs = 4000 }: { delayMs?: number }) {
  const { ios, native, installed } = useInstall();
  const [ready, setReady] = useState(delayMs === 0);
  const [hidden, setHidden] = useState(() => { try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < SNOOZE; } catch { return false; } });
  useEffect(() => { if (delayMs === 0) return; const t = setTimeout(() => setReady(true), delayMs); return () => clearTimeout(t); }, [delayMs]);
  const later = () => { setHidden(true); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* لا تخزين */ } };
  if (installed || hidden || !ready || (!ios && !native)) return null;
  return (
    <div className={`install-sheet${ios === 'safari' && !/iPad/.test(navigator.userAgent) ? ' point-down' : ' point-up'}`} role="dialog" aria-labelledby="install-title">
      <div className="install-head">
        <span className="install-icon"><LogoMark size={40} /></span>
        <div><b id="install-title">ثبّت مورد على جوالك</b><small className="mute">يفتح بلمسة من الشاشة الرئيسية، أسرع، ويعمل بلا نت</small></div>
        <button className="icon-btn" aria-label="إغلاق" onClick={later}><Icon name="close" size={20} /></button>
      </div>
      {ios ? <IosSteps browser={ios} /> : <p className="mute">ثبّته كتطبيق مستقل على جهازك.</p>}
      <div className="row">
        {native && !ios && <button className="btn primary block" onClick={() => void native.prompt().then(later)}><Icon name="download" /> تثبيت الآن</button>}
        <button className={ios ? 'btn block' : 'btn ghost'} onClick={later}>{ios ? 'فهمت' : 'لاحقاً'}</button>
      </div>
    </div>
  );
}

/** زر دائم «تثبيت التطبيق» (في الحساب والقائمة): يفتح الخطوات أو نافذة النظام. */
export function InstallButton({ className = 'btn' }: { className?: string }) {
  const { ios, native, installed } = useInstall();
  const [open, setOpen] = useState(false);
  if (installed || (!ios && !native)) return null;
  return <>
    <button className={className} onClick={() => (native && !ios ? void native.prompt() : setOpen(true))}><Icon name="download" /> تثبيت التطبيق على الجهاز</button>
    {open && ios && <div className="install-sheet point-up" role="dialog" aria-label="خطوات التثبيت">
      <div className="install-head"><span className="install-icon"><LogoMark size={40} /></span><div><b>تثبيت مورد</b><small className="mute">ثلاث خطوات فقط</small></div><button className="icon-btn" aria-label="إغلاق" onClick={() => setOpen(false)}><Icon name="close" size={20} /></button></div>
      <IosSteps browser={ios} />
      <button className="btn block" onClick={() => setOpen(false)}>فهمت</button>
    </div>}
  </>;
}
