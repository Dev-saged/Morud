import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../src/infra/db';
import { decode, encode, FirestoreDb } from '../src/infra/firestore';
import { accessToken, b64url, b64urlDecode, customToken, resetJwksCache, signJwt, verifyIdToken } from '../src/infra/google';
import { IdentityToolkit } from '../src/infra/identity';
import { MemoryDb } from '../src/infra/memory-db';
import { MemoryCounter, RateLimiter } from '../src/infra/ratelimit';

async function keys() {
  const kp = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', kp.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
  const jwk = { ...((await crypto.subtle.exportKey('jwk', kp.publicKey)) as JsonWebKey), kid: 'k1', alg: 'RS256', use: 'sig' };
  return { pem, jwk };
}

const res = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe('Google JWT', () => {
  it('base64url ذهاباً وإياباً', () => {
    expect(new TextDecoder().decode(b64urlDecode(b64url('مورد?>')))).toBe('مورد?>');
  });
  it('تحقق ID token: صالح، وكل حالات الرفض', async () => {
    resetJwksCache();
    const { pem, jwk } = await keys();
    const now = Date.UTC(2026, 10, 20);
    const t = Math.floor(now / 1000);
    const f = vi.fn(async () => res({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=600' }));
    const good = { iss: 'https://securetoken.google.com/mawred', aud: 'mawred', sub: 'u1', iat: t - 10, exp: t + 3000, auth_time: t - 10 };
    const tok = (p: Record<string, unknown>, kid = 'k1') => signJwt(p, pem, kid);
    expect(await verifyIdToken(await tok(good), 'mawred', f as never, now)).toMatchObject({ sub: 'u1' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(await verifyIdToken(await tok(good), 'mawred', f as never, now)).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(1); // مخزّن
    for (const bad of [{ ...good, aud: 'other' }, { ...good, iss: 'x' }, { ...good, exp: t - 1 }, { ...good, iat: t + 999 }, { ...good, sub: '' }, { ...good, auth_time: t + 999 }]) {
      expect(await verifyIdToken(await tok(bad), 'mawred', f as never, now)).toBeNull();
    }
    expect(await verifyIdToken(await tok(good, 'other'), 'mawred', f as never, now)).toBeNull();
    const [h, p] = (await tok(good)).split('.');
    expect(await verifyIdToken(`${h}.${p}.${b64url('fake')}`, 'mawred', f as never, now)).toBeNull();
    expect(await verifyIdToken('a.b', 'mawred', f as never, now)).toBeNull();
    expect(await verifyIdToken('!!.!!.!!', 'mawred', f as never, now)).toBeNull();
    const hs = `${b64url(JSON.stringify({ alg: 'HS256', kid: 'k1' }))}.${p}.x`;
    expect(await verifyIdToken(hs, 'mawred', f as never, now)).toBeNull();
  });
  it('فشل تحميل المفاتيح العامة يرفض الرمز', async () => {
    resetJwksCache();
    expect(await verifyIdToken('a.b.c', 'm', (async () => res({}, 500)) as never)).toBeNull();
  });
  it('رمز الوصول OAuth يُخزَّن حتى قرب انتهائه', async () => {
    resetJwksCache();
    const { pem } = await keys();
    const sa = { project_id: 'p', client_email: 'sa@p.iam', private_key: pem };
    const f = vi.fn(async () => res({ access_token: 'AT', expires_in: 3600 }));
    expect(await accessToken(sa, 's', f as never, 0)).toBe('AT');
    expect(await accessToken(sa, 's', f as never, 1000)).toBe('AT');
    expect(f).toHaveBeenCalledTimes(1);
    await accessToken(sa, 's', f as never, 3_590_000);
    expect(f).toHaveBeenCalledTimes(2);
    await expect(accessToken(sa, 'x', (async () => res({}, 400)) as never, 0)).rejects.toThrow();
    const ct = await customToken(sa, 'u1', { rp: ['ov'] }, 0);
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(ct.split('.')[1]!)));
    expect(payload).toMatchObject({ uid: 'u1', claims: { rp: ['ov'] }, iss: 'sa@p.iam' });
  });
  it('الرمز يُشارك بين النسخ عبر KV والطلبات المتزامنة تنتظر طلباً واحداً', async () => {
    resetJwksCache();
    const { pem } = await keys();
    const sa = { project_id: 'p', client_email: 'sa@p.iam', private_key: pem };
    const kv = new Map<string, string>();
    const store = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => { kv.set(k, v); } };
    const f = vi.fn(async () => res({ access_token: 'AT2', expires_in: 3600 }));
    const all = await Promise.all([1, 2, 3].map(() => accessToken(sa, 's', f as never, 0, store)));
    expect(all).toEqual(['AT2', 'AT2', 'AT2']);
    expect(f).toHaveBeenCalledTimes(1);
    expect(kv.size).toBe(1);
    expect([...kv.values()][0]).not.toContain(pem.slice(40, 80));
    resetJwksCache(); // نسخة جديدة: ذاكرتها فارغة لكنها تجد الرمز في KV
    const g = vi.fn(async () => res({ access_token: 'NEW', expires_in: 3600 }));
    expect(await accessToken(sa, 's', g as never, 10_000, store)).toBe('AT2');
    expect(g).not.toHaveBeenCalled();
    expect(await accessToken(sa, 's', g as never, 3_550_000, store)).toBe('NEW');
  });
});

describe('Firestore REST', () => {
  it('ترميز القيم وفكّها', () => {
    const d = new Date('2026-11-20T10:00:00Z');
    const v = { s: 'نص', i: 5, f: 1.5, b: true, n: null, a: [1, 'x'], m: { k: d } };
    const e = encode(v, 0);
    expect(decode(e)).toEqual(v);
    expect(encode('__server_time__', 42)).toEqual({ integerValue: '42' });
    expect(encode(undefined, 0)).toEqual({ nullValue: null });
    expect(decode({ referenceValue: 'r' })).toBe('r');
    expect(decode({ unknown: 1 })).toBeNull();
    expect(() => encode(Symbol('x'), 0)).toThrow();
  });
  const mk = (f: any) => new FirestoreDb('p', async () => 'AT', f, () => 7);
  it('get و batchGet و query', async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/users/missing')) return res({}, 404);
      if (url.endsWith('/users/u1')) return res({ name: 'projects/p/databases/(default)/documents/users/u1', fields: { a: { integerValue: '1' } }, updateTime: 't' });
      if (url.endsWith(':batchGet')) return res([{ found: { name: 'projects/p/databases/(default)/documents/users/u1', fields: {} } }, { missing: 'x' }]);
      if (url.endsWith(':runQuery')) {
        expect(JSON.parse(String(init!.body)).structuredQuery.from).toEqual([{ collectionId: 'history' }]);
        return res([{ document: { name: 'projects/p/databases/(default)/documents/orders/o1/history/h1', fields: {} } }, { readTime: 'x' }]);
      }
      return res({}, 500);
    });
    const db = mk(f);
    expect(await db.get('users/missing')).toBeNull();
    expect(await db.get('users/u1')).toMatchObject({ id: 'u1', data: { a: 1 }, updateTime: 't' });
    expect((await db.getMany(['users/u1', 'users/u2'])).map((d) => d?.id ?? null)).toEqual(['u1', null]);
    expect(await db.getMany([])).toEqual([]);
    expect((await db.query({ collection: 'orders/o1/history' }))[0]!.path).toBe('orders/o1/history/h1');
    expect(f.mock.calls[0]![1]!.headers).toMatchObject({ authorization: 'Bearer AT' });
    await expect(db.get('boom')).rejects.toThrow('firestore 500');
  });
  it('بناء الاستعلام المنظم', () => {
    const db = mk(vi.fn());
    const { parent, body } = db.structured({ collection: 'orders', where: [['shopId', '==', 's1'], ['sla.overdue', '==', true]], orderBy: [['createdAt', 'desc']], limit: 20, startAfter: [5] });
    expect(parent).toBe('projects/p/databases/(default)/documents');
    expect(body).toMatchObject({ structuredQuery: { where: { compositeFilter: { op: 'AND' } }, orderBy: [{ direction: 'DESCENDING' }], limit: 20, startAt: { before: false } } });
    expect(db.structured({ collection: 'x', where: [['my-field', 'in', [1]]] }).body).toMatchObject({ structuredQuery: { where: { fieldFilter: { field: { fieldPath: '`my-field`' }, op: 'IN' } } } });
  });
  it('تحويل الكتابات', () => {
    const w = mk(vi.fn()).toWrites([
      { kind: 'create', path: 'a/1', data: { x: 1 } }, { kind: 'update', path: 'a/1', data: { y: 2 } }, { kind: 'set', path: 'a/1', data: { z: 3 }, merge: true },
      { kind: 'set', path: 'a/1', data: { z: 3 } }, { kind: 'delete', path: 'a/1' }, { kind: 'increment', path: 'c/1', field: 'n', by: 2 },
    ]) as any[];
    expect(w[0].currentDocument).toEqual({ exists: false });
    expect(w[1]).toMatchObject({ updateMask: { fieldPaths: ['y'] }, currentDocument: { exists: true } });
    expect(w[2].updateMask).toEqual({ fieldPaths: ['z'] });
    expect(w[3].updateMask).toBeUndefined();
    expect(w[4].delete).toContain('a/1');
    expect(w[5].transform.fieldTransforms[0]).toEqual({ fieldPath: 'n', increment: { integerValue: '2' } });
  });
  it('المعاملة: إعادة المحاولة عند ABORTED، والتعارض عند وجود الوثيقة', async () => {
    let commits = 0;
    const f = vi.fn(async (url: string) => {
      if (url.endsWith(':beginTransaction')) return res({ transaction: 'T' });
      if (url.endsWith(':rollback')) return res({});
      if (url.includes('transaction=T')) return res({}, 404);
      if (url.endsWith(':commit')) return ++commits === 1 ? res({ error: { status: 'ABORTED' } }, 409) : res({});
      return res({}, 500);
    });
    const db = mk(f);
    const r = await db.runTransaction(async (tx) => {
      expect(await tx.get('a/1')).toBeNull();
      tx.write({ kind: 'create', path: 'a/1', data: {} });
      return 'done';
    });
    expect(r).toBe('done');
    expect(commits).toBe(2);
    const g = vi.fn(async (url: string) => (url.endsWith(':beginTransaction') ? res({ transaction: 'T' }) : url.endsWith(':commit') ? res({ error: { status: 'ALREADY_EXISTS' } }, 409) : res({})));
    await expect(mk(g).runTransaction(async (tx) => tx.write({ kind: 'create', path: 'a/1', data: {} }))).rejects.toBeInstanceOf(ConflictError);
    await expect(mk(vi.fn(async () => res({}, 500))).runTransaction(async () => 1)).rejects.toThrow();
    await mk(vi.fn()).commit([]);
  });
});

describe('Identity Toolkit', () => {
  it('ترجمة نتائج الدخول', async () => {
    const msg = (m: string) => async () => res({ error: { message: m } }, 400);
    const mk = (f: any) => new IdentityToolkit('p', 'KEY', async () => 'AT', f, () => 5000);
    expect(await mk(async () => res({ localId: 'u1' })).signInWithPassword('a', 'b')).toEqual({ ok: true, uid: 'u1' });
    expect(await mk(msg('INVALID_LOGIN_CREDENTIALS')).signInWithPassword('a', 'b')).toMatchObject({ reason: 'INVALID' });
    expect(await mk(msg('USER_DISABLED')).signInWithPassword('a', 'b')).toMatchObject({ reason: 'DISABLED' });
    expect(await mk(msg('TOO_MANY_ATTEMPTS_TRY_LATER')).signInWithPassword('a', 'b')).toMatchObject({ reason: 'THROTTLED' });
    expect(await mk(msg('INTERNAL')).signInWithPassword('a', 'b')).toMatchObject({ reason: 'ERROR' });
    expect(await mk(async () => new Response('x', { status: 500 })).signInWithPassword('a', 'b')).toMatchObject({ reason: 'ERROR' });
  });
  it('عمليات الإدارة', async () => {
    const calls: any[] = [];
    const f = async (url: string, init: RequestInit) => (calls.push([url, JSON.parse(String(init.body))]), res({}));
    const id = new IdentityToolkit('p', 'KEY', async () => 'AT', f as never, () => 5000);
    await id.createUser('u1', 'e@x', 'pw', 'اسم');
    await id.updateUser('u1', { password: 'n', disabled: true, email: 'e2', displayName: 'd', revokeSessions: true, claims: { rp: [] } });
    await id.sendPasswordReset('e@x');
    expect(calls[1][1]).toMatchObject({ localId: 'u1', disableUser: true, validSince: '5', customAttributes: '{"rp":[]}' });
    expect(calls[2][0]).toContain('sendOobCode');
    await expect(new IdentityToolkit('p', 'K', async () => 'AT', (async () => res({}, 403)) as never).updateUser('u', {})).rejects.toThrow();
  });
});

describe('MemoryDb وحد المعدل', () => {
  it('عمليات الاستعلام والترتيب والكتابة', async () => {
    const db = new MemoryDb();
    db.now = () => 99;
    db.seed('o/1', { n: 1, s: 'a', tags: ['x'], m: { k: 1 } }).seed('o/2', { n: 2, s: 'b', tags: ['y'] }).seed('o/1/h/1', { n: 9 });
    const ids = async (q: any) => (await db.query({ collection: 'o', ...q })).map((d) => d.id);
    expect(await ids({})).toEqual(['1', '2']);
    expect(await ids({ where: [['n', '>', 1]] })).toEqual(['2']);
    expect(await ids({ where: [['n', '>=', 1], ['n', '<=', 1]] })).toEqual(['1']);
    expect(await ids({ where: [['n', '<', 2], ['s', '!=', 'b']] })).toEqual(['1']);
    expect(await ids({ where: [['tags', 'array-contains', 'y']] })).toEqual(['2']);
    expect(await ids({ where: [['tags', 'array-contains-any', ['x', 'z']]] })).toEqual(['1']);
    expect(await ids({ where: [['s', 'in', ['b']]] })).toEqual(['2']);
    expect(await ids({ where: [['m.k', '==', 1]] })).toEqual(['1']);
    expect(await ids({ orderBy: [['n', 'desc']], limit: 1 })).toEqual(['2']);
    expect(await ids({ orderBy: [['n', 'asc']], startAfter: [1] })).toEqual(['2']);
    expect(await ids({ orderBy: [['missing', 'asc']] })).toHaveLength(2);
    await db.commit([{ kind: 'set', path: 'o/3', data: { t: '__server_time__', deep: { t: '__server_time__' } } }, { kind: 'increment', path: 'c/1', field: 'n', by: 3 }, { kind: 'set', path: 'o/1', data: { z: 1 }, merge: true }, { kind: 'delete', path: 'o/2' }]);
    expect((await db.get('o/3'))!.data).toEqual({ t: 99, deep: { t: 99 } });
    expect((await db.get('c/1'))!.data.n).toBe(3);
    expect((await db.get('o/1'))!.data).toMatchObject({ n: 1, z: 1 });
    await expect(db.commit([{ kind: 'update', path: 'nope/1', data: {} }])).rejects.toBeInstanceOf(ConflictError);
    expect((await db.getMany(['o/1', 'zz/1'])).map((d) => d?.id ?? null)).toEqual(['1', null]);
    await expect(db.runTransaction(async () => { throw new Error('x'); })).rejects.toThrow();
    expect(await db.runTransaction(async (tx) => (await tx.query({ collection: 'o' })).length)).toBe(2);
  });
  it('حد المعدل', async () => {
    const r = new RateLimiter(new MemoryCounter(), 2, 30, 't');
    expect(await r.blocked('a')).toBe(false);
    await r.hit('a');
    await r.hit('a');
    expect(await r.blocked('a')).toBe(true);
    await r.reset('a');
    expect(await r.blocked('a')).toBe(false);
  });
});

describe('fetch الافتراضي في Workers', () => {
  it('لا يُستدعى fetch كدالة عضو (Illegal invocation في Cloudflare)', async () => {
    const { FirestoreDb } = await import('../src/infra/firestore');
    const { IdentityToolkit } = await import('../src/infra/identity');
    const { Fcm } = await import('../src/infra/fcm');
    const real = globalThis.fetch;
    const strict = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    globalThis.fetch = strict as typeof fetch;
    try {
      const tok = async () => 't';
      await new FirestoreDb('p', tok).get('a/b').catch((e: Error) => { if (/Illegal/.test(e.message)) throw e; });
      await new IdentityToolkit('p', 'k', tok).deleteUser('u').catch((e: Error) => { if (/Illegal/.test(e.message)) throw e; });
      await new Fcm('p', tok).send('tok-aaaaaaaaaaaaaaaaaaaa', { title: 't', body: 'b', data: {} }).catch((e: Error) => { if (/Illegal/.test(e.message)) throw e; });
    } finally {
      globalThis.fetch = real;
    }
  });
});
