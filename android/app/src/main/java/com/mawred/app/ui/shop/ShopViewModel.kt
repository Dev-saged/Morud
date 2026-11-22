package com.mawred.app.ui.shop

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.data.CatalogData
import android.content.Context
import com.mawred.app.data.CatalogRepository
import com.mawred.app.data.OrderRepository
import com.mawred.app.data.OutboxWorker
import com.mawred.app.data.SubmitResult
import com.mawred.app.data.auth.AuthRepository
import com.mawred.app.data.auth.SessionState
import dagger.hilt.android.qualifiers.ApplicationContext
import com.mawred.app.data.Product
import com.mawred.app.data.Promotion
import com.mawred.app.data.CartQuote
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.local.CartLine
import com.mawred.app.data.local.CartRepository
import com.mawred.app.schema.SchemaEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** فهرس بحث يُبنى مرة واحدة لكل نسخة كتالوج: الكتابة في البحث لا تعيد تطبيع كل الأسماء مع كل حرف. */
class CatalogIndex(val data: CatalogData) {
    private val hay: Map<String, String> = data.products.associate { p -> p.id to (listOf(p.name, p.sku, p.brand.orEmpty()) + p.altNames + p.barcodes).joinToString(" ") { SchemaEngine.normalize(it) } }
    val unitNames: Map<String, String> = data.units.associate { it.id to it.name }

    fun filter(query: String, category: String?, availableOnly: Boolean, promo: Promotion? = null): List<Product> {
        val q = SchemaEngine.normalize(query)
        val ids = promo?.productIds?.toHashSet()
        return data.products.filter { p ->
            p.visible && (!availableOnly || p.available) && (category == null || p.categoryId == category) && (ids == null || p.id in ids) &&
                (q.isEmpty() || hay[p.id].orEmpty().contains(q))
        }
    }

    fun promotions(now: Long): List<Promotion> = data.promotions.filter { it.activeAt(now) }
    fun featured(): List<Product> = data.products.filter { it.featured && it.visible && it.available }.take(12)
    fun popular(): List<Product> { val byId = data.products.associateBy { it.id }; return data.popular.mapNotNull { byId[it] }.filter { it.visible && it.available } }
}

data class CatalogUi(
    val loading: Boolean = true,
    val error: String? = null,
    val data: CatalogData? = null,
    val offlineSince: Long? = null,
    val query: String = "",
    val category: String? = null,
    val availableOnly: Boolean = true,
    val promoFilter: String? = null,
    val visible: List<Product> = emptyList(),
    val unitNames: Map<String, String> = emptyMap(),
    val promotions: List<Promotion> = emptyList(),
    val promoOf: Map<String, String> = emptyMap(),
    val featured: List<Product> = emptyList(),
    val popular: List<Product> = emptyList(),
) {
    val browsing: Boolean get() = query.isBlank() && category == null && promoFilter == null
}

data class CartRow(val line: CartLine, val product: Product?, val unitName: String, val unitPrice: Long) {
    val total: Long get() = unitPrice * line.qtyMilli / 1000
}

/** حساب تقديري محلي فقط؛ الخادم يعيد حساب كل إجمالي عند الإرسال. */
fun cartRows(lines: List<CartLine>, data: CatalogData?): List<CartRow> {
    val products = data?.products?.associateBy { it.id } ?: emptyMap()
    val units = data?.units?.associate { it.id to it.name } ?: emptyMap()
    return lines.map { l ->
        val p = products[l.productId]
        CartRow(l, p, units[l.unitId] ?: l.unitId, p?.units?.firstOrNull { it.unitId == l.unitId }?.price ?: 0)
    }
}

data class CheckoutUi(
    val methods: List<String> = listOf("cash"),
    val method: String = "cash",
    val notes: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val priceChange: Pair<String, Long>? = null,
    val quote: CartQuote? = null,
    val queued: Boolean = false,
    val sentOrderId: String? = null,
)

@HiltViewModel
class ShopViewModel @Inject constructor(
    private val catalog: CatalogRepository,
    private val cart: CartRepository,
    private val orders: OrderRepository,
    auth: AuthRepository,
    @ApplicationContext private val ctx: Context,
) : ViewModel() {
    private val _ui = MutableStateFlow(CatalogUi())
    val ui: StateFlow<CatalogUi> = _ui
    val cartRows: StateFlow<List<CartRow>> = combine(cart.lines, _ui) { l, u -> cartRows(l, u.data) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private val _checkout = MutableStateFlow(CheckoutUi())
    val checkout: StateFlow<CheckoutUi> = _checkout
    val pendingCount = orders.pendingCount.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
    val shopId: String = (auth.state.value as? SessionState.SignedIn)?.user?.shopIds?.firstOrNull().orEmpty()

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    private fun watchQuote() = viewModelScope.launch {
        // كل تغيير في السلة يُسعَّر على الخادم بعد توقف قصير؛ بلا نت يبقى التقدير المحلي
        cart.lines.debounce(350).distinctUntilChanged().collect { lines ->
            if (lines.isEmpty()) { _checkout.update { it.copy(quote = null) }; return@collect }
            val q = runCatching { orders.quote(lines) }.getOrNull()
            _checkout.update { it.copy(quote = q?.takeIf { sameLines(it, lines) }) }
        }
    }

    private fun sameLines(q: CartQuote, lines: List<CartLine>) = q.lines.map { Triple(it.productId, it.unitId, it.qtyMilli) }.toSet() == lines.map { Triple(it.productId, it.unitId, it.qtyMilli) }.toSet()

    init {
        refresh()
        watchQuote()
        viewModelScope.launch {
            runCatching { orders.shop(shopId) }.onSuccess { s -> _checkout.update { it.copy(methods = s.paymentTerms.ifEmpty { listOf("cash") }) } }
            if (orders.pending().isNotEmpty()) OutboxWorker.schedule(ctx)
        }
    }

    fun method(m: String) = _checkout.update { it.copy(method = m) }
    fun notes(n: String) = _checkout.update { it.copy(notes = n.take(1000)) }
    fun consumeSent() = _checkout.update { it.copy(sentOrderId = null, queued = false) }

    fun submit() {
        val c = _checkout.value
        if (c.busy) return
        viewModelScope.launch {
            val lines = cart.all()
            if (lines.isEmpty()) return@launch
            _checkout.update { it.copy(busy = true, error = null) }
            try {
                // الإجمالي الذي رآه المحل يُرسل معه: لو تغيّر سعر أو عرض بعدها يطلب الخادم الموافقة على الجديد (SRS 4.5)
                val q = c.quote?.takeIf { sameLines(it, lines) }
                val seen = q?.total ?: cartRows(lines, _ui.value.data).sumOf { it.total }
                handle(orders.submit(orders.body(shopId, lines, c.method, c.notes, seen)))
            } catch (e: ApiException) {
                _checkout.update { it.copy(busy = false, error = e.message) }
            }
        }
    }

    fun acceptPrice() {
        val (key, total) = _checkout.value.priceChange ?: return
        viewModelScope.launch {
            _checkout.update { it.copy(busy = true, priceChange = null) }
            try { handle(orders.acceptPrice(key, total)) } catch (e: ApiException) { _checkout.update { it.copy(busy = false, error = e.message) } }
        }
    }

    fun rejectPrice() {
        val (key, _) = _checkout.value.priceChange ?: return
        viewModelScope.launch { orders.discard(key); _checkout.update { it.copy(priceChange = null) } }
    }

    private suspend fun handle(r: SubmitResult) {
        when (r) {
            is SubmitResult.Sent -> { cart.clear(); _checkout.update { it.copy(busy = false, notes = "", sentOrderId = r.orderId) } }
            SubmitResult.Queued -> { cart.clear(); OutboxWorker.schedule(ctx); _checkout.update { it.copy(busy = false, notes = "", queued = true) } }
            is SubmitResult.PriceChanged -> _checkout.update { it.copy(busy = false, priceChange = r.key to r.newTotal) }
        }
    }

    private var index: CatalogIndex? = null
    private var filterJob: Job? = null

    /** النسخة المحفوظة تظهر فوراً، ثم الحديثة من الخادم (ونفس النسخة لا تعيد الرسم). */
    fun refresh() = viewModelScope.launch {
        _ui.update { it.copy(loading = true, error = null) }
        if (_ui.value.data == null) catalog.cached()?.let { adopt(it.data, it.cachedAt, stillLoading = true) }
        try {
            val r = catalog.load()
            val same = r.data.ver != null && r.data.ver == _ui.value.data?.ver
            if (same) _ui.update { it.copy(loading = false, offlineSince = if (r.offline) r.cachedAt else null) }
            else adopt(r.data, if (r.offline) r.cachedAt else null, stillLoading = false)
        } catch (e: ApiException) {
            _ui.update { it.copy(loading = false, error = if (it.data == null) e.message else null) }
        }
    }

    private suspend fun adopt(data: CatalogData, offlineSince: Long?, stillLoading: Boolean) {
        val ix = withContext(Dispatchers.Default) { CatalogIndex(data) }
        index = ix
        val now = System.currentTimeMillis()
        val promos = ix.promotions(now)
        val promoOf = buildMap { promos.forEach { pr -> pr.productIds.forEach { id -> putIfAbsent(id, pr.label) } } }
        _ui.update { it.copy(loading = stillLoading, data = data, offlineSince = offlineSince, unitNames = ix.unitNames, promotions = promos, promoOf = promoOf, featured = ix.featured(), popular = ix.popular()) }
        applyFilters(0)
    }

    /** الفلترة خارج خيط الواجهة، والكتابة في البحث تنتظر توقف الأصابع لحظة قبل إعادة الفلترة. */
    private fun applyFilters(wait: Long) {
        val ix = index ?: return
        filterJob?.cancel()
        filterJob = viewModelScope.launch {
            if (wait > 0) delay(wait)
            val u = _ui.value
            val promo = u.promotions.firstOrNull { it.id == u.promoFilter }
            val list = withContext(Dispatchers.Default) { ix.filter(u.query, u.category, u.availableOnly, promo) }
            _ui.update { it.copy(visible = list) }
        }
    }

    fun query(q: String) { _ui.update { it.copy(query = q) }; applyFilters(if (q.isBlank()) 0 else 120) }
    fun category(c: String?) { _ui.update { it.copy(category = c) }; applyFilters(0) }
    fun availableOnly(v: Boolean) { _ui.update { it.copy(availableOnly = v) }; applyFilters(0) }
    fun promo(id: String?) { _ui.update { it.copy(promoFilter = if (it.promoFilter == id) null else id) }; applyFilters(0) }
    fun addById(productId: String, unitId: String) { _ui.value.data?.products?.firstOrNull { it.id == productId }?.let { add(it, unitId) } }
    fun add(p: Product, unitId: String) = viewModelScope.launch { p.units.firstOrNull { it.unitId == unitId }?.let { cart.add(p.id, unitId, it.minQtyMilli.coerceAtLeast(it.stepMilli)) } }
    fun setQty(l: CartLine, qtyMilli: Long) = viewModelScope.launch { cart.set(l.productId, l.unitId, qtyMilli) }
    fun addMany(lines: List<com.mawred.app.core.QuickLine>) = viewModelScope.launch { lines.forEach { cart.add(it.productId, it.unitId, it.qtyMilli) } }
}
