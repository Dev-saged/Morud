import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../src/lib/api';
import { cacheGet, clearOffline } from '../src/lib/offline';
import { enqueue, flushOutbox, readOutbox } from '../src/lib/outbox';
import { rememberedLogin, rememberLogin } from '../src/lib/session';

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const down = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => localStorage.clear());

describe('تذكرني', () => {
  it('يحفظ المعرّف فقط ويمسحه عند عدم التذكر', () => {
    expect(rememberedLogin()).toEqual({ identifier: '', remember: true });
    rememberLogin('shop1');
    expect(rememberedLogin()).toEqual({ identifier: 'shop1', remember: true });
    expect(JSON.stringify(localStorage)).not.toMatch(/password/i);
    rememberLogin(null);
    expect(rememberedLogin()).toEqual({ identifier: '', remember: false });
  });
});

describe('النسخ المحفوظة لكل مستخدم', () => {
  it('يحفظ القراءة الناجحة ويعيدها عند الانقطاع، دون تسريب بين الحسابات', async () => {
    let online = true;
    const f = vi.fn((_: RequestInfo | URL) => (online ? Promise.resolve(ok({ orders: [1, 2] })) : down()));
    const a = new Api('https://x', async () => 't', f as unknown as typeof fetch);
    a.scope = 'u1';
    expect(await a.get('/shops/s/orders')).toEqual({ orders: [1, 2] });
    online = false;
    expect(await a.get('/shops/s/orders')).toEqual({ orders: [1, 2] });
    a.scope = 'u2';
    await expect(a.get('/shops/s/orders')).rejects.toMatchObject({ code: 'NETWORK' });
    clearOffline('u1');
    expect(cacheGet('u1', '/shops/s/orders')).toBeNull();
  });
  it('لا يحفظ مسارات الهوية ولا يحفظ بلا مستخدم', async () => {
    const a = new Api('https://x', async () => 't', (() => Promise.resolve(ok({ user: 1 }))) as unknown as typeof fetch);
    await a.get('/catalog');
    expect(Object.keys(localStorage)).toHaveLength(0);
    a.scope = 'u1';
    await a.get('/auth/me');
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
});

describe('صندوق الصادر', () => {
  const q = (key: string) => ({ key, body: { shopId: 's', items: [{ productId: 'p', unitId: 'kg', qtyMilli: 1000 }], paymentMethod: 'cash', notes: '' }, at: 1, items: 1, total: 500 });
  it('يرسل بنفس المفتاح ويُشعر ثم يفرغ', async () => {
    enqueue('u1', q('k'.repeat(20)));
    const seen: string[] = [];
    const f = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => { seen.push((init!.headers as Record<string, string>)['idempotency-key']!); return Promise.resolve(ok({ order: { id: 'o1', number: 'M-1' } })); });
    const notes: string[] = [];
    const r = await flushOutbox(new Api('https://x', async () => 't', f as unknown as typeof fetch), 'u1', (t, b) => notes.push(t + b));
    expect(r.sent).toEqual(['o1']);
    expect(seen).toEqual(['k'.repeat(20)]);
    expect(notes[0]).toContain('M-1');
    expect(readOutbox('u1')).toEqual([]);
  });
  it('الانقطاع يبقي الطلب، ورفض الخادم يعلّمه للمراجعة', async () => {
    enqueue('u1', q('a'.repeat(20)));
    await flushOutbox(new Api('https://x', async () => 't', down as unknown as typeof fetch), 'u1', () => undefined);
    expect(readOutbox('u1')).toHaveLength(1);
    const reject = () => Promise.resolve(new Response(JSON.stringify({ error: { code: 'SHOP_SUSPENDED', message: 'الحساب موقوف' } }), { status: 409 }));
    const r = await flushOutbox(new Api('https://x', async () => 't', reject as unknown as typeof fetch), 'u1', () => undefined);
    expect(r.failed).toBe(1);
    expect(readOutbox('u1')[0]!.error).toBe('الحساب موقوف');
  });
});

describe('الجهاز المشترك', () => {
  it('عند فتح التطبيق بلا جلسة تُمسح بيانات آخر مستخدم المحفوظة', async () => {
    const { cachePut, cacheUser } = await import('../src/lib/offline');
    cacheUser({ uid: 'u9' });
    cachePut('u9', '/shops/s/orders', { orders: [1] });
    const { mount } = await import('./helpers');
    mount({}, false);
    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => expect(cacheGet('u9', '/shops/s/orders')).toBeNull());
    expect(localStorage.getItem('mawred.user.v1')).toBeNull();
  });
});
