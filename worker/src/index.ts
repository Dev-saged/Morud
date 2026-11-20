import { createApp } from './api/app';
import type { Services } from './api/context';
import { runScheduled } from './api/cron';
import { ALL_ROUTES } from './api/routes';
import { Fcm } from './infra/fcm';
import { R2Files } from './infra/files';
import { FirestoreDb } from './infra/firestore';
import { accessToken, customToken, verifyIdToken, type ServiceAccount } from './infra/google';
import { IdentityToolkit } from './infra/identity';
import { RateLimiter } from './infra/ratelimit';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_API_KEY: string;
  SERVICE_ACCOUNT_JSON: string;
  ALLOWED_ORIGINS: string;
  BACKUP_KEY: string;
  KV: KVNamespace;
  FILES: R2Bucket;
  BACKUPS: R2Bucket;
}

const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase.messaging';

export function services(env: Env, ec: { waitUntil(p: Promise<unknown>): void }): Services {
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const token = () => accessToken(sa, SCOPES);
  return {
    db: new FirestoreDb(env.FIREBASE_PROJECT_ID, token),
    identity: new IdentityToolkit(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY, token),
    files: new R2Files(env.FILES),
    pusher: new Fcm(env.FIREBASE_PROJECT_ID, token),
    defer: (p) => ec.waitUntil(p),
    verifyToken: (t) => verifyIdToken(t, env.FIREBASE_PROJECT_ID),
    customToken: (uid, claims) => customToken(sa, uid, claims),
    loginLimiter: new RateLimiter(env.KV, 5, 900, 'login'),
    ipLimiter: new RateLimiter(env.KV, 30, 900, 'ip'),
    now: () => Date.now(),
    id: () => crypto.randomUUID().replace(/-/g, ''),
  };
}

const handle = createApp(ALL_ROUTES);

export default {
  async fetch(req: Request, env: Env, ec: ExecutionContext): Promise<Response> {
    return handle(req, services(env, ec), { allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) });
  },
  async scheduled(event: ScheduledController, env: Env, ec: ExecutionContext): Promise<void> {
    ec.waitUntil(runScheduled(services(env, ec), event.cron, { backups: env.BACKUPS, backupKey: env.BACKUP_KEY }));
  },
} satisfies ExportedHandler<Env>;
