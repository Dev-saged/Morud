import type { Data } from '../infra/db';
import { requirePerm, type Ctx } from './context';
import { fail, json, type Router } from './http';

// لا تُعرض أي قيمة حساسة حتى لمن يملك السجل
const HIDDEN = /secret|password|token|loginEmail/i;
const scrub = (d: unknown): unknown => (d && typeof d === 'object' && !Array.isArray(d) ? Object.fromEntries(Object.entries(d as Data).filter(([k]) => !HIDDEN.test(k))) : d);
const ACTION_RE = /^[a-z]+(\.[a-z_]+){1,3}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * سجل العمليات (SRS 11.2-17 و11.3 و16.4): من فعل ماذا ومتى، مع القيم قبل وبعد.
 * فلاتر بالتساوي (الموظف، العنصر، نوع العملية) وتصفّح للأقدم بمؤشر الوقت.
 */
async function list(ctx: Ctx) {
  requirePerm(ctx, 'audit.view');
  const q = ctx.url.searchParams;
  const actor = q.get('actor');
  const entity = q.get('entity');
  const action = q.get('action');
  const before = q.get('before');
  const where: Array<[string, '==' | '<', unknown]> = [];
  if (actor) { if (!ID_RE.test(actor)) throw fail('VALIDATION', 'معرّف الموظف غير صالح'); where.push(['actorId', '==', actor]); }
  if (entity) { if (!ID_RE.test(entity)) throw fail('VALIDATION', 'معرّف العنصر غير صالح'); where.push(['entity.id', '==', entity]); }
  if (action) { if (!ACTION_RE.test(action)) throw fail('VALIDATION', 'نوع العملية غير صالح'); where.push(['action', '==', action]); }
  if (where.length > 1) throw fail('VALIDATION', 'اختر فلتراً واحداً في كل مرة');
  if (before) { const t = Number(before); if (!Number.isSafeInteger(t) || t <= 0) throw fail('VALIDATION', 'مؤشر غير صالح'); where.push(['at', '<', t]); }
  const limit = 50;
  const rows = await ctx.s.db.query({ collection: 'auditLogs', where, orderBy: [['at', 'desc']], limit });
  const ids = [...new Set(rows.map((r) => String(r.data.actorId)).filter((id) => id !== 'system' && id !== 'anonymous'))];
  const users = ids.length ? await ctx.s.db.getMany(ids.map((id) => `users/${id}`)) : [];
  const names = new Map(ids.map((id, i) => [id, String(users[i]?.data.displayName ?? id)]));
  const label = (id: string) => (id === 'system' ? 'النظام' : id === 'anonymous' ? 'زائر غير مسجل' : names.get(id) ?? id);
  return json({
    logs: rows.map((r) => {
      const d = r.data as Data;
      return { id: r.id, at: d.at, action: d.action, actorId: d.actorId, actor: label(String(d.actorId)), entity: d.entity, result: d.result, before: scrub(d.before), after: scrub(d.after), ip: d.ip, device: d.device };
    }),
    next: rows.length === limit ? rows[rows.length - 1]!.data.at : null,
  });
}

export function auditRoutes(r: Router<Ctx>) {
  r.on('GET', '/admin/audit', list);
}
