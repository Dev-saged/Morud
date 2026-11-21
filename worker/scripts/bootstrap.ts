// تشغيل: SERVICE_ACCOUNT=./sa.json FIREBASE_API_KEY=... OWNER_USERNAME=owner OWNER_NAME="اسم المالك" npx tsx scripts/bootstrap.ts
import { readFileSync } from 'node:fs';
import { bootstrap } from '../src/admin/bootstrap';
import type { Services } from '../src/api/context';
import { MemoryBlobs } from '../src/infra/blobs';
import { MemoryPusher } from '../src/infra/fcm';
import { MemoryFiles } from '../src/infra/files';
import { FirestoreDb } from '../src/infra/firestore';
import { accessToken, customToken, type ServiceAccount } from '../src/infra/google';
import { IdentityToolkit } from '../src/infra/identity';
import { MemoryCounter, RateLimiter } from '../src/infra/ratelimit';

const need = (k: string) => process.env[k] ?? (console.error(`المتغير ${k} مطلوب`), process.exit(1));
const sa = JSON.parse(readFileSync(need('SERVICE_ACCOUNT'), 'utf8')) as ServiceAccount;
const token = () => accessToken(sa, 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit');
const s: Services = {
  db: new FirestoreDb(sa.project_id, token),
  identity: new IdentityToolkit(sa.project_id, need('FIREBASE_API_KEY'), token),
  files: new MemoryFiles(),
  pusher: new MemoryPusher(),
  backupStore: new MemoryBlobs(),
  backupKey: '',
  defer: () => undefined,
  verifyToken: async () => null,
  customToken: (uid, c) => customToken(sa, uid, c),
  loginLimiter: new RateLimiter(new MemoryCounter(), 5, 900, 'login'),
  ipLimiter: new RateLimiter(new MemoryCounter(), 30, 900, 'ip'),
  now: () => Date.now(),
  id: () => crypto.randomUUID().replace(/-/g, ''),
};
const r = await bootstrap(s, {
  username: need('OWNER_USERNAME'),
  displayName: need('OWNER_NAME'),
  ...(process.env.OWNER_EMAIL ? { email: process.env.OWNER_EMAIL } : {}),
  ...(process.env.OWNER_PASSWORD ? { password: process.env.OWNER_PASSWORD } : {}),
});
// في CI على مستودع عام لا تُطبع أي كلمة مرور؛ كلمة المالك تأتي من سرّ OWNER_PASSWORD
console.log(r.tempPassword && !process.env.CI ? `تمت التهيئة. مالك النظام: ${r.uid}\nكلمة المرور المؤقتة (تُعرض مرة واحدة): ${r.tempPassword}` : `تمت التهيئة. مالك النظام: ${r.uid}`);
