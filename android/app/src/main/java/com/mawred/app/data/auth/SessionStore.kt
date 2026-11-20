package com.mawred.app.data.auth

/** تخزين الجلسة: الرموز مشفّرة، وبيانات المستخدم للعمل بلا نت. */
interface SessionStore {
    suspend fun load(): Pair<Tokens?, SessionUser?>
    suspend fun save(tokens: Tokens?, user: SessionUser?)
}

class MemorySessionStore : SessionStore {
    private var t: Tokens? = null
    private var u: SessionUser? = null
    override suspend fun load() = t to u
    override suspend fun save(tokens: Tokens?, user: SessionUser?) { t = tokens; u = user }
}
