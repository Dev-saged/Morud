package com.mawred.app

import com.mawred.app.data.OrderRepository
import com.mawred.app.data.SubmitResult
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.local.CartLine
import com.mawred.app.data.local.OutboxDao
import com.mawred.app.data.local.OutboxItem
import com.mawred.app.ui.shop.formatDuration
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class FakeOutbox : OutboxDao {
    val items = linkedMapOf<String, OutboxItem>()
    val n = MutableStateFlow(0)
    override suspend fun pending() = items.values.sortedBy { it.createdAt }
    override fun count() = n
    override suspend fun add(i: OutboxItem) { items.putIfAbsent(i.idempotencyKey, i); n.value = items.size }
    override suspend fun failed(key: String, error: String) { items[key]?.let { items[key] = it.copy(attempts = it.attempts + 1, lastError = error) } }
    override suspend fun done(key: String) { items.remove(key); n.value = items.size }
}

class OrdersTest {
    private lateinit var server: MockWebServer
    private val http = OkHttpClient()
    private var mode = "ok"
    private val seen = mutableListOf<RecordedRequest>()

    @Before fun up() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                seen += request
                val path = request.requestUrl!!.encodedPath
                return when {
                    path == "/orders" && mode == "ok" -> MockResponse().setResponseCode(201).setBody("""{"order":{"id":"o1"}}""")
                    path == "/orders" && mode == "price" -> MockResponse().setResponseCode(409).setBody("""{"error":{"code":"PRICE_CHANGED","message":"تغيّرت","details":{"total":900}}}""")
                    path == "/orders" && mode == "down" -> MockResponse().setResponseCode(503).setBody("{}")
                    path == "/orders" -> MockResponse().setResponseCode(400).setBody("""{"error":{"code":"CREDIT_LIMIT","message":"يتجاوز الحد"}}""")
                    path == "/shops/s1/statement" -> MockResponse().setBody("""{"statement":{"opening":0,"rows":[{"id":"l1","type":"invoice","amount":24750,"at":5,"running":24750}],"debit":24750,"credit":0,"closing":24750,"due":24750,"creditBalance":0},"credit":{"enabled":true,"limit":100000,"available":75250}}""")
                    path == "/orders/o1" -> MockResponse().setBody("""{"order":{"id":"o1","number":"MW-O-2026-000001","status":"new","items":[{"productId":"p","unitId":"box","name":"فيتا","unitName":"علبة","qtyMilli":2000,"unitPrice":800,"total":1600}],"totals":{"subtotal":1600,"discount":0,"total":1600},"sla":{"dueAt":99,"estimated":true}},"history":[{"to":"new","at":1}],"changes":[],"internal":[],"actions":[{"to":"cancelled","reason":true}]}""")
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
    }
    @After fun down() = server.shutdown()

    private fun repo(outbox: FakeOutbox, base: () -> String = { server.url("").toString().trimEnd('/') }) = OrderRepository(Api(http, base) { "T" }, outbox) { 1L }
    private val lines = listOf(CartLine("p", "box", 2000, 1))

    @Test fun sentClearsOutboxWithKey() = runTest {
        val ob = FakeOutbox(); val r = repo(ob)
        val res = r.submit(r.body("s1", lines, "cash", "", null), "KEY1")
        assertEquals(SubmitResult.Sent("o1"), res)
        assertTrue(ob.items.isEmpty())
        val req = seen.last()
        assertEquals("KEY1", req.getHeader("idempotency-key"))
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertEquals("s1", b["shopId"]!!.jsonPrimitive.content)
        assertEquals("2000", b["items"]!!.toString().substringAfter("\"qtyMilli\":").substringBefore("}"))
        assertFalse("seenTotal" in b)
    }

    @Test fun offlineQueuesAndFlushReusesSameKey() = runTest {
        val ob = FakeOutbox()
        val offline = repo(ob) { "http://127.0.0.1:1" }
        assertEquals(SubmitResult.Queued, offline.submit(offline.body("s1", lines, "cash", "", null), "KEY2"))
        assertEquals(1, ob.items["KEY2"]!!.attempts)
        mode = "down"
        assertTrue(repo(ob).flush())
        mode = "ok"
        assertFalse(repo(ob).flush())
        assertTrue(ob.items.isEmpty())
        assertTrue(seen.filter { it.requestUrl!!.encodedPath == "/orders" }.all { it.getHeader("idempotency-key") == "KEY2" })
    }

    @Test fun priceChangeWaitsForUserThenSendsSeenTotalSameKey() = runTest {
        val ob = FakeOutbox(); val r = repo(ob)
        mode = "price"
        assertEquals(SubmitResult.PriceChanged("KEY3", 900), r.submit(r.body("s1", lines, "credit", "ملاحظة", null), "KEY3"))
        val before = seen.size
        assertFalse(r.flush())
        assertEquals("flush يتخطى ما ينتظر قرار المستخدم", before, seen.size)
        mode = "ok"
        assertEquals(SubmitResult.Sent("o1"), r.acceptPrice("KEY3", 900))
        val req = seen.last()
        assertEquals("KEY3", req.getHeader("idempotency-key"))
        val b = Json.parseToJsonElement(req.body.readUtf8()).jsonObject
        assertEquals(900L, b["seenTotal"]!!.jsonPrimitive.content.toLong())
        assertEquals("credit", b["paymentMethod"]!!.jsonPrimitive.content)
        assertTrue(ob.items.isEmpty())
    }

    @Test fun businessRejectionRemovesAndSurfacesArabicError() = runTest {
        val ob = FakeOutbox(); val r = repo(ob)
        mode = "reject"
        val e = runCatching { r.submit(r.body("s1", lines, "credit", "", null), "KEY4") }.exceptionOrNull() as ApiException
        assertEquals("CREDIT_LIMIT", e.code); assertEquals("يتجاوز الحد", e.message)
        assertTrue(ob.items.isEmpty())
    }

    @Test fun orderDetailStatementAndDuration() = runTest {
        val r = repo(FakeOutbox())
        val d = r.order("o1")
        assertEquals("MW-O-2026-000001", d.order.number); assertEquals(1600L, d.order.items[0].total); assertTrue(d.actions[0].reason); assertTrue(d.order.sla!!.estimated)
        val (st, credit) = r.statement("s1")
        assertEquals(24750L, st.due); assertEquals(24750L, st.rows[0].running); assertEquals(75250L, credit!!.available)
        assertEquals("3 س 5 د", formatDuration(3 * 3_600_000L + 5 * 60_000))
        assertEquals("0 د", formatDuration(-5))
    }
}
