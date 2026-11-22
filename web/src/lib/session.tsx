import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Api, ApiError } from './api';
import { cachedUser, cacheUser, clearOffline } from './offline';

export interface User {
  uid: string;
  displayName: string;
  roles: string[];
  home: string;
  contexts: string[];
  permissions: string[];
  shopIds: string[];
  mustChangePassword: boolean;
}

// مزود الهوية (Firebase في الإنتاج) مجرَّد ليُختبر بسهولة
export interface AuthBackend {
  /** remember=false: جلسة مؤقتة تنتهي بإغلاق المتصفح */
  signInWithCustomToken(token: string, remember?: boolean): Promise<void>;
  idToken(): Promise<string | null>;
  signOut(): Promise<void>;
  onReady(cb: (signedIn: boolean) => void): () => void;
}

interface Session {
  api: Api;
  user: User | null;
  ready: boolean;
  login(identifier: string, password: string, remember?: boolean): Promise<void>;
  adopt(customToken: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  can(p: string): boolean;
}

const Ctx = createContext<Session | null>(null);

const REMEMBER_KEY = 'mawred.login.v1';
/** تذكرني: يحفظ المعرّف فقط (لا كلمة مرور أبداً)؛ والجلسة نفسها يحفظها مزود الهوية. */
export function rememberLogin(identifier: string | null) {
  try {
    if (identifier) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ identifier, remember: true }));
    else localStorage.setItem(REMEMBER_KEY, JSON.stringify({ identifier: '', remember: false }));
  } catch { /* تخزين غير متاح */ }
}
export function rememberedLogin(): { identifier: string; remember: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? 'null');
    if (v && typeof v.identifier === 'string') return { identifier: v.identifier, remember: v.remember !== false };
  } catch { /* تالف */ }
  return { identifier: '', remember: true };
}

export function SessionProvider({ backend, apiBase, children, fetchImpl }: { backend: AuthBackend; apiBase: string; children: ReactNode; fetchImpl?: typeof fetch }) {
  const api = useMemo(() => new Api(apiBase, () => backend.idToken(), fetchImpl), [apiBase, backend, fetchImpl]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const adoptUser = (u: User | null) => { api.scope = u?.uid ?? null; if (u) cacheUser(u); setUser(u); };
  const refresh = async () => {
    try {
      adoptUser((await api.get<{ user: User }>('/auth/me')).user);
    } catch (e) {
      // بلا نت: الجلسة محفوظة عند مزود الهوية، فنكمل بآخر بيانات مستخدم معروفة
      if (e instanceof ApiError && e.code === 'NETWORK') { const u = cachedUser<User>(); if (u) adoptUser(u); return; }
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (e.code === 'PASSWORD_CHANGE_REQUIRED') return;
        await backend.signOut();
        adoptUser(null);
      }
    }
  };

  useEffect(() => backend.onReady(async (signedIn) => {
    if (signedIn) await refresh();
    else {
      // جلسة «بدون تذكر» انتهت بإغلاق المتصفح: لا نُبقي بيانات صاحبها المحفوظة على جهاز قد يكون مشتركاً
      const stale = cachedUser<User>();
      if (stale) clearOffline(stale.uid);
    }
    setReady(true);
  }), [backend]);

  const value: Session = {
    api, user, ready, refresh,
    async login(identifier, password, remember = true) {
      const r = await api.post<{ customToken: string; user: User }>('/auth/login', { identifier, password });
      await backend.signInWithCustomToken(r.customToken, remember);
      rememberLogin(remember ? identifier : null);
      adoptUser(r.user);
    },
    /** بعد تغيير كلمة المرور: الخادم يعيد رمزاً جديداً فيبقى المستخدم داخلاً بلا إعادة كتابة. */
    async adopt(customToken) {
      await backend.signInWithCustomToken(customToken, rememberedLogin().remember);
      await refresh();
    },
    async logout() {
      const uid = user?.uid;
      await backend.signOut();
      if (uid) clearOffline(uid);
      adoptUser(null);
    },
    can: (p) => !!user?.permissions.includes(p),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider مفقود');
  return s;
}
