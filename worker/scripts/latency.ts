// قياس زمن الاستجابة الحي لكل مسار رئيسي (يُشغَّل يدوياً، بصلاحية المالك).
import { readFileSync } from 'node:fs';
import { customToken, type ServiceAccount } from '../src/infra/google';
const sa = JSON.parse(readFileSync(process.env.SERVICE_ACCOUNT!, 'utf8')) as ServiceAccount;
const ct = await customToken(sa, process.env.OWNER_UID!, {});
const ex = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.FIREBASE_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) })).json() as { idToken: string };
const API = 'https://mawred-api.dev-mr07.workers.dev';
const paths = (process.env.PATHS ?? '/auth/me,/catalog,/dashboard/summary,/orders,/admin/users,/admin/shops,/notifications,/promotions,/reports/sales-daily').split(',');
for (const p of paths) {
  const ts: number[] = []; let st = 0; let size = 0;
  for (let i = 0; i < 4; i++) { const t = performance.now(); const r = await fetch(API + p, { headers: { authorization: `Bearer ${ex.idToken}`, 'x-device': 'latency' } }); const b = await r.arrayBuffer(); ts.push(performance.now() - t); st = r.status; size = b.byteLength; }
  ts.sort((a, b) => a - b);
  console.log(`${p.padEnd(24)} ${st} ${String(Math.round(size / 1024)).padStart(4)}KB  min ${Math.round(ts[0]!)}ms  med ${Math.round(ts[1]!)}ms  max ${Math.round(ts[3]!)}ms`);
}
