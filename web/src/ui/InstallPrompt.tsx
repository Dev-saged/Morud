import { useEffect, useState } from 'react';
import { Icon } from './Icons';

export function isIosSafari(ua: string, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua) && !standalone;
}

/** نافذة تثبيت مصممة: آيفون بخطوات المشاركة ← إضافة للشاشة، وأندرويد بزر التثبيت. */
export function InstallPrompt() {
  const [ios, setIos] = useState(false);
  const [evt, setEvt] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('mawred.install.dismissed') === '1'; } catch { return false; } });
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    setIos(isIosSafari(navigator.userAgent, !!standalone));
    const h = (e: Event) => { e.preventDefault(); setEvt(e as never); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const dismiss = () => { setHidden(true); try { localStorage.setItem('mawred.install.dismissed', '1'); } catch { /* لا تخزين */ } };
  if (hidden || (!ios && !evt)) return null;
  return (
    <div className="sheet install" role="dialog" aria-label="تثبيت مورد">
      <b>ثبّت مورد على شاشتك الرئيسية</b>
      {ios ? <p>اضغط <Icon name="share" size={18} /> مشاركة في الأسفل، ثم «إضافة إلى الشاشة الرئيسية».</p> : <p>افتحه كتطبيق، أسرع وبلا شريط متصفح.</p>}
      <div className="row">
        {evt && <button className="btn primary" onClick={() => void evt.prompt().then(dismiss)}>تثبيت</button>}
        <button className="btn ghost" onClick={dismiss}>لاحقاً</button>
      </div>
    </div>
  );
}
