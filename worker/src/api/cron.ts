import type { Services } from './context';
import { runBackup } from './backup';
import { markOverdue } from './delivery';
import { settleSweep } from './finance';
import { processDueJobs } from './notify';

/**
 * المهام المجدولة. حساب Cloudflare المجاني يسمح بـ5 جداول للحساب كله، فمورد يستخدم جدولاً واحداً
 * كل دقيقة ويوزّع منه: الإشعارات كل دقيقة، التأخير كل 5 دقائق، التسوية والنسخ يومياً 01:00 UTC.
 */
export async function runScheduled(s: Services, cron: string, at: number = s.now()): Promise<void> {
  const d = new Date(at);
  const m = d.getUTCMinutes();
  const every = cron === '* * * * *';
  const jobs: Array<[string, () => Promise<unknown>]> = [];
  if (every) jobs.push(['notifications', () => processDueJobs(s, s.pusher)]);
  if (cron === '*/5 * * * *' || (every && m % 5 === 0)) jobs.push(['overdue', () => markOverdue(s)]);
  if (cron === '0 1 * * *' || (every && m === 0 && d.getUTCHours() === 1)) {
    jobs.push(['settle', () => settleSweep(s)], ['backup', () => runBackup(s)], ['purge', () => purgeIdempotency(s)]);
  }
  // كل مهمة معزولة: فشل واحدة لا يوقف الباقي، والنتيجة تُسجّل في systemHealth/cron لمراقبتها
  const health: Record<string, unknown> = {};
  for (const [name, run] of jobs) {
    try { await run(); health[name] = { ok: true, at: s.now() }; } catch (e) { health[name] = { ok: false, at: s.now(), error: String((e as Error).message ?? e).slice(0, 300) }; }
  }
  const failed = Object.values(health).some((h) => (h as { ok: boolean }).ok === false);
  // نكتب الصحة عند الفشل دائماً، وعند النجاح مرة كل ساعة فقط (توفير كتابات)
  if (failed || m === 0) await s.db.commit([{ kind: 'set', path: 'systemHealth/cron', data: { ...(await s.db.get('systemHealth/cron'))?.data, ...health, lastRunAt: s.now() } }]).catch(() => undefined);
}

/** بديل TTL (يحتاج خطة مدفوعة): يحذف مفاتيح منع التكرار الأقدم من 7 أيام على دفعات، بحد أعلى لكل تشغيل. */
export async function purgeIdempotency(s: Services, maxBatches = 20): Promise<number> {
  const before = s.now() - 7 * 86_400_000;
  let removed = 0;
  for (let i = 0; i < maxBatches; i++) {
    const old = await s.db.query({ collection: 'idempotency', where: [['createdAt', '<', before]], limit: 400 });
    if (!old.length) break;
    await s.db.commit(old.map((d) => ({ kind: 'delete' as const, path: d.path })));
    removed += old.length;
    if (old.length < 400) break;
  }
  // تذاكر التحقق بخطوتين المنتهية (لم تُستبدل)
  const stale = await s.db.query({ collection: 'mfaTickets', where: [['exp', '<', s.now()]], limit: 400 });
  if (stale.length) await s.db.commit(stale.map((d) => ({ kind: 'delete' as const, path: d.path })));
  return removed;
}
