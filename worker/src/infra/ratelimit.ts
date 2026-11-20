// حد المحاولات بنافذة ثابتة في KV (حماية من التخمين؛ اتساق KV النهائي مقبول لهذا الغرض)
export interface Counter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export class RateLimiter {
  constructor(private readonly kv: Counter, private readonly limit: number, private readonly windowSec: number, private readonly prefix: string) {}

  private k(id: string) {
    return `rl:${this.prefix}:${id}`;
  }

  async blocked(id: string): Promise<boolean> {
    return Number((await this.kv.get(this.k(id))) ?? 0) >= this.limit;
  }

  async hit(id: string): Promise<number> {
    const n = Number((await this.kv.get(this.k(id))) ?? 0) + 1;
    await this.kv.put(this.k(id), String(n), { expirationTtl: Math.max(60, this.windowSec) });
    return n;
  }

  reset(id: string) {
    return this.kv.delete(this.k(id));
  }
}

export class MemoryCounter implements Counter {
  readonly m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.m.set(k, v);
  }
  async delete(k: string) {
    this.m.delete(k);
  }
}
