package com.mawred.app.ui.shop

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mawred.app.core.Money
import com.mawred.app.core.QuickOrder
import com.mawred.app.core.defaultUnit
import com.mawred.app.data.CatalogData
import com.mawred.app.data.Product
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Notice
import com.mawred.app.ui.common.PrimaryButton
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.common.reducedMotion
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun CatalogScreen(ui: CatalogUi, vm: ShopViewModel, padding: PaddingValues) {
    val haptics = LocalHapticFeedback.current
    val still = reducedMotion()
    LazyVerticalGrid(GridCells.Adaptive(160.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ui.data?.let { QuickOrderCard(it, vm) }
                OutlinedTextField(ui.query, vm::query, Modifier.fillMaxWidth(), placeholder = { Text("ابحث بالاسم أو الرمز أو الباركود") }, leadingIcon = { Icon(Icons.search, null) }, singleLine = true)
                ui.offlineSince?.let { Notice("بلا اتصال — آخر تحديث ${SimpleDateFormat("d/M HH:mm", Locale("ar")).format(Date(it))}", "تحديث") { vm.refresh() } }
                ErrorText(ui.error)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { FilterChip(ui.category == null, { vm.category(null) }, { Text("الكل") }) }
                    items(ui.data?.categories.orEmpty(), key = { it.id }) { c -> FilterChip(ui.category == c.id, { vm.category(c.id) }, { Text(c.name) }) }
                    item { FilterChip(ui.availableOnly, { vm.availableOnly(!ui.availableOnly) }, { Text("المتوفر فقط") }) }
                }
            }
        }
        if (ui.loading && ui.data == null) items(List(6) { it }) { Skeleton() }
        else if (ui.visible.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { Empty("لا توجد منتجات مطابقة") }
        else items(ui.visible, key = { it.id }) { p ->
            ProductCard(p, ui.data?.units?.associate { it.id to it.name }.orEmpty()) { unitId ->
                vm.add(p, unitId)
                if (!still) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
        }
    }
}

@Composable
private fun ProductCard(p: Product, unitNames: Map<String, String>, onAdd: (String) -> Unit) {
    var unit by remember(p.id) { mutableStateOf(p.defaultUnit()?.unitId.orEmpty()) }
    val u = p.units.firstOrNull { it.unitId == unit }
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ProductShelf(p, Modifier.fillMaxWidth().aspectRatio(1f))
            Text(p.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Mawred.colors.ink)
            if (p.units.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { p.units.forEach { su -> FilterChip(su.unitId == unit, { unit = su.unitId }, { Text(unitNames[su.unitId] ?: su.unitId) }) } }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(u?.let { Money.format(it.price) } ?: "—", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge.merge(Tabular), color = Mawred.colors.ink)
                if (p.available) FilledIconButton({ onAdd(unit) }, Modifier.size(48.dp).semantics { contentDescription = "أضف ${p.name} إلى السلة" }, shape = CircleShape, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Mawred.colors.accent, contentColor = androidx.compose.ui.graphics.Color(com.mawred.app.BrandConfig.ON_ACCENT_HEX))) { Icon(Icons.plus, null) }
                else Text("غير متوفر حالياً", style = MaterialTheme.typography.labelMedium, color = Mawred.colors.danger)
            }
        }
    }
}

@Composable
fun CartScreen(rows: List<CartRow>, checkout: CheckoutUi, vm: ShopViewModel, padding: PaddingValues) {
    checkout.priceChange?.let { (_, total) ->
        AlertDialog(onDismissRequest = vm::rejectPrice,
            title = { Text("تغيّرت الأسعار") },
            text = { Text("تغيّرت الأسعار منذ إعداد السلة. الإجمالي الجديد ${Money.format(total)}. هل ترسل الطلب بالسعر الجديد؟") },
            confirmButton = { TextButton(vm::acceptPrice) { Text("موافق، أرسل") } },
            dismissButton = { TextButton(vm::rejectPrice) { Text("إلغاء") } })
    }
    if (rows.isEmpty()) { if (checkout.queued) Box(Modifier.padding(16.dp)) { Notice("حُفظ الطلب وسيُرسل تلقائياً عند عودة الاتصال") } else Empty("السلة فارغة"); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Notice("مسودة محفوظة على الجهاز — تبقى حتى بلا نت") }
        items(rows, key = { "${it.line.productId}|${it.line.unitId}" }) { r ->
            val su = r.product?.units?.firstOrNull { it.unitId == r.line.unitId }
            val step = su?.stepMilli ?: 1000
            Card {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(r.product?.name ?: "منتج لم يعد متاحاً", style = MaterialTheme.typography.titleSmall, color = if (r.product == null) Mawred.colors.danger else Mawred.colors.ink)
                        Text("${r.unitName} × ${Money.ltr(Money.formatQty(r.line.qtyMilli))}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    }
                    IconButton({ vm.setQty(r.line, r.line.qtyMilli - step) }, Modifier.semantics { contentDescription = "إنقاص" }) { Icon(Icons.minus, null) }
                    Text(Money.formatQty(r.line.qtyMilli), style = MaterialTheme.typography.titleMedium.merge(Tabular))
                    IconButton({ vm.setQty(r.line, r.line.qtyMilli + step) }, Modifier.semantics { contentDescription = "زيادة" }) { Icon(Icons.plus, null) }
                    Text(Money.format(r.total), style = MaterialTheme.typography.titleSmall.merge(Tabular))
                }
            }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                Text("الإجمالي التقديري", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Text(Money.format(rows.sumOf { it.total }), style = MaterialTheme.typography.titleLarge.merge(Tabular))
            }
            Text("الخادم يعيد حساب الأسعار والعروض عند إرسال الطلب.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
            Spacer(Modifier.height(12.dp))
            Text("طريقة الدفع", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                checkout.methods.forEach { m -> FilterChip(checkout.method == m, { vm.method(m) }, { Text(if (m == "credit") "آجل" else "نقدي عند الاستلام") }) }
            }
            OutlinedTextField(checkout.notes, vm::notes, Modifier.fillMaxWidth(), label = { Text("ملاحظات للطلب (اختياري)") }, minLines = 2)
            ErrorText(checkout.error)
            Spacer(Modifier.height(8.dp))
            PrimaryButton(if (checkout.busy) "جارٍ الإرسال…" else "تأكيد وإرسال الطلب", vm::submit, enabled = !checkout.busy && rows.none { it.product == null || it.product.available.not() })
            if (rows.any { it.product == null || !it.product.available }) Text("احذف الأصناف غير المتاحة للمتابعة", color = Mawred.colors.danger, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** طلب سريع بالكتابة: الرقم بلا وحدة يُفهم بوحدة الصنف المعتادة (10 سمك = 10 كغ). */
@Composable
private fun QuickOrderCard(data: CatalogData, vm: ShopViewModel) {
    var open by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }
    val r = remember(text, data) { if (text.isBlank()) null else QuickOrder.parse(text, data.products) }
    val names = remember(data) { data.products.associate { it.id to it.name } }
    val units = remember(data) { data.units.associate { it.id to it.name } }
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            TextButton({ open = !open }) { Icon(Icons.orders, null); Text(" طلب سريع بالكتابة", color = Mawred.colors.primary) }
            if (open) {
                Text("مثال: 10 سمك بوري، 2 جبنة، نص كيلو زعتر", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth(), minLines = 3, label = { Text("نص الطلب") })
                r?.lines?.forEach { l ->
                    Row { Text(names[l.productId].orEmpty(), Modifier.weight(1f)); Text("${Money.ltr(Money.formatQty(l.qtyMilli))} ${units[l.unitId] ?: l.unitId}${if (l.assumedUnit) " (المعتادة)" else ""}", style = Tabular) }
                }
                r?.problems?.forEach { pr -> Text("${pr.text}: ${QuickOrder.PROBLEM_TEXT[pr.reason]}", color = Mawred.colors.danger, style = MaterialTheme.typography.bodySmall) }
                if (r != null && r.lines.isNotEmpty()) PrimaryButton("أضف ${r.lines.size} صنف إلى السلة", { vm.addMany(r.lines); text = ""; open = false })
            }
        }
    }
}
