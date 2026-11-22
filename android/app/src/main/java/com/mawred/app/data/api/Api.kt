package com.mawred.app.data.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
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

/** نسخة كل قراءة ناجحة لكل مستخدم للعمل بلا نت. */
interface ReadCache {
    suspend fun get(key: String): Pair<String, Long>?
    suspend fun put(key: String, json: String)
    suspend fun clearScope(scope: String)
    suspend fun clearAll()
}

/** عميل الخادم: Bearer، مفتاح منع التكرار، سياق العمل، وأخطاء عربية موحدة. كل استدعاء آمن من انقطاع الشبكة. */
class Api(private val client: OkHttpClient, private val base: () -> String, private val token: suspend () -> String?) {
    var workContext: String? = null
    /** معرّف المستخدم الحالي؛ null = لا حفظ (قبل الدخول وبعد الخروج). */
    @Volatile var scope: String? = null
    var cache: ReadCache? = null
    /** وقت آخر بيانات محفوظة عُرضت بدل الحية؛ null = متصل. */
    val stale = MutableStateFlow<Long?>(null)

    private fun cacheable(method: String, path: String, auth: Boolean) = method == "GET" && auth && scope != null && cache != null && !path.startsWith("/auth/") && !path.startsWith("/files/")

    suspend fun request(method: String, path: String, body: JsonElement? = null, idem: String? = null, auth: Boolean = true): JsonObject = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base() + path).header("x-device", "android")
        if (auth) token()?.let { b.header("authorization", "Bearer $it") }
        idem?.let { b.header("idempotency-key", it) }
        workContext?.let { b.header("x-work-context", it) }
        val rb = body?.let { ApiJson.encodeToString(JsonElement.serializer(), it).toRequestBody(JSON) }
        b.method(method, rb ?: if (method == "POST" || method == "PATCH" || method == "PUT") "{}".toRequestBody(JSON) else null)
        val owner = scope
        val useCache = cacheable(method, path, auth)
        val res = try { client.newCall(b.build()).execute() } catch (e: IOException) {
            if (useCache) cache!!.get("$owner|$path")?.let { (json, at) ->
                runCatching { ApiJson.parseToJsonElement(json).jsonObject }.getOrNull()?.let { stale.value = at; return@withContext it }
            }
            throw ApiException(0, "NETWORK", "لا يوجد اتصال بالإنترنت، سنحاول مجدداً عند عودته")
        }
        res.use { r ->
            val text = r.body?.string().orEmpty()
            val obj = runCatching { ApiJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!r.isSuccessful) {
                val e = obj["error"] as? JsonObject
                throw ApiException(r.code, e?.get("code")?.jsonPrimitive?.contentOrNull ?: "ERROR", e?.get("message")?.jsonPrimitive?.contentOrNull ?: "حدث خطأ، حاول مرة أخرى", e?.get("details") as? JsonObject)
            }
            // لا نحفظ لو تغيّر المستخدم أثناء الطلب
            if (useCache && owner == scope) { cache!!.put("$owner|$path", text); stale.value = null }
            obj
        }
    }

    /** رفع ملف ثنائي (صور المنتجات المفرّغة). */
    suspend fun upload(path: String, bytes: ByteArray, contentType: String): JsonObject = withContext(Dispatchers.IO) {
        val b = Request.Builder().url(base() + path).header("x-device", "android").post(bytes.toRequestBody(contentType.toMediaType()))
        token()?.let { b.header("authorization", "Bearer $it") }
        val res = try { client.newCall(b.build()).execute() } catch (e: IOException) { throw ApiException(0, "NETWORK", "لا يوجد اتصال بالإنترنت") }
        res.use { r ->
            val obj = runCatching { ApiJson.parseToJsonElement(r.body?.string().orEmpty()).jsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!r.isSuccessful) {
                val e = obj["error"] as? JsonObject
                throw ApiException(r.code, e?.get("code")?.jsonPrimitive?.contentOrNull ?: "ERROR", e?.get("message")?.jsonPrimitive?.contentOrNull ?: "تعذّر رفع الملف")
            }
            obj
        }
    }

    suspend fun get(path: String) = request("GET", path)
    suspend fun post(path: String, body: JsonElement, idem: String? = null) = request("POST", path, body, idem)

    companion object { val JSON = "application/json; charset=utf-8".toMediaType() }
}
