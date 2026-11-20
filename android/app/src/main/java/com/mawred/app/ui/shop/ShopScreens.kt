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
import androidx.compose.material3.FilledIconButton
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
import com.mawred.app.data.Product
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Notice
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
    var unit by remember(p.id) { mutableStateOf(p.units.firstOrNull()?.unitId.orEmpty()) }
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
fun CartScreen(rows: List<CartRow>, vm: ShopViewModel, padding: PaddingValues) {
    if (rows.isEmpty()) { Empty("السلة فارغة"); return }
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
        }
    }
}
