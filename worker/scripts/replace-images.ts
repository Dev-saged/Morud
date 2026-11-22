// استبدال صور المنتجات بالصور الحقيقية المفرّغة: رفع الرئيسية والمصغّرة (WebP شفاف) ثم ربطها بالمنتج عبر واجهة الإدارة نفسها.
// تشغيل: SERVICE_ACCOUNT=... FIREBASE_API_KEY=... CF_TOKEN=... CF_ACCOUNT=... OWNER_UID=... npx tsx scripts/replace-images.ts ../catalog/photos/final [SKU...]
import { existsSync, readFileSync } from 'node:fs';
import { call } from './prod-app';

const [dir, ...only] = process.argv.slice(2);
const cat = await call('GET', '/catalog');
if (cat.status !== 200) throw new Error(`catalog ${cat.status}`);
const bySku = new Map((cat.body.products as Array<{ id: string; sku: string }>).map((p) => [p.sku, p.id]));
const upload = async (path: string) => {
  const b = readFileSync(path);
  const r = await call('POST', '/admin/uploads/product-image', undefined, { 'content-type': 'image/webp' }, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  if (r.status !== 201) throw new Error(`upload ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.key as string;
};
let ok = 0, fail = 0;
for (const [sku, id] of bySku) {
  if (only.length && !only.includes(sku)) continue;
  const main = `${dir}/${sku}.webp`, thumb = `${dir}/${sku}.thumb.webp`;
  if (!existsSync(main) || !existsSync(thumb)) continue;
  try {
    const key = await upload(main);
    const t = await upload(thumb);
    const r = await call('PATCH', `/admin/products/${id}`, { images: [{ key, thumb: t }] });
    if (r.status !== 200) throw new Error(`patch ${r.status} ${JSON.stringify(r.body)}`);
    ok++; process.stdout.write('.');
  } catch (e) { fail++; console.error(`\n${sku}: ${(e as Error).message}`); }
}
console.log(`\nاستُبدلت صور ${ok} منتج، فشل ${fail}`);
