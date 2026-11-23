package com.mawred.app.ui.admin

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.core.Money
import com.mawred.app.data.auth.SessionUser
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Kpi
import com.mawred.app.ui.common.Notice
import com.mawred.app.ui.common.PrimaryButton
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.shop.fmtDate
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.URLEncoder

// ===== أدوات JSON =====
private fun JsonObject?.s(k: String): String = (this?.get(k) as? JsonPrimitive)?.contentOrNull.orEmpty()
private fun JsonObject?.l(k: String): Long = (this?.get(k) as? JsonPrimitive)?.longOrNull ?: 0L
private fun JsonObject?.b(k: String): Boolean = (this?.get(k) as? JsonPrimitive)?.booleanOrNull ?: false
private fun JsonObject?.a(k: String): List<JsonObject> = (this?.get(k) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
private fun JsonObject?.o(k: String): JsonObject? = this?.get(k) as? JsonObject
private fun JsonObject?.strs(k: String): List<String> = (this?.get(k) as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

private data class Section(val id: String, val label: String, val icon: ImageVector, val perms: List<String>)
private val SECTIONS = listOf(
    Section("shops", "المحلات", Icons.store, listOf("shops.view")),
    Section("users", "المستخدمون والأدوار", Icons.users, listOf("users.manage")),
    Section("finance", "المالية", Icons.wallet, listOf("payments.create", "invoices.view", "accounts.adjust")),
    Section("promotions", "العروض", Icons.tag, listOf("promotions.manage")),
    Section("reports", "التقارير", Icons.chart, listOf("reports.view")),
    Section("delivery", "التوصيل", Icons.truck, listOf("delivery.view")),
    Section("support", "الدعم الفني", Icons.chat, listOf("support.manage")),
    Section("settings", "الإعدادات", Icons.gear, listOf("settings.manage")),
    Section("backups", "النسخ الاحتياطي", Icons.shield, listOf("backups.manage")),
    Section("audit", "سجل العمليات", Icons.list, listOf("audit.view")),
    Section("security", "أمان حسابي", Icons.lock, emptyList()),
)
/** قسم بلا صلاحيات = متاح لكل موظف (أمان حسابه الشخصي). */
private fun Section.allowed(user: SessionUser) = perms.isEmpty() || perms.any(user::can)

fun hasMoreSections(user: SessionUser) = SECTIONS.any { s -> s.allowed(user) }
fun canOpenSection(user: SessionUser, id: String) = SECTIONS.any { s -> s.id == id && s.allowed(user) }

/** «المزيد»: كل أقسام الإدارة المتاحة لصلاحيات المستخدم، مطابقة للوحة الويب. */
@Composable
fun AdminMoreScreen(user: SessionUser, padding: PaddingValues, focus: Focus? = null, consumed: () -> Unit = {}, vm: AdminVm = hiltViewModel()) {
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    androidx.compose.runtime.LaunchedEffect(focus) { focus?.id?.let { open = it; consumed() } }
    val st by vm.s.collectAsStateWithLifecycle()
    if (open != null) {
        BackHandler { open = null; vm.clearMsg() }
        Column(Modifier.fillMaxSize()) {
            TextButton({ open = null; vm.clearMsg() }, Modifier.padding(horizontal = 8.dp)) { Text("‹ المزيد") }
            Column(Modifier.padding(horizontal = 16.dp)) { ErrorText(st.error); st.info?.let { Text(it, color = Mawred.colors.ok) } }
            val pad = PaddingValues(16.dp, 8.dp, 16.dp, padding.calculateBottomPadding() + 16.dp)
            when (open) {
                "shops" -> ShopsSection(vm, user, pad)
                "users" -> TeamSection(vm, user.can("roles.manage"), pad)
                "finance" -> FinanceSection(vm, user, pad)
                "promotions" -> PromotionsSection(vm, pad)
                "reports" -> ReportsSection(vm, pad)
                "delivery" -> DeliverySection(vm, pad)
                "support" -> SupportSection(vm, pad)
                "settings" -> SettingsSection(vm, pad)
                "backups" -> BackupsSection(vm, pad)
                "audit" -> AuditSection(vm, pad)
                "security" -> Column(Modifier.padding(pad).padding(16.dp).verticalScroll(androidx.compose.foundation.rememberScrollState())) { com.mawred.app.ui.common.AccountSecurity(hiltViewModel()) }
            }
        }
        return
    }
    val list = SECTIONS.filter { s -> s.allowed(user) }
    LazyVerticalGrid(GridCells.Adaptive(150.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
            val ph by hiltViewModel<com.mawred.app.ui.update.UpdateViewModel>().phase.collectAsStateWithLifecycle()
            com.mawred.app.ui.update.UpdateEntry(ph, com.mawred.app.BuildConfig.VERSION_NAME, com.mawred.app.ui.update.LocalOpenUpdates.current)
        }
        items(list, key = { it.id }) { s ->
            Card(Modifier.clickable { open = s.id }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(s.icon, null, tint = Mawred.colors.primary)
                    Text(s.label, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

@Composable
private fun SectionList(pad: PaddingValues, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) =
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(8.dp), content = content)

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit, number: Boolean = false, phone: Boolean = false) =
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (number) KeyboardType.Decimal else if (phone) KeyboardType.Phone else KeyboardType.Text))

@Composable
private fun Row2(a: String, b: String) = Row(Modifier.fillMaxWidth()) { Text(a, Modifier.weight(1f), color = Mawred.colors.mute); Text(b, style = Tabular) }

@Composable
private fun TempPassword(pw: String?, onDone: () -> Unit) {
    if (pw == null) return
    Card { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("كلمة المرور المؤقتة (تظهر مرة واحدة):", style = MaterialTheme.typography.titleSmall)
        Text(pw, style = MaterialTheme.typography.headlineSmall.merge(Tabular), color = Mawred.colors.primary)
        Text("يُطلب تغييرها عند أول دخول.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
        TextButton(onDone) { Text("تم") }
    } }
}

// ===== المحلات =====
@Composable
private fun ShopsSection(vm: AdminVm, user: SessionUser, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var q by rememberSaveable { mutableStateOf("") }
    var mode by rememberSaveable { mutableStateOf<String?>(null) }
    val path = "/admin/shops?q=${enc(q)}"
    LaunchedEffect(path) { vm.load(path) }
    when {
        mode == "new" -> { ShopForm(vm, user) { mode = null; vm.load(path, true) }; return }
        mode != null -> { ShopDetail(vm, user, mode!!) { mode = null; vm.load(path, true) }; return }
    }
    SectionList(pad) {
        item {
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("بحث بالاسم أو الهاتف أو المدينة") }, singleLine = true, leadingIcon = { Icon(Icons.search, null) })
            if (user.can("shops.create")) PrimaryButton("محل جديد", { mode = "new" })
        }
        val shops = st.data[path].a("shops")
        if (path in st.loading && shops.isEmpty()) item { Skeleton() }
        else if (shops.isEmpty()) item { Empty("لا محلات") }
        items(shops, key = { it.s("id") }) { s ->
            Card(Modifier.clickable { mode = s.s("id") }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.s("name"), style = MaterialTheme.typography.titleSmall)
                        Text("${s.s("ownerName")} · ${Money.ltr(s.s("phone"))} · ${s.s("city")}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(Money.format(s.l("balance")), style = Tabular, color = if (s.l("balance") > 0) Mawred.colors.danger else Mawred.colors.ink)
                        if (s.s("status") != "active") Text("موقوف", color = Mawred.colors.danger, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ShopForm(vm: AdminVm, user: SessionUser, done: () -> Unit) {
    val st by vm.s.collectAsStateWithLifecycle()
    val f = remember { mutableStateListOf("", "", "", "", "", "", "", "") }
    val labels = listOf("اسم المحل", "اسم صاحب المحل", "الهاتف الأساسي", "هاتف بديل", "المنطقة", "المدينة", "العنوان التفصيلي", "اسم المستخدم لصاحب المحل (لاتيني)")
    var credit by remember { mutableStateOf(false) }
    var limit by remember { mutableStateOf("") }
    var temp by remember { mutableStateOf<String?>(null) }
    SectionList(PaddingValues(16.dp)) {
        item { TempPassword(temp) { temp = null; done() } }
        if (temp == null) {
            items(labels.size) { i -> Field(labels[i], f[i], { f[i] = it }, phone = i in 2..3) }
            if (user.can("shops.credit.manage")) item {
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(credit, { credit = it }); Text("يسمح بالدفع الآجل") }
                if (credit) Field("الحد الائتماني (₪)", limit, { limit = it }, number = true)
            }
            item {
                PrimaryButton("إنشاء المحل", {
                    val body = buildJsonObject {
                        put("name", f[0]); put("ownerName", f[1]); put("phone", f[2]); put("phoneAlt", f[3]); put("region", f[4]); put("city", f[5]); put("address", f[6])
                        putJsonObject("owner") { put("username", f[7]) }
                        if (user.can("shops.credit.manage")) {
                            putJsonArray("paymentTerms") { add(JsonPrimitive("cash")); if (credit) add(JsonPrimitive("credit")) }
                            putJsonObject("credit") { put("enabled", credit); put("limit", Money.parse(limit) ?: 0) }
                        }
                    }
                    vm.act("أُنشئ المحل وحساب صاحبه", "POST", "/admin/shops", body, idem = true) { r -> temp = r.s("tempPassword").ifBlank { null } ?: run { done(); null } }
                }, enabled = !st.busy)
            }
        }
    }
}

@Composable
private fun ShopDetail(vm: AdminVm, user: SessionUser, id: String, back: () -> Unit) {
    val st by vm.s.collectAsStateWithLifecycle()
    val path = "/shops/$id"
    val stPath = "/shops/$id/statement"
    LaunchedEffect(id) { vm.load(path, true); if (user.can("accounts.view")) vm.load(stPath, true) }
    val shop = st.data[path].o("shop")
    var reason by remember { mutableStateOf("") }
    var limit by remember(shop) { mutableStateOf(Money.format(shop.o("credit").l("limit")).substringBefore(" ").replace(",", "")) }
    BackHandler(onBack = back)
    SectionList(PaddingValues(16.dp)) {
        item { TextButton(back) { Text("‹ المحلات") } }
        if (shop == null) { item { Skeleton() }; return@SectionList }
        item {
            Text(shop.s("name"), style = MaterialTheme.typography.headlineSmall)
            Text("${shop.s("ownerName")} · ${Money.ltr(shop.s("phone"))} · ${shop.s("city")} — ${shop.s("address")}", color = Mawred.colors.mute)
            if (shop.s("adminNotes").isNotBlank()) Notice(shop.s("adminNotes"))
        }
        st.data[stPath]?.let { sp -> item {
            val stmt = sp.o("statement")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Kpi("المستحق", Money.format(stmt.l("due")), Modifier.weight(1f), alert = stmt.l("due") > 0)
                Kpi("رصيد دائن", Money.format(stmt.l("creditBalance")), Modifier.weight(1f))
            }
            if (sp.o("credit").b("enabled")) Kpi("المتاح من الحد", Money.format(sp.o("credit").l("available")))
        } }
        if (user.can("shops.credit.manage")) item {
            Field("الحد الائتماني (₪) — 0 = نقدي فقط", limit, { limit = it }, number = true)
            OutlinedButton({
                val l = Money.parse(limit) ?: 0
                vm.act("حُدّث الحد الائتماني", "PATCH", "/admin/shops/$id", buildJsonObject {
                    putJsonObject("credit") { put("enabled", l > 0); put("limit", l) }
                    putJsonArray("paymentTerms") { add(JsonPrimitive("cash")); if (l > 0) add(JsonPrimitive("credit")) }
                }, reload = listOf(path))
            }, Modifier.fillMaxWidth(), enabled = !st.busy) { Text("حفظ الحد") }
        }
        if (user.can("shops.suspend")) item {
            Field("سبب الإيقاف أو التفعيل", reason, { reason = it })
            val active = shop.s("status") == "active"
            OutlinedButton({ vm.act(if (active) "أُوقف المحل" else "فُعّل المحل", "POST", "/admin/shops/$id/status", buildJsonObject { put("status", if (active) "suspended" else "active"); put("reason", reason) }, reload = listOf(path)) },
                Modifier.fillMaxWidth(), enabled = !st.busy && reason.trim().length >= 3) { Text(if (active) "إيقاف المحل" else "تفعيل المحل", color = if (active) Mawred.colors.danger else Mawred.colors.primary) }
        }
    }
}

// ===== المالية =====
private val INV = mapOf("open" to "غير مدفوعة", "partial" to "مدفوعة جزئياً", "paid" to "مدفوعة", "void" to "ملغاة")

@Composable
private fun FinanceSection(vm: AdminVm, user: SessionUser, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(if (user.can("payments.create")) "pay" else "inv") }
    var shopId by rememberSaveable { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("cash") }
    var reason by remember { mutableStateOf("") }
    var dir by remember { mutableStateOf("debit") }
    var invStatus by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.load("/admin/shops") }
    val shops = st.data["/admin/shops"].a("shops")
    val payPath = "/shops/$shopId/payments"
    val invPath = "/invoices" + if (invStatus.isNotBlank()) "?status=$invStatus" else ""
    LaunchedEffect(shopId, tab) { if (shopId.isNotBlank() && tab == "pay") vm.load(payPath, true) }
    LaunchedEffect(invPath, tab) { if (tab == "inv") vm.load(invPath, true) }
    SectionList(pad) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (user.can("payments.create")) item { FilterChip(tab == "pay", { tab = "pay" }, { Text("تسجيل دفعة") }) }
                item { FilterChip(tab == "inv", { tab = "inv" }, { Text("الفواتير") }) }
                if (user.can("accounts.adjust")) item { FilterChip(tab == "adj", { tab = "adj" }, { Text("تسوية يدوية") }) }
            }
        }
        if (tab != "inv") {
            item { Text("المحل", style = MaterialTheme.typography.titleSmall) }
            item { LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(shops, key = { it.s("id") }) { s -> FilterChip(shopId == s.s("id"), { shopId = s.s("id") }, { Text("${s.s("name")} · ${Money.format(s.l("balance"))}") }) } } }
        }
        when (tab) {
            "pay" -> {
                item {
                    Field("المبلغ (₪)", amount, { amount = it }, number = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilterChip(method == "cash", { method = "cash" }, { Text("نقداً") }); FilterChip(method == "bank_transfer", { method = "bank_transfer" }, { Text("تحويل بنكي") }) }
                    PrimaryButton("تسجيل الدفعة", {
                        val a = Money.parse(amount)
                        if (a != null && a > 0) vm.act("سُجّلت الدفعة وتوزّعت على أقدم الفواتير", "POST", "/payments", buildJsonObject { put("shopId", shopId); put("amount", a); put("method", method); put("notes", "") }, idem = true, reload = listOf(payPath, "/admin/shops")) { amount = "" }
                    }, enabled = !st.busy && shopId.isNotBlank() && (Money.parse(amount) ?: 0) > 0)
                }
                if (shopId.isNotBlank()) {
                    item { Text("دفعات المحل", style = MaterialTheme.typography.titleSmall); if (user.can("payments.reverse")) Field("سبب العكس", reason, { reason = it }) }
                    items(st.data[payPath].a("payments"), key = { it.s("id") }) { p ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(Money.format(p.l("amount")), style = Tabular); Text("${Money.ltr(p.s("number"))} · ${fmtDate(p.l("at"))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
                            if (p.s("status") == "reversed") Text("معكوسة", color = Mawred.colors.danger)
                            else if (user.can("payments.reverse")) TextButton({ vm.act("عُكست الدفعة بحركة عكسية", "POST", "/payments/${p.s("id")}/reverse", buildJsonObject { put("reason", reason) }, reload = listOf(payPath, "/admin/shops")) }, enabled = reason.trim().length >= 3) { Text("عكس", color = Mawred.colors.danger) }
                        }
                    }
                }
            }
            "adj" -> item {
                Notice("الدفتر لا يُعدَّل؛ كل تصحيح حركة جديدة بسبب واضح وتظهر في كشف المحل.")
                Field("المبلغ (₪)", amount, { amount = it }, number = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FilterChip(dir == "debit", { dir = "debit" }, { Text("على المحل") }); FilterChip(dir == "credit", { dir = "credit" }, { Text("للمحل") }) }
                Field("السبب", reason, { reason = it })
                PrimaryButton("تسجيل التسوية", {
                    val a = Money.parse(amount) ?: 0
                    vm.act("سُجّلت التسوية في الدفتر", "POST", "/ledger/adjustments", buildJsonObject { put("shopId", shopId); put("amount", if (dir == "debit") a else -a); put("reason", reason); put("opening", false) }, idem = true, reload = listOf("/admin/shops")) { amount = ""; reason = "" }
                }, enabled = !st.busy && shopId.isNotBlank() && (Money.parse(amount) ?: 0) > 0 && reason.trim().length >= 3)
            }
            else -> {
                item { LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { item { FilterChip(invStatus == "", { invStatus = "" }, { Text("الكل") }) }; items(INV.entries.toList()) { (k, v) -> FilterChip(invStatus == k, { invStatus = k }, { Text(v) }) } } }
                val inv = st.data[invPath].a("invoices")
                if (inv.isEmpty()) item { Empty("لا فواتير") }
                items(inv, key = { it.s("id") }) { i ->
                    Card { Column {
                        Row { Text(Money.ltr(i.s("number")), Modifier.weight(1f), style = Tabular); Text(INV[i.s("status")] ?: i.s("status"), color = Mawred.colors.primary) }
                        Text("${i.s("shopName")} · ${fmtDate(i.l("issuedAt"))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                        Row2("الإجمالي", Money.format(i.l("total"))); Row2("المدفوع", Money.format(i.l("paid"))); Row2("المتبقي", Money.format(i.l("remaining")))
                    } }
                }
            }
        }
    }
}

// ===== العروض =====
private val PROMO = mapOf("item_percent" to "خصم نسبة على صنف", "item_amount" to "خصم مبلغ على الوحدة", "qty_percent" to "خصم عند كمية", "bxgy" to "اشترِ واحصل", "bundle_percent" to "خصم مجموعة")

@Composable
private fun PromotionsSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load("/promotions"); vm.load("/catalog") }
    var name by remember { mutableStateOf("") }
    var percent by remember { mutableStateOf("10") }
    var days by remember { mutableStateOf("7") }
    var q by remember { mutableStateOf("") }
    val chosen = remember { mutableStateListOf<String>() }
    val products = st.data["/catalog"].a("products")
    val names = products.associate { it.s("id") to it.s("name") }
    SectionList(pad) {
        item { Text("عرض خصم نسبة جديد", style = MaterialTheme.typography.titleMedium); Text("للأنواع الأخرى من العروض استخدم لوحة الويب.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
        item { Field("اسم العرض", name, { name = it }); Field("نسبة الخصم %", percent, { percent = it }, number = true); Field("المدة بالأيام من اليوم", days, { days = it }, number = true); Field("ابحث عن منتج لإضافته", q, { q = it }) }
        if (q.isNotBlank()) items(products.filter { it.s("name").contains(q) }.take(8), key = { "c" + it.s("id") }) { p ->
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(p.s("id") in chosen, { v -> if (v) chosen.add(p.s("id")) else chosen.remove(p.s("id")) }); Text(p.s("name")) }
        }
        item {
            if (chosen.isNotEmpty()) Text("المختار: ${chosen.joinToString("، ") { names[it] ?: it }}", style = MaterialTheme.typography.bodySmall)
            PrimaryButton("إنشاء العرض", {
                val now = System.currentTimeMillis()
                vm.act("أُنشئ العرض", "POST", "/admin/promotions", buildJsonObject {
                    put("name", name); put("type", "item_percent"); putJsonArray("productIds") { chosen.forEach { add(JsonPrimitive(it)) } }
                    put("startsAt", now); put("endsAt", now + (days.toLongOrNull() ?: 7) * 86_400_000L); put("percentBp", Math.round((percent.toDoubleOrNull() ?: 0.0) * 100)); put("terms", ""); put("minPurchase", 0)
                }, idem = true, reload = listOf("/promotions")) { name = ""; chosen.clear() }
            }, enabled = !st.busy && name.isNotBlank() && chosen.isNotEmpty())
        }
        item { HorizontalDivider(); Text("العروض الحالية", style = MaterialTheme.typography.titleMedium) }
        items(st.data["/promotions"].a("promotions"), key = { it.s("id") }) { p ->
            Card { Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(p.s("name"), style = MaterialTheme.typography.titleSmall)
                    Text("${PROMO[p.s("type")] ?: p.s("type")} · ${fmtDate(p.l("startsAt"))} — ${fmtDate(p.l("endsAt"))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    Text(p.strs("productIds").joinToString("، ") { names[it] ?: it }, style = MaterialTheme.typography.bodySmall)
                }
                Switch(p.b("active"), { v -> vm.act(if (v) "فُعّل العرض" else "أُوقف العرض", "PATCH", "/admin/promotions/${p.s("id")}", buildJsonObject { put("active", v) }, reload = listOf("/promotions")) })
            } }
        }
    }
}

// ===== التقارير =====
private val MONEY_COL = Regex("amount|net|gross|revenue|cost|profit|balance|discount|credited|collected|total|due|paid")

@Composable
private fun ReportsSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var rep by rememberSaveable { mutableStateOf<String?>(null) }
    var range by rememberSaveable { mutableStateOf(30) }
    LaunchedEffect(Unit) { vm.load("/reports") }
    val from = System.currentTimeMillis() - range * 86_400_000L
    val path = rep?.let { "/reports/$it?from=${from / 3_600_000 * 3_600_000}" }
    LaunchedEffect(path) { path?.let { vm.load(it, true) } }
    SectionList(pad) {
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(listOf(1 to "اليوم", 7 to "7 أيام", 30 to "30 يوماً", 365 to "سنة")) { (d, l) -> FilterChip(range == d, { range = d }, { Text(l) }) } } }
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(st.data["/reports"].a("reports").filter { it.b("allowed") }, key = { it.s("id") }) { r -> FilterChip(rep == r.s("id"), { rep = r.s("id") }, { Text(r.s("title")) }) } } }
        val r = path?.let { st.data[it] }
        if (rep != null && r == null) item { Skeleton() }
        if (r != null) {
            item { Text(r.s("title"), style = MaterialTheme.typography.titleMedium); if (r.s("note").isNotBlank()) Text(r.s("note"), color = Mawred.colors.mute) }
            val cols = (r["columns"] as? JsonArray)?.map { it.jsonArray.let { c -> c[0].jsonPrimitive.content to c[1].jsonPrimitive.content } }.orEmpty()
            val rows = r.a("rows")
            if (rows.isEmpty()) item { Empty("لا بيانات في هذه الفترة") }
            items(rows.size) { i ->
                Card { Column { cols.forEach { (k, l) ->
                    val v = rows[i][k]
                    val text = (v as? JsonPrimitive)?.let { p -> if (MONEY_COL.containsMatchIn(k) && p.longOrNull != null) Money.format(p.longOrNull!!) else p.contentOrNull.orEmpty() }.orEmpty()
                    Row2(l, text)
                } } }
            }
        }
    }
}

// ===== التوصيل =====
@Composable
private fun DeliverySection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load("/delivery/board", true) }
    val d = st.data["/delivery/board"]
    SectionList(pad) {
        if (d == null) { item { Skeleton() }; return@SectionList }
        item { Kpi("طلبات متأخرة", d.l("overdue").toString(), alert = d.l("overdue") > 0) }
        item { Text("المندوبون", style = MaterialTheme.typography.titleMedium) }
        items(d.a("agents"), key = { it.s("uid") }) { a -> Row2("${a.s("displayName")} · ${Money.ltr(a.s("phone"))}", "${a.l("activeTasks")} مهمة") }
        d.o("regions")?.forEach { (region, list) ->
            item { Text(region, style = MaterialTheme.typography.titleMedium) }
            items((list as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty(), key = { region + it.s("id") }) { o ->
                Row2("${Money.ltr(o.s("number"))} ${o.s("shopName")}", if (o.b("overdue")) "متأخر" else "")
            }
        }
    }
}

// ===== الدعم =====
private val TICKET = mapOf("open" to "مفتوحة", "in_progress" to "قيد المعالجة", "resolved" to "محلولة", "closed" to "مغلقة")

@Composable
private fun SupportSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var status by rememberSaveable { mutableStateOf("open") }
    val path = "/support?status=$status"
    LaunchedEffect(path) { vm.load(path, true) }
    SectionList(pad) {
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(TICKET.entries.toList()) { (k, v) -> FilterChip(status == k, { status = k }, { Text(v) }) } } }
        val list = st.data[path].a("tickets")
        if (list.isEmpty()) item { Empty("لا تذاكر") }
        items(list, key = { it.s("id") }) { t ->
            var reply by remember(t.s("id")) { mutableStateOf("") }
            Card { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(t.s("subject"), style = MaterialTheme.typography.titleSmall); Text(t.s("body"))
                t.a("replies").forEach { r -> Notice(r.s("text")) }
                OutlinedTextField(reply, { reply = it }, Modifier.fillMaxWidth(), label = { Text("الرد") })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton({ vm.act("أُرسل الرد", "PATCH", "/admin/support/${t.s("id")}", buildJsonObject { put("reply", reply); put("status", "in_progress") }, reload = listOf(path)) }, enabled = reply.isNotBlank()) { Text("رد") }
                    OutlinedButton({ vm.act("أُغلقت التذكرة", "PATCH", "/admin/support/${t.s("id")}", buildJsonObject { put("status", "resolved") }, reload = listOf(path)) }) { Text("تم الحل") }
                }
            } }
        }
    }
}

// ===== الإعدادات =====
private val DAYS = listOf("الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت")

@Composable
private fun SettingsSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load("/settings", true) }
    val s0 = st.data["/settings"].o("settings")
    if (s0 == null) { SectionList(pad) { item { Skeleton() } }; return }
    val days = remember(s0) { mutableStateListOf<Int>().apply { addAll((s0["workDays"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.intOrNull }.orEmpty()) } }
    val num = { k: String -> (s0[k] as? JsonPrimitive)?.contentOrNull.orEmpty() }
    val f = remember(s0) { androidx.compose.runtime.mutableStateMapOf(
        "platformName" to s0.s("platformName"), "orderIntakeStart" to s0.s("orderIntakeStart"), "orderIntakeEnd" to s0.s("orderIntakeEnd"), "deliveryStart" to s0.s("deliveryStart"), "deliveryEnd" to s0.s("deliveryEnd"),
        "slaWorkingHours" to num("slaWorkingHours"), "defaultPrepMinutes" to num("defaultPrepMinutes"), "creditWarnPercent" to num("creditWarnPercent"), "backupRetentionDays" to num("backupRetentionDays"),
        "sup.name" to s0.o("supplier").s("name"), "sup.phone" to s0.o("supplier").s("phone"), "sup.address" to s0.o("supplier").s("address"), "sup.taxId" to s0.o("supplier").s("taxId"),
    ) }
    val flags = remember(s0) { androidx.compose.runtime.mutableStateMapOf("newOrderSound" to (s0["newOrderSound"] as? JsonPrimitive)?.booleanOrNull.let { it != false }, "creditBlocksDeferredOrders" to (s0["creditBlocksDeferredOrders"] as? JsonPrimitive)?.booleanOrNull.let { it != false }, "mfaFeature" to s0.b("mfaFeature")) }
    val holidays = remember(s0) { mutableStateListOf<String>().apply { addAll(s0.strs("holidays")) } }
    val methods = remember(s0) { mutableStateListOf<JsonObject>().apply { addAll(s0.a("paymentMethods")) } }
    var holiday by remember { mutableStateOf("") }
    @Composable fun F(label: String, k: String, number: Boolean = false) = Field(label, f[k].orEmpty(), { f[k] = it }, number = number)
    @Composable fun Toggle(title: String, hint: String?, k: String) = SwitchRow(title, hint, flags[k] == true) { flags[k] = it }
    SectionList(pad) {
        item { SettingsCard("المنصة والمورد", Icons.home) { F("اسم المنصة", "platformName"); F("اسم المورد على الفواتير", "sup.name"); Field("هاتف المورد", f["sup.phone"].orEmpty(), { f["sup.phone"] = it }, phone = true); F("العنوان", "sup.address"); F("الرقم الضريبي (اختياري)", "sup.taxId") } }
        item {
            SettingsCard("أيام وأوقات العمل", Icons.clock) {
                Text("الأيام غير المختارة عطلة أسبوعية", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(7) { i -> FilterChip(i in days, { if (i in days) days.remove(i) else days.add(i) }, { Text(DAYS[i]) }) } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Column(Modifier.weight(1f)) { F("بداية الاستقبال", "orderIntakeStart") }; Column(Modifier.weight(1f)) { F("نهايته", "orderIntakeEnd") } }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Column(Modifier.weight(1f)) { F("بداية التوصيل", "deliveryStart") }; Column(Modifier.weight(1f)) { F("نهايته", "deliveryEnd") } }
                Text("العطلات الرسمية", style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(holiday, { holiday = it }, Modifier.weight(1f), label = { Text("YYYY-MM-DD") }, singleLine = true)
                    TextButton({ if (Regex("""^\d{4}-\d{2}-\d{2}$""").matches(holiday) && holiday !in holidays) { holidays.add(holiday); holidays.sort(); holiday = "" } }) { Text("إضافة") }
                }
                if (holidays.isEmpty()) Text("لا عطلات مسجلة", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                holidays.toList().forEach { h -> Row(verticalAlignment = Alignment.CenterVertically) { Text(Money.ltr(h), Modifier.weight(1f), style = Tabular); TextButton({ holidays.remove(h) }) { Text("إزالة", color = Mawred.colors.danger) } } }
            }
        }
        item { SettingsCard("الطلبات والتوصيل", Icons.truck) { F("مدة التوصيل المستهدفة (ساعات عمل)", "slaWorkingHours", true); F("مدة التجهيز الافتراضية (دقيقة)", "defaultPrepMinutes", true); Toggle("صوت عند وصول طلب جديد", "تنبيه مسموع لموظفي الطلبات", "newOrderSound") } }
        item {
            SettingsCard("المالية والدفع", Icons.wallet) {
                Text("طرق الدفع المتاحة للمحلات", style = MaterialTheme.typography.titleSmall, color = Mawred.colors.ink)
                methods.toList().forEachIndexed { i, m -> SwitchRow(m.s("label"), if (m.s("id") == "cash") "النقدي يبقى مفعّلاً دائماً" else null, m.b("enabled"), enabled = m.s("id") != "cash") { v -> methods[i] = JsonObject(m + ("enabled" to JsonPrimitive(v))) } }
                F("تنبيه الائتمان عند استهلاك (%)", "creditWarnPercent", true)
                Toggle("منع الطلب الآجل عند تجاوز حد الائتمان", "المحل يطلب نقداً فقط حتى يسدد", "creditBlocksDeferredOrders")
            }
        }
        item {
            SettingsCard("الأمان والنسخ", Icons.shield) {
                Toggle("التحقق بخطوتين", "عند التشغيل يستطيع كل مستخدم تفعيله لحسابه من «أمان حسابي». الإيقاف يلغي طلب الرمز للجميع فوراً.", "mfaFeature")
                F("الاحتفاظ بالنسخ الاحتياطية (يوم)", "backupRetentionDays", true)
            }
        }
        item {
            PrimaryButton(if (st.busy) "جارٍ الحفظ…" else "حفظ الإعدادات", {
                vm.act("حُفظت الإعدادات", "PATCH", "/admin/settings", buildJsonObject {
                    put("platformName", f["platformName"].orEmpty().trim())
                    putJsonArray("workDays") { days.sorted().forEach { add(JsonPrimitive(it)) } }
                    listOf("orderIntakeStart", "orderIntakeEnd", "deliveryStart", "deliveryEnd").forEach { put(it, f[it].orEmpty().trim()) }
                    f["slaWorkingHours"]?.toDoubleOrNull()?.let { put("slaWorkingHours", it) }
                    listOf("defaultPrepMinutes", "creditWarnPercent", "backupRetentionDays").forEach { k -> f[k]?.toLongOrNull()?.let { put(k, it) } }
                    putJsonArray("holidays") { holidays.forEach { add(JsonPrimitive(it)) } }
                    put("paymentMethods", JsonArray(methods.toList()))
                    put("supplier", buildJsonObject { put("name", f["sup.name"].orEmpty()); put("phone", f["sup.phone"].orEmpty()); put("address", f["sup.address"].orEmpty()); put("taxId", f["sup.taxId"].orEmpty()) })
                    flags.forEach { (k, v) -> put(k, v) }
                }, reload = listOf("/settings"))
            }, enabled = !st.busy)
            st.error?.let { Text(it, color = Mawred.colors.danger, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun SettingsCard(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, content: @Composable ColumnScope.() -> Unit) {
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Icon(icon, null, tint = Mawred.colors.primary); Text(title, style = MaterialTheme.typography.titleMedium, color = Mawred.colors.ink) }
            content()
        }
    }
}

@Composable
private fun SwitchRow(title: String, hint: String?, on: Boolean, enabled: Boolean = true, set: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = androidx.compose.ui.semantics.Role.Switch) { set(!on) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = Mawred.colors.ink)
            hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
        }
        Switch(on, null, enabled = enabled)
    }
}

// ===== النسخ الاحتياطي =====
@Composable
private fun BackupsSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.load("/admin/backups", true) }
    SectionList(pad) {
        item {
            Text("نسخة يومية مشفرة تلقائياً الساعة 01:00 UTC.", color = Mawred.colors.mute)
            PrimaryButton(if (st.busy) "جارٍ النسخ…" else "نسخة الآن", { vm.act("اكتملت النسخة", "POST", "/admin/backups/run", reload = listOf("/admin/backups")) }, enabled = !st.busy)
        }
        items(st.data["/admin/backups"].a("backups"), key = { it.s("id") }) { b ->
            Row2(fmtDate(b.l("at")), if (b.s("status") == "ok") "ناجحة · ${b.l("docs")} مستند · ${b.l("bytes") / 1024} KB" else b.s("error").ifBlank { "فشلت" })
        }
    }
}

// ===== سجل العمليات =====
/** نفس أسماء الويب: من عدّل السعر، من سجّل الدفعة، من ألغى الطلب (SRS 11.3). */
val AUDIT_ACTIONS = linkedMapOf(
    "orders.transition" to "تغيير حالة طلب", "orders.submit" to "إرسال طلب", "orders.change.request" to "تعديل طلب", "delivery.assign" to "إسناد لمندوب",
    "products.price" to "تعديل سعر", "products.update" to "تعديل منتج", "products.availability" to "تغيير توفر", "products.create" to "إضافة منتج", "products.archive" to "أرشفة منتج",
    "payments.create" to "تسجيل دفعة", "payments.reverse" to "عكس دفعة", "invoices.issue" to "إصدار فاتورة", "invoices.void" to "إلغاء فاتورة", "invoices.return" to "مرتجع", "ledger.adjust" to "تسوية رصيد",
    "users.create" to "إنشاء مستخدم", "users.suspend" to "إيقاف مستخدم", "shops.suspend" to "إيقاف محل", "users.update" to "تعديل مستخدم", "users.password.reset" to "إعادة تعيين كلمة مرور", "shops.create" to "إنشاء محل", "shops.update" to "تعديل محل",
    "promotions.create" to "إضافة عرض", "promotions.update" to "تعديل عرض", "settings.update" to "تعديل الإعدادات", "roles.upsert" to "حفظ دور", "auth.login" to "تسجيل دخول",
)
private val AUDIT_SKIP = setOf("updatedAt", "createdAt", "searchKeys", "version")

/** الحقول التي تغيّرت فقط بين قبل وبعد. */
fun auditChanges(before: JsonObject?, after: JsonObject?): List<Triple<String, String, String>> {
    val keys = (before?.keys.orEmpty() + after?.keys.orEmpty()).filterNot { it in AUDIT_SKIP }.distinct()
    fun show(e: kotlinx.serialization.json.JsonElement?) = when (e) { null, is kotlinx.serialization.json.JsonNull -> "—"; is JsonPrimitive -> e.content; else -> e.toString().take(120) }
    return keys.mapNotNull { k -> val a = before?.get(k); val b = after?.get(k); if (a == b) null else Triple(k, show(a), show(b)) }
}

@Composable
private fun AuditSection(vm: AdminVm, pad: PaddingValues) {
    val st by vm.s.collectAsStateWithLifecycle()
    var action by rememberSaveable { mutableStateOf<String?>(null) }
    var actor by rememberSaveable { mutableStateOf<String?>(null) }
    val path = when { action != null -> "/admin/audit?action=${enc(action!!)}"; actor != null -> "/admin/audit?actor=${enc(actor!!)}"; else -> "/admin/audit" }
    LaunchedEffect(path) { vm.load(path, true) }
    LaunchedEffect(Unit) { vm.load("/admin/users") }
    val users = st.data["/admin/users"].a("users")
    val logs = st.data[path].a("logs")
    SectionList(pad) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { FilterChip(action == null && actor == null, { action = null; actor = null }, { Text("الكل") }) }
                items(AUDIT_ACTIONS.entries.toList(), key = { it.key }) { (k, l) -> FilterChip(action == k, { action = if (action == k) null else k; actor = null }, { Text(l) }) }
            }
        }
        if (users.isNotEmpty()) item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(users, key = { it.s("uid") }) { u -> FilterChip(actor == u.s("uid"), { actor = if (actor == u.s("uid")) null else u.s("uid"); action = null }, { Text(u.s("displayName")) }) }
            }
        }
        if (st.data[path] == null) item { Skeleton() }
        else if (logs.isEmpty()) item { Empty("لا توجد عمليات مطابقة") }
        items(logs, key = { it.s("id") }) { l ->
            var open by rememberSaveable(l.s("id")) { mutableStateOf(false) }
            val diff = auditChanges(l.o("before"), l.o("after"))
            Card(Modifier.clickable(enabled = diff.isNotEmpty()) { open = !open }) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth()) {
                        Text(AUDIT_ACTIONS[l.s("action")] ?: l.s("action"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = if (l.s("result") == "ok") Mawred.colors.ink else Mawred.colors.danger)
                        Text(java.text.SimpleDateFormat("d/M HH:mm", java.util.Locale("ar")).format(java.util.Date(l.l("at"))), style = Tabular, color = Mawred.colors.mute)
                    }
                    Text("${l.s("actor")} · ${l.o("entity").s("kind")} ${Money.ltr(l.o("entity").s("id").take(10))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    if (diff.isNotEmpty()) Text(if (open) "إخفاء التغييرات" else "ما تغيّر (${diff.size})", style = MaterialTheme.typography.labelMedium, color = Mawred.colors.primary)
                    if (open) diff.forEach { (k, a, b) -> Row2(k, "${Money.ltr(a)} ← ${Money.ltr(b)}") }
                }
            }
        }
        val next = st.data[path]?.get("next") as? JsonPrimitive
        if (next?.longOrNull != null) item { Text("تُعرض آخر 50 عملية؛ استخدم الفلاتر للوصول لعملية بعينها.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
    }
}
