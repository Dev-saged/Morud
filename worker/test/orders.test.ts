import { describe, expect, it } from 'vitest';
import { deliverJob, processDueJobs, queueNotice } from '../src/api/notify';
import { ALL_ROUTES } from '../src/api/routes';
import type { MemoryPusher } from '../src/infra/fcm';
import { addUser, world, type World } from './helpers';

let k = 0;
const H = () => ({ 'idempotency-key': `key_${String(++k).padStart(16, '0')}` });

function setup() {
  const w = world(ALL_ROUTES);
  addUser(w, 'own', { username: 'owner', roles: ['super_admin'] });
  addUser(w, 'oe', { username: 'orders', roles: ['orders_employee'] });
  addUser(w, 'acc', { username: 'acc', roles: ['accountant'] });
  addUser(w, 'dm', { username: 'dm', roles: ['delivery_manager'] });
  addUser(w, 'ag', { username: 'agent', roles: ['delivery_agent'] });
  addUser(w, 'ag2', { username: 'agent2', roles: ['delivery_agent'] });
  addUser(w, 'so1', { username: 'shop1', roles: ['shop_owner'], shopIds: ['s1'] });
  addUser(w, 'se1', { username: 'emp1', roles: ['shop_employee'], shopIds: ['s1'] });
  addUser(w, 'so2', { username: 'shop2', roles: ['shop_owner'], shopIds: ['s2'] });
  w.db.seed('shops/s1', { name: 'بقالة النور', ownerName: 'أبو أحمد', phone: '0599888777', city: 'دير البلح', region: 'الوسطى', address: 'شارع صلاح الدين', status: 'active', paymentTerms: ['cash', 'credit'], credit: { enabled: true, limit: 100000 }, balance: 0, ownerUid: 'so1' });
  w.db.seed('shops/s2', { name: 'سوبرماركت الأمل', status: 'active', paymentTerms: ['cash'], credit: { enabled: false, limit: 0 }, balance: 0, ownerUid: 'so2' });
  w.db.seed('units/box', { name: 'علبة', kind: 'count', allowFraction: false }).seed('units/carton', { name: 'كرتونة', kind: 'count', allowFraction: false }).seed('units/kg', { name: 'كيلوغرام', kind: 'weight', allowFraction: true });
  w.db.seed('products/feta', { name: 'جبنة فيتا', altNames: [], sku: 'DAI-001', barcodes: [], categoryId: 'dairy', baseUnitId: 'box', available: true, visible: true, archived: false,
    units: [{ unitId: 'box', factorToBase: 1000, price: 800, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }, { unitId: 'carton', factorToBase: 12000, price: 9000, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] });
  w.db.seed('products/nuts', { name: 'مكسرات', altNames: [], sku: 'SNK-010', barcodes: [], categoryId: 'snacks', baseUnitId: 'kg', available: true, visible: true, archived: false,
    units: [{ unitId: 'kg', factorToBase: 1000, price: 4500, minQtyMilli: 250, stepMilli: 250, allowFraction: true }] });
  w.db.seed('products/off', { name: 'غير متوفر', altNames: [], sku: 'X-1', barcodes: [], categoryId: 'x', baseUnitId: 'box', available: false, visible: true, units: [{ unitId: 'box', factorToBase: 1000, price: 100, minQtyMilli: 1000, stepMilli: 1000, allowFraction: false }] });
  return w;
}
const T = (w: World, uid: string) => w.tokenFor(uid);
const cart = [{ productId: 'feta', unitId: 'carton', qtyMilli: 2000 }, { productId: 'nuts', unitId: 'kg', qtyMilli: 1500 }]; // 18000 + 6750 = 24750
const submit = (w: World, uid = 'so1', body: object = {}) => w.call('POST', '/orders', { token: T(w, uid), headers: H(), body: { shopId: 's1', items: cart, paymentMethod: 'cash', ...body } });
const move = (w: World, uid: string, id: string, to: string, body: object = {}) => w.call('POST', `/orders/${id}/transition`, { token: T(w, uid), headers: H(), body: { to, ...body } });

describe('إرسال الطلب (SRS 4)', () => {
  it('تسعير مسبق ثم إرسال: رقم فريد، مهلة تقديرية، سجل، إشعار الإدارة والمحل', async () => {
    const w = setup();
    w.db.seed('users/oe/devices/d1', { token: 'tok-oe-device-aaaaaaaaaaaa', platform: 'android' });
    const q = await w.call('POST', '/orders/quote', { token: T(w, 'se1'), body: { items: cart } });
    expect(q.body.cart.total).toBe(24750);
    const r = await submit(w, 'so1', { seenTotal: 24750, notes: 'التوصيل قبل الظهر' });
    expect(r.status).toBe(201);
    expect(r.body.order).toMatchObject({ number: 'MW-O-2026-000001', status: 'new', totals: { total: 24750 }, sla: { estimated: true, overdue: false } });
    const o = await w.db.get(`orders/${r.body.order.id}`);
    expect(o!.data).toMatchObject({ shopId: 's1', createdBy: 'so1', shopName: 'بقالة النور', items: [{ unitName: 'كرتونة', unitPrice: 9000 }, { unitPrice: 4500 }] });
    expect((await w.db.query({ collection: `orders/${r.body.order.id}/history` })).length).toBe(1);
    const inboxOe = await w.call('GET', '/notifications', { token: T(w, 'oe') });
    expect(inboxOe.body.notifications[0]).toMatchObject({ type: 'order.new', title: 'طلب جديد MW-O-2026-000001' });
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications[0].title).toBe('تم استلام طلبك');
    expect((await w.call('GET', '/notifications', { token: T(w, 'ag') })).body.notifications).toHaveLength(0);
    await w.flush();
    expect((w.s.pusher as MemoryPusher).sent[0]).toMatchObject({ token: 'tok-oe-device-aaaaaaaaaaaa', p: { sound: true, data: { type: 'order.new' } } });
  });
  it('الضغط المتكرر بنفس المفتاح = طلب واحد (SRS 19.3-4)', async () => {
    const w = setup();
    const h = H();
    const send = () => w.call('POST', '/orders', { token: T(w, 'so1'), headers: h, body: { shopId: 's1', items: cart, paymentMethod: 'cash' } });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.body.order.id).toBe(b.body.order.id);
    expect((await w.db.query({ collection: 'orders' })).length).toBe(1);
    expect((await w.db.get('counters/O-2026'))!.data.next).toBe(2);
  });
  it('الرفض: موظف بلا صلاحية إرسال، محل آخر، محل موقوف، طريقة دفع، آجل غير مفعّل، تجاوز الحد، تغيّر السعر، صنف غير متوفر', async () => {
    const w = setup();
    expect((await submit(w, 'se1')).status).toBe(403);
    expect((await submit(w, 'so2')).status).toBe(403);
    expect((await submit(w, 'so2', { shopId: 's2', paymentMethod: 'credit' })).body.error.code).toBe('PAYMENT_METHOD_NOT_ALLOWED');
    await w.db.commit([{ kind: 'update', path: 'shops/s2', data: { paymentTerms: ['cash', 'credit'] } }]);
    expect((await submit(w, 'so2', { shopId: 's2', paymentMethod: 'credit' })).body.error.code).toBe('CREDIT_NOT_ENABLED');
    expect((await submit(w, 'so1', { paymentMethod: 'credit', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 12000 }] })).body.error.code).toBe('CREDIT_LIMIT');
    expect((await submit(w, 'so1', { paymentMethod: 'cash', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 12000 }] })).status).toBe(201);
    const pc = await submit(w, 'so1', { seenTotal: 20000 });
    expect(pc.status).toBe(409);
    expect(pc.body.error).toMatchObject({ code: 'PRICE_CHANGED', details: { total: 24750 } });
    expect((await submit(w, 'so1', { items: [{ productId: 'off', unitId: 'box', qtyMilli: 1000 }] })).body.error.details.problems[0].code).toBe('PRODUCT_UNAVAILABLE');
    expect((await submit(w, 'so1', { items: 'x' })).status).toBe(400);
    expect((await submit(w, 'so1', { items: [{ productId: 'feta' }] })).status).toBe(400);
    await w.db.commit([{ kind: 'update', path: 'shops/s1', data: { status: 'suspended' } }]);
    expect((await submit(w, 'so1')).body.error.code).toBe('SHOP_SUSPENDED');
    expect((await w.call('POST', '/orders/quote', { token: T(w, 'acc'), body: { items: cart } })).status).toBe(403);
    expect((await w.call('POST', '/orders', { token: T(w, 'so1'), headers: H(), body: { shopId: 'ghost', items: cart } })).status).toBe(403);
  });
  it('تحذير الاقتراب من الحد الائتماني لا يمنع الطلب', async () => {
    const w = setup();
    const r = await submit(w, 'so1', { paymentMethod: 'credit', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 9000 }] });
    expect(r.body.order.creditWarning).toBe(true);
  });
});

describe('دورة حياة الطلب كاملة (SRS 5 و8 و9)', () => {
  it('مراجعة ← تأكيد بفاتورة ← تجهيز ← خروج ← في الطريق ← تسليم بتحصيل كامل', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    expect((await move(w, 'oe', id, 'under_review')).body.order.status).toBe('under_review');
    const c = await move(w, 'oe', id, 'confirmed');
    const invId = c.body.order.invoiceId;
    const inv = await w.db.get(`invoices/${invId}`);
    expect(inv!.data).toMatchObject({ number: 'MW-I-2026-000001', total: 24750, remaining: 24750, status: 'open', shop: { name: 'بقالة النور' }, orderNumber: 'MW-O-2026-000001' });
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(24750);
    await move(w, 'oe', id, 'preparing');
    await move(w, 'oe', id, 'ready_for_pickup');
    expect((await move(w, 'dm', id, 'out_for_delivery')).body.error.details.guards).toEqual(['agent_assigned']);
    await w.db.commit([{ kind: 'update', path: `orders/${id}`, data: { agentId: 'ag' } }]);
    expect((await move(w, 'dm', id, 'out_for_delivery')).status).toBe(200);
    expect((await move(w, 'ag2', id, 'on_the_way')).status).toBe(404);
    expect((await move(w, 'dm', id, 'on_the_way')).body.error.code).toBe('ACTOR_NOT_ALLOWED');
    expect((await move(w, 'ag', id, 'on_the_way')).status).toBe(200);
    expect((await w.db.get(`deliveryTracks/${id}`))!.data).toMatchObject({ active: true, agentId: 'ag' });
    expect((await move(w, 'ag', id, 'delivered')).body.error.details.guards).toEqual(['proof_present']);
    expect((await move(w, 'ag', id, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: 1.5 } })).status).toBe(400);
    const d = await move(w, 'ag', id, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: 24750, note: 'تم بنجاح', geo: { lat: 31.4, lng: 34.3 } } });
    expect(d.status).toBe(200);
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ paid: 24750, remaining: 0, status: 'paid' });
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(0);
    expect((await w.db.get(`deliveryTracks/${id}`))!.data.active).toBe(false);
    expect((await w.db.get(`deliveryProofs/${id}`))!.data).toMatchObject({ receiverName: 'أبو أحمد', collected: 24750 });
    const pays = await w.db.query({ collection: 'payments' });
    expect(pays[0]!.data).toMatchObject({ number: 'MW-P-2026-000001', amount: 24750, source: 'delivery', allocations: [{ invoiceId: invId, amount: 24750 }] });
    const shopInbox = (await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title);
    for (const t of ['طلبك قيد المراجعة', 'تم تأكيد طلبك وإصدار فاتورته', 'خرج طلبك للتوصيل', 'المندوب في الطريق إليك', 'تم تسليم طلبك']) expect(shopInbox).toContain(t);
    const hist = (await w.call('GET', `/orders/${id}`, { token: T(w, 'so1') })).body.history.map((h: any) => h.to);
    expect(hist).toEqual(['new', 'under_review', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'on_the_way', 'delivered']);
  });
  it('تحصيل جزئي يترك متبقياً، والمرتجع الجزئي يُنشئ إشعاراً دائناً', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    const invId = (await move(w, 'oe', id, 'confirmed')).body.order.invoiceId;
    await w.db.commit([{ kind: 'update', path: `orders/${id}`, data: { status: 'out_for_delivery', agentId: 'ag' } }]);
    await move(w, 'ag', id, 'delivered', { proof: { receiverName: 'أبو أحمد', collectedAmount: 10000 } });
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ paid: 10000, remaining: 14750, status: 'partial' });
    expect((await move(w, 'oe', id, 'returned', { reason: 'علبة تالفة' })).status).toBe(403);
    const r = await move(w, 'own', id, 'returned', { reason: 'كرتونة تالفة', returnLines: [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }] });
    expect(r.status).toBe(200);
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ credited: 9000, remaining: 5750 });
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(24750 - 10000 - 9000);
    expect((await w.db.get(`orders/${id}`))!.data.returnAmount).toBe(9000);
    expect((await move(w, 'own', id, 'cancelled', { reason: 'محاولة' })).body.error.code).toBe('TRANSITION_NOT_ALLOWED');
  });
  it('المرتجع لا يتجاوز الكمية المفوترة', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await move(w, 'oe', id, 'confirmed');
    await w.db.commit([{ kind: 'update', path: `orders/${id}`, data: { status: 'delivered' } }]);
    expect((await move(w, 'own', id, 'returned', { reason: 'زيادة', returnLines: [{ productId: 'feta', unitId: 'carton', qtyMilli: 3000 }] })).status).toBe(400);
    expect((await move(w, 'own', id, 'returned', { reason: 'زيادة', returnLines: [{ productId: 'ghost', unitId: 'box', qtyMilli: 1000 }] })).status).toBe(400);
    expect((await move(w, 'own', id, 'returned', { reason: 'زيادة', returnLines: [] })).status).toBe(400);
    expect((await move(w, 'own', id, 'returned', { reason: 'إرجاع كامل' })).status).toBe(200);
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(0);
  });
  it('الإلغاء بعد التأكيد يلغي الفاتورة بإشعار دائن، والمحل لا يلغي بعد التأكيد', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    const invId = (await move(w, 'oe', id, 'confirmed')).body.order.invoiceId;
    expect((await move(w, 'so1', id, 'cancelled', { reason: 'لم أعد أحتاجه' })).body.error.code).toBe('CANCEL_NOT_ALLOWED');
    expect((await move(w, 'oe', id, 'cancelled')).body.error.code).toBe('FORBIDDEN');
    const r = await move(w, 'own', id, 'cancelled', { reason: 'نفاد المخزون' });
    expect(r.status).toBe(200);
    expect((await w.db.get(`invoices/${invId}`))!.data).toMatchObject({ status: 'void', voidMode: 'keep_credit' });
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(0);
    const ledger = (await w.db.query({ collection: 'ledger' })).map((l) => [l.data.type, l.data.amount]);
    expect(ledger).toEqual(expect.arrayContaining([['invoice', 24750], ['credit_note', -24750]]));
    expect((await w.db.query({ collection: `invoices/${invId}/adjustments` }))[0]!.data.type).toBe('void');
    expect((await move(w, 'own', id, 'confirmed')).body.error.code).toBe('ORDER_CLOSED');
  });
  it('المحل يلغي طلباً جديداً بسبب، والإدارة تُبلَّغ', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    expect((await move(w, 'so1', id, 'cancelled')).body.error.code).toBe('REASON_REQUIRED');
    expect((await move(w, 'so1', id, 'cancelled', { reason: 'طلب مكرر' })).status).toBe(200);
    expect((await w.call('GET', '/notifications', { token: T(w, 'oe') })).body.notifications.map((n: any) => n.title)).toContain('ألغى المحل الطلب MW-O-2026-000001');
    expect((await move(w, 'se1', (await submit(w)).body.order.id, 'cancelled', { reason: 'x' })).status).toBe(404);
  });
  it('الرفض بسبب من الإدارة، والمحل الآخر لا يرى الطلب', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    expect((await move(w, 'so2', id, 'cancelled', { reason: 'xxx' })).status).toBe(404);
    expect((await move(w, 'oe', id, 'rejected', { reason: 'المحل خارج منطقة التوصيل' })).status).toBe(200);
    expect((await w.db.get(`orders/${id}`))!.data.closure).toMatchObject({ actor: 'staff', reason: 'المحل خارج منطقة التوصيل' });
  });
  it('تعذر التسليم ثم إعادة الجدولة', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await w.db.commit([{ kind: 'update', path: `orders/${id}`, data: { status: 'on_the_way', agentId: 'ag' } }]);
    expect((await move(w, 'ag', id, 'delivery_failed', { reason: 'المحل مغلق' })).status).toBe(200);
    expect((await w.call('GET', '/notifications', { token: T(w, 'dm') })).body.notifications.map((n: any) => n.title)).toContain('تعذّر تسليم الطلب MW-O-2026-000001');
    expect((await move(w, 'dm', id, 'ready_for_pickup', { reason: 'إعادة جدولة للغد' })).status).toBe(200);
  });
});

describe('تعديل الطلب وموافقة المحل (SRS 5.4)', () => {
  it('تعديل قبل التأكيد: موافقة المحل تؤكد بالإجمالي الجديد', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    const ch = await w.call('POST', `/orders/${id}/changes`, { token: T(w, 'oe'), headers: H(), body: { reason: 'المتوفر كرتونة واحدة فقط', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }, { productId: 'nuts', unitId: 'kg', qtyMilli: 1500 }] } });
    expect(ch.body.total).toBe(15750);
    expect((await w.db.get(`orders/${id}`))!.data.status).toBe('awaiting_shop_approval');
    expect((await w.call('POST', `/orders/${id}/changes`, { token: T(w, 'oe'), headers: H(), body: { reason: 'مرة أخرى', items: cart } })).status).toBe(400);
    expect((await move(w, 'se1', id, 'confirmed')).status).toBe(404);
    const ok = await move(w, 'so1', id, 'confirmed');
    expect(ok.status).toBe(200);
    const o = (await w.db.get(`orders/${id}`))!.data;
    expect(o).toMatchObject({ status: 'confirmed', totals: { total: 15750 } });
    expect((await w.db.get(`invoices/${o.invoiceId}`))!.data.total).toBe(15750);
    const changes = (await w.call('GET', `/orders/${id}`, { token: T(w, 'so1') })).body.changes;
    expect(changes[0]).toMatchObject({ status: 'approved', before: { total: 24750 }, after: { total: 15750 } });
    expect((await w.call('GET', '/notifications', { token: T(w, 'oe') })).body.notifications.map((n: any) => n.title)).toContain('وافق المحل على التعديل MW-O-2026-000001');
  });
  it('تعديل أثناء التجهيز: الفاتورة القديمة تُلغى وتصدر جديدة، والدفتر يطابق الإجمالي الجديد', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await move(w, 'oe', id, 'confirmed');
    await move(w, 'oe', id, 'preparing');
    await w.call('POST', `/orders/${id}/changes`, { token: T(w, 'oe'), headers: H(), body: { reason: 'نقص في المكسرات', items: [{ productId: 'feta', unitId: 'carton', qtyMilli: 2000 }, { productId: 'nuts', unitId: 'kg', qtyMilli: 1000 }] } });
    await move(w, 'so1', id, 'confirmed');
    expect((await w.db.get('shops/s1'))!.data.balance).toBe(18000 + 4500);
    const invoices = await w.db.query({ collection: 'invoices' });
    expect(invoices.map((i) => i.data.status).sort()).toEqual(['open', 'void']);
  });
  it('رفض المحل للتعديل يعيد الطلب للمراجعة بسبب', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await w.call('POST', `/orders/${id}/changes`, { token: T(w, 'oe'), headers: H(), body: { reason: 'بديل بعلامة أخرى', items: [{ productId: 'nuts', unitId: 'kg', qtyMilli: 1000 }] } });
    expect((await move(w, 'so1', id, 'under_review')).body.error.code).toBe('REASON_REQUIRED');
    expect((await move(w, 'so1', id, 'under_review', { reason: 'لا أريد البديل' })).status).toBe(200);
    expect((await w.call('GET', `/orders/${id}`, { token: T(w, 'oe') })).body.changes[0]).toMatchObject({ status: 'declined', declineReason: 'لا أريد البديل' });
  });
  it('لا تأكيد إذا أصبح صنف غير متوفر', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    await w.db.commit([{ kind: 'update', path: 'products/nuts', data: { available: false } }]);
    expect((await move(w, 'oe', id, 'confirmed')).body.error.details.guards).toEqual(['items_available']);
    expect((await w.call('POST', `/orders/${id}/changes`, { token: T(w, 'acc'), headers: H(), body: { reason: 'x y z', items: cart } })).status).toBe(403);
  });
});

describe('عرض الطلبات والملاحظات والمسودات', () => {
  it('لوحة الإدارة بالفلاتر، طلبات المحل، الملاحظات الداخلية، التعيين', async () => {
    const w = setup();
    const a = (await submit(w)).body.order.id;
    const b = (await submit(w, 'so2', { shopId: 's2' })).body.order.id;
    await move(w, 'oe', a, 'under_review');
    expect((await w.call('GET', '/orders?filter=review', { token: T(w, 'oe') })).body.orders.map((o: any) => o.id)).toEqual([a]);
    expect((await w.call('GET', '/orders?filter=new&shopId=s2', { token: T(w, 'oe') })).body.orders.map((o: any) => o.id)).toEqual([b]);
    expect((await w.call('GET', '/orders?filter=overdue', { token: T(w, 'oe') })).body.orders).toEqual([]);
    expect((await w.call('GET', '/orders?agentId=ag', { token: T(w, 'oe') })).body.orders).toEqual([]);
    expect((await w.call('GET', '/orders', { token: T(w, 'so1') })).status).toBe(403);
    expect((await w.call('GET', '/shops/s1/orders', { token: T(w, 'so1') })).body.orders).toHaveLength(1);
    expect((await w.call('GET', '/shops/s1/orders', { token: T(w, 'se1') })).body.orders).toHaveLength(0);
    expect((await w.call('GET', '/shops/s2/orders', { token: T(w, 'so1') })).status).toBe(403);
    expect((await w.call('POST', `/orders/${a}/notes`, { token: T(w, 'oe'), body: { text: 'العميل يفضّل الاتصال قبل الوصول' } })).status).toBe(201);
    expect((await w.call('GET', `/orders/${a}`, { token: T(w, 'oe') })).body.internal).toHaveLength(1);
    const shopView = await w.call('GET', `/orders/${a}`, { token: T(w, 'so1') });
    expect(shopView.body.internal).toEqual([]);
    expect(shopView.body.actions).toEqual([{ to: 'cancelled', reason: true }]);
    expect((await w.call('POST', `/orders/${a}/notes`, { token: T(w, 'so1'), body: { text: 'x' } })).status).toBe(403);
    expect((await w.call('POST', `/orders/${a}/assign`, { token: T(w, 'oe'), body: { employeeUid: 'acc' } })).status).toBe(200);
    expect((await w.call('POST', `/orders/${a}/assign`, { token: T(w, 'oe'), body: { employeeUid: 'ghost' } })).status).toBe(400);
    expect((await w.call('GET', '/orders/ghost', { token: T(w, 'oe') })).status).toBe(404);
  });
  it('مسودة موظف المحل يرسلها صاحب المحل', async () => {
    const w = setup();
    expect((await w.call('PUT', '/drafts/draft0001', { token: T(w, 'se1'), body: { items: cart, note: 'طلب الصباح' } })).status).toBe(200);
    expect((await w.call('PUT', '/drafts/draft0001', { token: T(w, 'so2'), body: { shopId: 's2', items: cart } })).status).toBe(403);
    expect((await w.call('PUT', '/drafts/x', { token: T(w, 'se1'), body: { items: cart } })).status).toBe(400);
    expect((await w.call('PUT', '/drafts/draft0002', { token: T(w, 'se1'), body: { shopId: 's2', items: cart } })).status).toBe(403);
    const list = await w.call('GET', '/shops/s1/drafts', { token: T(w, 'so1') });
    expect(list.body.drafts[0]).toMatchObject({ id: 'draft0001', createdBy: 'se1', note: 'طلب الصباح' });
    expect((await w.call('GET', '/shops/s1/drafts', { token: T(w, 'so2') })).status).toBe(403);
    await submit(w, 'so1', { draftId: 'draft0001' });
    expect(await w.db.get('drafts/draft0001')).toBeNull();
    await w.call('PUT', '/drafts/draft0003', { token: T(w, 'se1'), body: { items: cart } });
    expect((await w.call('DELETE', '/drafts/draft0003', { token: T(w, 'so2') })).status).toBe(404);
    expect((await w.call('DELETE', '/drafts/draft0003', { token: T(w, 'se1') })).status).toBe(200);
  });
});

describe('الإشعارات (SRS 6)', () => {
  it('الصندوق الداخلي: قراءة إشعار وكل الإشعارات', async () => {
    const w = setup();
    await submit(w);
    await submit(w);
    const inbox = await w.call('GET', '/notifications', { token: T(w, 'oe') });
    expect(inbox.body.unread).toBe(2);
    expect((await w.call('POST', `/notifications/${inbox.body.notifications[0].id}/read`, { token: T(w, 'oe') })).status).toBe(200);
    expect((await w.call('POST', `/notifications/${inbox.body.notifications[0].id}/read`, { token: T(w, 'acc') })).status).toBe(404);
    expect((await w.call('POST', '/notifications/read-all', { token: T(w, 'oe') })).body.count).toBe(1);
    expect((await w.call('GET', '/notifications', { token: T(w, 'oe') })).body.unread).toBe(0);
  });
  it('تسجيل الأجهزة، حذف الرموز التالفة، إعادة المحاولة حتى التوقف', async () => {
    const w = setup();
    const pusher = w.s.pusher as MemoryPusher;
    expect((await w.call('POST', '/devices', { token: T(w, 'oe'), body: { deviceId: 'phone-0001', token: 'valid-token-aaaaaaaaaaaaaaaa', platform: 'android', appVersion: '0.1.0' } })).status).toBe(200);
    await w.call('POST', '/devices', { token: T(w, 'oe'), body: { deviceId: 'old-phone-02', token: 'dead-token-aaaaaaaaaaaaaaaaa', platform: 'x' } });
    expect((await w.call('POST', '/devices', { token: T(w, 'oe'), body: { deviceId: '!', token: 'short' } })).status).toBe(400);
    pusher.invalid.add('dead-token-aaaaaaaaaaaaaaaaa');
    await submit(w);
    await w.flush();
    expect(await w.db.get('users/oe/devices/old-phone-02')).toBeNull();
    expect(pusher.sent.some((x) => x.token === 'valid-token-aaaaaaaaaaaaaaaa')).toBe(true);
    // جهاز يفشل مؤقتاً: إعادة محاولة ثم توقف بعد 6 محاولات
    w.db.seed('users/acc/devices/d', { token: 'flaky-token-aaaaaaaaaaaaaaaa' });
    pusher.failing.add('flaky-token-aaaaaaaaaaaaaaaa');
    const jobId = await w.db.runTransaction(async (tx) => queueNotice(tx, w.s, ['acc'], { type: 't', title: 'x', body: 'y', ref: { kind: 'order', id: 'o' } }, 'test.job'));
    await deliverJob(w.s, pusher, jobId!);
    expect((await w.db.get(`notificationJobs/${jobId}`))!.data).toMatchObject({ status: 'retry', attempts: 1, failed: ['acc'] });
    for (let i = 0; i < 6; i++) {
      w.clock.now += 3_600_000 * 24;
      await processDueJobs(w.s, pusher);
    }
    expect((await w.db.get(`notificationJobs/${jobId}`))!.data.status).toBe('dead');
    await deliverJob(w.s, pusher, jobId!);
    await deliverJob(w.s, pusher, 'ghost');
    expect(queueNotice({ write: () => undefined }, w.s, [], { type: 't', title: 'x', body: 'y', ref: { kind: 'o', id: 'x' } }, 'empty')).toBeNull();
    expect((await w.call('DELETE', '/devices/phone-0001', { token: T(w, 'oe') })).status).toBe(200);
  });
});
