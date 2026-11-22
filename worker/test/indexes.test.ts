import spec from '../../firebase/firestore.indexes.json';
import { describe, expect, it } from 'vitest';

// كل استعلام يجمع شروطاً على حقول مختلفة يحتاج فهرساً مركّباً في الإنتاج. الذاكرة المحلية لا تطلبه،
// فهذا الاختبار يضمن أن firestore.indexes.json يغطيها (وscripts/probe-indexes.ts يتحقق منها حيّاً).
const REQUIRED: Array<[string, string]> = [
  ['notificationJobs', 'status,nextAttemptAt'], ['drafts', 'shopId,updatedAt'], ['orders', 'sla.overdue,createdAt'], ['orders', 'agentId,createdAt'],
  ['orders', 'status,createdAt'], ['orders', 'shopId,createdAt'], ['supportTickets', 'by,createdAt'], ['supportTickets', 'status,createdAt'],
  ['supportTickets', 'by,status,createdAt'], ['users', 'roles,createdAt'], ['users', 'status,createdAt'], ['users', 'roles,status,createdAt'], ['auditLogs', 'actorId,at'], ['auditLogs', 'entity.id,at'], ['auditLogs', 'action,at'], ['invoices', 'shopId,issuedAt'], ['payments', 'shopId,at'],
  ['invoices', 'shopId,issuedAt'], ['ledger', 'shopId,at'], ['payments', 'shopId,at'], ['notifications', 'userId,createdAt'],
];

describe('فهارس Firestore', () => {
  it('تغطي كل الاستعلامات المركّبة المستخدمة في الخادم', () => {
    const have = new Set((spec.indexes as Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }>).map((i) => `${i.collectionGroup}:${i.fields.map((f) => f.fieldPath).join(',')}`));
    expect(REQUIRED.filter(([c, f]) => !have.has(`${c}:${f}`))).toEqual([]);
  });
});
