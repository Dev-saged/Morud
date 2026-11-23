// فحص صحة الإنتاج: آخر تشغيل للمهام المجدولة، النسخ الاحتياطية، الإشعارات العالقة، الطلبات المتأخرة.
import { s } from './prod-app';
const now = Date.now();
const ago = (t: unknown) => (typeof t === 'number' ? `${Math.round((now - t) / 60000)} د` : '—');
const h = await s.db.get('systemHealth/cron');
console.log('cron:', h ? JSON.stringify(h.data) : 'لا سجل فشل');
const b = await s.db.query({ collection: 'backupLogs', orderBy: [['at', 'desc']], limit: 3 });
for (const x of b) console.log('backup', x.data.key, x.data.status, x.data.docs, 'منذ', ago(x.data.at));
const pending = await s.db.query({ collection: 'notificationJobs', where: [['status', '==', 'pending']], limit: 50 });
const failed = await s.db.query({ collection: 'notificationJobs', where: [['status', '==', 'failed']], limit: 50 });
console.log('jobs pending', pending.length, 'failed', failed.length, failed.slice(0, 3).map((f) => f.data.lastError));
const stats = await s.db.get('system/stats');
console.log('popular', stats ? `${(stats.data.popular as string[]).length} منذ ${ago(stats.data.at)}` : 'لم يُحسب');
const devices = await s.db.query({ collection: 'devices', limit: 100 });
console.log('devices', devices.length);
const counts: Record<string, number> = {};
for (const c of ['orders', 'users', 'shops', 'products', 'payments', 'invoices']) counts[c] = (await s.db.query({ collection: c, limit: 5000 })).length;
console.log(JSON.stringify(counts));
