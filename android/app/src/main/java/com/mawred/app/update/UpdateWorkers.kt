package com.mawred.app.update

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

@EntryPoint
@InstallIn(SingletonComponent::class)
interface UpdateEntry { fun manager(): UpdateManager; fun downloader(): ApkDownloader }

/** التنزيل بالخلفية بإشعار تقدّم حيّ؛ الانقطاع يعيد المحاولة تلقائياً ويستأنف من آخر بايت. */
class UpdateDownloadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val e = EntryPointAccessors.fromApplication(applicationContext, UpdateEntry::class.java)
        val m = e.manager()
        val info = m.known ?: return Result.success()
        runCatching { setForeground(foreground(Progress(m.files.partialBytes(info.build), info.size, 0), info)) }
        var lastNotify = 0L
        return try {
            val file = e.downloader().download(info, m.files) { p ->
                m.set(UpdatePhase.Downloading(info, p))
                val t = System.currentTimeMillis()
                if (t - lastNotify > 900) { lastNotify = t; UpdateNotifications.progress(applicationContext, info, p) }
            }
            m.set(UpdatePhase.Verifying(info))
            m.set(UpdatePhase.Ready(info, file))
            UpdateNotifications.ready(applicationContext, info)
            Result.success()
        } catch (c: CancellationException) {
            throw c
        } catch (x: IntegrityException) {
            m.set(UpdatePhase.Failed(info, x.message ?: "فشل التحقق"))
            if (runAttemptCount < 2) Result.retry() else { UpdateNotifications.failed(applicationContext, info, x.message.orEmpty()); Result.failure() }
        } catch (x: IOException) {
            val done = m.files.partialBytes(info.build)
            m.set(UpdatePhase.Waiting(info, done, "انقطع الاتصال — سيكمل تلقائياً عند عودته"))
            UpdateNotifications.paused(applicationContext, info, done, waitingNetwork = true)
            Result.retry()
        }
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val m = EntryPointAccessors.fromApplication(applicationContext, UpdateEntry::class.java).manager()
        val info = m.known
        return foreground(Progress(info?.let { m.files.partialBytes(it.build) } ?: 0, info?.size ?: 0, 0), info)
    }

    private fun foreground(p: Progress, info: UpdateInfo?): ForegroundInfo {
        val n = UpdateNotifications.progressNotification(applicationContext, info, p)
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(UpdateNotifications.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(UpdateNotifications.ID, n)
    }
}

/** فحص كل 12 ساعة: إشعار بالإصدار الجديد، وتنزيل تلقائي على Wi‑Fi إن سمح المستخدم. */
class UpdateCheckWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val m = EntryPointAccessors.fromApplication(applicationContext, UpdateEntry::class.java).manager()
        val seen = m.known?.build
        val info = m.check(silent = true) ?: return Result.success()
        if (m.files.ready(info) != null) return Result.success()
        if (m.prefs.value.autoOnWifi) m.download(info, auto = true)
        else if (seen != info.build) UpdateNotifications.available(applicationContext, info)
        return Result.success()
    }
}
