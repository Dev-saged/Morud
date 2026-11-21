package com.mawred.app.ui.shop

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.data.OrderRepository
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Kpi
import com.mawred.app.ui.common.Notice
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private val dateFmt = SimpleDateFormat("d/M HH:mm", Locale("ar")).apply { timeZone = TimeZone.getTimeZone("Asia/Gaza") }
fun fmtDate(t: Long): String = Money.ltr(dateFmt.format(Date(t)))

/** المتبقي حتى موعد التوصيل بصيغة «3 س 5 د». */
fun formatDuration(ms: Long): String {
    val m = (ms.coerceAtLeast(0) / 60_000)
    return if (m >= 60) "${m / 60} س ${m % 60} د" else "$m د"
}

private val STAGE_LABELS = listOf("جديد", "مراجعة", "مؤكد", "تجهيز", "توصيل", "تسليم", "مكتمل")

@Composable
fun OrdersScreen(vm: OrdersViewModel, padding: PaddingValues, openId: String?, onOpened: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.refresh() }
    LaunchedEffect(openId) { if (openId != null) { vm.open(openId); onOpened() } }
    val open = ui.open
    if (open != null) { BackHandler { vm.open(null) }; OrderDetailView(vm, padding); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("طلباتي", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) }
        if (ui.pending.isNotEmpty()) item {
            val waitingPrice = ui.pending.count { it.lastError?.startsWith(OrderRepository.PRICE_PREFIX) == true }
            Notice("${ui.pending.size} طلب بانتظار الإرسال${if (waitingPrice > 0) " — $waitingPrice بانتظار موافقتك على السعر من السلة" else ""}", "أرسل الآن") { vm.retryPending() }
        }
        val list = ui.list
        if (list == null) items(List(3) { it }) { Skeleton() }
        else if (list.isEmpty()) item { Empty("لا طلبات بعد") }
        else items(list, key = { it.id }) { o ->
            Card(Modifier.clickable { vm.open(o.id) }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(Money.ltr(o.number), style = MaterialTheme.typography.titleSmall.merge(Tabular))
                        Text("${fmtDate(o.createdAt)} · ${o.items} أصناف", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    }
                    StatusChip(vm.states, o.status)
                    Text(Money.format(o.total), style = MaterialTheme.typography.titleSmall.merge(Tabular))
                }
            }
        }
    }
}

@Composable
fun StatusChip(states: OrderStates, status: String) {
    val c = when (states.tone(status)) { "success" -> Mawred.colors.ok; "danger" -> Mawred.colors.danger; "warning", "progress" -> Mawred.colors.accentInk; else -> Mawred.colors.primary }
    Text(states.label(status), Modifier.background(c.copy(alpha = 0.1f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp), color = c, style = MaterialTheme.typography.labelMedium)
}

@Composable
private fun OrderDetailView(vm: OrdersViewModel, padding: PaddingValues) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val d = ui.open ?: return
    val o = d.order
    var reason by remember { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(o.id) { while (true) { delay(30_000); now = System.currentTimeMillis() } }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { TextButton({ vm.open(null) }) { Text("‹ طلباتي") } }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(Money.ltr(o.number), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall.merge(Tabular))
                StatusChip(vm.states, o.status)
            }
        }
        item {
            val stage = OrderStates.stageIndex(o.status)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                STAGE_LABELS.forEachIndexed { i, l ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.fillMaxWidth().height(4.dp).background(if (i <= stage) Mawred.colors.primary else Mawred.colors.line, RoundedCornerShape(2.dp)))
                        Text(l, style = MaterialTheme.typography.labelSmall, color = if (i <= stage) Mawred.colors.ink else Mawred.colors.mute)
                    }
                }
            }
        }
        o.sla?.dueAt?.let { due ->
            if (OrderStates.stageIndex(o.status) in 0..4) item {
                Card {
                    Column {
                        Text(if (due > now) "متبقٍ ${formatDuration(due - now)}" else "تجاوز الموعد المتوقع", style = MaterialTheme.typography.titleMedium, color = if (due > now) Mawred.colors.primary else Mawred.colors.danger)
                        Text("الموعد ${fmtDate(due)}${if (o.sla.estimated) " (تقديري)" else ""}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    }
                }
            }
        }
        items(o.items, key = { "${it.productId}|${it.unitId}" }) { l ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text(l.name, style = MaterialTheme.typography.bodyLarge); Text("${l.unitName} × ${Money.ltr(Money.formatQty(l.qtyMilli))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
                Text(Money.format(l.total), style = MaterialTheme.typography.bodyLarge.merge(Tabular))
            }
        }
        item {
            if (o.totals.discount > 0) Row { Text("الخصم", Modifier.weight(1f)); Text("-" + Money.format(o.totals.discount), color = Mawred.colors.ok, style = Tabular) }
            Row { Text("الإجمالي", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text(Money.format(o.totals.total), style = MaterialTheme.typography.titleLarge.merge(Tabular)) }
            Text(if (o.paymentMethod == "credit") "دفع آجل" else "دفع نقدي عند الاستلام", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
        }
        if (d.actions.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (d.actions.any { it.reason }) OutlinedTextField(reason, { reason = it }, Modifier.fillMaxWidth(), label = { Text("السبب") })
                d.actions.forEach { a ->
                    OutlinedButton({ vm.act(a.to, reason) }, Modifier.fillMaxWidth(), enabled = !ui.busy && (!a.reason || reason.trim().length >= 3)) {
                        Text(vm.states.label(a.to), color = if (a.reason) Mawred.colors.danger else Mawred.colors.primary)
                    }
                }
            }
        }
        item { ErrorText(ui.error) }
        item { Text("السجل", style = MaterialTheme.typography.titleMedium) }
        items(d.history.reversed()) { h -> Text("${vm.states.label(h.to)} — ${fmtDate(h.at)}${h.reason?.let { " — $it" } ?: ""}", style = MaterialTheme.typography.bodySmall) }
    }
}

private val LEDGER_LABEL = mapOf("opening" to "رصيد افتتاحي", "invoice" to "فاتورة", "payment" to "دفعة", "adjustment" to "تسوية", "credit_note" to "إشعار دائن", "refund" to "استرداد", "reversal" to "عكس")

@Composable
fun AccountScreen(vm: OrdersViewModel, padding: PaddingValues) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.loadStatement() }
    val st = ui.statement
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("كشف الحساب", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) }
        if (st == null) item { Skeleton() } else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi("المستحق عليك", Money.format(st.first.due), Modifier.weight(1f), alert = st.first.due > 0)
                    Kpi("رصيد دائن لك", Money.format(st.first.creditBalance), Modifier.weight(1f))
                }
            }
            st.second?.takeIf { it.enabled }?.let { c -> item { Kpi("المتاح من الحد الائتماني", Money.format(c.available)) } }
            if (st.first.rows.isEmpty()) item { Empty("لا حركات") }
            items(st.first.rows.reversed(), key = { it.id }) { r ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(LEDGER_LABEL[r.type] ?: r.type, style = MaterialTheme.typography.bodyLarge); Text(fmtDate(r.at) + (r.reason?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute) }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(Money.format(r.amount), style = MaterialTheme.typography.bodyLarge.merge(Tabular), color = if (r.amount > 0) Mawred.colors.danger else Mawred.colors.ok)
                        Text(Money.format(r.running), style = MaterialTheme.typography.bodySmall.merge(Tabular), color = Mawred.colors.mute)
                    }
                }
            }
        }
    }
}
