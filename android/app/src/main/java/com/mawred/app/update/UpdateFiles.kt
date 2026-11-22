package com.mawred.app.update

import java.io.File
import java.io.IOException
import java.security.MessageDigest

/** مجلد التحديثات المنظّم داخل التطبيق: mawred-<build>.apk مكتمل، و.part أثناء التنزيل. يُحذف كل ما ثُبّت. */
class UpdateFiles(val dir: File) {
    init { dir.mkdirs() }
    fun apk(build: Int) = File(dir, "mawred-$build.apk")
    fun part(build: Int) = File(dir, "mawred-$build.apk.part")
    fun ready(info: UpdateInfo): File? = apk(info.build).takeIf { it.exists() && (info.size <= 0 || it.length() == info.size) }
    fun partialBytes(build: Int) = part(build).takeIf { it.exists() }?.length() ?: 0L
    fun usedBytes() = dir.listFiles()?.sumOf { it.length() } ?: 0L

    /** يحذف كل ملف لبناء مثبّت أو أقدم، وكل جزء لا يخص البناء المنتظر. */
    fun cleanup(current: Int, keep: Int? = null): Int {
        var n = 0
        dir.listFiles()?.forEach { f ->
            val b = Regex("""mawred-(\d+)\.apk(\.part)?""").matchEntire(f.name)?.groupValues?.get(1)?.toIntOrNull()
            if (b == null || b <= current || (keep != null && b != keep)) { if (f.delete()) n++ }
        }
        return n
    }

    fun clearAll() = dir.listFiles()?.forEach { it.delete() }

    companion object {
        fun sha256(f: File): String {
            val md = MessageDigest.getInstance("SHA-256")
            f.inputStream().use { s -> val buf = ByteArray(64 * 1024); while (true) { val n = s.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
    }
}

class IntegrityException(msg: String) : IOException(msg)
