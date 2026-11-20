import { describe, expect, it } from 'vitest';
import { postPayment, returnCredit, voidInvoice } from '../src/api/finance-core';
import { Fcm } from '../src/infra/fcm';
import { move, setup, submit } from './order-world';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('FCM HTTP v1', () => {
  it('نجاح، رمز تالف، إعادة محاولة', async () => {
    const calls: any[] = [];
    const ok = new Fcm('p', async () => 'AT', (async (u: string, i: RequestInit) => (calls.push([u, JSON.parse(String(i.body))]), res({ name: 'm' }))) as never);
    expect(await ok.send('t1', { title: 'طلب جديد', body: 'x', data: { type: 'order.new' }, sound: true })).toBe('ok');
    expect(calls[0][0]).toContain('/projects/p/messages:send');
    expect(calls[0][1].message.android.notification).toMatchObject({ channel_id: 'orders_sound', sound: 'new_order' });
    expect(await new Fcm('p', async () => 'AT', (async () => res({ name: 'm' })) as never).send('t', { title: 'a', body: 'b', data: {} })).toBe('ok');
    const unreg = new Fcm('p', async () => 'AT', (async () => res({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404)) as never);
    expect(await unreg.send('t', { title: 'a', body: 'b', data: {} })).toBe('invalid');
    const bad = new Fcm('p', async () => 'AT', (async () => res({ error: { status: 'INVALID_ARGUMENT' } }, 400)) as never);
    expect(await bad.send('t', { title: 'a', body: 'b', data: {} })).toBe('invalid');
    const busy = new Fcm('p', async () => 'AT', (async () => res({ error: { status: 'UNAVAILABLE' } }, 503)) as never);
    expect(await busy.send('t', { title: 'a', body: 'b', data: {} })).toBe('retry');
    const garbage = new Fcm('p', async () => 'AT', (async () => new Response('x', { status: 500 })) as never);
    expect(await garbage.send('t', { title: 'a', body: 'b', data: {} })).toBe('retry');
  });
});

describe('حالات حدّية في النواة المالية', () => {
  async function invoiced() {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await move(w, 'oe', id, 'under_review');
    const invId = (await move(w, 'oe', id, 'confirmed')).body.order.invoiceId as string;
    const ctx: any = { s: w.s, user: { uid: 'acc' }, workContext: null, ip: 't', device: 't', requestId: 'r' };
    return { w, invId, ctx };
  }
  it('الإلغاء المزدوج لا يكرر القيد، والفاتورة المفقودة تُرفض', async () => {
    const { w, invId, ctx } = await invoiced();
    await w.db.runTransaction((tx) => voidInvoice(tx, ctx, invId, 'keep_credit', 'سبب أول'));
    await w.db.runTransaction((tx) => voidInvoice(tx, ctx, invId, 'keep_credit', 'سبب ثانٍ'));
    expect((await w.db.query({ collection: 'ledger', where: [['type', '==', 'credit_note']] })).length).toBe(1);
    await expect(w.db.runTransaction((tx) => voidInvoice(tx, ctx, 'ghost', 'refund', 'سبب'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(w.db.runTransaction((tx) => returnCredit(tx, ctx, invId, [{ productId: 'feta', unitId: 'carton', qtyMilli: 1000 }], 'سبب'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('مرتجع بكمية سالبة يُرفض، ودفعة غير صالحة تُرفض', async () => {
    const { w, invId, ctx } = await invoiced();
    await expect(w.db.runTransaction((tx) => returnCredit(tx, ctx, invId, [{ productId: 'feta', unitId: 'carton', qtyMilli: -1 }], 'سبب'))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(w.db.runTransaction((tx) => returnCredit(tx, ctx, invId, 'x' as never, 'سبب'))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(w.db.runTransaction((tx) => postPayment(tx, ctx, { shopId: 's1', amount: -5, method: 'cash', source: 'office' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    const r = await w.db.runTransaction((tx) => postPayment(tx, { ...ctx, user: null }, { shopId: 's1', amount: 100, method: 'cash', source: 'office', notes: 'n', proofKey: 'k' }));
    expect(r.allocations[0]).toMatchObject({ invoiceId: invId, amount: 100 });
    expect((await w.db.get(`payments/${r.id}`))!.data).toMatchObject({ by: 'system', proofKey: 'k' });
  });
});
