package com.mawred.app.update

import com.mawred.app.BrandConfig
import com.mawred.app.data.api.ApiJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

@Serializable
data class UpdateInfo(val build: Int, val version: String, val apkUrl: String, val notes: String, val size: Long = 0, val sha256: String? = null, val publishedAt: String = "")

/** فحص آخر إصدار منشور في GitHub Releases ومقارنة رقم البناء. */
class UpdateChecker(private val http: OkHttpClient, private val repo: () -> String = { BrandConfig.updateRepo }) {
    /** null = لا جديد؛ يرمي عند فشل الشبكة ليميّز المستدعي «لا جديد» عن «تعذّر الفحص». */
    suspend fun latest(): UpdateInfo? = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("https://api.github.com/repos/${repo()}/releases/latest").header("accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { r ->
            if (r.code == 404) return@use null
            if (!r.isSuccessful) throw java.io.IOException("HTTP ${r.code}")
            parse(r.body?.string().orEmpty())
        }
    }

    companion object {
        const val APK = "application/vnd.android.package-archive"
        private val TAG = Regex("""^v(\d+\.\d+\.\d+)-b(\d+)$""")
        fun buildOf(name: String) = Regex("""mawred-(\d+)\.apk""").matchEntire(name)?.groupValues?.get(1)?.toIntOrNull()

        fun parse(json: String): UpdateInfo? {
            val o = ApiJson.parseToJsonElement(json).jsonObject
            val m = TAG.matchEntire(o["tag_name"]?.jsonPrimitive?.content.orEmpty()) ?: return null
            val apk = o["assets"]?.jsonArray?.map { it.jsonObject }?.firstOrNull { it["name"]?.jsonPrimitive?.content?.endsWith(".apk") == true } ?: return null
            // GitHub يضع digest بصيغة sha256:<hex> لكل ملف مرفوع؛ نستخدمه للتحقق من سلامة التنزيل
            val digest = apk["digest"]?.jsonPrimitive?.contentOrNull?.takeIf { it.startsWith("sha256:") }?.removePrefix("sha256:")
            return UpdateInfo(
                m.groupValues[2].toInt(), m.groupValues[1], apk["browser_download_url"]!!.jsonPrimitive.content, o["body"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                apk["size"]?.jsonPrimitive?.longOrNull ?: 0, digest, o["published_at"]?.jsonPrimitive?.contentOrNull.orEmpty(),
            )
        }
    }
}
