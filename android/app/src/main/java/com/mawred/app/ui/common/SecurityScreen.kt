package com.mawred.app.ui.common

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.theme.Tabular
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** يوفّر عميل الخادم لشاشة الأمان. */
@dagger.hilt.android.lifecycle.HiltViewModel
class SecurityViewModel @javax.inject.Inject constructor(val api: Api) : androidx.lifecycle.ViewModel()

/** أمان الحساب: تفعيل التحقق بخطوتين (فتح تطبيق المصادقة مباشرة أو إدخال المفتاح يدوياً) وإيقافه برمز. */
@Composable
fun SecurityPanel(api: Api) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var enabled by remember { mutableStateOf<Boolean?>(null) }
    var setup by remember { mutableStateOf<Pair<String, String>?>(null) }
    var code by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        enabled = runCatching { api.get("/auth/me")["user"]!!.let { (it as kotlinx.serialization.json.JsonObject)["mfaEnabled"]?.jsonPrimitive?.content == "true" } }.getOrNull()
    }
    fun act(path: String, ok: String, after: () -> Unit) = scope.launch {
        busy = true; err = null; msg = null
        try { api.post(path, buildJsonObject { put("code", code) }); msg = ok; code = ""; setup = null; after() } catch (e: ApiException) { err = e.message } finally { busy = false }
    }
    Panel("التحقق بخطوتين", when (enabled) { true -> "مفعّل"; false -> "غير مفعّل"; null -> null }) {
        Text("بعد كلمة المرور يُطلب رمز من تطبيق المصادقة (Google Authenticator أو Microsoft Authenticator)، فلا يدخل أحد حتى لو عرف كلمة المرور.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
        val codeField: @Composable () -> Unit = {
            OutlinedTextField(code, { v -> code = v.filter(Char::isDigit).take(6) }, Modifier.fillMaxWidth(), label = { Text("رمز التحقق") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword))
        }
        when {
            enabled == false && setup == null -> PrimaryButton("تفعيل", {
                scope.launch {
                    try { val r = api.post("/auth/mfa/setup", buildJsonObject { }); setup = r["secret"]!!.jsonPrimitive.content to r["uri"]!!.jsonPrimitive.content } catch (e: ApiException) { err = e.message }
                }
            }, Modifier.fillMaxWidth())
            setup != null -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("1. افتح تطبيق المصادقة بالزر، أو أضف حساباً بالمفتاح:", style = MaterialTheme.typography.bodyMedium)
                OutlinedButton({ runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(setup!!.second))) }.onFailure { err = "ثبّت Google Authenticator أولاً، أو أدخل المفتاح يدوياً" } }, Modifier.fillMaxWidth()) { Text("افتح في تطبيق المصادقة") }
                SelectionContainer { Text(setup!!.first, style = MaterialTheme.typography.titleMedium.merge(Tabular), color = Mawred.colors.ink) }
                Text("2. اكتب الرمز الظاهر في التطبيق:", style = MaterialTheme.typography.bodyMedium)
                codeField()
                PrimaryButton(if (busy) "جارٍ التحقق…" else "تأكيد", { act("/auth/mfa/enable", "فُعّل التحقق بخطوتين") { enabled = true } }, Modifier.fillMaxWidth(), enabled = !busy && code.length == 6)
            }
            enabled == true -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) { codeField() }
                OutlinedButton({ act("/auth/mfa/disable", "أُوقف التحقق بخطوتين") { enabled = false } }, Modifier.padding(top = 8.dp), enabled = !busy && code.length == 6) { Text("إيقاف") }
            }
        }
        msg?.let { Text(it, color = Mawred.colors.ok) }
        ErrorText(err)
    }
}
