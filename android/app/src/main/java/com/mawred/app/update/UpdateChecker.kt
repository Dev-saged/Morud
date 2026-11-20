package com.mawred.app.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.mawred.app.BrandConfig
import com.mawred.app.BuildConfig
import com.mawred.app.data.api.ApiJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

data class UpdateInfo(val build: Int, val version: String, val apkUrl: String, val notes: String)

/** فحص آخر إصدار منشور ومقارنة رقم البناء؛ التنزيل في مجلد التطبيق ويُحذف بعد التثبيت. */
class UpdateChecker(private val http: OkHttpClient, private val ctx: Context) {
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("https://api.github.com/repos/${BrandConfig.updateRepo}/releases/latest").header("accept", "application/vnd.github+json").build()
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@use null
                parse(r.body?.string().orEmpty())?.takeIf { it.build > BuildConfig.VERSION_CODE }
            }
        }.getOrNull()
    }

    fun download(info: UpdateInfo): Long {
        val dm = ctx.getSystemService(DownloadManager::class.java)
        val req = DownloadManager.Request(Uri.parse(info.apkUrl)).setTitle("${BrandConfig.NAME} ${info.version}").setMimeType(APK)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(File(dir(), "mawred-${info.build}.apk")))
        return dm.enqueue(req)
    }

    fun install(build: Int) {
        val f = File(dir(), "mawred-$build.apk")
        if (!f.exists()) return
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, APK).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** حذف ملفات التحديث المثبّتة (أقدم أو مساوية للبناء الحالي). */
    fun cleanup() {
        dir().listFiles()?.forEach { f -> buildOf(f.name)?.let { if (it <= BuildConfig.VERSION_CODE) f.delete() } }
    }

    private fun dir() = File(ctx.getExternalFilesDir(null), "updates").apply { mkdirs() }

    companion object {
        const val APK = "application/vnd.android.package-archive"
        private val TAG = Regex("""^v(\d+\.\d+\.\d+)-b(\d+)$""")
        fun buildOf(name: String) = Regex("""mawred-(\d+)\.apk""").matchEntire(name)?.groupValues?.get(1)?.toIntOrNull()

        fun parse(json: String): UpdateInfo? {
            val o = ApiJson.parseToJsonElement(json).jsonObject
            val m = TAG.matchEntire(o["tag_name"]?.jsonPrimitive?.content.orEmpty()) ?: return null
            val apk = o["assets"]?.jsonArray?.map { it.jsonObject }?.firstOrNull { it["name"]?.jsonPrimitive?.content?.endsWith(".apk") == true } ?: return null
            return UpdateInfo(m.groupValues[2].toInt(), m.groupValues[1], apk["browser_download_url"]!!.jsonPrimitive.content, o["body"]?.jsonPrimitive?.content.orEmpty())
        }
    }
}
