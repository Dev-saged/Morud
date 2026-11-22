package com.mawred.app.data.auth

/** تخزين الجلسة: الرموز مشفّرة، وبيانات المستخدم للعمل بلا نت. */
interface SessionStore {
    suspend fun load(): Pair<Tokens?, SessionUser?>
    suspend fun save(tokens: Tokens?, user: SessionUser?)
    /** تذكرني: المعرّف وخيار التذكر فقط، لا كلمة مرور أبداً. */
    suspend fun loginPrefs(): LoginPrefs
    suspend fun saveLoginPrefs(p: LoginPrefs)
}

data class LoginPrefs(val identifier: String = "", val remember: Boolean = true)

class MemorySessionStore : SessionStore {
    private var t: Tokens? = null
    private var u: SessionUser? = null
    override suspend fun load() = t to u
    override suspend fun save(tokens: Tokens?, user: SessionUser?) { t = tokens; u = user }
    private var prefs = LoginPrefs()
    override suspend fun loginPrefs() = prefs
    override suspend fun saveLoginPrefs(p: LoginPrefs) { prefs = p }
}
