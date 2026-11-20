package com.mawred.app.ui.shop

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.data.CatalogData
import com.mawred.app.data.CatalogRepository
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

@HiltViewModel
class ShopViewModel @Inject constructor(private val catalog: CatalogRepository, private val cart: CartRepository) : ViewModel() {
    private val _ui = MutableStateFlow(CatalogUi())
    val ui: StateFlow<CatalogUi> = _ui
    val cartRows: StateFlow<List<CartRow>> = combine(cart.lines, _ui) { l, u -> cartRows(l, u.data) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init { refresh() }

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
