package com.mawred.app

import com.mawred.app.data.api.Api
import com.mawred.app.ui.admin.AdminVm
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AdminVmTest {
    private lateinit var server: MockWebServer
    private val reqs = mutableListOf<RecordedRequest>()

    @Before fun up() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse { reqs += request; return when (request.path) {
                "/admin/shops" -> MockResponse().setBody("""{"shops":[{"id":"s1","name":"بقالة النور","balance":24750}]}""")
                "/payments" -> MockResponse().setResponseCode(201).setBody("""{"payment":{"id":"p1"}}""")
                "/admin/settings" -> MockResponse().setResponseCode(400).setBody("""{"error":{"code":"VALIDATION","message":"ساعات العمل غير صالحة"}}""")
                else -> MockResponse().setResponseCode(404)
            } }
        }
        server.start()
    }
    @After fun down() { server.shutdown(); Dispatchers.resetMain() }

    private fun wait(cond: () -> Boolean) { val t = System.currentTimeMillis(); while (!cond() && System.currentTimeMillis() - t < 5000) Thread.sleep(20) }

    @Test fun loadActAndErrors() {
        val vm = AdminVm(Api(OkHttpClient(), { server.url("").toString().trimEnd('/') }) { "T" })
        vm.load("/admin/shops"); wait { "/admin/shops" in vm.s.value.data }
        assertEquals("بقالة النور", vm.s.value.data["/admin/shops"]!!["shops"].toString().substringAfter("\"name\":\"").substringBefore("\""))
        var after = false
        vm.act("سُجّلت الدفعة", "POST", "/payments", buildJsonObject { put("shopId", "s1"); put("amount", 10000) }, idem = true, reload = listOf("/admin/shops")) { after = true }
        wait { vm.s.value.info != null }
        assertEquals("سُجّلت الدفعة", vm.s.value.info); assertTrue(after)
        val pay = reqs.first { it.path == "/payments" }
        assertEquals(32, pay.getHeader("idempotency-key")!!.length)
        wait { reqs.count { it.path == "/admin/shops" } == 2 }
        assertEquals(2, reqs.count { it.path == "/admin/shops" })
        vm.act("x", "PATCH", "/admin/settings", buildJsonObject { })
        wait { vm.s.value.error != null }
        assertEquals("ساعات العمل غير صالحة", vm.s.value.error)
        assertNull(reqs.last { it.path == "/admin/settings" }.getHeader("idempotency-key"))
        vm.clearMsg(); assertNull(vm.s.value.error)
    }
}
