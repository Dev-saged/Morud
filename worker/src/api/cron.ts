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
  if (every) await processDueJobs(s, s.pusher);
  if (cron === '*/5 * * * *' || (every && m % 5 === 0)) await markOverdue(s);
  if (cron === '0 1 * * *' || (every && m === 0 && d.getUTCHours() === 1)) {
    await settleSweep(s);
    await runBackup(s);
    await purgeIdempotency(s);
  }
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
  return removed;
}
