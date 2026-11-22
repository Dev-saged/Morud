// فحص كل أنماط الاستعلام ضد Firestore الإنتاج: أي فهرس مركّب ناقص يظهر هنا قبل أن يكسر ميزة (الاختبارات المحلية لا تطلب فهارس).
import { s } from './prod-app';
const N = Date.now();
type Q = Parameters<typeof s.db.query>[0];
const P: Array<[string, Q]> = [
  ['jobs retry', { collection: 'notificationJobs', where: [['status', '==', 'retry'], ['nextAttemptAt', '<=', N]] }],
  ['drafts', { collection: 'drafts', where: [['shopId', '==', 'x']], orderBy: [['updatedAt', 'desc']] }],
  ['invoices shop', { collection: 'invoices', where: [['shopId', '==', 'x']], orderBy: [['issuedAt', 'desc']] }],
  ['invoices status', { collection: 'invoices', where: [['status', '==', 'open']], orderBy: [['issuedAt', 'desc']] }],
  ['invoices shop+status', { collection: 'invoices', where: [['shopId', '==', 'x'], ['status', '==', 'open']], orderBy: [['issuedAt', 'desc']] }],
  ['invoices open', { collection: 'invoices', where: [['shopId', '==', 'x'], ['status', 'in', ['open', 'partial']]] }],
  ['ledger', { collection: 'ledger', where: [['shopId', '==', 'x']], orderBy: [['at', 'asc']] }],
  ['notif unread', { collection: 'notifications', where: [['userId', '==', 'x'], ['readAt', '==', null]] }],
  ['notif inbox', { collection: 'notifications', where: [['userId', '==', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['orders all', { collection: 'orders', orderBy: [['createdAt', 'desc']] }],
  ['orders overdue', { collection: 'orders', where: [['sla.overdue', '==', true]], orderBy: [['createdAt', 'desc']] }],
  ['orders today', { collection: 'orders', where: [['createdAt', '>=', N - 86400000]], orderBy: [['createdAt', 'desc']] }],
  ['orders status', { collection: 'orders', where: [['status', 'in', ['new']]], orderBy: [['createdAt', 'desc']] }],
  ['orders status+shop', { collection: 'orders', where: [['status', 'in', ['new']], ['shopId', '==', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['orders shop', { collection: 'orders', where: [['shopId', '==', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['orders agent', { collection: 'orders', where: [['agentId', '==', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['orders shop+creator', { collection: 'orders', where: [['shopId', '==', 'x'], ['createdBy', '==', 'y']], orderBy: [['createdAt', 'desc']] }],
  ['me shop 30d', { collection: 'orders', where: [['shopId', '==', 'x'], ['createdAt', '>=', N - 3e9]], orderBy: [['createdAt', 'desc']] }],
  ['me shop+creator 30d', { collection: 'orders', where: [['shopId', '==', 'x'], ['createdAt', '>=', N - 3e9], ['createdBy', '==', 'y']], orderBy: [['createdAt', 'desc']] }],
  ['agent visible', { collection: 'orders', where: [['agentId', '==', 'x'], ['status', 'in', ['ready_for_pickup']]] }],
  ['sla sweep', { collection: 'orders', where: [['sla.overdue', '==', false], ['sla.dueAt', '<', N]] }],
  ['delivery board', { collection: 'orders', where: [['status', 'in', ['confirmed', 'preparing']]], orderBy: [['createdAt', 'asc']] }],
  ['payments', { collection: 'payments', where: [['shopId', '==', 'x']], orderBy: [['at', 'desc']] }],
  ['tickets mine', { collection: 'supportTickets', where: [['by', '==', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['tickets status', { collection: 'supportTickets', where: [['status', '==', 'open']], orderBy: [['createdAt', 'desc']] }],
  ['tickets mine+status', { collection: 'supportTickets', where: [['by', '==', 'x'], ['status', '==', 'open']], orderBy: [['createdAt', 'desc']] }],
  ['users role', { collection: 'users', where: [['roles', 'array-contains', 'x']], orderBy: [['createdAt', 'desc']] }],
  ['users status', { collection: 'users', where: [['status', '==', 'active']], orderBy: [['createdAt', 'desc']] }],
  ['users role+status', { collection: 'users', where: [['roles', 'array-contains', 'x'], ['status', '==', 'active']], orderBy: [['createdAt', 'desc']] }],
  ['users any+status', { collection: 'users', where: [['roles', 'array-contains-any', ['x']], ['status', '==', 'active']] }],
  ['idem purge', { collection: 'idempotency', where: [['createdAt', '<', N]] }],
  ['mfa tickets', { collection: 'mfaTickets', where: [['exp', '<', N]] }],
];
for (const [name, q] of P) {
  try { await s.db.query({ ...q, limit: 1 }); } catch (e) { const m = (e as Error).message; console.log('MISSING', name, m.includes('index') ? '' : m.slice(0, 120)); }
}
console.log('probed', P.length);
