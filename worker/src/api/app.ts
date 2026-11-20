import { ConflictError } from '../infra/db';
import { authRoutes } from './auth';
import { buildUser, type Ctx, type Services } from './context';
import { ApiError, json, Router } from './http';

export interface AppConfig {
  allowedOrigins: string[];
}

export type RouteModule = (r: Router<Ctx>) => void;

export function createApp(modules: RouteModule[] = []) {
  const router = new Router<Ctx>();
  router.on('GET', '/health', async () => json({ ok: true, service: 'mawred-api' }));
  authRoutes(router);
  for (const m of modules) m(router);

  const PRE_AUTH = new Set(['/health', '/auth/login', '/auth/forgot']);
  const PASSWORD_CHANGE_ALLOWED = new Set(['/auth/me', '/auth/change-password', '/auth/logout-all']);

  return async function handle(req: Request, s: Services, cfg: AppConfig): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const cors: Record<string, string> = origin && cfg.allowedOrigins.includes(origin)
      ? { 'access-control-allow-origin': origin, vary: 'origin', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-work-context, x-device', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE', 'access-control-max-age': '600' }
      : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: origin && cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
    const requestId = s.id();
    const ctx: Ctx = {
      req, url, s, requestId, user: null, workContext: null,
      ip: req.headers.get('cf-connecting-ip') ?? 'unknown',
      device: (req.headers.get('x-device') ?? req.headers.get('user-agent') ?? 'unknown').slice(0, 160),
    };
    const withHeaders = (r: Response) => {
      const h = new Headers(r.headers);
      for (const [k, v] of Object.entries(cors)) h.set(k, v);
      h.set('x-request-id', requestId);
      h.set('x-content-type-options', 'nosniff');
      return new Response(r.body, { status: r.status, headers: h });
    };
    try {
      const m = router.match(req.method, url.pathname);
      if (m === null) return withHeaders(json({ error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } }, 404));
      if (m === 'METHOD') return withHeaders(json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'طريقة غير مدعومة' } }, 405));
      const auth = req.headers.get('authorization');
      if (auth?.startsWith('Bearer ')) {
        const claims = await s.verifyToken(auth.slice(7));
        if (!claims) throw new ApiError(401, 'UNAUTHENTICATED', 'جلسة غير صالحة، سجّل الدخول من جديد');
        ctx.user = await buildUser(s, claims.sub, claims);
        const wc = req.headers.get('x-work-context');
        ctx.workContext = wc && ctx.user.contexts.includes(wc) ? wc : ctx.user.home;
        if (ctx.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(url.pathname)) {
          throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'يجب تغيير كلمة المرور المؤقتة أولاً');
        }
      } else if (!PRE_AUTH.has(url.pathname) && !url.pathname.startsWith('/files/products/')) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'سجّل الدخول أولاً');
      }
      return withHeaders(await m.handler(ctx, m.params));
    } catch (e) {
      if (e instanceof ApiError) return withHeaders(json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, e.status));
      if (e instanceof ConflictError) return withHeaders(json({ error: { code: 'CONFLICT', message: 'تعارض في البيانات، أعد المحاولة' } }, 409));
      console.error(JSON.stringify({ requestId, path: url.pathname, error: String(e) }));
      return withHeaders(json({ error: { code: 'INTERNAL', message: 'حدث خطأ غير متوقع، حاول مرة أخرى', requestId } }, 500));
    }
  };
}
