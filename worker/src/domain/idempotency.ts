// منع تكرار العمليات الحساسة: نفس المفتاح = نفس النتيجة دون تنفيذ ثانٍ (SRS 19.3 سيناريو 4)
export interface IdempotencyStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

const KEY = /^[A-Za-z0-9_-]{16,80}$/;

export function validKey(key: string | null | undefined): key is string {
  return !!key && KEY.test(key);
}

export async function once<T>(store: IdempotencyStore, key: string, run: () => Promise<T>): Promise<{ value: T; replayed: boolean }> {
  const prev = await store.get(key);
  if (prev !== undefined) return { value: prev as T, replayed: true };
  const value = await run();
  await store.put(key, value);
  return { value, replayed: false };
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly m = new Map<string, unknown>();
  async get(key: string) {
    return this.m.get(key);
  }
  async put(key: string, value: unknown) {
    this.m.set(key, value);
  }
}
