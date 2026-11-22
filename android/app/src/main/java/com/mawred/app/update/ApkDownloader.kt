package com.mawred.app.update

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.FileOutputStream
import java.io.IOException
import kotlin.coroutines.coroutineContext

data class Progress(val done: Long, val total: Long, val bytesPerSec: Long) {
    val fraction get() = if (total > 0) (done.toFloat() / total).coerceIn(0f, 1f) else 0f
    val etaSec get() = if (bytesPerSec > 0 && total > done) (total - done) / bytesPerSec else -1
}

/** تنزيل قابل للاستئناف (Range) إلى .part ثم تحقق الحجم وSHA-256 ثم إعادة تسمية ذرّية. انقطاع النت لا يضيّع ما نُزّل. */
class ApkDownloader(private val http: OkHttpClient, private val now: () -> Long = System::currentTimeMillis) {
    suspend fun download(info: UpdateInfo, files: UpdateFiles, onProgress: (Progress) -> Unit): java.io.File = withContext(Dispatchers.IO) {
        files.ready(info)?.let { return@withContext it }
        val part = files.part(info.build)
        var have = part.takeIf { it.exists() }?.length() ?: 0L
        if (info.size > 0 && have > info.size) { part.delete(); have = 0 }
        if (info.size <= 0 || have < info.size) {
            val req = Request.Builder().url(info.apkUrl).apply { if (have > 0) header("Range", "bytes=$have-") }.build()
            http.newCall(req).execute().use { r ->
                if (r.code == 416) { part.delete(); throw IOException("RANGE") }
                if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
                val append = r.code == 206 && have > 0
                if (!append) have = 0
                val body = r.body ?: throw IOException("EMPTY")
                val total = if (info.size > 0) info.size else (body.contentLength().takeIf { it > 0 }?.plus(have) ?: -1)
                var lastTick = now(); var lastBytes = have; var speed = 0L
                FileOutputStream(part, append).use { out ->
                    body.byteStream().use { inp ->
                        val buf = ByteArray(32 * 1024)
                        onProgress(Progress(have, total, 0))
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = inp.read(buf); if (n < 0) break
                            out.write(buf, 0, n); have += n
                            val t = now()
                            if (t - lastTick >= 400) {
                                val inst = (have - lastBytes) * 1000 / (t - lastTick).coerceAtLeast(1)
                                speed = if (speed == 0L) inst else (speed * 7 + inst * 3) / 10
                                lastTick = t; lastBytes = have
                                onProgress(Progress(have, total, speed))
                            }
                        }
                    }
                }
                onProgress(Progress(have, total, speed))
            }
        }
        if (info.size > 0 && part.length() != info.size) throw IOException("INCOMPLETE")
        info.sha256?.let { expected -> if (!UpdateFiles.sha256(part).equals(expected, true)) { part.delete(); throw IntegrityException("الملف المنزّل لا يطابق توقيع الإصدار، سيُعاد تنزيله") } }
        val dest = files.apk(info.build)
        if (!part.renameTo(dest)) throw IOException("RENAME")
        dest
    }
}
