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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.Alignment
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

/** المؤشر ← (التبويب، ما يُفتح فيه): كل رقم يفتح القائمة نفسها التي حُسب منها. */
data class KpiDef(val key: String, val label: String, val tab: String, val focus: Focus)
val KPIS = listOf(
    KpiDef("ordersToday", "طلبات اليوم", "adminOrders", Focus("today")), KpiDef("new", "جديدة", "adminOrders", Focus("new")),
    KpiDef("review", "قيد المراجعة", "adminOrders", Focus("review")), KpiDef("preparing", "قيد التجهيز", "adminOrders", Focus("preparing")),
    KpiDef("ready", "جاهزة للتوصيل", "adminOrders", Focus("ready")), KpiDef("overdue", "متأخرة", "adminOrders", Focus("overdue")),
    KpiDef("delivering", "قيد التوصيل", "adminOrders", Focus("delivering")), KpiDef("completed", "مكتملة", "adminOrders", Focus("completed")),
    KpiDef("salesToday", "مبيعات اليوم", "adminMore", Focus(id = "reports")), KpiDef("collectedToday", "المحصّل اليوم", "adminMore", Focus(id = "finance")),
    KpiDef("totalDue", "المستحق على المحلات", "adminMore", Focus(id = "finance")), KpiDef("activeShops", "محلات نشطة", "adminMore", Focus(id = "shops")),
    KpiDef("availableProducts", "منتجات متاحة", "adminProducts", Focus("available")), KpiDef("unavailableProducts", "غير متوفرة", "adminProducts", Focus("unavailable")),
)
private val MONEY = setOf("salesToday", "collectedToday", "totalDue")

@Composable
fun DashboardScreen(vm: DashboardViewModel, padding: PaddingValues, canOpen: (String, Focus) -> Boolean = { _, _ -> false }, go: (String, Focus) -> Unit = { _, _ -> }) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val d = ui.data
    LazyVerticalGrid(GridCells.Adaptive(150.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) { Column { Text("لوحة المعلومات", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) } }
        if (d == null) items(List(6) { it }) { Skeleton() }
        else {
            items(KPIS.filter { d[it.key] != null }, key = { it.key }) { k ->
                val v = d[k.key]!!.jsonPrimitive.longOrNull ?: 0
                Kpi(k.label, if (k.key in MONEY) Money.format(v) else v.toString(), alert = k.key == "overdue" && v > 0, onClick = if (canOpen(k.tab, k.focus)) ({ go(k.tab, k.focus) }) else null)
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                val m = if (canOpen("adminMore", Focus(id = "reports"))) Modifier.clickable(onClickLabel = "فتح التقارير") { go("adminMore", Focus(id = "reports")) } else Modifier
                Card(m) { Column { Text("الطلبات آخر 7 أيام", style = MaterialTheme.typography.labelMedium, color = Mawred.colors.mute); Sparkline(d["ordersLast7Days"]?.jsonArray?.map { it.jsonPrimitive.long }.orEmpty()) } }
            }
            val top = d["topProducts"]?.jsonArray.orEmpty()
            if (top.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                Card {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("الأكثر طلباً اليوم", style = MaterialTheme.typography.titleMedium)
                        top.forEach { e ->
                            val p = e.jsonObject
                            val name = p["name"]?.jsonPrimitive?.content.orEmpty()
                            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).then(if (canOpen("adminProducts", Focus())) Modifier.clickable { go("adminProducts", Focus(query = name)) } else Modifier), verticalAlignment = Alignment.CenterVertically) {
                                Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                Text(p["count"]?.jsonPrimitive?.content.orEmpty(), style = MaterialTheme.typography.bodySmall.merge(Tabular), color = Mawred.colors.mute)
                            }
                        }
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Card {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("أحدث الطلبات", style = MaterialTheme.typography.titleMedium)
                        d["recent"]?.jsonArray?.forEach { e ->
                            val o = e.jsonObject
                            val id = o["id"]?.jsonPrimitive?.content
                            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).then(if (id != null && canOpen("adminOrders", Focus())) Modifier.clickable(onClickLabel = "فتح الطلب") { go("adminOrders", Focus("all", id)) } else Modifier), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
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
