import { ALL_ROUTES } from '../src/api/routes';
import { addUser, world, type World } from './helpers';

let k = 0;
export const H = () => ({ 'idempotency-key': `key_${String(++k).padStart(16, '0')}` });

export function setup() {
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
export const T = (w: World, uid: string) => w.tokenFor(uid);
export const cart = [{ productId: 'feta', unitId: 'carton', qtyMilli: 2000 }, { productId: 'nuts', unitId: 'kg', qtyMilli: 1500 }]; // 18000 + 6750 = 24750
export const submit = (w: World, uid = 'so1', body: object = {}) => w.call('POST', '/orders', { token: T(w, uid), headers: H(), body: { shopId: 's1', items: cart, paymentMethod: 'cash', ...body } });
export const move = (w: World, uid: string, id: string, to: string, body: object = {}) => w.call('POST', `/orders/${id}/transition`, { token: T(w, uid), headers: H(), body: { to, ...body } });

