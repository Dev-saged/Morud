package com.mawred.app.data.auth

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.mawred.app.data.api.ApiJson
import kotlinx.coroutines.flow.first

private val Context.sessionStore by preferencesDataStore("session")

class DataStoreSessionStore(private val context: Context, private val cipher: Cipherer) : SessionStore {
    private val kTokens = stringPreferencesKey("tokens")
    private val kUser = stringPreferencesKey("user")
    private val kLoginId = stringPreferencesKey("login_id")
    private val kRemember = booleanPreferencesKey("remember")

    override suspend fun loginPrefs(): LoginPrefs {
        val p = context.sessionStore.data.first()
        return LoginPrefs(p[kLoginId].orEmpty(), p[kRemember] ?: true)
    }

    override suspend fun saveLoginPrefs(p: LoginPrefs) {
        context.sessionStore.edit { e ->
            e[kRemember] = p.remember
            if (p.remember && p.identifier.isNotBlank()) e[kLoginId] = p.identifier else e.remove(kLoginId)
        }
    }

    override suspend fun load(): Pair<Tokens?, SessionUser?> {
        val p = context.sessionStore.data.first()
        val tokens = p[kTokens]?.let { cipher.decrypt(it) }?.let { runCatching { ApiJson.decodeFromString(Tokens.serializer(), it) }.getOrNull() }
        val user = p[kUser]?.let { runCatching { ApiJson.decodeFromString(SessionUser.serializer(), it) }.getOrNull() }
        return tokens to user
    }

    override suspend fun save(tokens: Tokens?, user: SessionUser?) {
        context.sessionStore.edit { p ->
            if (tokens == null) p.remove(kTokens) else p[kTokens] = cipher.encrypt(ApiJson.encodeToString(Tokens.serializer(), tokens))
            if (user == null) p.remove(kUser) else p[kUser] = ApiJson.encodeToString(SessionUser.serializer(), user)
        }
    }
}
