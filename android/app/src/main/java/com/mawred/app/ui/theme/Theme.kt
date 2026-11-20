package com.mawred.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** ألوان مورد المشتقة من الشعار (spec/design-tokens.json). */
@Immutable
data class MawredColors(
    val primary: Color, val onPrimary: Color, val surface: Color, val raised: Color, val ink: Color, val mute: Color,
    val line: Color, val accent: Color, val accentInk: Color, val ok: Color, val danger: Color,
)

private fun pick(pair: Pair<String, String>, dark: Boolean) = Color(Oklch.parse(if (dark) pair.second else pair.first))

fun mawredColors(dark: Boolean) = with(DesignTokens) {
    MawredColors(pick(primary, dark), pick(onPrimary, dark), pick(surface, dark), pick(raised, dark), pick(ink, dark), pick(mute, dark),
        pick(line, dark), pick(accent, dark), pick(accentInk, dark), pick(ok, dark), pick(danger, dark))
}

val LocalMawred = staticCompositionLocalOf { mawredColors(false) }

object Mawred {
    val colors: MawredColors @Composable get() = LocalMawred.current
}

@Composable
fun MawredTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = mawredColors(dark)
    val scheme = if (dark) darkColorScheme(primary = c.primary, onPrimary = c.onPrimary, background = c.surface, surface = c.raised, onSurface = c.ink, onBackground = c.ink, outline = c.line, secondary = c.accent, error = c.danger)
    else lightColorScheme(primary = c.primary, onPrimary = c.onPrimary, background = c.surface, surface = c.raised, onSurface = c.ink, onBackground = c.ink, outline = c.line, secondary = c.accent, error = c.danger)
    CompositionLocalProvider(LocalMawred provides c, LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(colorScheme = scheme, typography = MawredType, shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(24.dp)), content = content)
    }
}
