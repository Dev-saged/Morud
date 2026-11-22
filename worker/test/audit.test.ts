import { describe, expect, it } from 'vitest';
import { setup, submit, T } from './order-world';

describe('سجل العمليات', () => {
  it('يعرض من فعل ماذا بالأسماء، ويفلتر بالعنصر والموظف والعملية، ويتصفح للأقدم، ومحمي بصلاحية', async () => {
    const w = setup();
    const id = (await submit(w)).body.order.id;
    await w.call('PATCH', '/admin/products/feta', { token: T(w, 'own'), body: { name: 'فيتا' } });
    const all = await w.call('GET', '/admin/audit', { token: T(w, 'own') });
    expect(all.status).toBe(200);
    const edit = all.body.logs.find((l: any) => l.action === 'products.update');
    expect(edit).toMatchObject({ entity: { kind: 'product', id: 'feta' }, before: expect.objectContaining({ name: 'جبنة فيتا' }), after: expect.objectContaining({ name: 'فيتا' }) });
    expect(edit.actor).not.toBe(edit.actorId);
    const byEntity = (await w.call('GET', '/admin/audit?entity=feta', { token: T(w, 'own') })).body.logs;
    expect(byEntity.every((l: any) => l.entity.id === 'feta')).toBe(true);
    const byAction = (await w.call('GET', '/admin/audit?action=products.update', { token: T(w, 'own') })).body.logs;
    expect(byAction).toHaveLength(1);
    const byActor = (await w.call('GET', `/admin/audit?actor=${edit.actorId}`, { token: T(w, 'own') })).body.logs;
    expect(byActor.every((l: any) => l.actorId === edit.actorId)).toBe(true);
    const older = (await w.call('GET', `/admin/audit?before=${w.s.now() + 1}`, { token: T(w, 'own') })).body;
    expect(older.logs.length).toBeGreaterThan(0);
    expect(id).toBeTruthy();
    expect((await w.call('GET', '/admin/audit?action=x;drop', { token: T(w, 'own') })).status).toBe(400);
    expect((await w.call('GET', '/admin/audit?actor=a&entity=b', { token: T(w, 'own') })).status).toBe(400);
    expect((await w.call('GET', '/admin/audit', { token: T(w, 'so1') })).status).toBe(403);
    w.db.seed('auditLogs/x1', { actorId: 'system', action: 'users.update', entity: { kind: 'user', id: 'u1' }, before: { loginEmail: 'a@b', name: 'أ' }, after: { totpSecret: 'S', name: 'ب' }, result: 'ok', at: w.s.now() + 5 });
    const top = (await w.call('GET', '/admin/audit', { token: T(w, 'own') })).body.logs[0];
    expect(top).toMatchObject({ actor: 'النظام', before: { name: 'أ' }, after: { name: 'ب' } });
    expect(JSON.stringify(top)).not.toMatch(/loginEmail|totpSecret/);
  });
});
