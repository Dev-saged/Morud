import type { Services } from './context';
import { markOverdue } from './delivery';
import { processDueJobs } from './notify';

export interface CronDeps {
  backups: R2Bucket;
  backupKey: string;
}

/** المهام المجدولة: كل دقيقة إعادة محاولة الإشعارات؛ تُضاف مهام التأخير والنسخ في وحداتها. */
export async function runScheduled(s: Services, cron: string, _deps: CronDeps): Promise<void> {
  if (cron === '* * * * *') await processDueJobs(s, s.pusher);
  if (cron === '*/5 * * * *') await markOverdue(s);
}
