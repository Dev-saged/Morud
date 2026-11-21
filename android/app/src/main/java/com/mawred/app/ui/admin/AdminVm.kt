package com.mawred.app.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.newIdempotencyKey
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject

data class AdminState(val data: Map<String, JsonObject> = emptyMap(), val busy: Boolean = false, val error: String? = null, val info: String? = null, val loading: Set<String> = emptySet())

/** نموذج عام لأقسام الإدارة: تحميل مسارات JSON وتنفيذ إجراءات بصلاحيات الخادم نفسها التي يستخدمها الويب. */
@HiltViewModel
class AdminVm @Inject constructor(private val api: Api) : ViewModel() {
    private val _s = MutableStateFlow(AdminState())
    val s: StateFlow<AdminState> = _s

    fun load(path: String, force: Boolean = false) {
        if (!force && path in _s.value.data) return
        _s.update { it.copy(loading = it.loading + path) }
        viewModelScope.launch {
            try { val o = api.get(path); _s.update { it.copy(data = it.data + (path to o), loading = it.loading - path, error = null) } }
            catch (e: ApiException) { _s.update { it.copy(loading = it.loading - path, error = e.message) } }
        }
    }

    fun act(ok: String, method: String, path: String, body: JsonElement? = null, idem: Boolean = false, reload: List<String> = emptyList(), after: (JsonObject) -> Unit = {}) {
        if (_s.value.busy) return
        _s.update { it.copy(busy = true, error = null, info = null) }
        viewModelScope.launch {
            try {
                val r = api.request(method, path, body, if (idem) newIdempotencyKey() else null)
                _s.update { it.copy(busy = false, info = ok) }
                after(r)
                reload.forEach { load(it, force = true) }
            } catch (e: ApiException) { _s.update { it.copy(busy = false, error = e.message) } }
        }
    }

    fun clearMsg() = _s.update { it.copy(error = null, info = null) }
}
