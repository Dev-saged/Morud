import { ConflictError, SERVER_TIME, type Data, type Db, type Doc, type Query, type Tx, type Write } from './db';

const clone = <T>(v: T): T => structuredClone(v);

function getField(d: Data, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Data)[k] : undefined), d);
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return (a as number) < (b as number) ? -1 : 1;
}

/** قاعدة ذاكرة متوافقة مع واجهة Db — للاختبارات فقط. المعاملات تسلسلية. */
export class MemoryDb implements Db {
  readonly docs = new Map<string, Data>();
  now = () => Date.now();

  seed(path: string, data: Data) {
    this.docs.set(path, clone(data));
    return this;
  }

  async get(path: string): Promise<Doc | null> {
    const d = this.docs.get(path);
    return d ? { id: path.split('/').pop()!, path, data: clone(d) } : null;
  }

  async getMany(paths: string[]) {
    return Promise.all(paths.map((p) => this.get(p)));
  }

  async query(q: Query): Promise<Doc[]> {
    const depth = q.collection.split('/').length + 1;
    let rows = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(q.collection + '/') && p.split('/').length === depth)
      .map(([path, data]) => ({ id: path.split('/').pop()!, path, data: clone(data) }));
    for (const [f, op, v] of q.where ?? []) {
      rows = rows.filter((r) => {
        const x = getField(r.data, f);
        switch (op) {
          case '==': return x === v;
          case '!=': return x !== v;
          case '<': return cmp(x, v) < 0;
          case '<=': return cmp(x, v) <= 0;
          case '>': return cmp(x, v) > 0;
          case '>=': return cmp(x, v) >= 0;
          case 'array-contains': return Array.isArray(x) && x.includes(v);
          case 'array-contains-any': return Array.isArray(x) && (v as unknown[]).some((y) => x.includes(y));
          case 'in': return (v as unknown[]).includes(x);
        }
      });
    }
    for (const [f, dir] of [...(q.orderBy ?? [])].reverse()) {
      rows.sort((a, b) => cmp(getField(a.data, f), getField(b.data, f)) * (dir === 'desc' ? -1 : 1));
    }
    if (q.startAfter && q.orderBy?.[0]) {
      const [f, dir] = q.orderBy[0];
      rows = rows.filter((r) => cmp(getField(r.data, f), q.startAfter![0]) * (dir === 'desc' ? -1 : 1) > 0);
    }
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  private resolve(data: Data): Data {
    const out: Data = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = v === SERVER_TIME ? this.now() : v && typeof v === 'object' && !Array.isArray(v) ? this.resolve(v as Data) : v;
    }
    return out;
  }

  private apply(writes: Write[]) {
    for (const w of writes) {
      const exists = this.docs.has(w.path);
      if (w.kind === 'create' && exists) throw new ConflictError(w.path);
      if (w.kind === 'update' && !exists) throw new ConflictError(w.path);
    }
    for (const w of writes) {
      if (w.kind === 'delete') this.docs.delete(w.path);
      else if (w.kind === 'increment') {
        const d = this.docs.get(w.path) ?? {};
        d[w.field] = ((d[w.field] as number) ?? 0) + w.by;
        this.docs.set(w.path, d);
      } else if (w.kind === 'set' && !w.merge) this.docs.set(w.path, this.resolve(w.data));
      else this.docs.set(w.path, { ...(this.docs.get(w.path) ?? {}), ...this.resolve(w.data) });
    }
  }

  async commit(writes: Write[]) {
    this.apply(writes);
  }

  async dump(collectionId: string, afterPath: string | null, limit: number): Promise<Doc[]> {
    return [...this.docs.keys()]
      .filter((p) => { const seg = p.split('/'); return seg.length % 2 === 0 && seg[seg.length - 2] === collectionId; })
      .sort()
      .filter((p) => afterPath === null || p > afterPath)
      .slice(0, limit)
      .map((path) => ({ id: path.split('/').pop()!, path, data: clone(this.docs.get(path)!) }));
  }

  private chain: Promise<unknown> = Promise.resolve();

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const writes: Write[] = [];
      const tx: Tx = { get: (p) => this.get(p), query: (q) => this.query(q), write: (w) => writes.push(w) };
      const r = await fn(tx);
      this.apply(writes);
      return r;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}
