package com.mawred.app.ui.common

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.mawred.app.core.QuickOrder
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.newIdempotencyKey
import com.mawred.app.data.auth.SessionUser
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.Display
import com.mawred.app.ui.theme.Mawred
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import javax.inject.Inject

/** موضوع في دليل الاستخدام (spec/guide.json — المصدر نفسه للويب). */
data class GuideTopic(val id: String, val icon: String, val title: String, val steps: List<String>, val tip: String?, val perms: List<String>)

object Guide {
    fun parse(text: String): Map<String, List<GuideTopic>> {
        val roles = Json.parseToJsonElement(text).jsonObject["roles"]!!.jsonObject
        return roles.mapValues { (_, arr) ->
            arr.jsonArray.map { e ->
                val o = e.jsonObject
                GuideTopic(
                    o["id"]!!.jsonPrimitive.content, o["icon"]!!.jsonPrimitive.content, o["title"]!!.jsonPrimitive.content,
                    o["steps"]!!.jsonArray.map { it.jsonPrimitive.content }, o["tip"]?.jsonPrimitive?.content,
                    (o["perms"] as? JsonArray)?.map { it.jsonPrimitive.content }.orEmpty(),
                )
            }
        }
    }

    /** موضوع الإدارة يظهر إن امتلك المستخدم واحدة من صلاحياته. */
    fun topics(all: Map<String, List<GuideTopic>>, role: String, can: (String) -> Boolean) = all[role].orEmpty().filter { t -> t.perms.isEmpty() || t.perms.any(can) }

    fun search(list: List<GuideTopic>, q: String): List<GuideTopic> {
        val n = QuickOrder.normalize(q)
        if (n.isEmpty()) return list
        return list.filter { t -> QuickOrder.normalize((listOf(t.title, t.tip.orEmpty()) + t.steps).joinToString(" ")).contains(n) }
    }
}

data class Ticket(val id: String, val type: String, val subject: String, val body: String, val status: String, val at: Long, val replies: List<String>)
data class HelpUi(val tickets: List<Ticket>? = null, val busy: Boolean = false, val error: String? = null, val sent: Boolean = false)

@HiltViewModel
class HelpViewModel @Inject constructor(private val api: Api, @ApplicationContext ctx: android.content.Context) : ViewModel() {
    val guide: Map<String, List<GuideTopic>> = runCatching { Guide.parse(ctx.assets.open("spec/guide.json").bufferedReader().use { it.readText() }) }.getOrDefault(emptyMap())
    private val _ui = MutableStateFlow(HelpUi())
    val ui: StateFlow<HelpUi> = _ui

    fun loadTickets() = viewModelScope.launch {
        api.cached("/support")?.let { _ui.value = _ui.value.copy(tickets = parseTickets(it)) }
        try { _ui.value = _ui.value.copy(tickets = parseTickets(api.get("/support")), error = null) } catch (e: ApiException) { _ui.value = _ui.value.copy(error = e.message) }
    }

    fun send(type: String, subject: String, body: String, done: () -> Unit) {
        if (subject.trim().length < 3 || body.trim().length < 3) { _ui.value = _ui.value.copy(error = "اكتب عنواناً وتفاصيل واضحة"); return }
        viewModelScope.launch {
            _ui.value = _ui.value.copy(busy = true, error = null, sent = false)
            try {
                api.post("/support", kotlinx.serialization.json.buildJsonObject { put("type", type); put("subject", subject.trim()); put("body", body.trim()) }, newIdempotencyKey())
                _ui.value = _ui.value.copy(busy = false, sent = true)
                done(); loadTickets()
            } catch (e: ApiException) { _ui.value = _ui.value.copy(busy = false, error = e.message) }
        }
    }

    private fun parseTickets(o: JsonObject) = (o["tickets"] as? JsonArray).orEmpty().map { e ->
        val t = e.jsonObject
        fun s(k: String) = t[k]?.jsonPrimitive?.content.orEmpty()
        Ticket(s("id"), s("type"), s("subject"), s("body"), s("status"), t["createdAt"]?.jsonPrimitive?.longOrNull ?: 0, (t["replies"] as? JsonArray).orEmpty().map { it.jsonObject["text"]?.jsonPrimitive?.content.orEmpty() })
    }
}

private fun guideIcon(name: String): ImageVector = when (name) {
    "home" -> Icons.home; "search" -> Icons.search; "cart" -> Icons.cart; "truck" -> Icons.truck; "wallet" -> Icons.wallet
    "bell" -> Icons.bell; "lock" -> Icons.lock; "chart" -> Icons.chart; "list" -> Icons.list; "box" -> Icons.box; "tag" -> Icons.tag
    "store" -> Icons.store; "users" -> Icons.users; "gear" -> Icons.gear; "shield" -> Icons.shield; "check" -> Icons.check
    "close" -> Icons.close; "chat" -> Icons.chat; else -> Icons.sparkle
}

private val TYPES = listOf("inquiry" to "استفسار", "problem" to "مشكلة", "complaint" to "شكوى")
private val STATUS = mapOf("open" to "مفتوحة", "in_progress" to "قيد المعالجة", "resolved" to "محلولة", "closed" to "مغلقة")

/** المساعدة والدعم: دليل الاستخدام حسب الدور، وتذاكر الدعم للمستخدم إن كان يملك support.create. */
@Composable
fun HelpScreen(user: SessionUser, role: String, pad: PaddingValues, startOnSupport: Boolean = false, vm: HelpViewModel = androidx.hilt.navigation.compose.hiltViewModel(), header: (@Composable () -> Unit)? = null) {
    val canSupport = user.can("support.create")
    var support by rememberSaveable { mutableStateOf(startOnSupport && canSupport) }
    var q by rememberSaveable { mutableStateOf("") }
    val all = remember(user) { Guide.topics(vm.guide, role, user::can) }
    val shown = remember(all, q) { Guide.search(all, q) }
    var openId by rememberSaveable { mutableStateOf(all.firstOrNull()?.id) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(support) { if (support) vm.loadTickets() }
    var type by rememberSaveable { mutableStateOf("inquiry") }
    var subject by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }
    val c = Mawred.colors
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        header?.let { h -> item { h() } }
        if (canSupport) item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(!support, { support = false }, SegmentedButtonDefaults.itemShape(0, 2)) { Text("دليل الاستخدام") }
                SegmentedButton(support, { support = true }, SegmentedButtonDefaults.itemShape(1, 2)) { Text("تواصل مع الدعم") }
            }
        }
        if (!support) {
            item { OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("ابحث في الدليل: سلة، دفعة، عرض…") }, leadingIcon = { Icon(Icons.search, null) }, singleLine = true, shape = RoundedCornerShape(28.dp)) }
            if (shown.isEmpty()) item { Empty("لا يوجد موضوع بهذه الكلمة. جرّب كلمة أخرى أو تواصل مع الدعم.") }
            items(shown, key = { it.id }) { t ->
                val open = q.isNotBlank() || openId == t.id
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.raised)
                        .border(1.dp, if (open) c.primary.copy(alpha = .4f) else c.line, RoundedCornerShape(18.dp)).animateContentSize(),
                ) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClickLabel = if (open) "طيّ" else "فتح") { openId = if (openId == t.id) null else t.id }.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.primary.copy(alpha = .12f)), contentAlignment = Alignment.Center) { Icon(guideIcon(t.icon), null, tint = c.primary) }
                        Text(t.title, Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.titleMedium.copy(fontFamily = Display), color = c.ink)
                        Icon(Icons.chevron, null, Modifier.rotate(if (open) 90f else -90f), tint = c.mute)
                    }
                    if (open) Column(Modifier.padding(start = 64.dp, end = 16.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        t.steps.forEachIndexed { i, s ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("${i + 1}.", style = MaterialTheme.typography.bodyMedium, color = c.primary)
                                Text(s, style = MaterialTheme.typography.bodyMedium, color = c.ink)
                            }
                        }
                        t.tip?.let { Notice(it) }
                    }
                }
            }
        } else {
            item {
                Panel("رسالة جديدة") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { TYPES.forEach { (k, l) -> FilterChip(type == k, { type = k }, { Text(l) }) } }
                    OutlinedTextField(subject, { subject = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("العنوان") }, placeholder = { Text("مثلاً: نقص في طلب أمس") }, singleLine = true)
                    OutlinedTextField(body, { body = it.take(3000) }, Modifier.fillMaxWidth(), label = { Text("التفاصيل") }, placeholder = { Text("اكتب ما حدث ورقم الطلب إن وُجد") }, minLines = 3)
                    if (ui.sent) Text("وصلت رسالتك للإدارة، وسيصلك الرد بإشعار", color = c.ok)
                    ErrorText(ui.error)
                    PrimaryButton(if (ui.busy) "جارٍ الإرسال…" else "إرسال", { vm.send(type, subject, body) { subject = ""; body = "" } }, Modifier.fillMaxWidth(), enabled = !ui.busy)
                }
            }
            item { Text("رسائلي", style = MaterialTheme.typography.titleMedium) }
            val list = ui.tickets
            when {
                list == null -> item { Skeleton() }
                list.isEmpty() -> item { Empty("لا رسائل بعد.") }
                else -> items(list, key = { it.id }) { t ->
                    Panel(t.subject, STATUS[t.status] ?: t.status) {
                        Text("${TYPES.firstOrNull { it.first == t.type }?.second.orEmpty()} · ${com.mawred.app.ui.shop.fmtDate(t.at)}", style = MaterialTheme.typography.bodySmall, color = c.mute)
                        Text(t.body, style = MaterialTheme.typography.bodyMedium)
                        t.replies.forEach { r ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.primary.copy(alpha = .09f)).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.chat, null, Modifier.size(18.dp), tint = c.primary); Text(r, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** مدخل «المساعدة والدعم» في شاشة الحساب. */
@Composable
fun HelpEntry(onClick: () -> Unit) {
    val c = Mawred.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(18.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(18.dp)).clickable(role = Role.Button, onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.primary.copy(alpha = .12f)), contentAlignment = Alignment.Center) { Icon(Icons.chat, null, tint = c.primary) }
        Column(Modifier.weight(1f)) {
            Text("المساعدة والدعم", style = MaterialTheme.typography.titleMedium, color = c.ink)
            Text("دليل الاستخدام، وراسل الإدارة بأي استفسار أو مشكلة", style = MaterialTheme.typography.bodySmall, color = c.mute)
        }
        Icon(Icons.chevron, null, tint = c.mute)
    }
}
