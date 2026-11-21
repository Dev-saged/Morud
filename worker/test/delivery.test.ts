import { describe, expect, it } from 'vitest';
import { runScheduled } from '../src/api/cron';
import { markOverdue } from '../src/api/delivery';
import { zonedToUtc } from '../src/domain/sla';
import { MemoryPusher } from '../src/infra/fcm';
import { H, move, setup, submit, T } from './order-world';
import { png } from './images';

async function readyOrder(w: ReturnType<typeof setup>) {
  const id = (await submit(w)).body.order.id;
  await move(w, 'oe', id, 'under_review');
  await move(w, 'oe', id, 'confirmed');
  await move(w, 'oe', id, 'preparing');
  await move(w, 'oe', id, 'ready_for_pickup');
  return id;
}

describe('توزيع الطلبات على المندوبين (SRS 8.2)', () => {
  it('الإسناد والتغيير قبل الطريق، وإشعار المندوب، والترتيب', async () => {
    const w = setup();
    const a = await readyOrder(w);
    const b = await readyOrder(w);
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'oe'), body: { agentId: 'ag' } })).status).toBe(403);
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'oe' } })).status).toBe(400);
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag', deliveryOrder: 0 } })).status).toBe(400);
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag2' } })).status).toBe(200);
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag', deliveryOrder: 2 } })).status).toBe(200);
    await w.call('POST', `/orders/${b}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag', deliveryOrder: 1 } });
    expect((await w.call('GET', '/notifications', { token: T(w, 'ag') })).body.notifications[0].title).toBe('مهمة توصيل جديدة');
    expect((await w.call('POST', '/delivery/sequence', { token: T(w, 'dm'), body: { agentId: 'ag', orderIds: [a, b] } })).status).toBe(200);
    expect((await w.db.get(`orders/${a}`))!.data.deliveryOrder).toBe(1);
    expect((await w.call('POST', '/delivery/sequence', { token: T(w, 'dm'), body: { agentId: 'ag2', orderIds: [a] } })).status).toBe(400);
    expect((await w.call('POST', '/delivery/sequence', { token: T(w, 'dm'), body: { agentId: 'ag', orderIds: [] } })).status).toBe(400);
    await move(w, 'dm', a, 'out_for_delivery');
    await move(w, 'ag', a, 'on_the_way');
    expect((await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag2' } })).status).toBe(409);
    const board = await w.call('GET', '/delivery/board', { token: T(w, 'dm') });
    expect(board.body.regions['الوسطى']).toHaveLength(2);
    expect(board.body.agents.find((x: any) => x.uid === 'ag').activeTasks).toBe(2);
    expect((await w.call('GET', '/delivery/board', { token: T(w, 'so1') })).status).toBe(403);
  });
  it('المندوب يرى مهامه فقط بالمبلغ المطلوب تحصيله لا الحساب الكامل', async () => {
    const w = setup();
    const a = await readyOrder(w);
    await readyOrder(w);
    await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
    const tasks = await w.call('GET', '/agent/tasks', { token: T(w, 'ag') });
    expect(tasks.body.tasks).toHaveLength(1);
    expect(tasks.body.tasks[0]).toMatchObject({ id: a, shopName: 'بقالة النور', toCollect: 24750, address: { phone: '0599888777' } });
    expect(tasks.body.tasks[0].items[0]).toEqual({ name: 'جبنة فيتا', unitName: 'كرتونة', qtyMilli: 2000 });
    expect(JSON.stringify(tasks.body)).not.toContain('balance');
    expect((await w.call('GET', '/agent/tasks', { token: T(w, 'ag2') })).body.tasks).toEqual([]);
    expect((await w.call('GET', '/agent/tasks', { token: T(w, 'so1') })).status).toBe(403);
    expect((await w.call('GET', `/orders/${a}`, { token: T(w, 'ag2') })).status).toBe(404);
  });
});

describe('التتبع وإثبات التسليم (SRS 8.3–8.4)', () => {
  it('التتبع أثناء المهمة فقط ويتوقف بعد التسليم', async () => {
    const w = setup();
    const a = await readyOrder(w);
    await w.call('POST', `/orders/${a}/assign-agent`, { token: T(w, 'dm'), body: { agentId: 'ag' } });
    await move(w, 'dm', a, 'out_for_delivery');
    const pt = (lat: number, lng = 34.3, uid = 'ag') => w.call('POST', `/orders/${a}/track`, { token: T(w, uid), body: { lat, lng, acc: 12 } });
    expect((await pt(31.4)).body.error.code).toBe('TRACKING_NOT_ACTIVE');
    await move(w, 'ag', a, 'on_the_way');
    expect((await pt(31.4)).status).toBe(200);
    expect((await pt(31.41)).body.skipped).toBe(true);
    w.clock.now += 20_000;
    expect((await pt(31.42)).status).toBe(200);
    expect((await pt(95)).status).toBe(400);
    expect((await pt(31.4, 34.3, 'ag2')).status).toBe(404);
    const t = await w.call('GET', `/orders/${a}/track`, { token: T(w, 'dm') });
    expect(t.body.track.points).toHaveLength(2);
    expect((await w.call('GET', `/orders/${a}/track`, { token: T(w, 'so1') })).status).toBe(403);
    expect((await w.call('GET', '/orders/ghost/track', { token: T(w, 'dm') })).status).toBe(404);
    // صورة وتوقيع الإثبات
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const up = (kind: string, body: Uint8Array, uid = 'ag') => w.call('POST', `/orders/${a}/proof-upload?kind=${kind}`, { token: T(w, uid), body: body as never });
    const photo = await up('photo', jpg);
    expect(photo.body.key).toMatch(new RegExp(`^proofs/${a}/photo-.+\\.jpg$`));
    const sig = await up('signature', new Uint8Array(png(6)));
    expect((await up('video', jpg)).status).toBe(400);
    expect((await up('photo', new Uint8Array([1, 2]))).body.error.code).toBe('IMAGE_TYPE');
    expect((await up('photo', new Uint8Array(3_000_001))).status).toBe(413);
    expect((await up('photo', jpg, 'dm')).status).toBe(403);
    await move(w, 'ag', a, 'delivered', { proof: { receiverName: 'أبو أحمد', photoKey: photo.body.key, signatureKey: sig.body.key, collectedAmount: 24750 } });
    expect((await pt(31.43)).body.error.code).toBe('TRACKING_NOT_ACTIVE');
    const file = await w.call('GET', `/orders/${a}/proof/photo`, { token: T(w, 'so1') });
    expect(file.status).toBe(200);
    expect(file.headers.get('cache-control')).toContain('private');
    expect((await w.call('GET', `/orders/${a}/proof/signature`, { token: T(w, 'dm') })).status).toBe(200);
    expect((await w.call('GET', `/orders/${a}/proof/photo`, { token: T(w, 'so2') })).status).toBe(404);
    expect((await w.call('GET', `/orders/${a}/proof/other`, { token: T(w, 'so1') })).status).toBe(404);
    expect((await w.call('GET', `/orders/${a}/proof/photo`, { token: T(w, 'acc') })).status).toBe(404);
  });
});

describe('المهلة والتأخير (SRS 7.3)', () => {
  it('Cron يوسم المتأخر مرة واحدة ويبلغ الإدارة والمحل بموعد جديد', async () => {
    const w = setup();
    w.clock.now = zonedToUtc(2026, 11, 20, 9, 0, 'Asia/Gaza');
    const id = (await submit(w)).body.order.id;
    const done = (await submit(w)).body.order.id;
    await move(w, 'so1', done, 'cancelled', { reason: 'لا حاجة له' });
    expect(await markOverdue(w.s)).toBe(0);
    w.clock.now = zonedToUtc(2026, 11, 20, 15, 30, 'Asia/Gaza');
    await runScheduled(w.s, '*/5 * * * *');
    const o = (await w.db.get(`orders/${id}`))!.data;
    expect(o.sla).toMatchObject({ overdue: true, revisedDueAt: zonedToUtc(2026, 11, 20, 17, 30, 'Asia/Gaza') });
    expect(((await w.db.get(`orders/${done}`))!.data.sla as { overdue: boolean }).overdue).toBe(false);
    expect((await w.call('GET', '/notifications', { token: T(w, 'oe') })).body.notifications.map((n: any) => n.title)).toContain('طلب متأخر MW-O-2026-000001');
    expect((await w.call('GET', '/notifications', { token: T(w, 'so1') })).body.notifications.map((n: any) => n.title)).toContain('نعتذر، طلبك متأخر');
    expect(await markOverdue(w.s)).toBe(0);
    expect((await w.call('GET', '/orders?filter=overdue', { token: T(w, 'oe') })).body.orders.map((x: any) => x.id)).toEqual([id]);
    // موعد مؤكد يدوياً
    const due = w.clock.now + 3_600_000;
    const r = await w.call('PATCH', `/orders/${id}/due`, { token: T(w, 'oe'), body: { dueAt: due, reason: 'ازدحام في منطقة الوسطى' } });
    expect(r.body.sla).toMatchObject({ dueAt: due, estimated: false, overdue: false, delayReason: 'ازدحام في منطقة الوسطى' });
    expect((await w.call('PATCH', `/orders/${id}/due`, { token: T(w, 'oe'), body: { dueAt: 1, reason: 'سبب' } })).status).toBe(400);
    expect((await w.call('PATCH', `/orders/${id}/due`, { token: T(w, 'acc'), body: { dueAt: due, reason: 'سبب' } })).status).toBe(403);
    expect((await w.call('PATCH', `/orders/${done}/due`, { token: T(w, 'oe'), body: { dueAt: due, reason: 'سبب' } })).status).toBe(409);
  });
  it('مهمة الإشعارات في Cron الدقيقة', async () => {
    const w = setup();
    w.db.seed('users/oe/devices/d1', { token: 'tok-oe-aaaaaaaaaaaaaaaaaaaaaa' });
    const pusher = w.s.pusher as MemoryPusher;
    pusher.failing.add('tok-oe-aaaaaaaaaaaaaaaaaaaaaa');
    await submit(w);
    await w.flush();
    pusher.failing.clear();
    w.clock.now += 3_600_000;
    await runScheduled(w.s, '* * * * *');
    expect(pusher.sent.some((x) => x.token === 'tok-oe-aaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    await runScheduled(w.s, '0 1 * * *');
    expect(H()).toHaveProperty('idempotency-key');
  });
  it('جدول واحد كل دقيقة يوزّع: النسخ اليومي 01:00 UTC فقط', async () => {
    const w = setup();
    const blobs = w.s.backupStore as unknown as { m: Map<string, unknown> };
    w.s.backupKey = Buffer.alloc(32, 7).toString('base64');
    await runScheduled(w.s, '* * * * *', Date.UTC(2026, 10, 21, 1, 3));
    expect(blobs.m.size).toBe(0);
    await runScheduled(w.s, '* * * * *', Date.UTC(2026, 10, 21, 2, 0));
    expect(blobs.m.size).toBe(0);
    await runScheduled(w.s, '* * * * *', Date.UTC(2026, 10, 21, 1, 0));
    expect(blobs.m.size).toBe(1);
  });
});
