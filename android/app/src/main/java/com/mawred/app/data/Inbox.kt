package com.mawred.app.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiJson
import com.mawred.app.data.auth.AuthRepository
import com.mawred.app.data.auth.SessionState
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import java.util.concurrent.TimeUnit

@Serializable data class NoticeRef(val kind: String, val id: String)
@Serializable data class Notice(val id: String, val type: String = "", val title: String, val body: String = "", val ref: NoticeRef, val readAt: Long? = null, val createdAt: Long = 0)
@Serializable data class InboxPage(val notifications: List<Notice> = emptyList(), val unread: Int = 0)

/** صندوق الإشعارات من الخادم (المرجع الدائم؛ الإشعار على الجهاز تنبيه فقط). */
class InboxRepository(private val api: Api) {
    suspend fun load(): InboxPage = ApiJson.decodeFromJsonElement(InboxPage.serializer(), api.get("/notifications"))
    suspend fun read(id: String) { api.request("POST", "/notifications/$id/read", buildJsonObject { }) }
    suspend fun readAll() { api.request("POST", "/notifications/read-all", buildJsonObject { }) }

    /** ما لم يُعرض بعد على الجهاز: غير مقروء وأحدث من آخر ما نُبّه عليه. */
    fun fresh(page: InboxPage, lastNotified: Long) = page.notifications.filter { it.readAt == null && it.createdAt > lastNotified }.sortedBy { it.createdAt }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface InboxEntry { fun auth(): AuthRepository; fun inbox(): InboxRepository }

/** يفحص الإشعارات الجديدة كل 15 دقيقة (حد أندرويد الأدنى) ويعرضها على الجهاز، بلا حزمة Firebase. */
class InboxPollWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val e = EntryPointAccessors.fromApplication(applicationContext, InboxEntry::class.java)
        val auth = e.auth()
        if (auth.state.value !is SessionState.SignedIn) auth.restore()
        if (auth.state.value !is SessionState.SignedIn) return Result.success()
        return runCatching { notifyFresh(applicationContext, e.inbox()); Result.success() }.getOrElse { Result.retry() }
    }

    companion object {
        private const val WORK = "inbox-poll"
        private const val PREF = "inbox"

        suspend fun notifyFresh(ctx: Context, inbox: InboxRepository) {
            val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            val last = sp.getLong("lastNotified", 0)
            val page = inbox.load()
            // أول تشغيل بعد الدخول: لا نُغرق المستخدم بالقديم، نبدأ من الآن
            if (last == 0L) { sp.edit().putLong("lastNotified", page.notifications.maxOfOrNull { it.createdAt } ?: System.currentTimeMillis()).apply(); return }
            val fresh = inbox.fresh(page, last)
            fresh.takeLast(5).forEach { n -> Notifier.show(ctx, n.id.hashCode(), n.title, n.body, n.ref.kind, n.ref.id) }
            fresh.maxOfOrNull { it.createdAt }?.let { sp.edit().putLong("lastNotified", it).apply() }
        }

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<InboxPollWorker>(15, TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork(WORK)
            ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply()
        }
    }
}
