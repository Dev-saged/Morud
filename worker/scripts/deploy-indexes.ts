// نشر فهارس Firestore المركّبة عبر REST (firebase-tools يفشل مع حساب خدمة الإدارة)، ثم انتظار جاهزيتها.
// تشغيل: SERVICE_ACCOUNT=... npx tsx scripts/deploy-indexes.ts ../firebase/firestore.indexes.json
import { readFileSync } from 'node:fs';
import { accessToken, type ServiceAccount } from '../src/infra/google';

const sa = JSON.parse(readFileSync(process.env.SERVICE_ACCOUNT!, 'utf8')) as ServiceAccount;
const spec = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { indexes: Array<{ collectionGroup: string; queryScope: string; fields: unknown[] }> };
const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/collectionGroups`;
const tok = await accessToken(sa, 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform');
const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
let created = 0, existing = 0;
for (const ix of spec.indexes) {
  const r = await fetch(`${base}/${ix.collectionGroup}/indexes`, { method: 'POST', headers: H, body: JSON.stringify({ queryScope: ix.queryScope, fields: ix.fields }) });
  if (r.ok) created++;
  else if (r.status === 409) existing++;
  else console.error(ix.collectionGroup, r.status, (await r.text()).slice(0, 200));
}
console.log(`أُنشئ ${created}، موجود ${existing}`);
// انتظار البناء
for (let i = 0; i < 60; i++) {
  const groups = [...new Set(spec.indexes.map((x) => x.collectionGroup))];
  let building = 0;
  for (const g of groups) {
    const j = (await (await fetch(`${base}/${g}/indexes`, { headers: H })).json()) as { indexes?: Array<{ state: string }> };
    building += (j.indexes ?? []).filter((x) => x.state !== 'READY').length;
  }
  if (!building) { console.log('كل الفهارس جاهزة'); break; }
  process.stdout.write(`.${building}`);
  await new Promise((r) => setTimeout(r, 10_000));
}
