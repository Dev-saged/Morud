// يبني ملف أسرار Worker من متغيرات البيئة دون طباعة أي قيمة
import { writeFileSync } from 'node:fs';
const keys = ['SERVICE_ACCOUNT_JSON', 'FIREBASE_API_KEY', 'BACKUP_KEY'];
const out = {};
for (const k of keys) {
  if (!process.env[k]) { console.error(`السر ${k} غير مضبوط في GitHub`); process.exit(1); }
  out[k] = process.env[k];
}
JSON.parse(out.SERVICE_ACCOUNT_JSON);
if (!/^[A-Za-z0-9+/]{43}=$/.test(out.BACKUP_KEY)) { console.error('BACKUP_KEY يجب أن يكون 32 بايت بترميز base64 (44 حرفاً)'); process.exit(1); }
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('أسرار Worker جاهزة:', keys.join('، '));
