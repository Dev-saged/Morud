// نشر كل المنتجات المسودة دفعة واحدة (visible=true) عبر نفس صلاحيات وتدقيق لوحة الإدارة.
// تشغيل: SERVICE_ACCOUNT=... FIREBASE_API_KEY=... CF_TOKEN=... CF_ACCOUNT=... OWNER_UID=... npx tsx scripts/publish-all.ts
import { call } from './prod-app';

const cat = await call('GET', '/catalog');
if (cat.status !== 200) throw new Error(`catalog ${cat.status}`);
const drafts = (cat.body.products as Array<{ id: string; sku: string; visible: boolean }>).filter((p) => !p.visible);
let ok = 0;
for (const p of drafts) {
  const r = await call('PATCH', `/admin/products/${p.id}`, { visible: true });
  if (r.status === 200) ok++; else console.error(`${p.sku}: ${r.status} ${JSON.stringify(r.body)}`);
}
console.log(`المنتجات: ${cat.body.products.length}، كانت مسودة ${drafts.length}، نُشر ${ok}`);
