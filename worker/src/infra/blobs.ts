// مخزن النسخ الاحتياطية (R2 منفصل في الإنتاج)
export interface BlobStore {
  put(key: string, body: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  list(prefix: string): Promise<Array<{ key: string; uploaded: number; size: number }>>;
  delete(key: string): Promise<void>;
}

export class R2Blobs implements BlobStore {
  constructor(private readonly b: R2Bucket) {}
  async put(key: string, body: Uint8Array) {
    await this.b.put(key, body);
  }
  async get(key: string) {
    const o = await this.b.get(key);
    return o ? new Uint8Array(await o.arrayBuffer()) : null;
  }
  async list(prefix: string) {
    const out: Array<{ key: string; uploaded: number; size: number }> = [];
    let cursor: string | undefined;
    do {
      const r = await this.b.list({ prefix, ...(cursor ? { cursor } : {}) });
      for (const o of r.objects) out.push({ key: o.key, uploaded: o.uploaded.getTime(), size: o.size });
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  async delete(key: string) {
    await this.b.delete(key);
  }
}

export class MemoryBlobs implements BlobStore {
  readonly m = new Map<string, { body: Uint8Array; uploaded: number }>();
  clock = () => Date.now();
  async put(key: string, body: Uint8Array) {
    this.m.set(key, { body, uploaded: this.clock() });
  }
  async get(key: string) {
    return this.m.get(key)?.body ?? null;
  }
  async list(prefix: string) {
    return [...this.m.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, uploaded: v.uploaded, size: v.body.length }));
  }
  async delete(key: string) {
    this.m.delete(key);
  }
}
