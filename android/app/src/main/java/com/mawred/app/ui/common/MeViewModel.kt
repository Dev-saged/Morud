package com.mawred.app.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject

/** ملخص لوحة صاحب المحل أو المندوب من /me/summary (يُحفظ تلقائياً للعمل بلا نت). */
@HiltViewModel
class MeViewModel @Inject constructor(private val api: Api) : ViewModel() {
    private val _s = MutableStateFlow<JsonObject?>(null)
    val summary: StateFlow<JsonObject?> = _s
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        if (_s.value == null) api.cached("/me/summary")?.let { _s.value = it }
        try { _s.value = api.get("/me/summary") } catch (_: ApiException) { }
    }
}
