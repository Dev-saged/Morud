package com.mawred.app.data.auth

import kotlinx.serialization.Serializable

@Serializable
data class SessionUser(
    val uid: String,
    val displayName: String,
    val roles: List<String> = emptyList(),
    val home: String = "",
    val permissions: List<String> = emptyList(),
    val shopIds: List<String> = emptyList(),
    val mustChangePassword: Boolean = false,
) {
    val area: String get() = home.substringBefore('.')
    fun can(p: String) = p in permissions
}

@Serializable data class Tokens(val idToken: String, val refreshToken: String, val expiresAt: Long)
