import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

// هويات الاختبار كما يضعها الخادم في custom claims
const ID = {
  owner1: { uid: 'owner1', claims: { k: ['shop'], sh: ['s1'], rp: ['sa', 'si', 'ss'] } },
  emp1: { uid: 'emp1', claims: { k: ['shop'], sh: ['s1'], rp: [] } },
  owner2: { uid: 'owner2', claims: { k: ['shop'], sh: ['s2'], rp: ['sa', 'si', 'ss'] } },
  agent: { uid: 'agent1', claims: { k: ['agent'], sh: [], rp: [] } },
  ordersEmp: { uid: 'oe1', claims: { k: ['staff'], sh: [], rp: ['ov', 'sv'] } },
  accountant: { uid: 'acc1', claims: { k: ['staff'], sh: [], rp: ['ov', 'sv', 'iv', 'av', 'rv'] } },
  catalog: { uid: 'cat1', claims: { k: ['staff'], sh: [], rp: [] } },
  admin: { uid: 'adm1', claims: { k: ['staff'], sh: [], rp: ['ov', 'sv', 'iv', 'av', 'au', 'dv', 'dt', 'um', 'rm', 'rv', 'pc', 'bm', 'sm', 'st'] } },
} as const;

const as = (who: keyof typeof ID) => env.authenticatedContext(ID[who].uid, ID[who].claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-mawred', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const seed: Array<[string, Record<string, unknown>]> = [
      ['users/owner1', { displayName: 'أبو أحمد', status: 'active' }],
      ['users/owner2', { displayName: 'أم خالد', status: 'active' }],
      ['users/owner1/devices/d1', { fcmToken: 't' }],
      ['logins/u:owner1', { uid: 'owner1' }],
      ['roles/accountant', { label: 'مالي' }],
      ['system/permissions', { extra: [] }],
      ['settings/system', { currency: 'ILS' }],
      ['shops/s1', { name: 'بقالة النور' }],
      ['shops/s1/members/emp1', { role: 'employee' }],
      ['shops/s1/private/admin', { adminNotes: 'عميل ممتاز' }],
      ['shops/s2', { name: 'سوبرماركت الأمل' }],
      ['categories/dairy', { name: 'الألبان والأجبان' }],
      ['units/box', { name: 'علبة' }],
      ['products/p1', { name: 'جبنة', visible: true }],
      ['products/p2', { name: 'مخفي', visible: false }],
      ['products/p1/private/cost', { cost: 600 }],
      ['promotions/pr1', { active: true }],
      ['promotions/pr2', { active: false }],
      ['orders/o1', { shopId: 's1', createdBy: 'owner1', agentId: 'agent1', status: 'out_for_delivery' }],
      ['orders/o2', { shopId: 's1', createdBy: 'emp1', status: 'new' }],
      ['orders/o3', { shopId: 's2', createdBy: 'owner2', status: 'new' }],
      ['orders/o1/history/h1', { to: 'confirmed' }],
      ['orders/o1/changes/c1', { status: 'pending' }],
      ['orders/o1/internal/n1', { text: 'ملاحظة داخلية' }],
      ['invoices/i1', { shopId: 's1', total: 10000 }],
      ['invoices/i1/adjustments/a1', { amount: -100 }],
      ['invoices/i3', { shopId: 's2', total: 5000 }],
      ['ledger/l1', { shopId: 's1', amount: 10000 }],
      ['ledger/l3', { shopId: 's2', amount: 5000 }],
      ['payments/pay1', { shopId: 's1', amount: 6000 }],
      ['deliveryTracks/o1', { agentId: 'agent1', active: true }],
      ['deliveryProofs/o1', { agentId: 'agent1', shopId: 's1' }],
      ['notifications/n1', { userId: 'owner1', title: 'تم استلام طلبك' }],
      ['drafts/d1', { shopId: 's1', createdBy: 'emp1', items: [] }],
      ['auditLogs/a1', { action: 'auth.login' }],
      ['backupLogs/b1', { status: 'ok' }],
      ['supportTickets/t1', { by: 'owner1', status: 'open' }],
      ['counters/orders', { next: 5 }],
      ['idempotency/x', { route: 'r' }],
      ['notificationJobs/j1', { status: 'queued' }],
    ];
    for (const [p, d] of seed) await setDoc(doc(db, p), d);
  });
});

afterAll(async () => env?.cleanup());

const read = (db: ReturnType<typeof anon>, p: string) => getDoc(doc(db, p));

describe('لا كتابة من أي عميل', () => {
  it('حتى مالك النظام لا يكتب مباشرة', async () => {
    for (const who of Object.keys(ID) as Array<keyof typeof ID>) {
      const db = as(who);
      await assertFails(setDoc(doc(db, 'orders/new1'), { shopId: 's1' }));
      await assertFails(updateDoc(doc(db, 'products/p1'), { price: 1 }));
      await assertFails(deleteDoc(doc(db, 'ledger/l1')));
      await assertFails(setDoc(doc(db, `users/${ID[who].uid}`), { roles: ['super_admin'] }));
      await assertFails(setDoc(doc(db, 'auditLogs/x'), { action: 'fake' }));
    }
    await assertFails(setDoc(doc(anon(), 'orders/x'), {}));
  });
});

describe('SRS 19.2 — اختبارات الصلاحيات', () => {
  it('محل لا يشاهد طلبات أو فواتير أو حساب محل آخر', async () => {
    await assertSucceeds(read(as('owner1'), 'orders/o1'));
    await assertFails(read(as('owner1'), 'orders/o3'));
    await assertFails(read(as('owner1'), 'invoices/i3'));
    await assertFails(read(as('owner1'), 'ledger/l3'));
    await assertFails(read(as('owner1'), 'shops/s2'));
    await assertSucceeds(getDocs(query(collection(as('owner1'), 'orders'), where('shopId', '==', 's1'))));
    await assertFails(getDocs(query(collection(as('owner1'), 'orders'), where('shopId', '==', 's2'))));
    await assertFails(getDocs(collection(as('owner1'), 'orders')));
  });
  it('موظف المحل يرى طلباته فقط ولا يرى الفواتير والكشف دون صلاحية', async () => {
    await assertSucceeds(read(as('emp1'), 'orders/o2'));
    await assertFails(read(as('emp1'), 'orders/o1'));
    await assertFails(read(as('emp1'), 'invoices/i1'));
    await assertFails(read(as('emp1'), 'ledger/l1'));
    await assertSucceeds(read(as('emp1'), 'shops/s1'));
  });
  it('المندوب يرى الطلبات المسندة إليه فقط ولا يرى المالية', async () => {
    await assertSucceeds(read(as('agent'), 'orders/o1'));
    await assertFails(read(as('agent'), 'orders/o2'));
    await assertFails(read(as('agent'), 'invoices/i1'));
    await assertFails(read(as('agent'), 'ledger/l1'));
    await assertSucceeds(read(as('agent'), 'deliveryTracks/o1'));
    await assertSucceeds(read(as('agent'), 'deliveryProofs/o1'));
    await assertSucceeds(getDocs(query(collection(as('agent'), 'orders'), where('agentId', '==', 'agent1'))));
  });
  it('صاحب المحل لا يفتح بيانات الإدارة', async () => {
    for (const p of ['auditLogs/a1', 'roles/accountant', 'system/permissions', 'shops/s1/private/admin', 'orders/o1/internal/n1', 'products/p1/private/cost', 'backupLogs/b1', 'users/owner2']) {
      await assertFails(read(as('owner1'), p));
    }
  });
  it('موظف المنتجات لا يرى المعلومات المالية', async () => {
    await assertFails(read(as('catalog'), 'invoices/i1'));
    await assertFails(read(as('catalog'), 'ledger/l1'));
    await assertFails(read(as('catalog'), 'products/p1/private/cost'));
    await assertSucceeds(read(as('catalog'), 'products/p2'));
  });
  it('الموظف المالي يرى الفواتير والدفتر، وموظف الطلبات لا', async () => {
    await assertSucceeds(read(as('accountant'), 'invoices/i3'));
    await assertSucceeds(read(as('accountant'), 'ledger/l3'));
    await assertSucceeds(read(as('accountant'), 'payments/pay1'));
    await assertFails(read(as('ordersEmp'), 'invoices/i1'));
    await assertFails(read(as('ordersEmp'), 'ledger/l1'));
    await assertSucceeds(read(as('ordersEmp'), 'orders/o3'));
    await assertSucceeds(read(as('ordersEmp'), 'orders/o1/internal/n1'));
  });
  it('غير المسجّل لا يقرأ شيئاً', async () => {
    for (const p of ['settings/system', 'products/p1', 'categories/dairy', 'orders/o1', 'users/owner1']) await assertFails(read(anon(), p));
  });
});

describe('قراءات مسموحة بدقة', () => {
  it('الكتالوج: المرئي للجميع، المخفي للموظفين، العروض الفعّالة فقط للمحلات', async () => {
    await assertSucceeds(read(as('owner1'), 'products/p1'));
    await assertFails(read(as('owner1'), 'products/p2'));
    await assertSucceeds(getDocs(query(collection(as('owner1'), 'products'), where('visible', '==', true))));
    await assertFails(getDocs(collection(as('owner1'), 'products')));
    await assertSucceeds(read(as('owner1'), 'categories/dairy'));
    await assertSucceeds(read(as('owner1'), 'units/box'));
    await assertSucceeds(read(as('owner1'), 'promotions/pr1'));
    await assertFails(read(as('owner1'), 'promotions/pr2'));
    await assertSucceeds(read(as('catalog'), 'promotions/pr2'));
    await assertSucceeds(read(as('owner1'), 'settings/system'));
  });
  it('السجلات الفرعية للطلب تتبع صلاحية الطلب', async () => {
    await assertSucceeds(read(as('owner1'), 'orders/o1/history/h1'));
    await assertSucceeds(read(as('owner1'), 'orders/o1/changes/c1'));
    await assertFails(read(as('owner2'), 'orders/o1/history/h1'));
    await assertFails(read(as('emp1'), 'orders/o1/changes/c1'));
    await assertSucceeds(read(as('agent'), 'orders/o1/history/h1'));
    await assertSucceeds(read(as('owner1'), 'invoices/i1/adjustments/a1'));
    await assertFails(read(as('owner2'), 'invoices/i1/adjustments/a1'));
  });
  it('المستخدم يرى ملفه وأجهزته وإشعاراته وتذاكره فقط', async () => {
    await assertSucceeds(read(as('owner1'), 'users/owner1'));
    await assertSucceeds(read(as('owner1'), 'users/owner1/devices/d1'));
    await assertFails(read(as('owner2'), 'users/owner1/devices/d1'));
    await assertSucceeds(read(as('owner1'), 'notifications/n1'));
    await assertFails(read(as('owner2'), 'notifications/n1'));
    await assertSucceeds(read(as('owner1'), 'supportTickets/t1'));
    await assertFails(read(as('owner2'), 'supportTickets/t1'));
    await assertSucceeds(read(as('owner1'), 'shops/s1/members/emp1'));
    await assertSucceeds(read(as('emp1'), 'drafts/d1'));
    await assertFails(read(as('owner2'), 'drafts/d1'));
    await assertFails(read(as('accountant'), 'drafts/d1'));
  });
  it('المدير يرى التدقيق والمستخدمين والتتبع والنسخ', async () => {
    for (const p of ['auditLogs/a1', 'users/owner2', 'deliveryTracks/o1', 'backupLogs/b1', 'supportTickets/t1', 'shops/s2/private/admin', 'products/p1/private/cost', 'roles/accountant']) {
      await assertSucceeds(read(as('admin'), p));
    }
  });
  it('مجموعات الخادم الداخلية مغلقة للجميع', async () => {
    for (const p of ['logins/u:owner1', 'counters/orders', 'idempotency/x', 'notificationJobs/j1']) {
      await assertFails(read(as('admin'), p));
      await assertFails(read(as('owner1'), p));
    }
  });
});
