import type { Services } from './context';
import { runBackup } from './backup';
import { markOverdue } from './delivery';
import { settleSweep } from './finance';
import { processDueJobs } from './notify';

/** المهام المجدولة: كل دقيقة إعادة محاولة الإشعارات؛ تُضاف مهام التأخير والنسخ في وحداتها. */
export async function runScheduled(s: Services, cron: string): Promise<void> {
  if (cron === '* * * * *') await processDueJobs(s, s.pusher);
  if (cron === '*/5 * * * *') await markOverdue(s);
  if (cron === '0 1 * * *') {
    await settleSweep(s);
    await runBackup(s);
  }
}
