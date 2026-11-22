package com.mawred.app.update

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.mawred.app.MainActivity
import com.mawred.app.R
import com.mawred.app.data.Notifier

/** إشعارات التحديث: تقدّم حيّ بالنسبة والسرعة والوقت المتبقي، ثم «جاهز للتثبيت» بزر مباشر. */
object UpdateNotifications {
    const val ID = 7301
    private const val CH_PROGRESS = "update_progress"
    private const val CH_READY = "update_ready"

    private fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CH_PROGRESS) == null) nm.createNotificationChannel(NotificationChannel(CH_PROGRESS, "تنزيل التحديثات", NotificationManager.IMPORTANCE_LOW).apply { description = "تقدّم تنزيل إصدار جديد"; setShowBadge(false) })
        if (nm.getNotificationChannel(CH_READY) == null) nm.createNotificationChannel(NotificationChannel(CH_READY, "تحديثات جاهزة", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "إصدار جديد متاح أو جاهز للتثبيت" })
    }

    private fun intent(ctx: Context, action: String, code: Int) = PendingIntent.getActivity(ctx, code, Intent(ctx, MainActivity::class.java).setAction(action).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun base(ctx: Context, ch: String) = NotificationCompat.Builder(ctx, ch).setSmallIcon(R.drawable.ic_launcher_monochrome).setColor(0xFF1D4ED8.toInt())
        .setContentIntent(intent(ctx, UpdateManager.ACTION_OPEN, 1)).setOnlyAlertOnce(true)

    fun progressNotification(ctx: Context, info: UpdateInfo?, p: Progress): Notification {
        channels(ctx)
        val pct = (p.fraction * 100).toInt()
        val detail = buildString {
            append(Bytes.of(p.done)); if (p.total > 0) append(" من ").append(Bytes.of(p.total))
            if (p.bytesPerSec > 0) append(" · ").append(Bytes.of(p.bytesPerSec)).append("/ث")
            if (p.etaSec >= 0) append(" · يتبقى ").append(Bytes.eta(p.etaSec))
        }
        return base(ctx, CH_PROGRESS).setContentTitle("يُنزَّل مورد ${info?.version.orEmpty()} — $pct٪").setContentText(detail)
            .setProgress(100, pct, p.total <= 0).setOngoing(true).setCategory(NotificationCompat.CATEGORY_PROGRESS).setSilent(true).build()
    }

    private fun post(ctx: Context, n: Notification) { if (Notifier.allowed(ctx)) runCatching { NotificationManagerCompat.from(ctx).notify(ID, n) } }

    fun progress(ctx: Context, info: UpdateInfo, p: Progress) = post(ctx, progressNotification(ctx, info, p))

    fun paused(ctx: Context, info: UpdateInfo, done: Long, waitingNetwork: Boolean = false) {
        channels(ctx)
        val pct = if (info.size > 0) (done * 100 / info.size).toInt() else 0
        post(ctx, base(ctx, CH_PROGRESS).setContentTitle(if (waitingNetwork) "بانتظار الإنترنت — مورد ${info.version}" else "التنزيل موقوف — مورد ${info.version}")
            .setContentText("نُزّل ${Bytes.of(done)}${if (info.size > 0) " من ${Bytes.of(info.size)}" else ""} · يكمل من حيث وقف").setProgress(100, pct, false).setSilent(true).build())
    }

    fun ready(ctx: Context, info: UpdateInfo) {
        channels(ctx)
        post(ctx, base(ctx, CH_READY).setContentTitle("مورد ${info.version} جاهز للتثبيت").setContentText("نُزّل في الخلفية وتحقّقنا من سلامته. ثبّته متى ناسبك.")
            .addAction(0, "ثبّت الآن", intent(ctx, UpdateManager.ACTION_INSTALL, 2)).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_RECOMMENDATION).build())
    }

    fun available(ctx: Context, info: UpdateInfo) {
        channels(ctx)
        post(ctx, base(ctx, CH_READY).setContentTitle("إصدار جديد: مورد ${info.version}").setContentText("${if (info.size > 0) Bytes.of(info.size) + " · " else ""}اضغط لعرض الجديد وتنزيله بالخلفية").setAutoCancel(true).build())
    }

    fun failed(ctx: Context, info: UpdateInfo, msg: String) {
        channels(ctx)
        post(ctx, base(ctx, CH_READY).setContentTitle("تعذّر تنزيل مورد ${info.version}").setContentText(msg.ifBlank { "اضغط لإعادة المحاولة" }).setAutoCancel(true).build())
    }

    fun clear(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(ID)
}

/** أحجام وأوقات بالعربية. */
object Bytes {
    fun of(b: Long): String = when {
        b >= 1_048_576 -> "%.1f م.ب".format(java.util.Locale.US, b / 1_048_576.0)
        b >= 1024 -> "${b / 1024} ك.ب"
        else -> "$b بايت"
    }
    fun eta(s: Long): String = when {
        s < 60 -> "$s ث"
        s < 3600 -> "${s / 60} د ${s % 60} ث"
        else -> "${s / 3600} س ${(s % 3600) / 60} د"
    }
}
