package com.mawred.app.ui.admin

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.core.Money
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.PrimaryButton
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.shop.fmtDate
import com.mawred.app.ui.theme.Mawred
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

private fun JsonObject?.s(k: String): String = (this?.get(k) as? JsonPrimitive)?.contentOrNull.orEmpty()
private fun JsonObject?.l(k: String): Long = (this?.get(k) as? JsonPrimitive)?.longOrNull ?: 0L
private fun JsonObject?.a(k: String): List<JsonObject> = (this?.get(k) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
private fun JsonObject?.strs(k: String): List<String> = (this?.get(k) as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()

private val HOME_LABEL = mapOf("admin.dashboard" to "لوحة المعلومات", "admin.orders" to "الطلبات", "admin.finance" to "المالية", "admin.products" to "المنتجات", "admin.delivery" to "التوصيل", "agent.tasks" to "مهام المندوب", "shop.home" to "واجهة المحل")
private val KIND_LABEL = linkedMapOf("staff" to "إدارة", "agent" to "مندوب", "shop" to "محل")
private val SCOPES = mapOf("staff" to setOf("staff", "any"), "agent" to setOf("agent", "any"), "shop" to setOf("shop", "any"))

/** نفس مجموعات الويب: الصلاحيات مرتبة كما يفكر بها المدير. */
val PERM_GROUPS = listOf(
    Triple("orders", "الطلبات", setOf("orders")),
    Triple("catalog", "المنتجات والعروض", setOf("products", "categories", "units", "promotions")),
    Triple("shops", "المحلات", setOf("shops")),
    Triple("finance", "المالية", setOf("invoices", "payments", "accounts", "reports")),
    Triple("delivery", "التوصيل", setOf("delivery")),
    Triple("team", "الفريق والنظام", setOf("users", "roles", "settings", "audit", "backups", "notifications", "support")),
    Triple("shop", "واجهة المحل", setOf("shop")),
)

data class PermGroup(val id: String, val label: String, val perms: List<Pair<String, String>>)

/** يقسّم الصلاحيات (معرّف، اسم) على المجموعات، وما لا ينتمي لأي منها في «أخرى». */
fun groupPerms(perms: List<Pair<String, String>>): List<PermGroup> {
    val out = PERM_GROUPS.map { (id, label, pre) -> PermGroup(id, label, perms.filter { it.first.substringBefore('.') in pre }) }.filter { it.perms.isNotEmpty() }
    val used = out.flatMap { it.perms }.toSet()
    val rest = perms.filterNot { it in used }
    return if (rest.isEmpty()) out else out + PermGroup("other", "أخرى", rest)
}

private fun initials(n: String) = n.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull()?.toString() }.joinToString("")

@Composable
private fun Avatar(text: String, size: Int = 44) {
    Box(Modifier.size(size.dp).background(Mawred.colors.primary.copy(alpha = .12f), CircleShape), contentAlignment = Alignment.Center) {
        Text(text, color = Mawred.colors.primary, fontWeight = FontWeight.Bold, style = if (size > 50) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun Tag(text: String, color: androidx.compose.ui.graphics.Color = Mawred.colors.primary) {
    Text(text, Modifier.background(color.copy(alpha = .1f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
}

@Composable
private fun Block(title: String, subtitle: String? = null, content: @Composable () -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column { Text(title, style = MaterialTheme.typography.titleMedium, color = Mawred.colors.ink); subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) } }
            content()
        }
    }
}

/** قسم المستخدمين والأدوار: تبويبان بارزان، بطاقات واضحة، وصلاحيات مجمّعة. */
@Composable
fun TeamSection(vm: AdminVm, canRoles: Boolean, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf("users") }
    LaunchedEffect(Unit) { vm.load("/admin/roles"); vm.load("/admin/users") }
    val rolesData = st.data["/admin/roles"]
    val users = st.data["/admin/users"].a("users")
    val roles = rolesData.a("roles")
    val perms = rolesData.a("permissions").map { Triple(it.s("id"), it.s("label"), it.s("scope")) }
    var openUser by rememberSaveable { mutableStateOf<String?>(null) }
    var openRole by rememberSaveable { mutableStateOf<String?>(null) }
    var temp by remember { mutableStateOf<String?>(null) }

    if (rolesData != null && openUser != null) {
        UserForm(vm, users.firstOrNull { it.s("uid") == openUser }, roles, perms, onTemp = { temp = it }) { openUser = null }
        return
    }
    if (rolesData != null && openRole != null) {
        RoleForm(vm, roles.firstOrNull { it.s("id") == openRole }, roles, perms, users) { openRole = null }
        return
    }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (canRoles) item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(tab == "users", { tab = "users" }, SegmentedButtonDefaults.itemShape(0, 2), icon = { Icon(Icons.user, null, Modifier.size(18.dp)) }) { Text("المستخدمون · ${users.size}") }
                SegmentedButton(tab == "roles", { tab = "roles" }, SegmentedButtonDefaults.itemShape(1, 2), icon = { Icon(Icons.shield, null, Modifier.size(18.dp)) }) { Text("الأدوار · ${roles.size}") }
            }
        }
        temp?.let { pw -> item { TempCard(pw) { temp = null } } }
        if (rolesData == null) { item { Skeleton() }; return@LazyColumn }
        if (tab == "users") usersList(this, users, roles, { openUser = it }) else rolesList(this, roles, perms, users) { openRole = it }
    }
}

@Composable
private fun TempCard(pw: String, done: () -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.check, null, tint = Mawred.colors.ok, modifier = Modifier.size(36.dp))
            Text("كلمة المرور المؤقتة تظهر مرة واحدة", style = MaterialTheme.typography.titleSmall)
            Text(Money.ltr(pw), Modifier.border(1.dp, Mawred.colors.line, RoundedCornerShape(12.dp)).padding(horizontal = 20.dp, vertical = 10.dp), style = MaterialTheme.typography.headlineSmall.merge(com.mawred.app.ui.theme.Tabular), color = Mawred.colors.primary)
            Text("أعطها للموظف؛ يُطلب منه تغييرها عند أول دخول.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
            TextButton(done) { Text("تم") }
        }
    }
}

private fun usersList(scope: androidx.compose.foundation.lazy.LazyListScope, users: List<JsonObject>, roles: List<JsonObject>, open: (String) -> Unit) = with(scope) {
    item(key = "tools") {
        var q by rememberSaveable { mutableStateOf("") }
        var role by rememberSaveable { mutableStateOf<String?>(null) }
        val roleName = roles.associate { it.s("id") to it.s("label") }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("الاسم أو اسم المستخدم أو الهاتف") }, singleLine = true, leadingIcon = { Icon(Icons.search, null) }, shape = RoundedCornerShape(50))
            PrimaryButton("مستخدم جديد", { open("") })
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { FilterChip(role == null, { role = null }, { Text("كل الأدوار") }) }
                items(roles.filter { r -> r.s("kind") != "shop" && users.any { r.s("id") in it.strs("roles") } }, key = { it.s("id") }) { r ->
                    FilterChip(role == r.s("id"), { role = if (role == r.s("id")) null else r.s("id") }, { Text("${r.s("label")} ${users.count { r.s("id") in it.strs("roles") }}") })
                }
            }
            val n = q.trim().lowercase()
            val list = users.filter { u -> (role == null || role in u.strs("roles")) && (n.isEmpty() || "${u.s("displayName")} ${u.s("username")} ${u.s("phone")}".lowercase().contains(n)) }
            if (list.isEmpty()) Empty("لا يوجد مستخدمون مطابقون")
            list.forEach { u -> PersonCard(u, roleName) { open(u.s("uid")) } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PersonCard(u: JsonObject, roleName: Map<String, String>, onClick: () -> Unit) {
    val active = u.s("status") == "active"
    Surface(onClick = onClick, shape = RoundedCornerShape(16.dp), color = Mawred.colors.raised, border = BorderStroke(1.dp, Mawred.colors.line), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${u.s("displayName")}، ${if (active) "نشط" else "موقوف"}" }) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(initials(u.s("displayName")))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(u.s("displayName"), style = MaterialTheme.typography.titleSmall, color = if (active) Mawred.colors.ink else Mawred.colors.mute, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(Money.ltr("@" + u.s("username")), style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { u.strs("roles").forEach { Tag(roleName[it] ?: it) } }
                Text(if (u.l("lastLoginAt") > 0) "آخر دخول ${fmtDate(u.l("lastLoginAt"))}" else "لم يدخل بعد", style = MaterialTheme.typography.labelSmall, color = Mawred.colors.mute)
            }
            Tag(if (active) "نشط" else "موقوف", if (active) Mawred.colors.ok else Mawred.colors.danger)
        }
    }
}

private fun rolesList(scope: androidx.compose.foundation.lazy.LazyListScope, roles: List<JsonObject>, perms: List<Triple<String, String, String>>, users: List<JsonObject>, open: (String) -> Unit) = with(scope) {
    item(key = "intro") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("كل دور مجموعة صلاحيات. عدّل الدور مرة فيتغيّر لكل من يحمله.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
            PrimaryButton("دور جديد", { open("") })
        }
    }
    KIND_LABEL.keys.forEach { k ->
        val list = roles.filter { it.s("kind") == k }
        if (list.isEmpty()) return@forEach
        item(key = "h-$k") { Text(when (k) { "staff" -> "أدوار الإدارة"; "agent" -> "التوصيل"; else -> "المحلات" }, style = MaterialTheme.typography.titleMedium, color = Mawred.colors.ink, modifier = Modifier.padding(top = 8.dp)) }
        items(list, key = { "r-" + it.s("id") }) { r ->
            val total = perms.count { it.third in (SCOPES[k] ?: emptySet()) }.coerceAtLeast(1)
            val all = "*" in r.strs("permissions")
            val n = r.strs("permissions").size
            val locked = (r["protected"] as? JsonPrimitive)?.contentOrNull == "true"
            Surface(onClick = { open(r.s("id")) }, enabled = !locked, shape = RoundedCornerShape(16.dp), color = Mawred.colors.raised, border = BorderStroke(1.dp, Mawred.colors.line), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.s("label"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink)
                        if (locked) Icon(Icons.lock, "محمي", Modifier.size(18.dp), tint = Mawred.colors.mute) else Icon(Icons.chevron, null, Modifier.size(18.dp), tint = Mawred.colors.mute)
                    }
                    LinearProgressIndicator({ if (all) 1f else n.toFloat() / total }, Modifier.fillMaxWidth().height(6.dp), color = Mawred.colors.primary, trackColor = Mawred.colors.line, drawStopIndicator = {})
                    Text((if (all) "كل الصلاحيات" else "$n صلاحية") + if (k != "shop") " · ${users.count { r.s("id") in it.strs("roles") }} مستخدم" else "", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                }
            }
        }
    }
}

@Composable
private fun Input(label: String, value: String, onChange: (String) -> Unit, ltr: Boolean = false, enabled: Boolean = true, phone: Boolean = false) =
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true, enabled = enabled,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = if (phone) androidx.compose.ui.text.input.KeyboardType.Phone else if (ltr) androidx.compose.ui.text.input.KeyboardType.Ascii else androidx.compose.ui.text.input.KeyboardType.Text),
        textStyle = if (ltr) MaterialTheme.typography.bodyLarge.copy(textDirection = androidx.compose.ui.text.style.TextDirection.Ltr) else MaterialTheme.typography.bodyLarge)

@Composable
private fun ChoiceCard(title: String, subtitle: String, on: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Surface(onClick = onClick, enabled = enabled, shape = RoundedCornerShape(14.dp), color = if (on) Mawred.colors.primary.copy(alpha = .07f) else Mawred.colors.raised,
        border = BorderStroke(if (on) 1.5.dp else 1.dp, if (on) Mawred.colors.primary else Mawred.colors.line), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "$title${if (on) "، مختار" else ""}" }) {
        Row(Modifier.padding(12.dp).heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(24.dp).background(if (on) Mawred.colors.primary else androidx.compose.ui.graphics.Color.Transparent, CircleShape).border(1.5.dp, if (on) Mawred.colors.primary else Mawred.colors.line, CircleShape), contentAlignment = Alignment.Center) {
                if (on) Icon(Icons.check, null, Modifier.size(16.dp), tint = Mawred.colors.raised)
            }
            Column { Text(title, style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
        }
    }
}

@Composable
private fun UserForm(vm: AdminVm, u: JsonObject?, roles: List<JsonObject>, perms: List<Triple<String, String, String>>, onTemp: (String) -> Unit, done: () -> Unit) {
    val st by vm.s.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf(u.s("displayName")) }
    var username by rememberSaveable { mutableStateOf(u.s("username")) }
    var phone by rememberSaveable { mutableStateOf(u.s("phone")) }
    val sel = remember { mutableStateListOf<String>().apply { addAll(u.strs("roles")) } }
    val grant = remember { mutableStateListOf<String>().apply { addAll(u.strs("grant")) } }
    val deny = remember { mutableStateListOf<String>().apply { addAll(u.strs("deny")) } }
    var reason by remember { mutableStateOf("") }
    var custom by rememberSaveable { mutableStateOf(grant.isNotEmpty() || deny.isNotEmpty()) }
    BackHandler(onBack = done)
    val staffRoles = roles.filter { it.s("kind") != "shop" }
    val chosen = roles.filter { it.s("id") in sel }
    val fromRoles = chosen.flatMap { it.strs("permissions") }.toSet()
    val kinds = chosen.map { it.s("kind") }.toSet()
    val scoped = perms.filter { p -> kinds.any { p.third in (SCOPES[it] ?: emptySet()) } }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { TextButton(done) { Icon(Icons.chevron, null, Modifier.size(18.dp)); Text("كل المستخدمين") } }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(initials(name.ifBlank { "؟" }), 56)
                Column {
                    Text(if (u == null) "مستخدم جديد" else u.s("displayName"), style = MaterialTheme.typography.titleLarge, color = Mawred.colors.ink)
                    if (u != null) Text("${if (u.s("status") == "active") "نشط" else "موقوف"} · ${if (u.l("lastLoginAt") > 0) "آخر دخول ${fmtDate(u.l("lastLoginAt"))}" else "لم يدخل بعد"}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                }
            }
        }
        item {
            Block("البيانات الأساسية") {
                Input("الاسم", name, { name = it })
                Input("اسم المستخدم (لاتيني)", username, { username = it.trim() }, ltr = true)
                Input("الهاتف", phone, { phone = it }, ltr = true, phone = true)
            }
        }
        item {
            Block("الدور الوظيفي", "اختر دوراً أو أكثر؛ الصلاحيات تُجمع من كل الأدوار المختارة") {
                staffRoles.forEach { r ->
                    val id = r.s("id")
                    ChoiceCard(r.s("label"), (if ("*" in r.strs("permissions")) "كل الصلاحيات" else "${r.strs("permissions").size} صلاحية") + " · يبدأ في ${HOME_LABEL[r.s("home")] ?: r.s("home")}", id in sel) { if (id in sel) sel.remove(id) else sel.add(id) }
                }
            }
        }
        if (scoped.isNotEmpty() && "*" !in fromRoles) item {
            Block("تخصيص صلاحيات هذا المستخدم", "امنحه صلاحية ليست في دوره أو احجب صلاحية منه") {
                OutlinedButton({ custom = !custom }, Modifier.fillMaxWidth()) { Text(if (custom) "إخفاء التخصيص" else "عرض الصلاحيات (${grant.size + deny.size} مخصصة)") }
                if (custom) groupPerms(scoped.map { it.first to it.second }).forEach { g ->
                    Text(g.label, style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink, modifier = Modifier.padding(top = 6.dp))
                    g.perms.forEach { (id, label) ->
                        val inRole = id in fromRoles
                        val v = if (id in deny) "deny" else if (id in grant) "grant" else "role"
                        val effective = v == "grant" || (v == "role" && inRole)
                        Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(if (effective) Icons.check else Icons.close, null, Modifier.size(18.dp), tint = if (effective) Mawred.colors.ok else Mawred.colors.mute)
                                Spacer(Modifier.width(8.dp))
                                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = if (effective) Mawred.colors.ink else Mawred.colors.mute)
                            }
                            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                                SegmentedButton(v == "role", { grant.remove(id); deny.remove(id) }, SegmentedButtonDefaults.itemShape(0, 2)) { Text(if (inRole) "من الدور" else "بلا", style = MaterialTheme.typography.labelMedium) }
                                if (inRole) SegmentedButton(v == "deny", { grant.remove(id); if (id !in deny) deny.add(id) }, SegmentedButtonDefaults.itemShape(1, 2), colors = SegmentedButtonDefaults.colors(activeContainerColor = Mawred.colors.danger.copy(alpha = .14f), activeContentColor = Mawred.colors.danger)) { Text("حجب", style = MaterialTheme.typography.labelMedium) }
                                else SegmentedButton(v == "grant", { deny.remove(id); if (id !in grant) grant.add(id) }, SegmentedButtonDefaults.itemShape(1, 2), colors = SegmentedButtonDefaults.colors(activeContainerColor = Mawred.colors.ok.copy(alpha = .16f), activeContentColor = Mawred.colors.ok)) { Text("منح", style = MaterialTheme.typography.labelMedium) }
                            }
                        }
                    }
                }
            }
        }
        item {
            val body = buildJsonObject {
                put("displayName", name.trim()); put("username", username); if (phone.isNotBlank()) put("phone", phone.trim()) else put("phone", JsonNull)
                putJsonArray("roles") { sel.forEach { add(JsonPrimitive(it)) } }
                putJsonArray("grant") { grant.forEach { add(JsonPrimitive(it)) } }
                putJsonArray("deny") { deny.forEach { add(JsonPrimitive(it)) } }
                if (u == null) putJsonArray("shopIds") {}
            }
            val ok = !st.busy && sel.isNotEmpty() && name.isNotBlank() && username.isNotBlank()
            if (u == null) PrimaryButton("إنشاء الحساب", { vm.act("أُنشئ الحساب", "POST", "/admin/users", body, idem = true, reload = listOf("/admin/users")) { r -> r.s("tempPassword").takeIf { it.isNotBlank() }?.let(onTemp); done() } }, enabled = ok)
            else PrimaryButton("حفظ التعديلات", { vm.act("حُفظت التعديلات", "PATCH", "/admin/users/${u.s("uid")}", body, reload = listOf("/admin/users")) { done() } }, enabled = ok)
            st.error?.let { Text(it, color = Mawred.colors.danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        }
        if (u != null) item {
            val uid = u.s("uid")
            val active = u.s("status") == "active"
            Card {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("إدارة الحساب", style = MaterialTheme.typography.titleMedium, color = Mawred.colors.ink)
                    OutlinedButton({ vm.act("أعيد تعيين كلمة المرور", "POST", "/admin/users/$uid/reset-password") { r -> onTemp(r.s("tempPassword")); done() } }, Modifier.fillMaxWidth()) { Icon(Icons.lock, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("إعادة تعيين كلمة المرور") }
                    OutlinedButton({ vm.act("خرج من كل أجهزته", "POST", "/admin/users/$uid/revoke-sessions") }, Modifier.fillMaxWidth()) { Icon(Icons.logout, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("إخراجه من كل الأجهزة") }
                    Input(if (active) "سبب الإيقاف" else "سبب التفعيل", reason, { reason = it })
                    OutlinedButton({ vm.act(if (active) "أُوقف الحساب" else "فُعّل الحساب", "POST", "/admin/users/$uid/status", buildJsonObject { put("status", if (active) "suspended" else "active"); put("reason", reason) }, reload = listOf("/admin/users")) { done() } },
                        Modifier.fillMaxWidth(), enabled = reason.trim().length >= 3, border = BorderStroke(1.dp, if (active) Mawred.colors.danger else Mawred.colors.primary)) { Text(if (active) "إيقاف الحساب" else "تفعيل الحساب", color = if (active) Mawred.colors.danger else Mawred.colors.primary) }
                }
            }
        }
    }
}

@Composable
private fun RoleForm(vm: AdminVm, r: JsonObject?, roles: List<JsonObject>, perms: List<Triple<String, String, String>>, users: List<JsonObject>, done: () -> Unit) {
    val st by vm.s.collectAsStateWithLifecycle()
    val isNew = r == null
    var id by rememberSaveable { mutableStateOf(r.s("id")) }
    var label by rememberSaveable { mutableStateOf(r.s("label")) }
    var kind by rememberSaveable { mutableStateOf(r.s("kind").ifBlank { "staff" }) }
    var home by rememberSaveable { mutableStateOf(r.s("home").ifBlank { "admin.dashboard" }) }
    var q by rememberSaveable { mutableStateOf("") }
    val sel = remember { mutableStateListOf<String>().apply { addAll(r.strs("permissions")) } }
    BackHandler(onBack = done)
    val available = perms.filter { it.third in (SCOPES[kind] ?: emptySet()) }
    val holders = users.count { id in it.strs("roles") }
    val homes = roles.filter { it.s("kind") == kind }.map { it.s("home") }.distinct().ifEmpty { listOf(home) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { TextButton(done) { Icon(Icons.chevron, null, Modifier.size(18.dp)); Text("كل الأدوار") } }
        item {
            Column {
                Text(if (isNew) "دور جديد" else label, style = MaterialTheme.typography.titleLarge, color = Mawred.colors.ink)
                Text("${sel.size} من ${available.size} صلاحية" + if (!isNew && kind != "shop") " · $holders مستخدم يحمله" else "", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
            }
        }
        item {
            Block("بيانات الدور") {
                Input("اسم الدور", label, { label = it })
                Input("المعرّف (لاتيني، لا يتغيّر)", id, { id = it.lowercase().filter { c -> c in 'a'..'z' || c == '_' } }, ltr = true, enabled = isNew)
                Text("النوع", style = MaterialTheme.typography.labelLarge, color = Mawred.colors.mute)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    KIND_LABEL.entries.forEachIndexed { i, (k, l) -> SegmentedButton(kind == k, { if (isNew) { kind = k; sel.clear(); home = roles.firstOrNull { it.s("kind") == k }?.s("home") ?: home } }, SegmentedButtonDefaults.itemShape(i, KIND_LABEL.size), enabled = isNew) { Text(l) } }
                }
                Text("الواجهة بعد الدخول", style = MaterialTheme.typography.labelLarge, color = Mawred.colors.mute)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(homes) { h -> FilterChip(home == h, { home = h }, { Text(HOME_LABEL[h] ?: h) }) } }
            }
        }
        item {
            Card {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("الصلاحيات", style = MaterialTheme.typography.titleMedium, color = Mawred.colors.ink)
                    OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("ابحث عن صلاحية") }, singleLine = true, leadingIcon = { Icon(Icons.search, null) }, shape = RoundedCornerShape(50))
                    groupPerms(available.filter { q.isBlank() || it.second.contains(q.trim()) }.map { it.first to it.second }).forEach { g ->
                        val ids = g.perms.map { it.first }
                        val n = ids.count { it in sel }
                        Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("${g.label}  ${n}/${ids.size}", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink)
                            TextButton({ if (n < ids.size) ids.forEach { if (it !in sel) sel.add(it) } else sel.removeAll(ids) }) { Text(if (n < ids.size) "تحديد الكل" else "إلغاء الكل") }
                        }
                        g.perms.forEach { (pid, plabel) ->
                            val on = pid in sel
                            Row(Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { if (on) sel.remove(pid) else sel.add(pid) }.heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(on, null)
                                Text(plabel, style = MaterialTheme.typography.bodyMedium, color = if (on) Mawred.colors.ink else Mawred.colors.mute)
                            }
                        }
                    }
                }
            }
        }
        item {
            PrimaryButton("حفظ الدور", {
                vm.act("حُفظ الدور", "PUT", "/admin/roles/$id", buildJsonObject { put("label", label.trim()); put("kind", kind); put("home", home); putJsonArray("permissions") { sel.forEach { add(JsonPrimitive(it)) } } }, reload = listOf("/admin/roles")) { done() }
            }, enabled = !st.busy && label.isNotBlank() && Regex("^[a-z_]{3,40}$").matches(id))
            if (!isNew) OutlinedButton({ vm.act("حُذف الدور", "DELETE", "/admin/roles/$id", reload = listOf("/admin/roles")) { done() } }, Modifier.fillMaxWidth().padding(top = 8.dp), enabled = !st.busy && holders == 0, border = BorderStroke(1.dp, Mawred.colors.danger)) {
                Text(if (holders > 0) "انقل مستخدميه لدور آخر قبل الحذف" else "حذف الدور", color = Mawred.colors.danger)
            }
            st.error?.let { Text(it, color = Mawred.colors.danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}
