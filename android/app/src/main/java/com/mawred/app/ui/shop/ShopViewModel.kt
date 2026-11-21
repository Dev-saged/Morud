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
import javax.inject.Inject

data class CatalogUi(
    val loading: Boolean = true,
    val error: String? = null,
    val data: CatalogData? = null,
    val offlineSince: Long? = null,
    val query: String = "",
    val category: String? = null,
    val availableOnly: Boolean = true,
) {
    val visible: List<Product> get() {
        val d = data ?: return emptyList()
        val q = SchemaEngine.normalize(query)
        return d.products.filter { p ->
            p.visible && (!availableOnly || p.available) && (category == null || p.categoryId == category) &&
                (q.isEmpty() || (listOf(p.name, p.sku, p.brand.orEmpty()) + p.altNames + p.barcodes).any { SchemaEngine.normalize(it).contains(q) })
        }
    }
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

    init {
        refresh()
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
                handle(orders.submit(orders.body(shopId, lines, c.method, c.notes, null)))
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

    fun refresh() = viewModelScope.launch {
        _ui.update { it.copy(loading = true, error = null) }
        try {
            val r = catalog.load()
            _ui.update { it.copy(loading = false, data = r.data, offlineSince = if (r.offline) r.cachedAt else null) }
        } catch (e: ApiException) {
            _ui.update { it.copy(loading = false, error = e.message) }
        }
    }

    fun query(q: String) = _ui.update { it.copy(query = q) }
    fun category(c: String?) = _ui.update { it.copy(category = c) }
    fun availableOnly(v: Boolean) = _ui.update { it.copy(availableOnly = v) }
    fun add(p: Product, unitId: String) = viewModelScope.launch { p.units.firstOrNull { it.unitId == unitId }?.let { cart.add(p.id, unitId, it.minQtyMilli.coerceAtLeast(it.stepMilli)) } }
    fun setQty(l: CartLine, qtyMilli: Long) = viewModelScope.launch { cart.set(l.productId, l.unitId, qtyMilli) }
}
