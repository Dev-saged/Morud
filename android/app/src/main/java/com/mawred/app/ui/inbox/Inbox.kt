package com.mawred.app.ui.inbox

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.mawred.app.data.InboxPage
import com.mawred.app.data.InboxPollWorker
import com.mawred.app.data.InboxRepository
import com.mawred.app.data.Notice
import com.mawred.app.data.NoticeRef
import com.mawred.app.data.api.ApiException
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.Mawred
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class InboxViewModel @Inject constructor(private val repo: InboxRepository, @ApplicationContext private val ctx: Context) : ViewModel() {
    private val _page = MutableStateFlow<InboxPage?>(null)
    val page: StateFlow<InboxPage?> = _page

    init {
        InboxPollWorker.schedule(ctx)
        // أثناء فتح التطبيق: تحديث كل دقيقة + تنبيه الجهاز بما وصل
        viewModelScope.launch { while (isActive) { refresh(); runCatching { InboxPollWorker.notifyFresh(ctx, repo) }; delay(60_000) } }
    }

    fun refresh() = viewModelScope.launch { try { _page.value = repo.load() } catch (_: ApiException) { } }
    fun open(n: Notice) = viewModelScope.launch {
        if (n.readAt == null) {
            _page.value = _page.value?.let { p -> p.copy(unread = (p.unread - 1).coerceAtLeast(0), notifications = p.notifications.map { if (it.id == n.id) it.copy(readAt = System.currentTimeMillis()) else it }) }
            runCatching { repo.read(n.id) }
        }
    }
    fun readAll() = viewModelScope.launch {
        _page.value = _page.value?.let { p -> p.copy(unread = 0, notifications = p.notifications.map { it.copy(readAt = it.readAt ?: System.currentTimeMillis()) }) }
        runCatching { repo.readAll() }
    }
}

/** زر الجرس في الشريط العلوي بعدد غير المقروء. */
@Composable
fun BellButton(unread: Int, onClick: () -> Unit) {
    IconButton(onClick) {
        if (unread > 0) BadgedBox(badge = { Badge(containerColor = Mawred.colors.accent, contentColor = Color(com.mawred.app.BrandConfig.ON_ACCENT_HEX)) { Text(if (unread > 9) "9+" else "$unread") } }) { Icon(Icons.bell, "الإشعارات، $unread غير مقروء") }
        else Icon(Icons.bell, "الإشعارات")
    }
}

/** صندوق الإشعارات: كل إشعار يفتح مرجعه. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxSheet(vm: InboxViewModel, close: () -> Unit, openRef: (NoticeRef) -> Unit) {
    val page by vm.page.collectAsStateWithLifecycle()
    val c = Mawred.colors
    LaunchedEffect(Unit) { vm.refresh() }
    ModalBottomSheet(close, containerColor = c.raised) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("الإشعارات", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, color = c.ink)
                if ((page?.unread ?: 0) > 0) TextButton(vm::readAll) { Text("تعليم الكل كمقروء", color = c.primary) }
            }
            val list = page?.notifications
            when {
                list == null -> Text("جارٍ التحميل…", Modifier.padding(24.dp), color = c.mute)
                list.isEmpty() -> Text("لا إشعارات بعد", Modifier.fillMaxWidth().padding(32.dp), color = c.mute)
                else -> LazyColumn(Modifier.heightIn(max = 560.dp)) {
                    items(list, key = { it.id }) { n ->
                        Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable { vm.open(n); close(); openRef(n.ref) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(9.dp).clip(CircleShape).background(if (n.readAt == null) c.accent else Color.Transparent))
                            Column(Modifier.weight(1f)) {
                                Text(n.title, style = MaterialTheme.typography.titleSmall, fontWeight = if (n.readAt == null) FontWeight.Bold else FontWeight.Normal, color = if (n.readAt == null) c.ink else c.mute)
                                if (n.body.isNotBlank()) Text(n.body, style = MaterialTheme.typography.bodySmall, color = c.mute)
                            }
                            Text(SimpleDateFormat("d/M HH:mm", Locale.US).format(Date(n.createdAt)), style = MaterialTheme.typography.labelSmall, color = c.mute)
                        }
                    }
                }
            }
        }
    }
}
