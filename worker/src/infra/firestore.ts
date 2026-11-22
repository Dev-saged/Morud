import { ConflictError, SERVER_TIME, type Data, type Db, type Doc, type Query, type Tx, type Write } from './db';

type Value = Record<string, unknown>;
type Fetch = typeof fetch;

export function encode(v: unknown, now: number): Value {
  if (v === SERVER_TIME) return { integerValue: String(now) };
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encode(x, now)) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Data, now) } };
  throw new TypeError('قيمة غير مدعومة');
}

export function encodeFields(d: Data, now: number): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) out[k] = encode(v, now);
  return out;
}

export function decode(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue as string);
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, Value> }).fields ?? {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}

export function decodeFields(f: Record<string, Value>): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(f)) out[k] = decode(v);
  return out;
}

const quote = (k: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/[`\\]/g, (c) => '\\' + c) + '`');

const OPS: Record<string, string> = {
  '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL',
  'array-contains': 'ARRAY_CONTAINS', in: 'IN', 'array-contains-any': 'ARRAY_CONTAINS_ANY',
};

export class FirestoreDb implements Db {
  private readonly root: string;
  constructor(
    private readonly projectId: string,
    private readonly token: () => Promise<string>,
    private readonly f: Fetch = (i, init) => fetch(i, init),
    private readonly clock: () => number = Date.now,
    private readonly base = 'https://firestore.googleapis.com/v1',
  ) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${await this.token()}` };
    return this.f(`${this.base}/${path}`, { ...init, headers });
  }

  private toDoc(raw: { name: string; fields?: Record<string, Value>; updateTime?: string }): Doc {
    const path = raw.name.slice(this.root.length + 1);
    return { id: path.split('/').pop()!, path, data: decodeFields(raw.fields ?? {}), ...(raw.updateTime ? { updateTime: raw.updateTime } : {}) };
  }

  private async getIn(path: string, transaction?: string): Promise<Doc | null> {
    const q = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
    const res = await this.call(`${this.root}/${path}${q}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await this.error(res);
    return this.toDoc((await res.json()) as never);
  }

  get(path: string) {
    return this.getIn(path);
  }

  async getMany(paths: string[]): Promise<Array<Doc | null>> {
    if (paths.length === 0) return [];
    const res = await this.call(`${this.root}:batchGet`, { method: 'POST', body: JSON.stringify({ documents: paths.map((p) => `${this.root}/${p}`) }) });
    if (!res.ok) throw await this.error(res);
    const rows = (await res.json()) as Array<{ found?: never; missing?: string }>;
    const byName = new Map<string, Doc>();
    for (const r of rows) if (r.found) { const d = this.toDoc(r.found); byName.set(d.path, d); }
    return paths.map((p) => byName.get(p) ?? null);
  }

  structured(q: Query): { parent: string; body: Record<string, unknown> } {
    const segs = q.collection.split('/');
    const collectionId = segs.pop()!;
    const parent = segs.length ? `${this.root}/${segs.join('/')}` : this.root;
    const filters = (q.where ?? []).map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f.split('.').map(quote).join('.') }, op: OPS[op], value: encode(v, this.clock()) } }));
    const sq: Record<string, unknown> = { from: [{ collectionId }] };
    if (filters.length === 1) sq.where = filters[0];
    if (filters.length > 1) sq.where = { compositeFilter: { op: 'AND', filters } };
    if (q.orderBy?.length) sq.orderBy = q.orderBy.map(([f, d]) => ({ field: { fieldPath: f }, direction: d === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
    if (q.startAfter) sq.startAt = { values: q.startAfter.map((v) => encode(v, this.clock())), before: false };
    if (q.limit) sq.limit = q.limit;
    return { parent, body: { structuredQuery: sq } };
  }

  private async queryIn(q: Query, transaction?: string): Promise<Doc[]> {
    const { parent, body } = this.structured(q);
    const res = await this.call(`${parent}:runQuery`, { method: 'POST', body: JSON.stringify(transaction ? { ...body, transaction } : body) });
    if (!res.ok) throw await this.error(res);
    const rows = (await res.json()) as Array<{ document?: never }>;
    return rows.filter((r) => r.document).map((r) => this.toDoc(r.document!));
  }

  query(q: Query) {
    return this.queryIn(q);
  }

  async dump(collectionId: string, afterPath: string | null, limit: number): Promise<Doc[]> {
    const sq: Record<string, unknown> = { from: [{ collectionId, allDescendants: true }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit };
    if (afterPath) sq.startAt = { values: [{ referenceValue: `${this.root}/${afterPath}` }], before: false };
    const res = await this.call(`${this.root}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: sq }) });
    if (!res.ok) throw await this.error(res);
    const rows = (await res.json()) as Array<{ document?: never }>;
    return rows.filter((r) => r.document).map((r) => this.toDoc(r.document!));
  }

  toWrites(writes: Write[]): unknown[] {
    const now = this.clock();
    return writes.map((w) => {
      const name = `${this.root}/${w.path}`;
      switch (w.kind) {
        case 'delete':
          return { delete: name };
        case 'increment':
          return { transform: { document: name, fieldTransforms: [{ fieldPath: quote(w.field), increment: { integerValue: String(w.by) } }] } };
        case 'create':
          return { update: { name, fields: encodeFields(w.data, now) }, currentDocument: { exists: false } };
        case 'update':
          return { update: { name, fields: encodeFields(w.data, now) }, updateMask: { fieldPaths: Object.keys(w.data).map(quote) }, currentDocument: { exists: true } };
        case 'set':
          return w.merge
            ? { update: { name, fields: encodeFields(w.data, now) }, updateMask: { fieldPaths: Object.keys(w.data).map(quote) } }
            : { update: { name, fields: encodeFields(w.data, now) } };
      }
    });
  }

  async commit(writes: Write[], transaction?: string): Promise<void> {
    if (writes.length === 0 && !transaction) return;
    const res = await this.call(`${this.root}:commit`, { method: 'POST', body: JSON.stringify({ writes: this.toWrites(writes), ...(transaction ? { transaction } : {}) }) });
    if (!res.ok) throw await this.error(res);
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 5): Promise<T> {
    for (let i = 0; ; i++) {
      const begin = await this.call(`${this.root}:beginTransaction`, { method: 'POST', body: '{}' });
      if (!begin.ok) throw await this.error(begin);
      const { transaction } = (await begin.json()) as { transaction: string };
      const writes: Write[] = [];
      const tx: Tx = { get: (p) => this.getIn(p, transaction), query: (q) => this.queryIn(q, transaction), write: (w) => writes.push(w) };
      try {
        const r = await fn(tx);
        await this.commit(writes, transaction);
        return r;
      } catch (e) {
        await this.call(`${this.root}:rollback`, { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        if (e instanceof RetryableError && i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 50 * 2 ** i));
          continue;
        }
        throw e;
      }
    }
  }

  private async error(res: Response): Promise<Error> {
    // runQuery يعيد الخطأ داخل مصفوفة، وباقي الواجهات ككائن
    const raw = (await res.json().catch(() => ({}))) as unknown;
    const body = (Array.isArray(raw) ? raw[0] : raw) as { error?: { status?: string; message?: string } } | undefined;
    const status = body?.error?.status ?? '';
    const message = body?.error?.message ?? '';
    if (status === 'ABORTED') return new RetryableError(message || 'aborted');
    if (status === 'ALREADY_EXISTS' || status === 'NOT_FOUND') return new ConflictError(message || status);
    return new Error(`firestore ${res.status} ${status} ${message.slice(0, 240)}`.trim());
  }
}

export class RetryableError extends Error {}
