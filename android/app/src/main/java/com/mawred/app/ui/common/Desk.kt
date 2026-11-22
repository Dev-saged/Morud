package com.mawred.app.ui.common

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.Display
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

fun greeting(h: Int = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) = when { h < 5 -> "مساء الخير"; h < 12 -> "صباح الخير"; h < 17 -> "نهارك سعيد"; else -> "مساء الخير" }

private val HERO_A = Color(0xFF1E40AF)
private val HERO_B = Color(0xFF172554)
private val GLOW = Color(0xFFF08A24)

/** رأس اللوحة الفاخر: تدرّج أزرق عميق، توهّج برتقالي ينجرف ببطء، تحية باسم المستخدم وتاريخ اليوم. */
@Composable
fun DeskHero(name: String, subtitle: String?, content: @Composable ColumnScope.() -> Unit = {}) {
    val still = reducedMotion()
    val t = rememberInfiniteTransition(label = "hero")
    val drift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(14000, easing = LinearEasing), RepeatMode.Reverse), label = "drift")
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(HERO_A, HERO_B)))) {
        Canvas(Modifier.matchParentSize()) {
            val d = if (still) .3f else drift
            drawCircle(Brush.radialGradient(listOf(GLOW.copy(alpha = .45f), Color.Transparent), center = Offset(size.width * (.15f + .2f * d), size.height * (.1f + .4f * d)), radius = size.width * .55f), radius = size.width * .55f, center = Offset(size.width * (.15f + .2f * d), size.height * (.1f + .4f * d)))
        }
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(SimpleDateFormat("EEEE، d MMMM", Locale("ar")).format(Date()), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = .75f))
            Text("${greeting()}، ${name.substringBefore(' ')}", style = MaterialTheme.typography.headlineSmall.copy(fontFamily = Display, fontWeight = FontWeight.Bold), color = Color.White)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = .85f)) }
            content()
        }
    }
}

/** رقم كبير داخل الرأس. */
@Composable
fun HeroStat(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = .75f))
        Text(value, style = MaterialTheme.typography.headlineSmall.merge(Tabular).copy(fontFamily = Display, fontWeight = FontWeight.Bold), color = Color.White, maxLines = 1)
    }
}

/** بطاقة مؤشر: أيقونة في مربع ملوّن، القيمة، تلميح، خط اتجاه اختياري؛ قابلة للنقر حين تفتح تفاصيل. */
@Composable
fun DeskTile(icon: ImageVector, label: String, value: String, tone: Color, modifier: Modifier = Modifier, hint: String? = null, spark: List<Long>? = null, alert: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = Mawred.colors
    val shape = RoundedCornerShape(18.dp)
    val bg = if (alert) c.danger.copy(alpha = .07f) else c.raised
    var m = modifier.fillMaxWidth().heightIn(min = 92.dp).clip(shape).background(bg).border(1.dp, if (alert) c.danger.copy(alpha = .5f) else c.line, shape)
    if (onClick != null) m = m.clickable(onClickLabel = "عرض التفاصيل", role = Role.Button, onClick = onClick)
    Row(m.padding(14.dp).semantics(mergeDescendants = true) { contentDescription = "$label: $value" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(tone.copy(alpha = .13f)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(20.dp), tint = tone) }
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = c.mute, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(value, style = MaterialTheme.typography.titleLarge.merge(Tabular).copy(fontFamily = Display, fontWeight = FontWeight.Bold), color = if (alert) c.danger else c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = c.mute, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        spark?.let { AreaSpark(it, Modifier.width(64.dp).height(34.dp)) }
        if (onClick != null) Icon(Icons.chevron, null, Modifier.size(14.dp).graphicsLayer { scaleX = -1f; alpha = .45f }, tint = c.mute)
    }
}

/** خط اتجاه بمساحة متدرّجة. */
@Composable
fun AreaSpark(values: List<Long>, modifier: Modifier = Modifier, color: Color = Mawred.colors.primary) {
    if (values.isEmpty()) return
    Canvas(modifier) {
        val max = (values.maxOrNull() ?: 1L).coerceAtLeast(1L).toFloat()
        val step = if (values.size > 1) size.width / (values.size - 1) else size.width
        val pts = values.mapIndexed { i, v -> Offset(size.width - i * step, size.height - (v / max) * size.height * .9f) }
        val line = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
        val area = Path().apply { addPath(line); lineTo(pts.last().x, size.height); lineTo(pts.first().x, size.height); close() }
        drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = .28f), Color.Transparent)))
        drawPath(line, color, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
    }
}

data class DonutPart(val key: String, val label: String, val value: Long, val color: Color)

/** توزيع حلقي للطلبات المفتوحة؛ كل بند في المفتاح يفتح قائمته. */
@Composable
fun Donut(parts: List<DonutPart>, onPick: ((String) -> Unit)?) {
    val c = Mawred.colors
    val sum = parts.sumOf { it.value }.coerceAtLeast(0)
    val grow by animateFloatAsState(1f, spring(stiffness = Spring.StiffnessVeryLow), label = "donut")
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(Modifier.size(128.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val w = 16.dp.toPx()
                drawArc(c.line, 0f, 360f, false, topLeft = Offset(w / 2, w / 2), size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w))
                var start = -90f
                if (sum > 0) parts.filter { it.value > 0 }.forEach { p ->
                    val sweep = 360f * p.value / sum * grow
                    drawArc(p.color, start, (sweep - 2f).coerceAtLeast(.5f), false, topLeft = Offset(w / 2, w / 2), size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w))
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$sum", style = MaterialTheme.typography.headlineSmall.merge(Tabular).copy(fontFamily = Display, fontWeight = FontWeight.Bold), color = c.ink)
                Text("مفتوح", style = MaterialTheme.typography.labelSmall, color = c.mute)
            }
        }
        Column(Modifier.weight(1f)) {
            parts.forEach { p ->
                Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clip(RoundedCornerShape(10.dp)).then(if (onPick != null) Modifier.clickable { onPick(p.key) } else Modifier).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(p.color))
                    Text(p.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = c.ink, maxLines = 1)
                    Text("${p.value}", style = MaterialTheme.typography.titleSmall.merge(Tabular), color = c.ink)
                }
            }
        }
    }
}

/** حلقة نسبة صغيرة (الحد الائتماني المتاح). */
@Composable
fun MiniRing(value: Float, track: Color, color: Color, label: String, modifier: Modifier = Modifier.size(58.dp)) {
    val v by animateFloatAsState(value.coerceIn(0f, 1f), spring(stiffness = Spring.StiffnessLow), label = "ring")
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = 6.dp.toPx()
            drawArc(track, 0f, 360f, false, topLeft = Offset(w / 2, w / 2), size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w))
            drawArc(color, -90f, 360f * v, false, topLeft = Offset(w / 2, w / 2), size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round))
        }
        Text(label, style = MaterialTheme.typography.labelMedium.merge(Tabular), color = Color.White, fontWeight = FontWeight.Bold)
    }
}

/** بطاقة قسم بعنوان. */
@Composable
fun Panel(title: String, trailing: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = Mawred.colors
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium.copy(fontFamily = Display), color = c.ink)
            trailing?.let { Text(it, style = MaterialTheme.typography.labelMedium.merge(Tabular), color = c.mute) }
        }
        Spacer(Modifier.height(2.dp))
        content()
    }
}

/** سطر قائمة غني: حرف أول في دائرة، عنوان وتفاصيل، شارة، ومبلغ. */
@Composable
fun RichRow(initial: String, title: String, sub: String? = null, amount: String? = null, chip: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    val c = Mawred.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(12.dp)).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(c.primary.copy(alpha = .11f)), contentAlignment = Alignment.Center) { Text(initial.take(1), style = MaterialTheme.typography.titleSmall, color = c.primary, fontWeight = FontWeight.Bold) }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, style = MaterialTheme.typography.bodySmall.merge(Tabular), color = c.mute, maxLines = 1) }
        }
        chip?.invoke()
        amount?.let { Text(it, style = MaterialTheme.typography.titleSmall.merge(Tabular), color = c.ink) }
    }
}
