package com.mawred.app

import com.mawred.app.update.ApkDownloader
import com.mawred.app.update.Bytes
import com.mawred.app.update.IntegrityException
import com.mawred.app.update.Progress
import com.mawred.app.update.ReleaseNotes
import com.mawred.app.update.UpdateFiles
import com.mawred.app.update.UpdateInfo
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

class UpdateTest {
    private lateinit var server: MockWebServer
    private val payload = ByteArray(200_000) { (it % 251).toByte() }
    private val sha = MessageDigest.getInstance("SHA-256").digest(payload).joinToString("") { "%02x".format(it) }
    private val ranges = mutableListOf<String?>()
    private lateinit var dir: File

    @Before fun up() {
        dir = Files.createTempDirectory("upd").toFile()
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val range = request.getHeader("Range"); ranges += range
                val from = range?.removePrefix("bytes=")?.removeSuffix("-")?.toInt() ?: 0
                val body = Buffer().write(payload, from, payload.size - from)
                return if (from > 0) MockResponse().setResponseCode(206).setBody(body) else MockResponse().setBody(body)
            }
        }
    }
    @After fun down() { server.shutdown(); dir.deleteRecursively() }

    private fun info(sum: String? = sha) = UpdateInfo(12, "0.4.0", server.url("/a.apk").toString(), "", payload.size.toLong(), sum)

    @Test fun resumesFromPartialAndVerifies() = runTest {
        val files = UpdateFiles(dir)
        files.part(12).writeBytes(payload.copyOfRange(0, 80_000))
        val seen = mutableListOf<Progress>()
        val f = ApkDownloader(OkHttpClient()).download(info(), files) { seen += it }
        assertEquals("bytes=80000-", ranges.single())
        assertArrayEquals(payload, f.readBytes())
        assertEquals(files.apk(12), f)
        assertFalse("لا يبقى ملف جزئي", files.part(12).exists())
        assertEquals(1f, seen.last().fraction)
        // مرة ثانية: الملف جاهز فلا تنزيل
        ApkDownloader(OkHttpClient()).download(info(), files) {}
        assertEquals(1, ranges.size)
    }

    @Test fun wrongDigestDeletesPartAndFails() = runTest {
        val files = UpdateFiles(dir)
        val r = runCatching { ApkDownloader(OkHttpClient()).download(info("00".repeat(32)), files) {} }
        assertTrue(r.exceptionOrNull() is IntegrityException)
        assertFalse(files.part(12).exists()); assertFalse(files.apk(12).exists())
    }

    @Test fun cleanupKeepsOnlyPendingBuild() {
        val files = UpdateFiles(dir)
        listOf("mawred-10.apk", "mawred-11.apk.part", "mawred-12.apk.part", "junk.tmp").forEach { File(dir, it).writeText("x") }
        files.cleanup(current = 11, keep = 12)
        assertEquals(setOf("mawred-12.apk.part"), dir.list()!!.toSet())
        files.cleanup(current = 12)
        assertEquals(0, dir.list()!!.size)
    }

    @Test fun releaseNotesSections() {
        val n = ReleaseNotes.parse("# v0.3.0 — تذكرني والعمل بلا نت\n\n## الإضافات\n- **تذكرني** في الدخول\n- صادر `outbox`\n\n## الإصلاحات\n- رقم المتأخرة\n")
        assertEquals("تذكرني والعمل بلا نت", n.headline)
        assertEquals(listOf("الإضافات", "الإصلاحات"), n.sections.map { it.title })
        assertEquals(listOf("تذكرني في الدخول", "صادر outbox"), n.sections[0].items)
    }

    @Test fun humanSizesAndEta() {
        assertEquals("3.1 م.ب", Bytes.of(3_200_000)); assertEquals("200 ك.ب", Bytes.of(204_800)); assertEquals("1 د 5 ث", Bytes.eta(65))
        assertEquals(10L, Progress(500, 1500, 100).etaSec)
    }
}
