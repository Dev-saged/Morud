package com.mawred.app.data.auth

import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.ApiJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

sealed interface SessionState {
    data object Loading : SessionState
    data object SignedOut : SessionState
    data class SignedIn(val user: SessionUser, val offline: Boolean = false) : SessionState
}

/** Identity Toolkit عبر REST: تبادل الرمز المخصص من الخادم بـ idToken + refreshToken، بلا SDK. */
class IdentityRest(private val client: OkHttpClient, private val apiKey: () -> String, private val idtBase: String = "https://identitytoolkit.googleapis.com", private val stsBase: String = "https://securetoken.googleapis.com", private val now: () -> Long = System::currentTimeMillis) {
    suspend fun exchange(customToken: String): Tokens = call(
        Request.Builder().url("$idtBase/v1/accounts:signInWithCustomToken?key=${apiKey()}")
            .post(buildJsonObject { put("token", customToken); put("returnSecureToken", true) }.toString().toRequestBody(Api.JSON)).build(),
    ) { o -> Tokens(o.str("idToken"), o.str("refreshToken"), now() + o.str("expiresIn").toLong() * 1000) }

    suspend fun refresh(refreshToken: String): Tokens = call(
        Request.Builder().url("$stsBase/v1/token?key=${apiKey()}").post(FormBody.Builder().add("grant_type", "refresh_token").add("refresh_token", refreshToken).build()).build(),
    ) { o -> Tokens(o.str("id_token"), o.str("refresh_token"), now() + o.str("expires_in").toLong() * 1000) }

    private suspend fun <T> call(req: Request, map: (JsonObject) -> T): T = withContext(Dispatchers.IO) {
        val res = try { client.newCall(req).execute() } catch (e: IOException) { throw ApiException(0, "NETWORK", "لا يوجد اتصال بالإنترنت") }
        res.use { r ->
            val o = runCatching { ApiJson.parseToJsonElement(r.body?.string().orEmpty()).jsonObject }.getOrNull() ?: JsonObject(emptyMap())
            if (!r.isSuccessful) throw ApiException(r.code, "UNAUTHENTICATED", "انتهت الجلسة، سجّل الدخول من جديد")
            map(o)
        }
    }

    private fun JsonObject.str(k: String) = this[k]?.jsonPrimitive?.content ?: throw ApiException(500, "BAD_RESPONSE", "استجابة غير متوقعة من خدمة الدخول")
}

class AuthRepository(private val store: SessionStore, private val identity: IdentityRest, private val now: () -> Long = System::currentTimeMillis) {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state
    private var tokens: Tokens? = null
    private val lock = Mutex()
    lateinit var api: Api
    /** false = الجلسة في الذاكرة فقط وتنتهي بإغلاق التطبيق. */
    private var remember = true

    private suspend fun persist(t: Tokens?, u: SessionUser?) { if (remember) store.save(t, u) else store.save(null, null) }

    private fun signedIn(u: SessionUser, offline: Boolean = false) {
        api.scope = u.uid
        _state.value = SessionState.SignedIn(u, offline)
    }

    suspend fun loginPrefs() = store.loginPrefs()

    /** رمز صالح لدقيقة على الأقل؛ يُحدَّث تلقائياً. */
    suspend fun idToken(): String? = lock.withLock {
        val t = tokens ?: return null
        if (t.expiresAt - now() > 60_000) return t.idToken
        return try {
            identity.refresh(t.refreshToken).also { tokens = it; persist(it, (state.value as? SessionState.SignedIn)?.user) }.idToken
        } catch (e: ApiException) {
            if (e.code == "NETWORK") t.idToken else { signOutLocal(); null }
        }
    }

    suspend fun restore() {
        val (t, u) = store.load()
        tokens = t
        // بلا جلسة محفوظة (خروج أو «بدون تذكر»): لا تبقى بيانات أي حساب سابق على جهاز قد يكون مشتركاً
        if (t == null || u == null) { api.cache?.clearAll(); _state.value = SessionState.SignedOut; return }
        signedIn(u, offline = true)
        refreshUser()
    }

    suspend fun refreshUser() {
        try {
            val u = ApiJson.decodeFromJsonElement(SessionUser.serializer(), api.get("/auth/me")["user"]!!)
            persist(tokens, u)
            signedIn(u)
        } catch (e: ApiException) {
            if (e.status == 401 || e.status == 403) signOutLocal()
        }
    }

    /** يرجع تذكرة إن كان الحساب يطلب رمز التحقق بخطوتين، وإلا يُكمل الدخول ويرجع null. */
    suspend fun login(identifier: String, password: String, remember: Boolean = true): String? {
        val r = api.request("POST", "/auth/login", buildJsonObject { put("identifier", identifier.trim()); put("password", password) }, auth = false)
        if (r["mfaRequired"]?.jsonPrimitive?.content == "true") return r["ticket"]!!.jsonPrimitive.content
        complete(r, identifier, remember)
        return null
    }

    suspend fun loginMfa(ticket: String, code: String, identifier: String, remember: Boolean) {
        val r = api.request("POST", "/auth/login/mfa", buildJsonObject { put("ticket", ticket); put("code", code) }, auth = false)
        complete(r, identifier, remember)
    }

    private suspend fun complete(r: kotlinx.serialization.json.JsonObject, identifier: String, remember: Boolean) {
        val t = identity.exchange(r["customToken"]!!.jsonPrimitive.content)
        val u = ApiJson.decodeFromJsonElement(SessionUser.serializer(), r["user"]!!)
        tokens = t
        this.remember = remember
        store.saveLoginPrefs(LoginPrefs(if (remember) identifier.trim() else "", remember))
        persist(t, u)
        signedIn(u)
    }

    suspend fun changePassword(newPassword: String) {
        val r = api.post("/auth/change-password", buildJsonObject { put("newPassword", newPassword) })
        tokens = identity.exchange(r["customToken"]!!.jsonPrimitive.content)
        refreshUser()
    }

    suspend fun forgot(identifier: String) { api.request("POST", "/auth/forgot", buildJsonObject { put("identifier", identifier.trim()) }, auth = false) }

    suspend fun logout() = signOutLocal()

    private suspend fun signOutLocal() {
        val uid = (state.value as? SessionState.SignedIn)?.user?.uid
        tokens = null
        api.scope = null
        store.save(null, null)
        uid?.let { api.cache?.clearScope(it) }
        api.stale.value = null
        _state.value = SessionState.SignedOut
    }
}
