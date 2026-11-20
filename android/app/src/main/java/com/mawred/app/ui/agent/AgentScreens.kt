package com.mawred.app.ui.agent

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.ui.Icons
import com.mawred.app.ui.common.Card
import com.mawred.app.ui.common.Empty
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.Skeleton
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import javax.inject.Inject

data class TasksUi(val tasks: List<JsonObject>? = null, val error: String? = null)

@HiltViewModel
class AgentViewModel @Inject constructor(private val api: Api, val states: OrderStates) : ViewModel() {
    private val _ui = MutableStateFlow(TasksUi())
    val ui: StateFlow<TasksUi> = _ui
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        _ui.value = try { TasksUi(api.get("/agent/tasks")["tasks"]?.jsonArray?.map { it.jsonObject }.orEmpty()) } catch (e: ApiException) { TasksUi(_ui.value.tasks, e.message) }
    }
}

@Composable
fun TasksScreen(vm: AgentViewModel, padding: PaddingValues) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, padding.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("مهام التوصيل", style = MaterialTheme.typography.headlineMedium); ErrorText(ui.error) }
        val tasks = ui.tasks
        if (tasks == null) items(List(3) { it }) { Skeleton() }
        else if (tasks.isEmpty()) item { Empty("لا مهام حالياً") }
        else items(tasks, key = { it["id"]!!.jsonPrimitive.content }) { t ->
            val addr = t["address"]?.jsonObject
            val phone = addr?.get("phone")?.jsonPrimitive?.contentOrNull
            val geo = addr?.get("geo") as? JsonObject
            val collect = t["toCollect"]?.jsonPrimitive?.longOrNull ?: 0
            Card {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(t["shopName"]?.jsonPrimitive?.content.orEmpty(), style = MaterialTheme.typography.titleMedium)
                    Text(vm.states.label(t["status"]?.jsonPrimitive?.content.orEmpty()), style = MaterialTheme.typography.labelMedium, color = Mawred.colors.primary)
                    Text("${addr?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty()} · ${addr?.get("city")?.jsonPrimitive?.contentOrNull.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
                    if (collect > 0) Text("المطلوب تحصيله: ${Money.format(collect)}", style = MaterialTheme.typography.titleSmall.merge(Tabular), color = Mawred.colors.ink)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (phone != null) OutlinedButton({ ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }) { Icon(Icons.phone, null); Text(" اتصال") }
                        if (geo != null) OutlinedButton({
                            val lat = geo["lat"]!!.jsonPrimitive.double
                            val lng = geo["lng"]!!.jsonPrimitive.double
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lng")).takeIf { it.resolveActivity(ctx.packageManager) != null } ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")))
                        }) { Icon(Icons.pin, null); Text(" الملاحة") }
                    }
                }
            }
        }
    }
}
