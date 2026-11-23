import { lazy, Suspense } from 'react';
import { useSession } from './lib/session';
import { ChangePassword, Login } from './Login';
import { cachedUser } from './lib/offline';

// كل واجهة في ملف منفصل: صاحب المحل لا ينزّل كود لوحة الإدارة، والملف يبدأ تنزيله فور فتح الموقع
const load = { admin: () => import('./admin/AdminApp'), agent: () => import('./agent/AgentApp'), shop: () => import('./shop/ShopApp') };
const AdminApp = lazy(() => load.admin().then((m) => ({ default: m.AdminApp })));
const AgentApp = lazy(() => load.agent().then((m) => ({ default: m.AgentApp })));
const ShopApp = lazy(() => load.shop().then((m) => ({ default: m.ShopApp })));
{
  const area = cachedUser<{ home?: string }>()?.home?.split('.')[0];
  if (area === 'admin' || area === 'agent' || area === 'shop') void load[area]().catch(() => undefined);
}
import { InstallPrompt } from './ui/InstallPrompt';
import { LogoMark } from './ui/Icons';
import { useStale } from './lib/offline';
import { formatDate } from './lib/format';

/** شريط «بلا اتصال» للإدارة والمندوب عند عرض بيانات محفوظة. */
function StaleBanner() {
  const at = useStale();
  return at ? <div className="stale" role="status">بلا اتصال — تُعرض بيانات محفوظة من {formatDate(at)}</div> : null;
}

/** توجيه تلقائي بعد الدخول حسب الدور (SRS 2.2). */
export function App() {
  const { user, ready } = useSession();
  if (!ready) return <div className="splash"><LogoMark size={72} /></div>;
  if (!user) return <><Login /><InstallPrompt /></>;
  if (user.mustChangePassword) return <ChangePassword />;
  const area = user.home.split('.')[0];
  return <>{area !== 'shop' && <StaleBanner />}<Suspense fallback={<div className="splash"><LogoMark size={72} /></div>}>{area === 'admin' ? <AdminApp /> : area === 'agent' ? <AgentApp /> : area === 'shop' ? <ShopApp /> : <p className="empty">لا توجد واجهة لحسابك، تواصل مع الإدارة.</p>}</Suspense><InstallPrompt /></>;
}
