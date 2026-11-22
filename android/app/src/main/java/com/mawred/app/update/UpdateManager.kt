package com.mawred.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.mawred.app.BuildConfig
import com.mawred.app.data.api.ApiJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.util.concurrent.TimeUnit

/** مراحل التحديث كما تراها الواجهة والإشعار. */
sealed interface UpdatePhase {
    data object Idle : UpdatePhase
    data object Checking : UpdatePhase
    data class UpToDate(val checkedAt: Long) : UpdatePhase
    data class Available(val info: UpdateInfo, val partial: Long = 0) : UpdatePhase
    data class Downloading(val info: UpdateInfo, val progress: Progress) : UpdatePhase
    data class Waiting(val info: UpdateInfo, val done: Long, val reason: String) : UpdatePhase
    data class Verifying(val info: UpdateInfo) : UpdatePhase
    data class Ready(val info: UpdateInfo, val file: File) : UpdatePhase
    data class Failed(val info: UpdateInfo?, val message: String) : UpdatePhase
}

data class UpdatePrefs(val autoOnWifi: Boolean = true, val wifiOnly: Boolean = false)

/** مركز التحديث: فحص دوري، تنزيل بالخلفية قابل للإيقاف والاستئناف، تحقق، تثبيت في أي وقت، وتنظيف المجلد. */
class UpdateManager(private val ctx: Context, private val checker: UpdateChecker, val files: UpdateFiles, private val now: () -> Long = System::currentTimeMillis) {
    private val sp = ctx.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private val _phase = MutableStateFlow<UpdatePhase>(UpdatePhase.Idle)
    val phase: StateFlow<UpdatePhase> = _phase
    private val _prefs = MutableStateFlow(UpdatePrefs(sp.getBoolean("auto", true), sp.getBoolean("wifiOnly", false)))
    val prefs: StateFlow<UpdatePrefs> = _prefs
    val currentVersion: String = BuildConfig.VERSION_NAME
    val currentBuild: Int = BuildConfig.VERSION_CODE

    var known: UpdateInfo?
        get() = sp.getString("info", null)?.let { runCatching { ApiJson.decodeFromString(UpdateInfo.serializer(), it) }.getOrNull() }?.takeIf { it.build > currentBuild }
        private set(v) { sp.edit().apply { if (v == null) remove("info") else putString("info", ApiJson.encodeToString(UpdateInfo.serializer(), v)) }.apply() }

    val lastCheck: Long get() = sp.getLong("checkedAt", 0)

    /** عند فتح التطبيق: احذف ما ثُبّت واستعد الحالة من المجلد (جاهز، أو جزء منزّل). */
    fun restore() {
        val info = known
        files.cleanup(currentBuild, keep = info?.build)
        if (info == null) { known = null; return }
        set(files.ready(info)?.let { UpdatePhase.Ready(info, it) } ?: UpdatePhase.Available(info, files.partialBytes(info.build)))
    }

    fun set(p: UpdatePhase) { _phase.value = p }

    suspend fun check(silent: Boolean = false): UpdateInfo? {
        val before = _phase.value
        val busy = before is UpdatePhase.Downloading || before is UpdatePhase.Verifying || before is UpdatePhase.Ready
        if (!silent && !busy) set(UpdatePhase.Checking)
        return try {
            val info = checker.latest()?.takeIf { it.build > currentBuild }
            sp.edit().putLong("checkedAt", now()).apply()
            if (info == null) { known = null; if (!busy) set(UpdatePhase.UpToDate(now())); null }
            else {
                val prev = known
                known = info
                if (!busy || (prev != null && prev.build != info.build)) set(files.ready(info)?.let { UpdatePhase.Ready(info, it) } ?: UpdatePhase.Available(info, files.partialBytes(info.build)))
                info
            }
        } catch (e: Exception) {
            if (!silent && !busy) set(UpdatePhase.Failed(known, "تعذّر الوصول لخادم التحديثات، تحقق من الإنترنت"))
            known
        }
    }

    /** تنزيل في الخلفية عبر WorkManager: يكمل لو أُغلق التطبيق، وينتظر الشبكة لو انقطعت. */
    fun download(target: UpdateInfo? = null, auto: Boolean = false) {
        val info = target ?: known ?: return
        val net = if (auto || _prefs.value.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED
        val req = OneTimeWorkRequestBuilder<UpdateDownloadWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(net).setRequiresStorageNotLow(true).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS)
            .apply { if (!auto) setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST) }
            .addTag(TAG_DOWNLOAD).build()
        known = info
        set(UpdatePhase.Waiting(info, files.partialBytes(info.build), if (net == NetworkType.UNMETERED) "بانتظار شبكة Wi‑Fi" else "يبدأ التنزيل…"))
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK_DOWNLOAD, ExistingWorkPolicy.KEEP, req)
    }

    /** إيقاف مؤقت: الجزء المنزّل يبقى ويُستأنف من حيث وقف. */
    fun pause() {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_DOWNLOAD)
        val info = known ?: return
        set(UpdatePhase.Waiting(info, files.partialBytes(info.build), "موقوف مؤقتاً"))
        UpdateNotifications.paused(ctx, info, files.partialBytes(info.build))
    }

    fun cancel() {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_DOWNLOAD)
        val info = known
        files.cleanup(currentBuild, keep = -1)
        UpdateNotifications.clear(ctx)
        set(info?.let { UpdatePhase.Available(it) } ?: UpdatePhase.Idle)
    }

    /** true = بدأ التثبيت؛ false = يلزم إذن «تثبيت تطبيقات غير معروفة» وفُتحت شاشته. */
    fun install(): Boolean {
        val info = known ?: return false
        val f = files.ready(info) ?: return false
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return false
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, UpdateChecker.APK).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }

    fun setPrefs(p: UpdatePrefs) {
        sp.edit().putBoolean("auto", p.autoOnWifi).putBoolean("wifiOnly", p.wifiOnly).apply()
        _prefs.value = p
    }

    fun schedulePeriodic() {
        val req = PeriodicWorkRequestBuilder<UpdateCheckWorker>(12, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK_CHECK, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    companion object {
        const val WORK_DOWNLOAD = "update-download"
        const val WORK_CHECK = "update-check"
        const val TAG_DOWNLOAD = "update"
        const val ACTION_INSTALL = "com.mawred.app.INSTALL_UPDATE"
        const val ACTION_OPEN = "com.mawred.app.OPEN_UPDATE"
    }
}
