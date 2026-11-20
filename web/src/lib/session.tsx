import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Api, ApiError } from './api';

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
  signInWithCustomToken(token: string): Promise<void>;
  idToken(): Promise<string | null>;
  signOut(): Promise<void>;
  onReady(cb: (signedIn: boolean) => void): () => void;
}

interface Session {
  api: Api;
  user: User | null;
  ready: boolean;
  login(identifier: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  can(p: string): boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ backend, apiBase, children, fetchImpl }: { backend: AuthBackend; apiBase: string; children: ReactNode; fetchImpl?: typeof fetch }) {
  const api = useMemo(() => new Api(apiBase, () => backend.idToken(), fetchImpl), [apiBase, backend, fetchImpl]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    try {
      setUser((await api.get<{ user: User }>('/auth/me')).user);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        if (e.code === 'PASSWORD_CHANGE_REQUIRED') return;
        await backend.signOut();
        setUser(null);
      }
    }
  };

  useEffect(() => backend.onReady(async (signedIn) => {
    if (signedIn) await refresh();
    setReady(true);
  }), [backend]);

  const value: Session = {
    api, user, ready, refresh,
    async login(identifier, password) {
      const r = await api.post<{ customToken: string; user: User }>('/auth/login', { identifier, password });
      await backend.signInWithCustomToken(r.customToken);
      setUser(r.user);
    },
    async logout() {
      await backend.signOut();
      setUser(null);
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
