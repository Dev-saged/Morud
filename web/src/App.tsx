import { AdminApp } from './admin/AdminApp';
import { AgentApp } from './agent/AgentApp';
import { useSession } from './lib/session';
import { ChangePassword, Login } from './Login';
import { ShopApp } from './shop/ShopApp';
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
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword />;
  const area = user.home.split('.')[0];
  return <>{area !== 'shop' && <StaleBanner />}{area === 'admin' ? <AdminApp /> : area === 'agent' ? <AgentApp /> : area === 'shop' ? <ShopApp /> : <p className="empty">لا توجد واجهة لحسابك، تواصل مع الإدارة.</p>}<InstallPrompt /></>;
}
