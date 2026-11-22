package com.mawred.app.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.mawred.app.MainActivity
import com.mawred.app.R

/** إشعارات محلية لحالة الطلبات المحفوظة؛ القناة تُنشأ مرة، والإذن يُطلب لحظة الحاجة فقط. */
object Notifier {
    private const val CHANNEL = "orders"

    fun allowed(ctx: Context) = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    const val ACTION_OPEN_REF = "com.mawred.app.OPEN_REF"

    /** إشعار يفتح مرجعه (طلب، حساب…) عند الضغط. */
    fun show(ctx: Context, id: Int, title: String, body: String, refKind: String? = null, refId: String? = null) {
        if (!allowed(ctx)) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL, "حالة الطلبات", NotificationManager.IMPORTANCE_DEFAULT).apply { description = "إرسال الطلبات المحفوظة وتغيّر حالتها" })
        val i = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (refKind != null && refId != null) i.setAction(ACTION_OPEN_REF).putExtra("refKind", refKind).putExtra("refId", refId)
        val open = PendingIntent.getActivity(ctx, id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(R.drawable.ic_launcher_monochrome).setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true).build()
        runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
    }
}
