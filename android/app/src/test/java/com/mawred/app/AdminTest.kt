package com.mawred.app

import com.mawred.app.data.AdminRepository
import com.mawred.app.data.Product
import com.mawred.app.data.ProductImage
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class AdminTest {
    private lateinit var server: MockWebServer
    private val reqs = mutableListOf<Pair<RecordedRequest, ByteArray>>()

    @Before fun up() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                reqs += request to request.body.readByteArray()
                return when ("${request.method} ${request.requestUrl!!.encodedPath}") {
                    "GET /orders" -> MockResponse().setBody("""{"orders":[{"id":"o1","number":"MW-O-2026-000001","shopName":"بقالة النور","status":"new","createdAt":1,"items":2,"total":24750,"paymentMethod":"cash","sla":{"dueAt":5,"overdue":true}}]}""")
                    "GET /delivery/board" -> MockResponse().setBody("""{"agents":[{"uid":"ag1","displayName":"سامر","phone":"0599","activeTasks":2}],"regions":{},"overdue":0}""")
                    "POST /admin/uploads/product-image" -> if (request.getHeader("content-type")!!.startsWith("image/png")) MockResponse().setResponseCode(201).setBody("""{"key":"products/abc12345.png","width":100,"height":100}""") else MockResponse().setResponseCode(400).setBody("""{"error":{"code":"IMAGE_TYPE","message":"الصيغ المقبولة: PNG أو WebP"}}""")
                    "POST /orders/o1/transition" -> MockResponse().setBody("""{"order":{"id":"o1"}}""")
                    else -> MockResponse().setBody("{}")
                }
            }
        }
        server.start()
    }
    @After fun down() = server.shutdown()

    private fun repo() = AdminRepository(Api(OkHttpClient(), { server.url("").toString().trimEnd('/') }) { "T" })
    private fun json(b: ByteArray) = Json.parseToJsonElement(String(b)).jsonObject

    @Test fun ordersAgentsAssignAvailability() = runTest {
        val r = repo()
        val list = r.orders("overdue")
        assertEquals("filter=overdue", reqs.last().first.requestUrl!!.query)
        assertEquals(true, list[0].sla!!.overdue); assertEquals(24750L, list[0].total)
        assertEquals("سامر", r.agents()[0].displayName)
        r.assignAgent("o1", "ag1")
        assertEquals("ag1", json(reqs.last().second)["agentId"]!!.jsonPrimitive.content)
        r.setAvailability("feta", false)
        assertEquals("PATCH", reqs.last().first.method)
        assertEquals("false", json(reqs.last().second)["available"].toString())
    }

    @Test fun imageUploadKeepsExistingImages() = runTest {
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
        val p = Product("feta", "فيتا", images = listOf(ProductImage("products/old11111.png", "products/old11111.png")))
        assertEquals("products/abc12345.png", repo().addImage(p, png))
        val upload = reqs.first { it.first.requestUrl!!.encodedPath == "/admin/uploads/product-image" }
        assertArrayEquals(png, upload.second)
        assertEquals("Bearer T", upload.first.getHeader("authorization"))
        val images = json(reqs.last().second)["images"]!!.jsonArray.map { it.jsonObject["key"]!!.jsonPrimitive.content }
        assertEquals(listOf("products/old11111.png", "products/abc12345.png"), images)
    }

    @Test fun deliverySendsProofAndIdempotencyKey() = runTest {
        repo().deliver("o1", " أبو أحمد ", 24750)
        val (req, body) = reqs.last()
        val b = json(body)
        assertEquals("delivered", b["to"]!!.jsonPrimitive.content)
        assertEquals("أبو أحمد", b["proof"]!!.jsonObject["receiverName"]!!.jsonPrimitive.content)
        assertEquals("24750", b["proof"]!!.jsonObject["collectedAmount"].toString())
        assertEquals(32, req.getHeader("idempotency-key")!!.length)
    }

    @Test fun uploadErrorIsArabic() = runTest {
        val api = Api(OkHttpClient(), { server.url("").toString().trimEnd('/') }) { "T" }
        val e = runCatching { api.upload("/admin/uploads/product-image", byteArrayOf(1), "image/jpeg") }.exceptionOrNull() as ApiException
        assertEquals("IMAGE_TYPE", e.code); assertEquals("الصيغ المقبولة: PNG أو WebP", e.message)
    }
}
