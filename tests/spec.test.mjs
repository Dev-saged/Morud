// اختبارات اتساق المواصفات الآلية: أي تعارض بين الصلاحيات والأدوار وحالات الطلب يُفشل البناء
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (f) => JSON.parse(readFileSync(new URL(`../spec/${f}`, import.meta.url), 'utf8'));
const perms = load('permissions.json').permissions;
const roles = load('roles.json').roles;
const fsm = load('order-states.json');
const seed = load('seed.json');

const permIds = new Set(perms.map((p) => p.id));
const scopeOf = Object.fromEntries(perms.map((p) => [p.id, p.scope]));
const stateIds = new Set(fsm.states.map((s) => s.id));
const role = (id) => roles.find((r) => r.id === id);
const has = (r, p) => r.permissions.includes('*') || r.permissions.includes(p);

test('معرفات الصلاحيات فريدة وبنطاق صالح', () => {
  assert.equal(permIds.size, perms.length);
  for (const p of perms) assert.ok(['staff', 'shop', 'agent', 'any'].includes(p.scope), p.id);
});

test('صلاحيات SRS 2.4 كلها موجودة في الكتالوج', () => {
  const srs = ['products.view', 'products.create', 'products.update', 'products.delete', 'products.availability.update',
    'orders.view', 'orders.create', 'orders.confirm', 'orders.reject', 'orders.cancel', 'orders.prepare', 'orders.dispatch',
    'invoices.view', 'invoices.create', 'payments.create', 'payments.reverse', 'accounts.view', 'accounts.adjust',
    'users.manage', 'roles.manage', 'reports.view', 'settings.manage', 'audit.view'];
  // orders.create في الوثيقة = shop.orders.submit هنا لأن إنشاء الطلب فعل محلي
  const alias = { 'orders.create': 'shop.orders.submit' };
  for (const p of srs) assert.ok(permIds.has(alias[p] ?? p), p);
});

test('كل صلاحية في الأدوار معرّفة في الكتالوج', () => {
  for (const r of roles) for (const p of r.permissions) if (p !== '*') assert.ok(permIds.has(p), `${r.id} → ${p}`);
});

test('مالك النظام وحده يملك كل الصلاحيات ومحمي', () => {
  const sa = role('super_admin');
  assert.ok(sa.protected && sa.permissions.includes('*'));
  for (const r of roles.filter((x) => x.id !== 'super_admin')) {
    assert.ok(!r.permissions.includes('*'), r.id);
    assert.ok(r.permissions.length < permIds.size / 2, `${r.id} واسع أكثر من اللازم`);
    assert.ok(!has(r, 'roles.manage') && !has(r, 'settings.manage') && !has(r, 'backups.manage'), r.id);
  }
});

test('نطاق صلاحيات كل دور يطابق نوعه', () => {
  const allowed = { staff: ['staff', 'any'], shop: ['shop', 'any'], agent: ['agent', 'any'] };
  for (const r of roles.filter((x) => x.id !== 'super_admin')) {
    for (const p of r.permissions) assert.ok(allowed[r.kind].includes(scopeOf[p]), `${r.id} لا يجوز أن يملك ${p}`);
  }
});

test('فصل المهام: SRS 19.2', () => {
  const agent = role('delivery_agent');
  for (const p of ['accounts.view', 'products.update', 'products.price.update', 'orders.view']) assert.ok(!has(agent, p), p);
  assert.ok(!has(role('orders_employee'), 'payments.create'));
  assert.ok(!has(role('accountant'), 'products.price.update') && !has(role('accountant'), 'products.update'));
  assert.ok(!has(role('catalog_employee'), 'accounts.view') && !has(role('catalog_employee'), 'invoices.view'));
  assert.ok(!has(role('shop_owner'), 'orders.view'));
  assert.ok(!has(role('shop_employee'), 'shop.orders.submit') && !has(role('shop_employee'), 'shop.statement.view'));
});

test('كل دور له واجهة توجيه بعد الدخول', () => {
  for (const r of roles) assert.match(r.home, /^(admin|shop|agent)\.[a-z]+$/, r.id);
});

test('انتقالات الطلب تشير إلى حالات وصلاحيات صحيحة', () => {
  assert.ok(stateIds.has(fsm.initial));
  for (const t of fsm.transitions) {
    assert.ok(stateIds.has(t.from) && stateIds.has(t.to), `${t.from}→${t.to}`);
    if (t.actor === 'system') assert.equal(t.permission, undefined);
    else {
      assert.ok(permIds.has(t.permission), t.permission);
      const want = { staff: 'staff', shop: 'shop', agent: 'agent' }[t.actor];
      assert.equal(scopeOf[t.permission], want, `${t.from}→${t.to}`);
    }
  }
});

test('لا انتقال مكرر لنفس الفاعل', () => {
  const keys = fsm.transitions.map((t) => `${t.from}|${t.to}|${t.actor}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('حالة التسوية لا يخرج منها إلا النظام عند عكس دفعة', () => {
  const out = fsm.transitions.filter((t) => t.from === 'financially_completed');
  assert.deepEqual(out.map((t) => [t.to, t.actor, t.guards]), [['delivered', 'system', ['payment_reversed']]]);
});

test('الحالات النهائية بلا مخارج', () => {
  for (const s of fsm.states.filter((x) => x.terminal)) {
    assert.ok(!fsm.transitions.some((t) => t.from === s.id), s.id);
  }
});

test('كل حالة قابلة للوصول من «جديد» وكل حالة غير نهائية تصل لنهاية', () => {
  const out = (id) => fsm.transitions.filter((t) => t.from === id).map((t) => t.to);
  const seen = new Set([fsm.initial]);
  const q = [fsm.initial];
  while (q.length) for (const n of out(q.shift())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.deepEqual([...stateIds].filter((s) => !seen.has(s)), []);
  const terminals = new Set(fsm.states.filter((s) => s.terminal || s.settled).map((s) => s.id));
  for (const s of stateIds) {
    if (terminals.has(s)) continue;
    const v = new Set([s]); const st = [s]; let ok = false;
    while (st.length && !ok) for (const n of out(st.pop())) { if (terminals.has(n)) ok = true; if (!v.has(n)) { v.add(n); st.push(n); } }
    assert.ok(ok, `${s} لا يصل لحالة نهائية`);
  }
});

test('لا إلغاء بعد التسليم إلا عبر مرتجع (SRS 5.5)', () => {
  for (const s of ['delivered', 'returned', 'financially_completed']) {
    assert.ok(!fsm.transitions.some((t) => t.from === s && t.to === 'cancelled'), s);
  }
  assert.ok(fsm.transitions.some((t) => t.from === 'delivered' && t.to === 'returned' && t.reason));
});

test('الرفض والإلغاء والتعديل وتعذر التسليم تشترط سبباً', () => {
  for (const t of fsm.transitions) {
    if (['cancelled', 'rejected', 'delivery_failed', 'returned', 'awaiting_shop_approval'].includes(t.to)) assert.ok(t.reason, `${t.from}→${t.to}`);
  }
});

test('الإلغاء بعد التأكيد يعالج الأثر المالي، والتأكيد يصدر الفاتورة', () => {
  const confirmedOrLater = ['confirmed', 'preparing', 'ready_for_pickup', 'delivery_failed', 'awaiting_shop_approval'];
  for (const t of fsm.transitions.filter((x) => x.to === 'cancelled' && confirmedOrLater.includes(x.from))) {
    assert.ok(t.effects?.includes('reverse_financials'), `${t.from}→cancelled`);
  }
  for (const t of fsm.transitions.filter((x) => x.to === 'confirmed')) assert.ok(t.effects.includes('issue_invoice'));
});

test('المندوب لا يغيّر إلا مهمة مسندة إليه، والإكمال المالي آلي فقط', () => {
  for (const t of fsm.transitions.filter((x) => x.actor === 'agent')) assert.ok(t.guards.includes('assigned_to_actor'));
  for (const t of fsm.transitions.filter((x) => x.to === 'financially_completed')) assert.equal(t.actor, 'system');
});

test('إلغاء المحل محصور في الحالات المسموحة بالإعدادات', () => {
  const allowed = new Set(seed.settings.shopCancelStates);
  for (const t of fsm.transitions.filter((x) => x.actor === 'shop' && x.to === 'cancelled')) assert.ok(allowed.has(t.from), t.from);
});

test('البيانات الأولية: 12 تصنيفاً ووحدات SRS 3.4 بلا تكرار', () => {
  assert.equal(seed.categories.length, 12);
  assert.equal(new Set(seed.categories.map((c) => c.id)).size, 12);
  const names = seed.units.map((u) => u.name);
  for (const n of ['حبة', 'كيلوغرام', 'غرام', 'نصف كيلو', 'لتر', 'ملليلتر', 'عبوة', 'علبة', 'كيس', 'شوال', 'كرتونة', 'دستة', 'جالون']) assert.ok(names.includes(n), n);
  assert.equal(new Set(seed.units.map((u) => u.id)).size, seed.units.length);
  for (const u of seed.units) assert.ok(['count', 'weight', 'volume'].includes(u.kind));
  for (const u of seed.units.filter((x) => x.kind === 'count')) assert.equal(u.allowFraction, false, u.id);
});

test('الإعدادات الافتراضية صالحة (SRS 7.1 و13)', () => {
  const s = seed.settings;
  const min = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  assert.ok(min(s.orderIntakeStart) < min(s.orderIntakeEnd));
  assert.equal(s.orderIntakeStart, '06:00');
  assert.equal(s.orderIntakeEnd, '23:00');
  assert.equal(s.slaWorkingHours, 6);
  assert.equal(s.currency, 'ILS');
  assert.equal(s.timezone, 'Asia/Gaza');
  assert.ok(s.paymentMethods.some((p) => p.id === 'cash' && p.enabled));
});
