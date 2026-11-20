package com.mawred.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mawred.app.BrandConfig
import com.mawred.app.BuildConfig
import com.mawred.app.data.auth.SessionState
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.DesignTokens
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Oklch
import com.mawred.app.ui.theme.Tabular
import com.mawred.app.update.UpdateInfo

/** شاشة #test المخفية (7 نقرات على الشعار): حالة البناء والإعداد والجلسة والتباين والأيقونات. */
@Composable
fun TestScreen(session: SessionState, update: UpdateInfo?, close: () -> Unit) {
    val rows = listOf(
        "الإصدار" to "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
        "نوع البناء" to BuildConfig.BUILD_TYPE,
        "الخادم" to BrandConfig.apiUrl.ifBlank { "غير مهيأ" },
        "مفتاح Firebase" to if (BrandConfig.firebaseApiKey.isBlank()) "غير مهيأ" else "مهيأ",
        "الجلسة" to when (session) { is SessionState.SignedIn -> "${session.user.displayName} · ${session.user.home}${if (session.offline) " (بلا اتصال)" else ""}"; SessionState.SignedOut -> "خارج"; SessionState.Loading -> "تحميل" },
        "التحديث" to (update?.let { "متاح ${it.version} (${it.build})" } ?: "لا جديد"),
    )
    val c = Mawred.colors
    val pairs = listOf("ink/surface" to (c.ink to c.surface), "mute/surface" to (c.mute to c.surface), "onPrimary/primary" to (c.onPrimary to c.primary), "accentInk/accent" to (c.accentInk to c.accent), "danger/raised" to (c.danger to c.raised))
    LazyColumn(Modifier.fillMaxSize().background(c.surface).statusBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Row(verticalAlignment = Alignment.CenterVertically) { Text("#test", Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium); TextButton(close) { Text("إغلاق") } } }
        items(rows) { (k, v) -> Row { Text(k, Modifier.weight(1f), color = c.mute); Text(v, style = MaterialTheme.typography.bodyMedium.merge(Tabular)) } }
        item { Text("التباين (≥ 4.5)", style = MaterialTheme.typography.titleMedium) }
        items(pairs) { (n, p) ->
            val ratio = Oklch.contrast(p.first.toArgbInt(), p.second.toArgbInt())
            Row(Modifier.fillMaxWidth().background(p.second, RoundedCornerShape(8.dp)).padding(8.dp)) { Text(n, Modifier.weight(1f), color = p.first); Text("%.2f".format(ratio), color = p.first, style = Tabular) }
        }
        item { Text("الرموز (${DesignTokens::class.simpleName})", style = MaterialTheme.typography.titleMedium) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { listOf(c.primary, c.accent, c.ink, c.mute, c.line, c.ok, c.danger).forEach { Box(Modifier.size(32.dp).background(it, RoundedCornerShape(8.dp))) } } }
        item { Text("الأيقونات (${Icons.all.size})", style = MaterialTheme.typography.titleMedium) }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Icons.all.values.take(14).forEach { Icon(it, null, tint = c.ink) } } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Icons.all.values.drop(14).forEach { Icon(it, null, tint = c.ink) } } }
    }
}

private fun Color.toArgbInt(): Int = (0xFF shl 24) or ((red * 255).toInt() shl 16) or ((green * 255).toInt() shl 8) or (blue * 255).toInt()
