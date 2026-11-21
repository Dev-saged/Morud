package com.mawred.app.ui.shop

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.core.OrderStates
import com.mawred.app.data.CreditInfo
import com.mawred.app.data.OrderDetail
import com.mawred.app.data.OrderRepository
import com.mawred.app.data.OrderSummary
import com.mawred.app.data.Statement
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.auth.AuthRepository
import com.mawred.app.data.auth.SessionState
import com.mawred.app.data.local.OutboxItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OrdersUi(
    val list: List<OrderSummary>? = null,
    val pending: List<OutboxItem> = emptyList(),
    val open: OrderDetail? = null,
    val statement: Pair<Statement, CreditInfo?>? = null,
    val error: String? = null,
    val busy: Boolean = false,
)

@HiltViewModel
class OrdersViewModel @Inject constructor(private val orders: OrderRepository, auth: AuthRepository, val states: OrderStates) : ViewModel() {
    private val shopId = (auth.state.value as? SessionState.SignedIn)?.user?.shopIds?.firstOrNull().orEmpty()
    private val _ui = MutableStateFlow(OrdersUi())
    val ui: StateFlow<OrdersUi> = _ui

    fun refresh() = viewModelScope.launch {
        _ui.update { it.copy(error = null, pending = orders.pending()) }
        try { _ui.update { it.copy(list = orders.shopOrders(shopId)) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message, list = it.list ?: emptyList()) } }
    }

    fun open(id: String?) = viewModelScope.launch {
        if (id == null) { _ui.update { it.copy(open = null) }; refresh(); return@launch }
        try { _ui.update { it.copy(open = orders.order(id), error = null) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message) } }
    }

    fun act(to: String, reason: String) {
        val id = _ui.value.open?.order?.id ?: return
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, error = null) }
            try { orders.transition(id, to, reason); _ui.update { it.copy(open = orders.order(id), busy = false) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message, busy = false) } }
        }
    }

    fun retryPending() = viewModelScope.launch { runCatching { orders.flush() }; refresh() }

    fun loadStatement() = viewModelScope.launch {
        try { _ui.update { it.copy(statement = orders.statement(shopId), error = null) } } catch (e: ApiException) { _ui.update { it.copy(error = e.message) } }
    }
}
