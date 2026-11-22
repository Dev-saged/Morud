package com.mawred.app.ui.shop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.core.defaultUnit
import com.mawred.app.data.CatalogData
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.DeskHero
import com.mawred.app.ui.common.DeskTile
import com.mawred.app.ui.common.HeroStat
import com.mawred.app.ui.common.MeViewModel
import com.mawred.app.ui.common.MiniRing
import com.mawred.app.ui.common.Panel
import com.mawred.app.ui.theme.Mawred
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull

/** لوحة صاحب المحل أعلى الرئيسية: المستحق والحد المتاح، الطلبات المفتوحة، المصروف، آخر طلب وتقدّمه، و«اطلب مجدداً». */
@Composable
fun ShopDesk(me: MeViewModel, name: String, cat: CatalogData?, pending: Int, states: OrderStates?, openOrders: () -> Unit, openOrder: (String) -> Unit, openAccount: () -> Unit, reorder: (productId: String, unitId: String) -> Unit) {
    val m by me.summary.collectAsStateWithLifecycle()
    val c = Mawred.colors
    val s = m
    fun n(o: JsonObject?, k: String) = o?.get(k)?.jsonPrimitive?.longOrNull
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val open = n(s, "open") ?: 0
        DeskHero(name, if (s == null) null else if (open > 0) "عندك $open طلب مفتوح" else "جاهز لطلبك القادم؟") {
            val due = n(s, "due")
            if (due != null) Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                HeroStat("المستحق عليك", Money.format(due))
                n(s, "creditAvailable")?.let { avail ->
                    val total = (avail + due).coerceAtLeast(1)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MiniRing(avail.toFloat() / total, Color.White.copy(alpha = .22f), Color(0xFFF5A04A), "${avail * 100 / total}٪")
                        HeroStat("المتاح من الحد", Money.format(avail))
                    }
                }
            }
        }
        if (s != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                DeskTile(Icons.orders, "طلبات مفتوحة", "$open", if (pending > 0) c.accentInk else c.primary, Modifier.weight(1f), hint = if (pending > 0) "+$pending بانتظار النت" else "اضغط للمتابعة", onClick = openOrders)
                DeskTile(Icons.chart, "مصروف 30 يوماً", Money.format(n(s, "spendMonth") ?: 0), c.primary, Modifier.weight(1f), hint = "${n(s, "ordersMonth") ?: 0} طلب",
                    onClick = if (s["due"] != null) openAccount else null)
            }
            (s["last"] as? JsonObject)?.let { last ->
                val status = last["status"]?.jsonPrimitive?.content.orEmpty()
                val stage = OrderStates.stageIndex(status)
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(c.raised).border(1.dp, c.line, RoundedCornerShape(18.dp)).clickable { openOrder(last["id"]!!.jsonPrimitive.content) }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(c.ok.copy(alpha = .13f)), contentAlignment = Alignment.Center) { Icon(Icons.truck, null, tint = c.ok) }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("آخر طلب · ${Money.ltr(last["number"]?.jsonPrimitive?.content.orEmpty())}", style = MaterialTheme.typography.labelMedium, color = c.mute)
                        Text(states?.label(status) ?: status, style = MaterialTheme.typography.titleMedium, color = c.ink)
                        if (stage >= 0) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            OrderStates.STAGES.indices.forEach { i -> Box(Modifier.weight(1f).height(5.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= stage) c.primary else c.line)) }
                        }
                    }
                    Text(Money.format(last["total"]?.jsonPrimitive?.long ?: 0), style = MaterialTheme.typography.titleSmall)
                }
            }
            val again = s["reorder"]?.jsonArray?.map { it.jsonObject }.orEmpty().mapNotNull { r ->
                val p = cat?.products?.firstOrNull { it.id == r["productId"]?.jsonPrimitive?.content && it.available } ?: return@mapNotNull null
                Triple(p, r["unitId"]?.jsonPrimitive?.content ?: p.defaultUnit()?.unitId ?: p.units.first().unitId, cat.units.associate { it.id to it.name })
            }
            if (again.isNotEmpty()) Panel("اطلب مجدداً", "بوحدتك المعتادة") {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(again, key = { it.first.id }) { (p, unit, names) ->
                        Row(Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(24.dp)).border(1.dp, c.line, RoundedCornerShape(24.dp)).clickable { reorder(p.id, unit) }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.plus, null, Modifier.size(16.dp), tint = c.primary)
                            Text(p.name, style = MaterialTheme.typography.bodyMedium, color = c.ink)
                            Text(names[unit].orEmpty(), style = MaterialTheme.typography.labelSmall, color = c.mute)
                        }
                    }
                }
            }
        }
    }
}
