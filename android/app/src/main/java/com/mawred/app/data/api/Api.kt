package com.mawred.app.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.UUID

class ApiException(val status: Int, val code: String, message: String, val details: JsonObject? = null) : Exception(message)

fun newIdempotencyKey(): String = UUID.randomUUID().toString().replace("-", "")

val ApiJson = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }

/** عميل الخادم: Bearer، مفتاح منع التكرار، سياق العمل، وأخطاء عربية موحدة. كل استدعاء آمن من انقطاع الشبكة. */
class Api(private val client: OkHttpClient, private val base: () -> String, private val token: suspend () -> String?) {
    var workContext: String? = null

    suspend fun request(method: String, path: String, body: JsonElement? = null, idem: String? = null, auth: Boolean = true): JsonObject = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base() + path).header("x-device", "android")
        if (auth) token()?.let { b.header("authorization", "Bearer $it") }
        idem?.let { b.header("idempotency-key", it) }
        workContext?.let { b.header("x-work-context", it) }
        val rb = body?.let { ApiJson.encodeToString(JsonElement.serializer(), it).toRequestBody(JSON) }
        b.method(method, rb ?: if (method == "POST" || method == "PATCH" || method == "PUT") "{}".toRequestBody(JSON) else null)
        val res = try { client.newCall(b.build()).execute() } catch (e: IOException) {
            throw ApiException(0, "NETWORK", "لا يوجد اتصال بالإنترنت، سنحاول مجدداً عند عودته")
        }
        res.use { r ->
            val text = r.body?.string().orEmpty()
            val obj = runCatching { ApiJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!r.isSuccessful) {
                val e = obj["error"] as? JsonObject
                throw ApiException(r.code, e?.get("code")?.jsonPrimitive?.contentOrNull ?: "ERROR", e?.get("message")?.jsonPrimitive?.contentOrNull ?: "حدث خطأ، حاول مرة أخرى", e?.get("details") as? JsonObject)
            }
            obj
        }
    }

    suspend fun get(path: String) = request("GET", path)
    suspend fun post(path: String, body: JsonElement, idem: String? = null) = request("POST", path, body, idem)

    companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
