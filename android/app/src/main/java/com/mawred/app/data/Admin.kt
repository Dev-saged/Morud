package com.mawred.app.data

import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiJson
import com.mawred.app.data.api.newIdempotencyKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable data class AdminOrder(val id: String, val number: String = "", val shopName: String = "", val status: String = "", val createdAt: Long = 0, val items: Int = 0, val total: Long = 0, val paymentMethod: String = "cash", val sla: Sla? = null)
@Serializable data class Agent(val uid: String, val displayName: String = "", val phone: String? = null, val activeTasks: Int = 0)

/** عمليات الإدارة والمندوب على Android؛ كل كتابة عبر الخادم بصلاحياته. */
class AdminRepository(private val api: Api) {
    suspend fun orders(filter: String): List<AdminOrder> = api.get("/orders?filter=$filter")["orders"]!!.jsonArray.map { ApiJson.decodeFromJsonElement(AdminOrder.serializer(), it) }

    suspend fun agents(): List<Agent> = api.get("/delivery/board")["agents"]?.jsonArray?.map { ApiJson.decodeFromJsonElement(Agent.serializer(), it) }.orEmpty()

    suspend fun assignAgent(orderId: String, agentId: String) { api.post("/orders/$orderId/assign-agent", buildJsonObject { put("agentId", agentId) }) }

    suspend fun setAvailability(productId: String, available: Boolean) { api.request("PATCH", "/admin/products/$productId", buildJsonObject { put("available", available) }) }

    /** يرفع PNG المفرّغ ثم يضيفه لصور المنتج مع الإبقاء على السابقة. */
    suspend fun addImage(product: Product, png: ByteArray): String {
        val key = api.upload("/admin/uploads/product-image", png, "image/png")["key"]!!.jsonPrimitive.content
        val images = product.images + ProductImage(key, key)
        api.request("PATCH", "/admin/products/${product.id}", buildJsonObject {
            put("images", buildJsonArray { images.forEach { add(buildJsonObject { put("key", it.key); put("thumb", it.thumb) }) } })
        })
        return key
    }

    /** إجراءات المندوب: بدء الطريق، التسليم بإثبات، التعذّر بسبب. */
    suspend fun deliver(orderId: String, receiver: String, collected: Long) {
        api.post("/orders/$orderId/transition", buildJsonObject {
            put("to", "delivered")
            put("proof", buildJsonObject { put("receiverName", receiver.trim()); put("collectedAmount", collected) })
        }, newIdempotencyKey())
    }
}
