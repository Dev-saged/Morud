package com.mawred.app.ui.common

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular

/** هل فعّل المستخدم «إزالة الحركات»؟ (يعطّل الحركة والاهتزاز). */
@Composable
fun reducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/** خلفية حيّة: نقاط برتقالية تنجرف ببطء على أزرق مورد. */
@Composable
fun AliveBackground(modifier: Modifier = Modifier) {
    val c = Mawred.colors
    val still = reducedMotion()
    val t by rememberInfiniteTransition(label = "drift").animateFloat(0f, 1f, infiniteRepeatable(tween(18_000, easing = LinearEasing), RepeatMode.Restart), label = "t")
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.verticalGradient(listOf(c.primary, c.primary.copy(alpha = 0.86f))))
        val step = 48.dp.toPx()
        val shift = if (still) 0f else t * step
        var y = -step
        while (y < size.height + step) {
            var x = -step
            while (x < size.width + step) {
                drawCircle(c.accent.copy(alpha = 0.32f), radius = 2.5.dp.toPx(), center = Offset(x + shift, y + shift * 2 % step))
                x += step
            }
            y += step
        }
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick, modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = enabled, shape = RoundedCornerShape(50), colors = ButtonDefaults.buttonColors(containerColor = Mawred.colors.primary, contentColor = Mawred.colors.onPrimary)) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun ErrorText(text: String?) {
    if (text != null) Text(text, color = Mawred.colors.danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 6.dp))
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().background(Mawred.colors.raised, RoundedCornerShape(16.dp)).border(1.dp, Mawred.colors.line, RoundedCornerShape(16.dp)).padding(16.dp)) { content() }
}

@Composable
fun Kpi(label: String, value: String, modifier: Modifier = Modifier, alert: Boolean = false) {
    Card(modifier) {
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = if (alert) Mawred.colors.danger else Mawred.colors.mute)
            Text(value, style = MaterialTheme.typography.headlineSmall.merge(Tabular), color = if (alert) Mawred.colors.danger else Mawred.colors.ink)
        }
    }
}

/** خط صغير للاتجاه بدون مكتبات رسوم. */
@Composable
fun Sparkline(values: List<Long>, modifier: Modifier = Modifier) {
    val color = Mawred.colors.primary
    Canvas(modifier.fillMaxWidth().height(48.dp)) {
        if (values.isEmpty()) return@Canvas
        val max = (values.maxOrNull() ?: 1L).coerceAtLeast(1L).toFloat()
        val dx = size.width / (values.size - 1).coerceAtLeast(1)
        val p = Path()
        values.forEachIndexed { i, v -> val pt = Offset(i * dx, size.height - v / max * (size.height - 4)); if (i == 0) p.moveTo(pt.x, pt.y) else p.lineTo(pt.x, pt.y) }
        drawPath(p, color, style = Stroke(width = 2.dp.toPx()))
    }
}

/** هيكل تحميل بدلاً من الدوّار. */
@Composable
fun Skeleton(modifier: Modifier = Modifier) {
    val a by rememberInfiniteTransition(label = "sk").animateFloat(0.35f, 0.8f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
    Box(modifier.fillMaxWidth().height(96.dp).alpha(a).background(Mawred.colors.line, RoundedCornerShape(16.dp)))
}

@Composable
fun Empty(text: String) {
    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { Text(text, color = Mawred.colors.mute, style = MaterialTheme.typography.bodyLarge) }
}

@Composable
fun Notice(text: String, action: String? = null, onAction: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(Mawred.colors.accent.copy(alpha = 0.14f), RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.alert, null, tint = Mawred.colors.accentInk)
        Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = Mawred.colors.ink)
        if (action != null) TextButton(onAction) { Text(action, color = Mawred.colors.primary) }
    }
}

