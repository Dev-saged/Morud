// أخطاء HTTP موحّدة وموجّه مسارات بسيط بلا مكتبات
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

export const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, PRICE_CHANGED: 409, RATE_LIMITED: 429,
  ACCOUNT_SUSPENDED: 403, ACCOUNT_EXPIRED: 403, INVALID_CREDENTIALS: 401, PAYLOAD_TOO_LARGE: 413,
};

export const fail = (code: string, message: string, details?: Record<string, unknown>, status?: number) =>
  new ApiError(status ?? STATUS[code] ?? 400, code, message, details);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export async function readJson<T = Record<string, unknown>>(req: Request, max = 1_000_000): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > max) throw fail('PAYLOAD_TOO_LARGE', 'حجم الطلب أكبر من المسموح');
  const text = await req.text();
  if (text.length > max) throw fail('PAYLOAD_TOO_LARGE', 'حجم الطلب أكبر من المسموح');
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw fail('BAD_JSON', 'صيغة البيانات غير صالحة');
  }
}

export type Handler<C> = (ctx: C, params: Record<string, string>) => Promise<Response>;
interface Route<C> {
  method: string;
  parts: string[];
  handler: Handler<C>;
}

export class Router<C> {
  private readonly routes: Route<C>[] = [];

  on(method: string, path: string, handler: Handler<C>) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler<C>; params: Record<string, string> } | 'METHOD' | null {
    const segs = pathname.split('/').filter(Boolean);
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      const okPath = r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(segs[i]!)), true) : p === segs[i]));
      if (!okPath) continue;
      if (r.method !== method) {
        methodMismatch = true;
        continue;
      }
      return { handler: r.handler, params };
    }
    return methodMismatch ? 'METHOD' : null;
  }
}

// تنظيف نص قادم من العميل: حدود الطول وإزالة محارف التحكم
export function cleanText(v: unknown, max: number, field: string, required = true): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw fail('VALIDATION', `الحقل «${field}» مطلوب`, { field });
    return '';
  }
  if (typeof v !== 'string') throw fail('VALIDATION', `الحقل «${field}» يجب أن يكون نصاً`, { field });
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !s) throw fail('VALIDATION', `الحقل «${field}» مطلوب`, { field });
  if (s.length > max) throw fail('VALIDATION', `الحقل «${field}» أطول من المسموح`, { field, max });
  return s;
}
