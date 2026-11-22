package com.mawred.app

import com.mawred.app.data.CatalogRepository
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.auth.AuthRepository
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import com.mawred.app.data.api.ReadCache
import com.mawred.app.data.auth.LoginPrefs
import com.mawred.app.data.auth.IdentityRest
import com.mawred.app.data.auth.MemorySessionStore
import com.mawred.app.data.auth.SessionState
import com.mawred.app.data.auth.SessionUser
import com.mawred.app.data.auth.Tokens
import com.mawred.app.data.local.CacheDao
import com.mawred.app.data.local.CacheEntry
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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
import java.util.concurrent.TimeUnit

class NetworkTest {
    private lateinit var server: MockWebServer
    private val http = OkHttpClient.Builder().readTimeout(5, TimeUnit.SECONDS).build()
    private val user = """{"uid":"so1","displayName":"أبو أحمد","roles":["shop_owner"],"home":"shop.home","permissions":["shop.orders.submit"],"shopIds":["s1"],"mustChangePassword":false}"""
    private var now = 1_000_000L
    private val routes = mutableMapOf<String, () -> MockResponse>()

    @Before fun up() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = routes["${request.method} ${request.requestUrl!!.encodedPath}"]?.invoke() ?: MockResponse().setResponseCode(404).setBody("""{"error":{"code":"NOT_FOUND","message":"غير موجود"}}""")
        }
        server.start()
    }
    @After fun down() = server.shutdown()

    private fun base() = server.url("").toString().trimEnd('/')
    private fun ok(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setBody(body)

    private fun repo(store: MemorySessionStore = MemorySessionStore()): AuthRepository {
        val r = AuthRepository(store, IdentityRest(http, { "KEY" }, base(), base(), { now }), { now })
        r.api = Api(http, ::base) { r.idToken() }
        return r
    }

    @Test fun apiHeadersErrorsAndNetwork() = runTest {
        routes["POST /x"] = { ok("""{"error":{"code":"PRICE_CHANGED","message":"تغيّرت الأسعار"}}""", 409) }
        routes["GET /y"] = { ok("""{"a":1}""") }
        val api = Api(http, ::base) { "TOK" }
        api.workContext = "admin.finance"
        assertEquals("1", api.get("/y")["a"].toString())
        val req = server.takeRequest()
        assertEquals("Bearer TOK", req.getHeader("authorization"))
        assertEquals("admin.finance", req.getHeader("x-work-context"))
        assertEquals("android", req.getHeader("x-device"))
        val e = runCatching { api.post("/x", buildJsonObject { put("q", 1) }, "K1") }.exceptionOrNull() as ApiException
        assertEquals("PRICE_CHANGED", e.code); assertEquals(409, e.status); assertEquals("تغيّرت الأسعار", e.message)
        assertEquals("K1", server.takeRequest().getHeader("idempotency-key"))
        val dead = Api(http, { "http://127.0.0.1:1" }) { null }
        assertEquals("NETWORK", (runCatching { dead.get("/z") }.exceptionOrNull() as ApiException).code)
        routes["GET /bad"] = { ok("oops", 500) }
        assertEquals("ERROR", (runCatching { api.get("/bad") }.exceptionOrNull() as ApiException).code)
    }

    @Test fun loginExchangesCustomTokenAndRoutes() = runTest {
        routes["POST /auth/login"] = { ok("""{"customToken":"CT","user":$user}""") }
        routes["POST /v1/accounts:signInWithCustomToken"] = { ok("""{"idToken":"ID1","refreshToken":"R1","expiresIn":"3600"}""") }
        routes["GET /auth/me"] = { ok("""{"user":$user}""") }
        val store = MemorySessionStore()
        val r = repo(store)
        r.login(" 0599888777 ", "Secret123")
        val s = r.state.value as SessionState.SignedIn
        assertEquals("shop", s.user.area)
        assertEquals("ID1", r.idToken())
        assertEquals(Tokens("ID1", "R1", now + 3_600_000), store.load().first)
        val login = server.takeRequest()
        assertEquals("""{"identifier":"0599888777","password":"Secret123"}""", login.body.readUtf8())
        assertEquals(null, login.getHeader("authorization"))
        assertTrue(server.takeRequest().requestUrl.toString().contains("key=KEY"))
    }

    @Test fun refreshNearExpiryAndSignOutWhenRevoked() = runTest {
        val store = MemorySessionStore()
        store.save(Tokens("OLD", "R1", now + 30_000), SessionUser("u", "س"))
        routes["POST /v1/token"] = { ok("""{"id_token":"NEW","refresh_token":"R2","expires_in":"3600"}""") }
        routes["GET /auth/me"] = { ok("""{"user":$user}""") }
        val r = repo(store)
        r.restore()
        assertEquals("NEW", r.idToken())
        assertEquals("R2", store.load().first!!.refreshToken)
        assertEquals("أبو أحمد", (r.state.value as SessionState.SignedIn).user.displayName)
        now += 7_200_000
        routes["POST /v1/token"] = { ok("""{"error":{"message":"TOKEN_EXPIRED"}}""", 400) }
        assertEquals(null, r.idToken())
        assertEquals(SessionState.SignedOut, r.state.value)
        assertEquals(null to null, store.load())
    }

    @Test fun restoreOfflineKeepsSession() = runTest {
        val store = MemorySessionStore()
        store.save(Tokens("T", "R", now + 3_600_000), SessionUser("u", "س", home = "agent.tasks"))
        val r = AuthRepository(store, IdentityRest(http, { "KEY" }, base(), base(), { now }), { now })
        r.api = Api(http, { "http://127.0.0.1:1" }) { r.idToken() }
        r.restore()
        val s = r.state.value as SessionState.SignedIn
        assertTrue(s.offline); assertEquals("agent", s.user.area)
    }

    @Test fun changePasswordReissuesTokens() = runTest {
        routes["POST /auth/login"] = { ok("""{"customToken":"CT","user":${user.replace("false}", "true}")}}""") }
        routes["POST /v1/accounts:signInWithCustomToken"] = { ok("""{"idToken":"ID","refreshToken":"R","expiresIn":"3600"}""") }
        routes["POST /auth/change-password"] = { ok("""{"ok":true,"customToken":"CT2"}""") }
        routes["GET /auth/me"] = { ok("""{"user":$user}""") }
        val r = repo()
        r.login("x", "y")
        assertTrue((r.state.value as SessionState.SignedIn).user.mustChangePassword)
        r.changePassword("NewPass123")
        assertFalse((r.state.value as SessionState.SignedIn).user.mustChangePassword)
    }

    @Test fun catalogFallsBackToCache() = runTest {
        val cache = object : CacheDao {
            val m = mutableMapOf<String, CacheEntry>()
            override suspend fun get(key: String) = m[key]
            override suspend fun put(e: CacheEntry) { m[e.key] = e }
            override suspend fun clear() = m.clear()
            override suspend fun clearPrefix(prefix: String) { m.keys.removeAll { it.startsWith(prefix) } }
        }
        routes["GET /catalog"] = { ok("""{"products":[{"id":"p","name":"أرز","units":[{"unitId":"kg","factorToBase":1000,"price":500}]}],"categories":[],"units":[],"at":5}""") }
        val api = Api(http, ::base) { "T" }
        val fresh = CatalogRepository(api, cache) { 42 }.load()
        assertFalse(fresh.offline); assertEquals("أرز", fresh.data.products[0].name)
        val offline = CatalogRepository(Api(http, { "http://127.0.0.1:1" }) { null }, cache) { 99 }.load()
        assertTrue(offline.offline); assertEquals(42L, offline.cachedAt); assertEquals(1, offline.data.products.size)
        val empty = runCatching { CatalogRepository(Api(http, { "http://127.0.0.1:1" }) { null }, object : CacheDao by cache { override suspend fun get(key: String): CacheEntry? = null }).load() }
        assertEquals("NETWORK", (empty.exceptionOrNull() as ApiException).code)
    }

    @Test fun rememberMeOffKeepsSessionInMemoryOnly() = runTest {
        routes["POST /auth/login"] = { ok("""{"customToken":"CT","user":$user}""") }
        routes["POST /v1/accounts:signInWithCustomToken"] = { ok("""{"idToken":"ID1","refreshToken":"R1","expiresIn":"3600"}""") }
        val store = MemorySessionStore()
        val r = repo(store)
        r.login("0599888777", "Secret123", remember = false)
        assertTrue(r.state.value is SessionState.SignedIn)
        assertEquals("ID1", r.idToken())
        assertEquals("لا يُحفظ شيء على الجهاز", null to null, store.load())
        assertEquals(LoginPrefs("", false), store.loginPrefs())
        val r2 = repo(store)
        r2.login("0599888777", "Secret123", remember = true)
        assertEquals(LoginPrefs("0599888777", true), store.loginPrefs())
        assertEquals("ID1", store.load().first?.idToken)
    }

    @Test fun readCacheIsPerUserAndClearedOnLogout() = runTest {
        val m = mutableMapOf<String, Pair<String, Long>>()
        val cache = object : ReadCache {
            override suspend fun get(key: String) = m[key]
            override suspend fun put(key: String, json: String) { m[key] = json to 7L }
            override suspend fun clearScope(scope: String) { m.keys.removeAll { it.startsWith("$scope|") } }
            override suspend fun clearAll() = m.clear()
        }
        routes["GET /shops/s1/orders"] = { ok("""{"orders":[{"id":"o1"}]}""") }
        val live = Api(http, ::base) { "T" }.also { it.cache = cache; it.scope = "u1" }
        live.get("/shops/s1/orders")
        val dead = Api(http, { "http://127.0.0.1:1" }) { "T" }.also { it.cache = cache; it.scope = "u1" }
        assertEquals("o1", dead.get("/shops/s1/orders")["orders"]!!.jsonArray[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(7L, dead.stale.value)
        dead.scope = "u2"
        assertEquals("NETWORK", runCatching { dead.get("/shops/s1/orders") }.exceptionOrNull().let { (it as ApiException).code })
        cache.clearScope("u1")
        assertTrue(m.isEmpty())
        m["u7|/x"] = "{}" to 1L
        val fresh = repo(MemorySessionStore())
        fresh.api.cache = cache
        fresh.restore()
        assertTrue("فتح التطبيق بلا جلسة يمسح النسخ المحفوظة", m.isEmpty())
    }

    @Test fun mfaLoginReturnsTicketThenCodeCompletes() = runTest {
        routes["POST /auth/login"] = { ok("""{"mfaRequired":true,"ticket":"${"a".repeat(48)}"}""") }
        routes["POST /auth/login/mfa"] = { ok("""{"customToken":"CT","user":$user}""") }
        routes["POST /v1/accounts:signInWithCustomToken"] = { ok("""{"idToken":"ID1","refreshToken":"R1","expiresIn":"3600"}""") }
        val r = repo(MemorySessionStore())
        val ticket = r.login("owner", "Secret123")
        assertEquals("a".repeat(48), ticket)
        assertTrue("لا جلسة قبل الرمز", r.state.value !is SessionState.SignedIn)
        r.loginMfa(ticket!!, "123456", "owner", true)
        assertTrue(r.state.value is SessionState.SignedIn)
        assertEquals("ID1", r.idToken())
    }
}
