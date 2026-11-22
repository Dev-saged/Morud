package com.mawred.app.data

import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.ApiJson
import com.mawred.app.data.api.newIdempotencyKey
import com.mawred.app.data.local.CartLine
import com.mawred.app.data.local.OutboxDao
import com.mawred.app.data.local.OutboxItem
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

@Serializable data class Sla(val dueAt: Long? = null, val overdue: Boolean = false, val estimated: Boolean = false)
@Serializable data class OrderSummary(val id: String, val number: String = "", val status: String = "", val createdAt: Long = 0, val items: Int = 0, val total: Long = 0, val paymentMethod: String = "cash", val sla: Sla? = null)
@Serializable data class OrderLine(val productId: String, val unitId: String, val name: String = "", val unitName: String = "", val qtyMilli: Long = 0, val unitPrice: Long = 0, val total: Long = 0)
@Serializable data class Totals(val subtotal: Long = 0, val discount: Long = 0, val total: Long = 0)
@Serializable data class Order(val id: String, val number: String = "", val status: String = "", val items: List<OrderLine> = emptyList(), val totals: Totals = Totals(), val paymentMethod: String = "cash", val notes: String? = null, val sla: Sla? = null, val invoiceId: String? = null, val createdAt: Long = 0)
@Serializable data class HistoryEntry(val to: String = "", val at: Long = 0, val reason: String? = null)
@Serializable data class OrderAction(val to: String, val reason: Boolean = false)
@Serializable data class OrderDetail(val order: Order, val history: List<HistoryEntry> = emptyList(), val actions: List<OrderAction> = emptyList())
@Serializable data class LedgerRow(val id: String, val type: String, val amount: Long, val at: Long, val running: Long = 0, val reason: String? = null)
@Serializable data class Statement(val opening: Long = 0, val rows: List<LedgerRow> = emptyList(), val debit: Long = 0, val credit: Long = 0, val closing: Long = 0, val due: Long = 0, val creditBalance: Long = 0)
@Serializable data class CreditInfo(val enabled: Boolean = false, val limit: Long = 0, val available: Long = 0)
/** تسعير الخادم للسلة قبل الإرسال (بالعروض الفعالة): ما يراه المحل هو ما سيُعتمد. */
@Serializable data class CartQuote(val lines: List<OrderLine> = emptyList(), val subtotal: Long = 0, val discount: Long = 0, val total: Long = 0)
@Serializable data class ShopInfo(val id: String, val name: String = "", val paymentTerms: List<String> = listOf("cash"), val status: String = "active")

/** نتيجة الإرسال: تم، أو في الانتظار بلا نت، أو تغيّر السعر بانتظار الموافقة. */
sealed interface SubmitResult {
    data class Sent(val orderId: String, val number: String = "", val items: Int = 0) : SubmitResult
    data object Queued : SubmitResult
    data class PriceChanged(val key: String, val newTotal: Long) : SubmitResult
}

class OrderRepository(private val api: Api, private val outbox: OutboxDao, private val now: () -> Long = System::currentTimeMillis) {
    val pendingCount = outbox.count()

    fun body(shopId: String, lines: List<CartLine>, method: String, notes: String, seenTotal: Long?): JsonObject = buildJsonObject {
        put("shopId", shopId)
        put("items", buildJsonArray { lines.forEach { l -> add(buildJsonObject { put("productId", l.productId); put("unitId", l.unitId); put("qtyMilli", l.qtyMilli) }) } })
        put("paymentMethod", method)
        put("notes", notes)
        seenTotal?.let { put("seenTotal", it) }
    }

    suspend fun quote(lines: List<CartLine>): CartQuote = ApiJson.decodeFromJsonElement(
        CartQuote.serializer(),
        api.post("/orders/quote", buildJsonObject { put("items", buildJsonArray { lines.forEach { l -> add(buildJsonObject { put("productId", l.productId); put("unitId", l.unitId); put("qtyMilli", l.qtyMilli) }) } }) })["cart"]!!,
    )

    /** يُحفظ في outbox أولاً بمفتاح ثابت، ثم يُرسل؛ بلا نت يبقى ويُعاد لاحقاً بالمفتاح نفسه فلا يتكرر الطلب. */
    suspend fun submit(body: JsonObject, key: String = newIdempotencyKey()): SubmitResult {
        outbox.add(OutboxItem(key, "/orders", body.toString(), now()))
        return send(OutboxItem(key, "/orders", body.toString(), now()))
    }

    suspend fun send(item: OutboxItem): SubmitResult = try {
        val r = api.post(item.path, ApiJson.parseToJsonElement(item.body), item.idempotencyKey)
        outbox.done(item.idempotencyKey)
        val o = r["order"]!!.jsonObject
        SubmitResult.Sent(o["id"]!!.jsonPrimitive.content, o["number"]?.jsonPrimitive?.content.orEmpty(), runCatching { ApiJson.parseToJsonElement(item.body).jsonObject["items"]!!.jsonArray.size }.getOrDefault(0))
    } catch (e: ApiException) {
        when {
            e.code == "NETWORK" || e.status >= 500 -> { outbox.failed(item.idempotencyKey, e.message.orEmpty()); SubmitResult.Queued }
            e.code == "PRICE_CHANGED" -> {
                outbox.failed(item.idempotencyKey, PRICE_PREFIX + (e.details?.get("total")?.jsonPrimitive?.longOrNull ?: 0))
                SubmitResult.PriceChanged(item.idempotencyKey, e.details?.get("total")?.jsonPrimitive?.longOrNull ?: 0)
            }
            else -> { outbox.done(item.idempotencyKey); throw e }
        }
    }

    /** موافقة على السعر الجديد: نفس المفتاح مع seenTotal. */
    suspend fun acceptPrice(key: String, total: Long): SubmitResult {
        val item = outbox.pending().firstOrNull { it.idempotencyKey == key } ?: throw ApiException(404, "NOT_FOUND", "الطلب المعلّق غير موجود")
        val b = ApiJson.parseToJsonElement(item.body).jsonObject.toMutableMap().apply { put("seenTotal", kotlinx.serialization.json.JsonPrimitive(total)) }
        val updated = item.copy(body = JsonObject(b).toString())
        outbox.done(key); outbox.add(updated)
        return send(updated)
    }

    suspend fun discard(key: String) = outbox.done(key)

    /** يرسل كل المعلّق الذي لا ينتظر قرار المستخدم؛ يُرجع true إن بقي شيء لإعادة المحاولة. يُبلغ بكل نجاح أو رفض. */
    suspend fun flush(onSent: (SubmitResult.Sent) -> Unit = {}, onRejected: (String) -> Unit = {}): Boolean {
        var retry = false
        for (i in outbox.pending()) {
            if (i.lastError?.startsWith(PRICE_PREFIX) == true) continue
            try {
                when (val r = send(i)) {
                    is SubmitResult.Queued -> retry = true
                    is SubmitResult.Sent -> onSent(r)
                    is SubmitResult.PriceChanged -> onRejected("تغيّرت الأسعار؛ افتح طلباتي ووافق على الإجمالي الجديد")
                }
            } catch (e: ApiException) { onRejected(e.message ?: "تعذّر إرسال طلب محفوظ") }
        }
        return retry
    }

    suspend fun pending() = outbox.pending()

    suspend fun shopOrders(shopId: String): List<OrderSummary> =
        api.get("/shops/$shopId/orders")["orders"]!!.jsonArray.map { ApiJson.decodeFromJsonElement(OrderSummary.serializer(), it) }

    suspend fun order(id: String): OrderDetail = ApiJson.decodeFromJsonElement(OrderDetail.serializer(), api.get("/orders/$id"))

    suspend fun transition(id: String, to: String, reason: String) {
        api.post("/orders/$id/transition", buildJsonObject { put("to", to); put("reason", reason) }, newIdempotencyKey())
    }

    suspend fun statement(shopId: String): Pair<Statement, CreditInfo?> {
        val o = api.get("/shops/$shopId/statement")
        return ApiJson.decodeFromJsonElement(Statement.serializer(), o["statement"]!!) to (o["credit"] as? JsonObject)?.let { ApiJson.decodeFromJsonElement(CreditInfo.serializer(), it) }
    }

    suspend fun shop(shopId: String): ShopInfo = ApiJson.decodeFromJsonElement(ShopInfo.serializer(), api.get("/shops/$shopId")["shop"]!!)

    companion object { const val PRICE_PREFIX = "PRICE_CHANGED:" }
}
