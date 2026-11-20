import { createApp } from './api/app';
import type { Services } from './api/context';
import { FirestoreDb } from './infra/firestore';
import { accessToken, customToken, verifyIdToken, type ServiceAccount } from './infra/google';
import { IdentityToolkit } from './infra/identity';
import { RateLimiter } from './infra/ratelimit';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY: string;
  SERVICE_ACCOUNT_JSON: string;
  ALLOWED_ORIGINS: string;
  KV: KVNamespace;
  FILES: R2Bucket;
}

const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase.messaging';

export function services(env: Env): Services {
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const token = () => accessToken(sa, SCOPES);
  return {
    db: new FirestoreDb(env.FIREBASE_PROJECT_ID, token),
    identity: new IdentityToolkit(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY, token),
    verifyToken: (t) => verifyIdToken(t, env.FIREBASE_PROJECT_ID),
    customToken: (uid, claims) => customToken(sa, uid, claims),
    loginLimiter: new RateLimiter(env.KV, 5, 900, 'login'),
    ipLimiter: new RateLimiter(env.KV, 30, 900, 'ip'),
    now: () => Date.now(),
    id: () => crypto.randomUUID().replace(/-/g, ''),
  };
}

const handle = createApp();

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, services(env), { allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) });
  },
} satisfies ExportedHandler<Env>;
