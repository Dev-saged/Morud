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
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Alignment
import com.mawred.app.ui.common.DeskHero
import com.mawred.app.ui.common.HeroStat
import com.mawred.app.ui.common.DeskTile
import com.mawred.app.ui.common.Panel
import com.mawred.app.ui.common.Donut
import com.mawred.app.ui.common.DonutPart
import com.mawred.app.ui.common.AreaSpark
import com.mawred.app.ui.common.RichRow
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
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
data class KpiDef(val key: String, val label: String, val tab: String, val focus: Focus, val icon: androidx.compose.ui.graphics.vector.ImageVector = com.mawred.app.ui.Icons.orders, val tone: String = "primary")
val KPIS = listOf(
    KpiDef("ordersToday", "طلبات اليوم", "adminOrders", Focus("today"), com.mawred.app.ui.Icons.orders),
    KpiDef("overdue", "متأخرة", "adminOrders", Focus("overdue"), com.mawred.app.ui.Icons.clock, "danger"),
    KpiDef("completed", "مكتملة", "adminOrders", Focus("completed"), com.mawred.app.ui.Icons.check, "ok"),
    KpiDef("salesToday", "مبيعات اليوم", "adminMore", Focus(id = "reports"), com.mawred.app.ui.Icons.chart),
    KpiDef("collectedToday", "المحصّل اليوم", "adminMore", Focus(id = "finance"), com.mawred.app.ui.Icons.wallet, "ok"),
    KpiDef("totalDue", "المستحق على المحلات", "adminMore", Focus(id = "finance"), com.mawred.app.ui.Icons.alert, "accent"),
    KpiDef("activeShops", "محلات نشطة", "adminMore", Focus(id = "shops"), com.mawred.app.ui.Icons.store),
    KpiDef("availableProducts", "منتجات متاحة", "adminProducts", Focus("available"), com.mawred.app.ui.Icons.box, "ok"),
    KpiDef("unavailableProducts", "غير متوفرة", "adminProducts", Focus("unavailable"), com.mawred.app.ui.Icons.box, "danger"),
)
/** مراحل المسار في الحلقة (كل مرحلة تفتح فلترها). */
val PIPELINE = listOf("new" to "جديدة", "review" to "قيد المراجعة", "preparing" to "قيد التجهيز", "ready" to "جاهزة للتوصيل", "delivering" to "قيد التوصيل")
private val MONEY = setOf("salesToday", "collectedToday", "totalDue")

@Composable
fun DashboardScreen(vm: DashboardViewModel, padding: PaddingValues, canOpen: (String, Focus) -> Boolean = { _, _ -> false }, go: (String, Focus) -> Unit = { _, _ -> }, name: String = "") {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val d = ui.data
    val c = Mawred.colors
    fun tone(t: String) = when (t) { "danger" -> c.danger; "ok" -> c.ok; "accent" -> c.accentInk; else -> c.primary }
    fun num(k: String) = d?.get(k)?.jsonPrimitive?.longOrNull
    LazyVerticalGrid(GridCells.Adaptive(170.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column { ErrorText(ui.error)
                DeskHero(name, "هذا ما يحدث في مورد اليوم") {
                    if (d != null) Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                        HeroStat("طلبات اليوم", "${num("ordersToday") ?: 0}")
                        num("salesToday")?.let { HeroStat("مبيعات اليوم", Money.format(it)) }
                        num("overdue")?.takeIf { it > 0 }?.let { HeroStat("متأخرة الآن", "$it") }
                    }
                }
            }
        }
        if (d == null) items(List(6) { it }) { Skeleton() }
        else {
            items(KPIS.filter { d[it.key] != null }, key = { it.key }) { k ->
                val v = num(k.key) ?: 0
                val alert = k.key == "overdue" && v > 0
                DeskTile(k.icon, k.label, if (k.key in MONEY) Money.format(v) else v.toString(), tone(if (k.key == "unavailableProducts" && v == 0L) "mute" else k.tone),
                    hint = when (k.key) { "ordersToday" -> "آخر 7 أيام"; "overdue" -> if (v > 0) "تحتاج تدخلاً" else "كل الطلبات في وقتها"; else -> null },
                    spark = if (k.key == "ordersToday") d["ordersLast7Days"]?.jsonArray?.map { it.jsonPrimitive.long } else null,
                    alert = alert, onClick = if (canOpen(k.tab, k.focus)) ({ go(k.tab, k.focus) }) else null)
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Panel("مسار الطلبات المفتوحة") {
                    val colors = listOf(c.accent, c.primary, c.mute, c.ok, c.danger)
                    Donut(PIPELINE.mapIndexed { i, (key, label) -> DonutPart(key, label, num(key) ?: 0, colors[i]) }, if (canOpen("adminOrders", Focus())) ({ key -> go("adminOrders", Focus(key)) }) else null)
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                val series = d["ordersLast7Days"]?.jsonArray?.map { it.jsonPrimitive.long }.orEmpty()
                val m = if (canOpen("adminMore", Focus(id = "reports"))) Modifier.clickable(onClickLabel = "فتح التقارير") { go("adminMore", Focus(id = "reports")) } else Modifier
                Box(m) { Panel("الطلبات آخر 7 أيام", "${series.sum()}") { AreaSpark(series, Modifier.fillMaxWidth().height(110.dp)) } }
            }
            val top = d["topProducts"]?.jsonArray.orEmpty()
            item(span = { GridItemSpan(maxLineSpan) }) {
                Panel("الأكثر طلباً اليوم") {
                    if (top.isEmpty()) Text("لا طلبات اليوم بعد", color = c.mute)
                    top.forEachIndexed { i, e ->
                        val p = e.jsonObject
                        val pname = p["name"]?.jsonPrimitive?.content.orEmpty()
                        RichRow("${i + 1}", pname, "${p["count"]?.jsonPrimitive?.content.orEmpty()} طلب", onClick = if (canOpen("adminProducts", Focus())) ({ go("adminProducts", Focus(query = pname)) }) else null)
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Panel("أحدث الطلبات") {
                    val recent = d["recent"]?.jsonArray.orEmpty()
                    if (recent.isEmpty()) Text("لا طلبات بعد", color = c.mute)
                    recent.forEach { e ->
                        val o = e.jsonObject
                        val id = o["id"]?.jsonPrimitive?.content
                        val shop = o["shopName"]?.jsonPrimitive?.content.orEmpty()
                        RichRow(shop, shop, Money.ltr(o["number"]?.jsonPrimitive?.content.orEmpty()), o["total"]?.jsonPrimitive?.longOrNull?.let(Money::format),
                            chip = { Text(vm.states.label(o["status"]?.jsonPrimitive?.content.orEmpty()), style = MaterialTheme.typography.labelMedium, color = c.primary) },
                            onClick = if (id != null && canOpen("adminOrders", Focus())) ({ go("adminOrders", Focus("all", id)) }) else null)
                    }
                }
            }
        }
    }
}
