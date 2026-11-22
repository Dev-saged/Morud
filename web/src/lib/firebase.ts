import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserSessionPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth';
import type { AuthBackend } from './session';

/** Firebase Auth فقط (القراءة والكتابة عبر الخادم). الجلسة تُحفظ بأمان في المتصفح (تذكّرني). */
export function firebaseBackend(): AuthBackend {
  const app = initializeApp({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID });
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);
  return {
    async signInWithCustomToken(t, remember = true) {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithCustomToken(auth, t);
    },
    idToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
    signOut: () => signOut(auth),
    onReady: (cb) => onAuthStateChanged(auth, (u) => cb(!!u)),
  };
}
