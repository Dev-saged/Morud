import { createApp } from './api/app';
import type { Services } from './api/context';
import { runScheduled } from './api/cron';
import { ALL_ROUTES } from './api/routes';
import { R2Blobs } from './infra/blobs';
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

// مفاتيح JWKS العامة من كاش حافة Cloudflare بدل Google في كل نسخة جديدة
const edgeFetch: typeof fetch = (input, init) => fetch(input, { ...init, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);

// عملاء Google يعيشون طوال عمر النسخة حتى تبقى كاشاتهم (الرمز، الأدوار) دافئة بين الطلبات
let shared: { key: string; db: FirestoreDb; identity: IdentityToolkit; pusher: Fcm; sa: ServiceAccount } | null = null;
function clients(env: Env) {
  const key = `${env.FIREBASE_PROJECT_ID}|${env.SERVICE_ACCOUNT_JSON.length}`;
  if (shared?.key === key) return shared;
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const token = () => accessToken(sa, SCOPES, fetch, Date.now(), env.KV);
  shared = { key, sa, db: new FirestoreDb(env.FIREBASE_PROJECT_ID, token), identity: new IdentityToolkit(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY, token), pusher: new Fcm(env.FIREBASE_PROJECT_ID, token) };
  return shared;
}

export function services(env: Env, ec: { waitUntil(p: Promise<unknown>): void }): Services {
  const { sa, db, identity, pusher } = clients(env);
  return {
    db,
    identity,
    files: new R2Files(env.FILES),
    pusher,
    backupStore: new R2Blobs(env.BACKUPS),
    backupKey: env.BACKUP_KEY,
    defer: (p) => ec.waitUntil(p),
    verifyToken: (t) => verifyIdToken(t, env.FIREBASE_PROJECT_ID, edgeFetch),
    customToken: (uid, claims) => customToken(sa, uid, claims),
    loginLimiter: new RateLimiter(env.KV, 5, 900, 'login'),
    ipLimiter: new RateLimiter(env.KV, 30, 900, 'ip'),
    cache: env.KV,
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
    ec.waitUntil(runScheduled(services(env, ec), event.cron, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
