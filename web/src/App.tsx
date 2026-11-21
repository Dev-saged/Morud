import { AdminApp } from './admin/AdminApp';
import { AgentApp } from './agent/AgentApp';
import { useSession } from './lib/session';
import { ChangePassword, Login } from './Login';
import { ShopApp } from './shop/ShopApp';
import { InstallPrompt } from './ui/InstallPrompt';
import { LogoMark } from './ui/Icons';

/** توجيه تلقائي بعد الدخول حسب الدور (SRS 2.2). */
export function App() {
  const { user, ready } = useSession();
  if (!ready) return <div className="splash"><LogoMark size={72} /></div>;
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword />;
  const area = user.home.split('.')[0];
  return <>{area === 'admin' ? <AdminApp /> : area === 'agent' ? <AgentApp /> : area === 'shop' ? <ShopApp /> : <p className="empty">لا توجد واجهة لحسابك، تواصل مع الإدارة.</p>}<InstallPrompt /></>;
}
