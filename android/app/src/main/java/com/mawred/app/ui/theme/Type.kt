package com.mawred.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp
import com.mawred.app.R

@OptIn(ExperimentalTextApi::class)
private fun alex(w: Int) = Font(R.font.alexandria, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
val Display = FontFamily(alex(500), alex(600), alex(700), alex(800))
val Body = FontFamily(Font(R.font.plex_arabic_regular, FontWeight.Normal), Font(R.font.plex_arabic_medium, FontWeight.Medium), Font(R.font.plex_arabic_semibold, FontWeight.SemiBold), Font(R.font.plex_arabic_bold, FontWeight.Bold))

private val lh = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)
private fun d(size: Int, w: FontWeight) = TextStyle(fontFamily = Display, fontWeight = w, fontSize = size.sp, lineHeight = (size * 1.3).sp, lineHeightStyle = lh)
private fun b(size: Int, w: FontWeight = FontWeight.Normal) = TextStyle(fontFamily = Body, fontWeight = w, fontSize = size.sp, lineHeight = (size * 1.6).sp, lineHeightStyle = lh)

/** أرقام جدولية في القوائم والمؤشرات. */
val Tabular = TextStyle(fontFeatureSettings = "tnum")

val MawredType = Typography(
    displaySmall = d(34, FontWeight.Bold), headlineMedium = d(26, FontWeight.Bold), headlineSmall = d(22, FontWeight.SemiBold),
    titleLarge = d(20, FontWeight.SemiBold), titleMedium = b(17, FontWeight.SemiBold), titleSmall = b(15, FontWeight.SemiBold),
    bodyLarge = b(17), bodyMedium = b(15), bodySmall = b(13), labelLarge = b(15, FontWeight.SemiBold), labelMedium = b(13, FontWeight.Medium), labelSmall = b(12, FontWeight.Medium),
)
