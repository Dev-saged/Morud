package com.mawred.app

import com.mawred.app.BuildConfig

/** المصدر الوحيد لهوية العميل وإعداداته؛ بيع نسخة لعميل جديد = تعديل هذا الملف فقط. */
object BrandConfig {
    const val NAME = "مورد"
    const val NAME_LATIN = "MAWRED"
    const val TAGLINE = "توريد بالجملة لمحلات غزة"
    const val CURRENCY_SYMBOL = "₪"
    const val TIMEZONE = "Asia/Gaza"
    const val BLUE_HEX = 0xFF1D4ED8
    const val ORANGE_HEX = 0xFFF08A24
    /** نص وأيقونات فوق البرتقالي في الوضعين (مطابق للويب). */
    const val ON_ACCENT_HEX = 0xFF1B1206
    val apiUrl: String get() = BuildConfig.API_URL.trimEnd('/')
    val firebaseApiKey: String get() = BuildConfig.FIREBASE_API_KEY
    val updateRepo: String get() = BuildConfig.UPDATE_REPO
    val modules = setOf("catalog", "cart", "orders", "statement", "admin.dashboard", "agent.tasks")
    val configured: Boolean get() = apiUrl.startsWith("https://") && firebaseApiKey.isNotBlank()
}
