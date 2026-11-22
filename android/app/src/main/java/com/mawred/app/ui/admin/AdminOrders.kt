package com.mawred.app.ui.admin

import android.graphics.ImageDecoder
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.data.AdminOrder
import com.mawred.app.data.AdminRepository
import com.mawred.app.data.Agent
import com.mawred.app.data.CatalogRepository
import com.mawred.app.data.Cutout
import com.mawred.app.data.OrderDetail
import com.mawred.app.data.OrderRepository
import com.mawred.app.data.Product
import com.mawred.app.data.api.ApiException
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.shop.ProductShelf
import com.mawred.app.ui.shop.StatusChip
import com.mawred.app.ui.shop.fmtDate
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

private val FILTERS = listOf("today" to "اليوم", "all" to "الكل", "new" to "الجديدة", "review" to "قيد المراجعة", "preparing" to "قيد التجهيز", "ready" to "جاهزة", "delivering" to "قيد التوصيل", "overdue" to "المتأخرة", "completed" to "المكتملة", "cancelled" to "الملغاة")

data class AdminOrdersUi(val filter: String = "new", val list: List<AdminOrder>? = null, val open: OrderDetail? = null, val agents: List<Agent> = emptyList(), val busy: Boolean = false, val error: String? = null, val info: String? = null)

@HiltViewModel
class AdminOrdersViewModel @Inject constructor(private val admin: AdminRepository, private val orders: OrderRepository, val states: OrderStates) : ViewModel() {
    private val _ui = MutableStateFlow(AdminOrdersUi())
    val ui: StateFlow<AdminOrdersUi> = _ui
    init { load() }

    fun filter(f: String) { _ui.update { it.copy(filter = f, list = null) }; load() }
    /** فتح من بطاقة في اللوحة: فلتر محدد و/أو طلب بعينه. */
    fun focus(filter: String?, id: String?) {
        if (filter != null && filter != _ui.value.filter) filter(filter)
        if (id != null) open(id)
    }
    fun load() = viewModelScope.launch {
        try { _ui.update { it.copy(list = admin.orders(it.filter), error = null) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message, list = it.list ?: emptyList()) } }
    }
    fun open(id: String?) = viewModelScope.launch {
        if (id == null) { _ui.update { it.copy(open = null, info = null) }; load(); return@launch }
        try {
            val d = orders.order(id)
            val agents = runCatching { admin.agents() }.getOrDefault(emptyList())
            _ui.update { it.copy(open = d, agents = agents, error = null) }
        } catch (e: ApiException) { _ui.update { it.copy(error = e.message) } }
    }
    private fun act(ok: String, block: suspend (String) -> Unit) {
        val id = _ui.value.open?.order?.id ?: return
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, error = null, info = null) }
            try { block(id); _ui.update { it.copy(open = orders.order(id), busy = false, info = ok) } } catch (e: ApiException) { _ui.update { it.copy(busy = false, error = e.message) } }
        }
    }
    fun transition(to: String, reason: String) = act("تم: ${states.label(to)}") { orders.transition(it, to, reason) }
    fun assign(agentId: String) = act("أُسند للمندوب") { admin.assignAgent(it, agentId) }
}

@Composable
fun AdminOrdersScreen(vm: AdminOrdersViewModel, padding: PaddingValues, focus: Focus? = null, consumed: () -> Unit = {}) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(focus) { focus?.let { vm.focus(it.filter, it.id); consumed() } }
    val d = ui.open
    if (d != null) { BackHandler { vm.open(null) }; AdminOrderDetail(vm, ui, d, padding); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("الطلبات", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) }
        item { LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(FILTERS) { (id, l) -> FilterChip(ui.filter == id, { vm.filter(id) }, { Text(l) }) } } }
        val list = ui.list
        if (list == null) items(List(4) { it }) { Skeleton() }
        else if (list.isEmpty()) item { Empty("لا طلبات في هذا التصنيف") }
        else items(list, key = { it.id }) { o ->
            Card(Modifier.clickable { vm.open(o.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(o.shopName, style = MaterialTheme.typography.titleSmall)
                        Text("${Money.ltr(o.number)} · ${fmtDate(o.createdAt)} · ${if (o.paymentMethod == "credit") "آجل" else "نقدي"}", style = MaterialTheme.typography.bodySmall, color = if (o.sla?.overdue == true) Mawred.colors.danger else Mawred.colors.mute)
                    }
                    StatusChip(vm.states, o.status)
                    Text(Money.format(o.total), style = MaterialTheme.typography.titleSmall.merge(Tabular))
                }
            }
        }
    }
}

@Composable
private fun AdminOrderDetail(vm: AdminOrdersViewModel, ui: AdminOrdersUi, d: OrderDetail, padding: PaddingValues) {
    var reason by remember(d.order.id) { mutableStateOf("") }
    val o = d.order
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { TextButton({ vm.open(null) }) { Text("‹ الطلبات") } }
        item { Row(verticalAlignment = Alignment.CenterVertically) { Text(Money.ltr(o.number), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall.merge(Tabular)); StatusChip(vm.states, o.status) } }
        items(o.items, key = { "${it.productId}|${it.unitId}" }) { l ->
            Row { Text("${l.name} — ${l.unitName} × ${Money.ltr(Money.formatQty(l.qtyMilli))}", Modifier.weight(1f)); Text(Money.format(l.total), style = Tabular) }
        }
        item { Row { Text("الإجمالي", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text(Money.format(o.totals.total), style = MaterialTheme.typography.titleLarge.merge(Tabular)) } }
        o.notes?.takeIf { it.isNotBlank() }?.let { item { Text("ملاحظات المحل: $it", color = Mawred.colors.mute) } }
        if (d.actions.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (d.actions.any { it.reason }) OutlinedTextField(reason, { reason = it }, Modifier.fillMaxWidth(), label = { Text("السبب (للرفض والإلغاء)") })
                d.actions.forEach { a -> OutlinedButton({ vm.transition(a.to, reason) }, Modifier.fillMaxWidth(), enabled = !ui.busy && (!a.reason || reason.trim().length >= 3)) { Text(vm.states.label(a.to), color = if (a.reason) Mawred.colors.danger else Mawred.colors.primary) } }
            }
        }
        if (o.status in setOf("confirmed", "preparing", "ready_for_pickup", "delivery_failed") && ui.agents.isNotEmpty()) {
            item { Text("إسناد لمندوب", style = MaterialTheme.typography.titleMedium) }
            items(ui.agents, key = { it.uid }) { a -> OutlinedButton({ vm.assign(a.uid) }, Modifier.fillMaxWidth(), enabled = !ui.busy) { Text("${a.displayName} · ${a.activeTasks} مهمة") } }
        }
        item { ErrorText(ui.error); ui.info?.let { Text(it, color = Mawred.colors.ok) } }
        item { Text("السجل", style = MaterialTheme.typography.titleMedium) }
        items(d.history.reversed()) { h -> Text("${vm.states.label(h.to)} — ${fmtDate(h.at)}${h.reason?.let { " — $it" } ?: ""}", style = MaterialTheme.typography.bodySmall) }
    }
}

data class AdminProductsUi(val products: List<Product>? = null, val query: String = "", val busyId: String? = null, val error: String? = null, val info: String? = null, val show: String = "all") {
    val draftsOnly get() = show == "drafts"
}

/** ما يُفتح عند الانتقال من بطاقة: فلتر، عنصر، أو بحث. */
data class Focus(val filter: String? = null, val id: String? = null, val query: String? = null)

val PRODUCT_SHOW: Map<String, (Product) -> Boolean> = linkedMapOf("all" to { _ -> true }, "drafts" to { p -> !p.visible }, "available" to { p -> p.available }, "unavailable" to { p -> !p.available })

@HiltViewModel
class AdminProductsViewModel @Inject constructor(private val catalog: CatalogRepository, private val admin: AdminRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AdminProductsUi())
    val ui: StateFlow<AdminProductsUi> = _ui
    init { load() }
    fun load() = viewModelScope.launch {
        try { _ui.update { it.copy(products = catalog.load().data.products, error = null) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message, products = it.products ?: emptyList()) } }
    }
    fun query(q: String) = _ui.update { it.copy(query = q) }
    fun show(v: String) = _ui.update { it.copy(show = v) }
    fun focus(f: Focus) = _ui.update { it.copy(show = f.filter?.takeIf { k -> k in PRODUCT_SHOW } ?: it.show, query = f.query ?: it.query) }
    fun publish(items: List<Product>) = run("all", "نُشر ${items.size} منتج") { items.forEach { admin.setVisible(it.id, true) } }
    fun publishOne(p: Product) = run(p.id, "نُشر المنتج") { admin.setVisible(p.id, true) }
    fun toggle(p: Product) = run(p.id, if (p.available) "صار غير متوفر" else "صار متوفراً") { admin.setAvailability(p.id, !p.available) }
    fun image(p: Product, png: suspend () -> ByteArray) = run(p.id, "فُرّغت الصورة ورُفعت، تظهر للجميع الآن") { admin.addImage(p, png()) }
    private fun run(id: String, ok: String, block: suspend () -> Unit) = viewModelScope.launch {
        _ui.update { it.copy(busyId = id, error = null, info = null) }
        try { block(); load().join(); _ui.update { it.copy(busyId = null, info = ok) } }
        catch (e: ApiException) { _ui.update { it.copy(busyId = null, error = e.message) } }
        catch (e: Exception) { _ui.update { it.copy(busyId = null, error = e.message ?: "تعذّر تفريغ الصورة") } }
    }
}

@Composable
fun AdminProductsScreen(vm: AdminProductsViewModel, padding: PaddingValues, canEdit: Boolean, focus: Focus? = null, consumed: () -> Unit = {}) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(focus) { focus?.let { vm.focus(it); consumed() } }
    val ctx = LocalContext.current
    var target by remember { mutableStateOf<Product?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val p = target ?: return@rememberLauncherForActivityResult
        if (uri != null) vm.image(p) {
            val bmp = withContext(Dispatchers.IO) { ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { dec, _, _ -> dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE; dec.isMutableRequired = true } }
            withContext(Dispatchers.Default) { Cutout.toPng(bmp) }
        }
    }
    val list = ui.products?.filter(PRODUCT_SHOW[ui.show] ?: { true })?.filter { ui.query.isBlank() || com.mawred.app.schema.SchemaEngine.normalize(it.name).contains(com.mawred.app.schema.SchemaEngine.normalize(ui.query)) || it.sku.contains(ui.query, true) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("المنتجات", style = MaterialTheme.typography.headlineMedium)
            OutlinedTextField(ui.query, vm::query, Modifier.fillMaxWidth(), placeholder = { Text("بحث بالاسم أو الرمز") }, singleLine = true)
            val draftCount = ui.products?.count { !it.visible } ?: 0
            val offCount = ui.products?.count { !it.available } ?: 0
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("all" to "الكل", "drafts" to "المسودات ($draftCount)", "available" to "المتوفرة", "unavailable" to "غير المتوفرة ($offCount)")) { (k, l) -> FilterChip(ui.show == k, { vm.show(k) }, { Text(l) }) }
            }
            if (ui.draftsOnly && canEdit && list?.isNotEmpty() == true) {
                Text("راجع الأسعار أولاً (السعر المرجعي في وصف كل منتج)، ثم انشر.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                com.mawred.app.ui.common.PrimaryButton(if (ui.busyId == "all") "جارٍ النشر…" else "انشر ${list.size} مسودة", { vm.publish(list) }, enabled = ui.busyId == null)
            }
            ErrorText(ui.error); ui.info?.let { Text(it, color = Mawred.colors.ok) }
        }
        if (list == null) items(List(4) { it }) { Skeleton() }
        else items(list, key = { it.id }) { p ->
            Card {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ProductShelf(p, Modifier.size(56.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.name, style = MaterialTheme.typography.titleSmall)
                        Text(Money.ltr(p.sku), style = MaterialTheme.typography.bodySmall.merge(Tabular), color = Mawred.colors.mute)
                        if (!p.visible && canEdit) TextButton({ vm.publishOne(p) }, enabled = ui.busyId == null) { Text("مسودة · انشر", color = Mawred.colors.accentInk) }
                        if (canEdit) TextButton({ target = p; picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = ui.busyId == null) { Text(if (ui.busyId == p.id) "جارٍ التفريغ والرفع…" else "إضافة صورة مفرّغة") }
                    }
                    Switch(p.available, { vm.toggle(p) }, enabled = ui.busyId == null)
                }
            }
        }
    }
}
