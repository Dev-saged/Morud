// إشعارات المتصفح الفورية عبر FCM: إذن عند الطلب فقط، تسجيل الجهاز في الخادم، وإلغاؤه عند الخروج (جهاز مشترك)
import type { Api } from './api';

const DEVICE = 'mawred.device.v1';
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE);
    if (!id) { id = `w${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`; localStorage.setItem(DEVICE, id); }
    return id;
  } catch { return 'w-volatile-device'; }
}

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';
export function pushState(): PushState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  return Notification.permission as PushState;
}

/** يفعّل الإشعارات: إذن ← رمز FCM مرتبط بعامل الخدمة ← تسجيل الجهاز. */
export async function enablePush(api: Api, appVersion: string): Promise<PushState> {
  if (pushState() === 'unsupported') return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as PushState;
  await registerToken(api, appVersion);
  return 'granted';
}

/** يجدّد التسجيل بصمت إن كان الإذن ممنوحاً سابقاً (الرمز قد يتغير). */
export async function registerToken(api: Api, appVersion: string): Promise<boolean> {
  if (pushState() !== 'granted') return false;
  try {
    const [{ getApp }, { getMessaging, getToken, isSupported }] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
    if (!(await isSupported())) return false;
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
    const token = await getToken(getMessaging(getApp()), { serviceWorkerRegistration: reg });
    if (!token) return false;
    await api.post('/devices', { deviceId: deviceId(), token, platform: 'web', appVersion });
    return true;
  } catch { return false; }
}

export async function unregisterDevice(api: Api) {
  try { await api.del(`/devices/${deviceId()}`); } catch { /* بلا نت: الخادم يحذف الرموز التالفة تلقائياً */ }
}
