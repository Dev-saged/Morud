// عميل الخادم: ترويسة الجلسة، مفاتيح منع التكرار، وأخطاء عربية موحدة، ونسخ محفوظة للعمل بلا نت
import { cacheGet, cachePut, markStale } from './offline';
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export type TokenProvider = () => Promise<string | null>;

export function newKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export class Api {
  workContext: string | null = null;
  /** معرّف المستخدم الحالي لفصل النسخ المحفوظة؛ null = لا حفظ */
  scope: string | null = null;
  constructor(readonly base: string, private readonly token: TokenProvider, private readonly f: typeof fetch = (...a) => fetch(...a)) {}

  async request<T = any>(method: string, path: string, body?: unknown, opts: { idem?: string; raw?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-device': 'web' };
    const t = await this.token();
    if (t) headers.authorization = `Bearer ${t}`;
    if (opts.idem) headers['idempotency-key'] = opts.idem;
    if (this.workContext) headers['x-work-context'] = this.workContext;
    const cacheable = method === 'GET' && !opts.raw && this.scope !== null;
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      if (cacheable) {
        const hit = cacheGet<T>(this.scope!, path);
        if (hit) { markStale(hit.at); return hit.data; }
      }
      throw new ApiError(0, 'NETWORK', 'لا يوجد اتصال بالإنترنت، سنحاول مجدداً عند عودته');
    }
    if (opts.raw && res.ok) return (await res.text()) as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error ?? {};
      throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'حدث خطأ، حاول مرة أخرى', e.details);
    }
    if (cacheable) { cachePut(this.scope!, path, data); markStale(null); }
    return data as T;
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown, idem?: string) {
    return this.request<T>('POST', path, body ?? {}, idem ? { idem } : {});
  }
  patch<T = any>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  put<T = any>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }
  del<T = any>(path: string) {
    return this.request<T>('DELETE', path);
  }
  /** رفع ملف ثنائي (صور المنتجات المفرّغة). */
  async upload<T = any>(path: string, blob: Blob): Promise<T> {
    const headers: Record<string, string> = { 'content-type': blob.type || 'application/octet-stream', 'x-device': 'web' };
    const t = await this.token();
    if (t) headers.authorization = `Bearer ${t}`;
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, { method: 'POST', headers, body: blob });
    } catch {
      throw new ApiError(0, 'NETWORK', 'لا يوجد اتصال بالإنترنت، سنحاول مجدداً عند عودته');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (data as { error?: { code?: string; message?: string } }).error ?? {};
      throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'تعذّر رفع الملف');
    }
    return data as T;
  }
}
