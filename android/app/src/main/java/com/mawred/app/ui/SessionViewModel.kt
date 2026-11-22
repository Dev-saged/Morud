package com.mawred.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.BrandConfig
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.auth.AuthRepository
import com.mawred.app.data.auth.LoginPrefs
import com.mawred.app.update.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FormState(val busy: Boolean = false, val error: String? = null, val info: String? = null, val mfaTicket: String? = null)

@HiltViewModel
class SessionViewModel @Inject constructor(private val auth: AuthRepository, private val updates: UpdateManager, @dagger.hilt.android.qualifiers.ApplicationContext private val ctx: android.content.Context) : ViewModel() {
    val session = auth.state
    /** وقت آخر بيانات محفوظة عُرضت بدل الحية (null = متصل). */
    val stale = auth.api.stale
    private val _form = MutableStateFlow(FormState())
    val form: StateFlow<FormState> = _form
    private val _prefs = MutableStateFlow(LoginPrefs())
    val prefs: StateFlow<LoginPrefs> = _prefs

    init {
        viewModelScope.launch { _prefs.value = auth.loginPrefs(); auth.restore() }
        updates.restore(); updates.schedulePeriodic()
        viewModelScope.launch { updates.check(silent = true) }
    }

    private fun run(block: suspend () -> Unit) {
        if (_form.value.busy) return
        _form.value = FormState(busy = true)
        viewModelScope.launch {
            try { block(); _form.update { it.copy(busy = false) } } catch (e: ApiException) { _form.value = FormState(error = e.message) }
        }
    }

    fun login(id: String, pw: String, remember: Boolean) {
        if (!BrandConfig.configured) { _form.value = FormState(error = "التطبيق غير مهيأ بعنوان الخادم، تواصل مع الإدارة"); return }
        if (id.isBlank() || pw.isBlank()) { _form.value = FormState(error = "أدخل المعرّف وكلمة المرور"); return }
        run {
            val ticket = auth.login(id, pw, remember)
            if (ticket != null) { _form.value = FormState(busy = true, mfaTicket = ticket); return@run }
            _prefs.value = LoginPrefs(if (remember) id.trim() else "", remember)
        }
    }

    /** الخطوة الثانية: رمز تطبيق المصادقة. */
    fun loginMfa(id: String, code: String, remember: Boolean) {
        val ticket = _form.value.mfaTicket ?: return
        if (!Regex("\\d{6}").matches(code)) { _form.value = FormState(mfaTicket = ticket, error = "الرمز 6 أرقام"); return }
        if (_form.value.busy) return
        _form.value = FormState(busy = true, mfaTicket = ticket)
        viewModelScope.launch {
            try { auth.loginMfa(ticket, code, id, remember); _form.value = FormState(); _prefs.value = LoginPrefs(if (remember) id.trim() else "", remember) }
            catch (e: ApiException) { _form.value = if (e.code == "MFA_EXPIRED") FormState(error = e.message) else FormState(mfaTicket = ticket, error = e.message) }
        }
    }

    fun forgot(id: String) = run { auth.forgot(id); _form.value = FormState(info = "إن كان الحساب موجوداً سيصلك رابط الاستعادة") }

    fun changePassword(pw: String, confirm: String) {
        if (pw != confirm) { _form.value = FormState(error = "كلمتا المرور غير متطابقتين"); return }
        if (pw.length < 8 || pw.none(Char::isDigit) || pw.none(Char::isLetter)) { _form.value = FormState(error = "8 أحرف على الأقل وتحتوي حرفاً ورقماً"); return }
        run { auth.changePassword(pw) }
    }

    /** الخروج يوقف فحص الإشعارات فلا تصل إشعارات هذا الحساب لمن يستخدم الجهاز بعده. */
    fun logout() = viewModelScope.launch { com.mawred.app.data.InboxPollWorker.cancel(ctx); auth.logout() }
    fun clearForm() { _form.value = FormState() }
}
