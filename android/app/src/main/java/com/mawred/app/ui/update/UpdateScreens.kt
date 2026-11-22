package com.mawred.app.ui.update

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.AskNotifyWhen
import com.mawred.app.ui.common.PrimaryButton
import com.mawred.app.ui.common.reducedMotion
import com.mawred.app.ui.theme.Display
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import com.mawred.app.update.Bytes
import com.mawred.app.update.NotesSection
import com.mawred.app.update.ReleaseNotes
import com.mawred.app.update.UpdatePhase
import com.mawred.app.update.UpdatePrefs

private fun UpdatePhase.fraction(): Float = when (this) {
    is UpdatePhase.Downloading -> progress.fraction
    is UpdatePhase.Waiting -> if (info.size > 0) (done.toFloat() / info.size).coerceIn(0f, 1f) else 0f
    is UpdatePhase.Available -> if (info.size > 0) (partial.toFloat() / info.size).coerceIn(0f, 1f) else 0f
    is UpdatePhase.Verifying, is UpdatePhase.Ready -> 1f
    else -> 0f
}

/** شريط مضغوط أعلى أي شاشة: يظهر فقط حين يوجد ما يستحق (إصدار، تنزيل جارٍ، جاهز). */
@Composable
fun UpdateBanner(phase: UpdatePhase, onOpen: () -> Unit, onInstall: () -> Unit) {
    val info = UpdateViewModel.infoOf(phase) ?: return
    if (phase is UpdatePhase.Failed && phase.info == null) return
    val ready = phase is UpdatePhase.Ready
    val bg by animateColorAsState(if (ready) Mawred.colors.ok.copy(alpha = .14f) else Mawred.colors.primary.copy(alpha = .10f), label = "bg")
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(18.dp)).background(bg).clickable(onClickLabel = "تفاصيل التحديث", onClick = onOpen)
            .padding(horizontal = 12.dp, vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        MiniRing(phase.fraction(), ready, phase is UpdatePhase.Downloading || phase is UpdatePhase.Verifying)
        Column(Modifier.weight(1f)) {
            Text(when (phase) {
                is UpdatePhase.Ready -> "مورد ${info.version} جاهز للتثبيت"
                is UpdatePhase.Downloading -> "يُنزَّل ${info.version} — ${(phase.progress.fraction * 100).toInt()}٪"
                is UpdatePhase.Verifying -> "نتحقق من سلامة الملف…"
                is UpdatePhase.Waiting -> phase.reason
                is UpdatePhase.Failed -> "تعذّر التنزيل — اضغط للمحاولة"
                else -> "إصدار جديد ${info.version} متاح"
            }, style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink, maxLines = 1)
            Text(when (phase) {
                is UpdatePhase.Downloading -> listOfNotNull(Bytes.of(phase.progress.done) + (if (phase.progress.total > 0) " / " + Bytes.of(phase.progress.total) else ""), phase.progress.etaSec.takeIf { it >= 0 }?.let { "يتبقى " + Bytes.eta(it) }).joinToString(" · ")
                is UpdatePhase.Ready -> "ثبّته الآن أو متى ناسبك"
                else -> if (info.size > 0) "الحجم ${Bytes.of(info.size)} · ينزل بالخلفية" else "ينزل بالخلفية"
            }, style = MaterialTheme.typography.bodySmall.merge(Tabular), color = Mawred.colors.mute, maxLines = 1)
        }
        if (ready) TextButton(onInstall) { Text("ثبّت", color = Mawred.colors.primary, fontWeight = FontWeight.Bold) }
        else Icon(Icons.chevron, null, Modifier.size(16.dp), tint = Mawred.colors.mute)
    }
}

@Composable
private fun MiniRing(f: Float, done: Boolean, spinning: Boolean) {
    val c = Mawred.colors
    val anim by animateFloatAsState(f, spring(stiffness = Spring.StiffnessLow), label = "mini")
    val spin = rememberInfiniteTransition(label = "spin")
    val rot by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "rot")
    val still = reducedMotion()
    Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = 3.5.dp.toPx()
            drawArc(c.line, 0f, 360f, false, style = Stroke(w))
            rotate(if (spinning && !still && anim == 0f) rot else 0f) {
                drawArc(if (done) c.ok else c.primary, -90f, if (anim == 0f && spinning) 70f else 360f * anim, false, style = Stroke(w, cap = StrokeCap.Round))
            }
        }
        Icon(if (done) Icons.check else Icons.download, null, Modifier.size(16.dp), tint = if (done) c.ok else c.primary)
    }
}

/** مركز التحديث: حلقة تقدّم حيّة، خطوات المسار، تفاصيل الإصدار، والتحكم الكامل بالتنزيل والتثبيت. */
@Composable
fun UpdateCenter(vm: UpdateViewModel, close: () -> Unit) {
    val phase by vm.phase.collectAsStateWithLifecycle()
    val prefs by vm.prefs.collectAsStateWithLifecycle()
    val notes by vm.notes.collectAsStateWithLifecycle()
    val haptic = LocalHapticFeedback.current
    val still = reducedMotion()
    LaunchedEffect(phase is UpdatePhase.Ready) { if (phase is UpdatePhase.Ready && !still) haptic.performHapticFeedback(HapticFeedbackType.LongPress) }
    LaunchedEffect(Unit) { if (phase is UpdatePhase.Idle) vm.check() }
    var askNotify by remember { mutableStateOf(false) }
    AskNotifyWhen(askNotify)
    val info = UpdateViewModel.infoOf(phase)
    val c = Mawred.colors
    Column(Modifier.fillMaxSize().background(c.surface).statusBarsPadding().navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(close) { Text("‹ رجوع", color = c.primary) }
            Spacer(Modifier.weight(1f))
            Text("التحديثات", style = MaterialTheme.typography.titleMedium, color = c.ink)
            Spacer(Modifier.weight(1f)); Spacer(Modifier.width(72.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Spacer(Modifier.height(8.dp))
            HeroRing(phase)
            Spacer(Modifier.height(16.dp))
            AnimatedContent(phase::class, transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) }, label = "title") { _ ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(title(phase, vm.manager.currentVersion), style = MaterialTheme.typography.headlineSmall.copy(fontFamily = Display, fontWeight = FontWeight.Bold), color = c.ink)
                    Spacer(Modifier.height(4.dp))
                    Text(subtitle(phase, vm.manager.currentVersion, vm.manager.currentBuild, vm.manager.lastCheck), style = MaterialTheme.typography.bodyMedium.merge(Tabular), color = c.mute, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
            if (info != null) { Spacer(Modifier.height(18.dp)); Steps(phase) }
            Spacer(Modifier.height(20.dp))
            Actions(phase, vm) { askNotify = true }
            notes?.let { if (it.sections.isNotEmpty()) { Spacer(Modifier.height(20.dp)); NotesCard(it) } }
            Spacer(Modifier.height(16.dp))
            SettingsCard(prefs, vm::setPrefs)
            Spacer(Modifier.height(12.dp))
            StorageCard(vm)
            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun title(p: UpdatePhase, current: String) = when (p) {
    UpdatePhase.Idle, UpdatePhase.Checking -> "نبحث عن إصدار أحدث…"
    is UpdatePhase.UpToDate -> "تطبيقك محدّث"
    is UpdatePhase.Available -> "مورد ${p.info.version}"
    is UpdatePhase.Downloading -> "${(p.progress.fraction * 100).toInt()}٪"
    is UpdatePhase.Waiting -> "مورد ${p.info.version}"
    is UpdatePhase.Verifying -> "نتحقق من سلامة الملف"
    is UpdatePhase.Ready -> "جاهز للتثبيت"
    is UpdatePhase.Failed -> p.info?.let { "مورد ${it.version}" } ?: "مورد $current"
}

private fun subtitle(p: UpdatePhase, current: String, build: Int, checked: Long): String = when (p) {
    UpdatePhase.Idle, UpdatePhase.Checking -> "الإصدار الحالي $current"
    is UpdatePhase.UpToDate -> "الإصدار $current · بناء $build · آخر فحص ${ago(p.checkedAt)}"
    is UpdatePhase.Available -> "من $current إلى ${p.info.version}" + (if (p.info.size > 0) " · ${Bytes.of(p.info.size)}" else "") + (if (p.partial > 0) " · نُزّل ${Bytes.of(p.partial)} سابقاً" else "")
    is UpdatePhase.Downloading -> listOfNotNull(Bytes.of(p.progress.done) + (if (p.progress.total > 0) " من " + Bytes.of(p.progress.total) else ""), p.progress.bytesPerSec.takeIf { it > 0 }?.let { Bytes.of(it) + "/ث" }, p.progress.etaSec.takeIf { it >= 0 }?.let { "يتبقى " + Bytes.eta(it) }).joinToString(" · ")
    is UpdatePhase.Waiting -> p.reason + (if (p.done > 0) " · نُزّل ${Bytes.of(p.done)}" else "")
    is UpdatePhase.Verifying -> "مطابقة الحجم وبصمة SHA-256 مع الإصدار المنشور"
    is UpdatePhase.Ready -> "مورد ${p.info.version} نُزّل وتحقّقنا منه. لن يضيع لو أغلقت التطبيق."
    is UpdatePhase.Failed -> p.message
}.let { if (checked == 0L || p !is UpdatePhase.UpToDate) it else it }

private fun ago(t: Long): String {
    val m = ((System.currentTimeMillis() - t) / 60_000).coerceAtLeast(0)
    return when { m < 1 -> "الآن"; m < 60 -> "قبل $m د"; m < 1440 -> "قبل ${m / 60} س"; else -> "قبل ${m / 1440} يوم" }
}

/** الحلقة الرئيسية: قوس متدرّج أزرق→برتقالي بنابض ناعم، توهّج دوّار أثناء الانتظار، وعلامة صح عند الجاهزية. */
@Composable
private fun HeroRing(phase: UpdatePhase) {
    val c = Mawred.colors
    val still = reducedMotion()
    val f by animateFloatAsState(phase.fraction(), spring(dampingRatio = .85f, stiffness = Spring.StiffnessVeryLow), label = "hero")
    val t = rememberInfiniteTransition(label = "hero-t")
    val rot by t.animateFloat(0f, 360f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "rot")
    val pulse by t.animateFloat(.92f, 1f, infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "pulse")
    val busy = phase is UpdatePhase.Checking || phase is UpdatePhase.Idle || phase is UpdatePhase.Verifying || (phase is UpdatePhase.Waiting)
    val done = phase is UpdatePhase.Ready || phase is UpdatePhase.UpToDate
    val ringDesc = when (phase) { is UpdatePhase.Downloading -> "تقدّم التنزيل ${(f * 100).toInt()} بالمئة"; is UpdatePhase.Ready -> "التحديث جاهز"; else -> "حالة التحديث" }
    Box(Modifier.size(196.dp).semantics { contentDescription = ringDesc }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = 14.dp.toPx()
            val inset = w / 2 + 6.dp.toPx()
            val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
            val tl = Offset(inset, inset)
            val glow = if (still) 1f else pulse
            drawCircle(Brush.radialGradient(listOf((if (done) c.ok else c.primary).copy(alpha = .16f * glow), Color.Transparent)), radius = size.minDimension / 2)
            drawArc(c.line, 0f, 360f, false, tl, arcSize, style = Stroke(w))
            val sweep = Brush.sweepGradient(listOf(c.primary, c.accent, c.primary), center)
            if (busy && f == 0f) {
                rotate(if (still) 0f else rot) { drawArc(sweep, -90f, 90f, false, tl, arcSize, style = Stroke(w, cap = StrokeCap.Round)) }
            } else if (f > 0f) {
                drawArc(if (done) Brush.linearGradient(listOf(c.ok, c.ok)) else sweep, -90f, 360f * f, false, tl, arcSize, style = Stroke(w, cap = StrokeCap.Round))
            } else if (done) drawArc(c.ok, -90f, 360f, false, tl, arcSize, style = Stroke(w))
        }
        Box(Modifier.size(92.dp).clip(CircleShape).background(c.raised).border(1.dp, c.line, CircleShape), contentAlignment = Alignment.Center) {
            when {
                done -> Icon(Icons.check, null, Modifier.size(44.dp), tint = c.ok)
                phase is UpdatePhase.Downloading -> Text("${(f * 100).toInt()}٪", style = MaterialTheme.typography.headlineSmall.merge(Tabular).copy(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 26.sp), color = c.primary)
                phase is UpdatePhase.Failed -> Icon(Icons.alert, null, Modifier.size(40.dp), tint = c.danger)
                else -> Icon(Icons.download, null, Modifier.size(40.dp), tint = c.primary)
            }
        }
    }
}

/** فحص ← تنزيل ← تحقق ← جاهز ← تثبيت. */
@Composable
private fun Steps(phase: UpdatePhase) {
    val c = Mawred.colors
    val at = when (phase) { is UpdatePhase.Available, is UpdatePhase.Failed -> 1; is UpdatePhase.Downloading, is UpdatePhase.Waiting -> 1; is UpdatePhase.Verifying -> 2; is UpdatePhase.Ready -> 3; else -> 0 }
    val labels = listOf("فحص", "تنزيل", "تحقق", "جاهز", "تثبيت")
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        labels.forEachIndexed { i, l ->
            val reached = i < at || (i == at && phase is UpdatePhase.Ready)
            val current = i == at && phase !is UpdatePhase.Ready
            val col by animateColorAsState(if (reached) c.ok else if (current) c.primary else c.line, label = "s$i")
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f).height(2.dp).background(if (i == 0) Color.Transparent else if (i <= at) c.ok.copy(alpha = .6f) else c.line))
                    Box(Modifier.size(if (current) 14.dp else 10.dp).clip(CircleShape).background(col))
                    Box(Modifier.weight(1f).height(2.dp).background(if (i == labels.lastIndex) Color.Transparent else if (i < at) c.ok.copy(alpha = .6f) else c.line))
                }
                Spacer(Modifier.height(6.dp))
                Text(l, style = MaterialTheme.typography.labelSmall, color = if (current) c.primary else if (reached) c.ink else c.mute)
            }
        }
    }
}

@Composable
private fun Actions(phase: UpdatePhase, vm: UpdateViewModel, onFirstDownload: () -> Unit) {
    val c = Mawred.colors
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (phase) {
            UpdatePhase.Idle, UpdatePhase.Checking -> {}
            is UpdatePhase.UpToDate -> OutlinedButton(vm::check, Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("افحص الآن") }
            is UpdatePhase.Available -> {
                PrimaryButton(if (phase.partial > 0) "تابع التنزيل بالخلفية" else "نزّل بالخلفية", { onFirstDownload(); vm.download() }, Modifier.fillMaxWidth())
                Text("يكمل التنزيل حتى لو أغلقت التطبيق، ويستأنف تلقائياً لو انقطع النت.", style = MaterialTheme.typography.bodySmall, color = c.mute, modifier = Modifier.fillMaxWidth())
            }
            is UpdatePhase.Downloading, is UpdatePhase.Verifying -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(vm::pause, Modifier.weight(1f).heightIn(min = 48.dp), enabled = phase is UpdatePhase.Downloading) { Icon(Icons.pause, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("إيقاف مؤقت") }
                TextButton(vm::cancel, Modifier.heightIn(min = 48.dp)) { Text("إلغاء", color = c.danger) }
            }
            is UpdatePhase.Waiting -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (phase.reason == "موقوف مؤقتاً") PrimaryButton("تابع التنزيل", vm::download, Modifier.weight(1f))
                else OutlinedButton(vm::pause, Modifier.weight(1f).heightIn(min = 48.dp)) { Text("إيقاف مؤقت") }
                TextButton(vm::cancel, Modifier.heightIn(min = 48.dp)) { Text("إلغاء", color = c.danger) }
            }
            is UpdatePhase.Ready -> {
                PrimaryButton("ثبّت الآن", { vm.install() }, Modifier.fillMaxWidth())
                Text("أو اتركه: يبقى جاهزاً هنا وفي الإشعار حتى تثبّته، ويُحذف ملفه تلقائياً بعد التثبيت.", style = MaterialTheme.typography.bodySmall, color = c.mute, modifier = Modifier.fillMaxWidth())
            }
            is UpdatePhase.Failed -> PrimaryButton("أعد المحاولة", { if (phase.info != null) vm.download() else vm.check() }, Modifier.fillMaxWidth())
        }
    }
}

private val SECTION_ICON = mapOf("الإضافات" to Icons.plus, "المميزات" to Icons.sparkle, "الإصلاحات" to Icons.check, "الاختبارات" to Icons.shield)

/** «ما الجديد»: الأقسام من ملاحظات الإصدار، أول 3 بنود لكل قسم و«المزيد». */
@Composable
private fun NotesCard(n: ReleaseNotes) {
    val c = Mawred.colors
    var all by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("ما الجديد", style = MaterialTheme.typography.titleMedium.copy(fontFamily = Display), color = c.ink)
        if (n.headline.isNotBlank()) Text(n.headline, style = MaterialTheme.typography.bodyMedium, color = c.mute)
        n.sections.filter { it.title != "الاختبارات" }.forEach { s -> Section(s, all) }
        if (n.sections.any { it.items.size > 3 }) TextButton({ all = !all }) { Text(if (all) "عرض أقل" else "عرض كل التفاصيل", color = c.primary) }
    }
}

@Composable
private fun Section(s: NotesSection, all: Boolean) {
    val c = Mawred.colors
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(28.dp).clip(RoundedCornerShape(9.dp)).background(c.primary.copy(alpha = .10f)), contentAlignment = Alignment.Center) { Icon(SECTION_ICON[s.title] ?: Icons.sparkle, null, Modifier.size(16.dp), tint = c.primary) }
            Text(s.title, style = MaterialTheme.typography.titleSmall, color = c.ink)
        }
        (if (all) s.items else s.items.take(3)).forEach { item ->
            Row(Modifier.padding(start = 36.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.padding(top = 8.dp).size(5.dp).clip(CircleShape).background(c.accent))
                Text(item, style = MaterialTheme.typography.bodyMedium, color = c.ink)
            }
        }
    }
}

@Composable
private fun SettingsCard(p: UpdatePrefs, set: (UpdatePrefs) -> Unit) {
    val c = Mawred.colors
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(20.dp)).padding(horizontal = 16.dp, vertical = 8.dp)) {
        Toggle("نزّل التحديثات تلقائياً على Wi‑Fi", "نفحص كل 12 ساعة وننزّل بصمت؛ أنت تختار وقت التثبيت", p.autoOnWifi) { set(p.copy(autoOnWifi = it)) }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
        Toggle("التنزيل على Wi‑Fi فقط", "لا يستهلك باقة البيانات حتى عند التنزيل اليدوي", p.wifiOnly) { set(p.copy(wifiOnly = it)) }
    }
}

@Composable
private fun Toggle(title: String, hint: String, on: Boolean, change: (Boolean) -> Unit) {
    val c = Mawred.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = androidx.compose.ui.semantics.Role.Switch) { change(!on) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = c.ink)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = c.mute)
        }
        Switch(on, null, colors = SwitchDefaults.colors(checkedTrackColor = c.primary))
    }
}

@Composable
private fun StorageCard(vm: UpdateViewModel) {
    val c = Mawred.colors
    var used by remember { mutableLongStateOf(vm.storage()) }
    val phase by vm.phase.collectAsStateWithLifecycle()
    LaunchedEffect(phase::class) { used = vm.storage() }
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(20.dp)).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.accent.copy(alpha = .14f)), contentAlignment = Alignment.Center) { Icon(Icons.folder, null, tint = c.accentInk) }
        Column(Modifier.weight(1f)) {
            Text("مجلد التحديثات", style = MaterialTheme.typography.titleSmall, color = c.ink)
            Text(if (used > 0) "${Bytes.of(used)} · داخل ملفات التطبيق الخاصة، يُحذف تلقائياً بعد التثبيت" else "فارغ · الملفات تُحذف تلقائياً بعد التثبيت", style = MaterialTheme.typography.bodySmall.merge(Tabular), color = c.mute)
        }
    }
}

/** فتح مركز التحديث من أي شاشة. */
val LocalOpenUpdates = androidx.compose.runtime.staticCompositionLocalOf<() -> Unit> { {} }

/** بند «التحديثات وحول التطبيق» في حسابي/المزيد/المهام. */
@Composable
fun UpdateEntry(phase: UpdatePhase, version: String, open: () -> Unit) {
    val c = Mawred.colors
    val info = UpdateViewModel.infoOf(phase)
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(16.dp)).clickable(onClick = open).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.download, null, tint = c.primary)
        Column(Modifier.weight(1f)) {
            Text("التحديثات وحول التطبيق", style = MaterialTheme.typography.titleSmall, color = c.ink)
            Text(if (info != null) "إصدار جديد ${info.version} متاح" else "الإصدار $version", style = MaterialTheme.typography.bodySmall.merge(Tabular), color = if (info != null) c.primary else c.mute)
        }
        if (info != null) Box(Modifier.size(10.dp).clip(CircleShape).background(c.accent))
        Icon(Icons.chevron, null, Modifier.size(16.dp), tint = c.mute)
    }
}
