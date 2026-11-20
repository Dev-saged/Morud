package com.mawred.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.mawred.app.BrandConfig
import com.mawred.app.ui.FormState
import com.mawred.app.ui.Icons
import com.mawred.app.ui.LogoMark
import com.mawred.app.ui.common.AliveBackground
import com.mawred.app.ui.common.ErrorText
import com.mawred.app.ui.common.PrimaryButton
import com.mawred.app.ui.theme.Mawred

@Composable
private fun AuthFrame(onLogoTaps: () -> Unit = {}, content: @Composable ColumnScope.() -> Unit) {
    var taps by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize()) {
        AliveBackground()
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(Modifier.background(Mawred.colors.raised, RoundedCornerShape(28.dp)).padding(18.dp).clickable(remember { MutableInteractionSource() }, null) { if (++taps >= 7) { taps = 0; onLogoTaps() } }) {
                LogoMark(64.dp, Mawred.colors.primary, Mawred.colors.accent)
            }
            Spacer(Modifier.height(12.dp))
            Text(BrandConfig.NAME, style = MaterialTheme.typography.displaySmall, color = Mawred.colors.onPrimary)
            Text(BrandConfig.TAGLINE, style = MaterialTheme.typography.bodyMedium, color = Mawred.colors.onPrimary.copy(alpha = 0.85f))
            Spacer(Modifier.height(24.dp))
            Column(Modifier.fillMaxWidth().background(Mawred.colors.raised, RoundedCornerShape(24.dp)).padding(20.dp)) { content() }
        }
    }
}

@Composable
fun LoginScreen(form: FormState, onLogin: (String, String) -> Unit, onForgot: (String) -> Unit, onSecret: () -> Unit, clear: () -> Unit) {
    var id by rememberSaveable { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var forgot by rememberSaveable { mutableStateOf(false) }
    AuthFrame(onSecret) {
        Text(if (forgot) "استعادة كلمة المرور" else "تسجيل الدخول", style = MaterialTheme.typography.titleLarge, color = Mawred.colors.ink)
        Text("رقم الهاتف أو البريد أو اسم المستخدم", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(id, { id = it }, Modifier.fillMaxWidth(), label = { Text("المعرّف") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
        if (!forgot) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(pw, { pw = it }, Modifier.fillMaxWidth(), label = { Text("كلمة المرور") }, singleLine = true,
                visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                trailingIcon = { IconButton({ show = !show }, Modifier.semantics { contentDescription = if (show) "إخفاء كلمة المرور" else "إظهار كلمة المرور" }) { Icon(Icons.eye, null) } })
        }
        ErrorText(form.error)
        form.info?.let { Text(it, color = Mawred.colors.ok, style = MaterialTheme.typography.bodyMedium) }
        Spacer(Modifier.height(12.dp))
        PrimaryButton(if (form.busy) "جارٍ التحقق…" else if (forgot) "إرسال" else "دخول", { if (forgot) onForgot(id) else onLogin(id, pw) }, enabled = !form.busy)
        TextButton({ forgot = !forgot; clear() }, Modifier.align(Alignment.CenterHorizontally)) { Text(if (forgot) "العودة للدخول" else "نسيت كلمة المرور؟", color = Mawred.colors.primary) }
    }
}

@Composable
fun ChangePasswordScreen(form: FormState, onSave: (String, String) -> Unit, onLogout: () -> Unit) {
    var pw by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    AuthFrame {
        Text("كلمة مرور جديدة", style = MaterialTheme.typography.titleLarge, color = Mawred.colors.ink)
        Text("كلمة المرور الحالية مؤقتة؛ اختر كلمة خاصة بك للمتابعة.", style = MaterialTheme.typography.bodySmall, color = Mawred.colors.mute)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(pw, { pw = it }, Modifier.fillMaxWidth(), label = { Text("كلمة المرور الجديدة") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(confirm, { confirm = it }, Modifier.fillMaxWidth(), label = { Text("تأكيد كلمة المرور") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
        ErrorText(form.error)
        Spacer(Modifier.height(12.dp))
        PrimaryButton(if (form.busy) "جارٍ الحفظ…" else "حفظ ومتابعة", { onSave(pw, confirm) }, enabled = !form.busy)
        TextButton(onLogout, Modifier.align(Alignment.CenterHorizontally)) { Text("تسجيل الخروج", color = Mawred.colors.mute) }
    }
}
