package com.mawred.app.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Kpi
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.common.Sparkline
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import javax.inject.Inject

data class DashboardUi(val data: JsonObject? = null, val error: String? = null)

@HiltViewModel
class DashboardViewModel @Inject constructor(private val api: Api, val states: OrderStates) : ViewModel() {
    private val _ui = MutableStateFlow(DashboardUi())
    val ui: StateFlow<DashboardUi> = _ui
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        _ui.value = try { DashboardUi(api.get("/dashboard/summary")) } catch (e: ApiException) { DashboardUi(_ui.value.data, e.message) }
    }
}

private val KPIS = listOf(
    "ordersToday" to "طلبات اليوم", "new" to "جديدة", "review" to "قيد المراجعة", "preparing" to "قيد التجهيز", "overdue" to "متأخرة", "delivering" to "قيد التوصيل",
    "completed" to "مكتملة", "salesToday" to "مبيعات اليوم", "collectedToday" to "المحصّل اليوم", "totalDue" to "المستحق على المحلات", "activeShops" to "محلات نشطة",
)
private val MONEY = setOf("salesToday", "collectedToday", "totalDue")

@Composable
fun DashboardScreen(vm: DashboardViewModel, padding: PaddingValues) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val d = ui.data
    LazyVerticalGrid(GridCells.Adaptive(150.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) { Column { Text("لوحة المعلومات", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) } }
        if (d == null) items(List(6) { it }) { Skeleton() }
        else {
            items(KPIS.filter { d[it.first] != null }, key = { it.first }) { (k, label) ->
                val v = d[k]!!.jsonPrimitive.longOrNull ?: 0
                Kpi(label, if (k in MONEY) Money.format(v) else v.toString(), alert = k == "overdue" && v > 0)
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Card { Column { Text("الطلبات آخر 7 أيام", style = MaterialTheme.typography.labelMedium, color = Mawred.colors.mute); Sparkline(d["ordersLast7Days"]?.jsonArray?.map { it.jsonPrimitive.long }.orEmpty()) } }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Card {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("أحدث الطلبات", style = MaterialTheme.typography.titleMedium)
                        d["recent"]?.jsonArray?.forEach { e ->
                            val o = e.jsonObject
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(o["number"]?.jsonPrimitive?.content.orEmpty(), style = MaterialTheme.typography.bodySmall.merge(Tabular))
                                Text(o["shopName"]?.jsonPrimitive?.content.orEmpty(), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                Text(vm.states.label(o["status"]?.jsonPrimitive?.content.orEmpty()), style = MaterialTheme.typography.labelMedium, color = Mawred.colors.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}
