package com.mawred.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mawred.app.BrandConfig
import com.mawred.app.data.auth.SessionState
import com.mawred.app.data.auth.SessionUser
import com.mawred.app.ui.admin.DashboardScreen
import com.mawred.app.ui.agent.TasksScreen
import com.mawred.app.ui.common.Notice
import com.mawred.app.ui.screens.ChangePasswordScreen
import com.mawred.app.ui.screens.LoginScreen
import com.mawred.app.ui.screens.TestScreen
import com.mawred.app.ui.shop.CartScreen
import com.mawred.app.ui.shop.CatalogScreen
import com.mawred.app.ui.shop.ShopViewModel
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.update.UpdateInfo

/** التوجيه حسب الجلسة والدور (SRS 2.2): كل حساب إلى واجهته مباشرة. */
@Composable
fun MawredRoot(vm: SessionViewModel = hiltViewModel()) {
    val session by vm.session.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val update by vm.update.collectAsStateWithLifecycle()
    var secret by rememberSaveable { mutableStateOf(false) }
    if (secret) { BackHandler { secret = false }; TestScreen(session, update) { secret = false }; return }
    AnimatedContent(session, transitionSpec = { fadeIn(spring()) togetherWith fadeOut(spring()) }, contentKey = { it::class to ((it as? SessionState.SignedIn)?.user?.mustChangePassword) }, label = "root") { s ->
        when (s) {
            SessionState.Loading -> Box(Modifier.fillMaxSize().background(Mawred.colors.surface), contentAlignment = Alignment.Center) { LogoMark(72.dp, Mawred.colors.primary, Mawred.colors.accent) }
            SessionState.SignedOut -> LoginScreen(form, vm::login, vm::forgot, { secret = true }, vm::clearForm)
            is SessionState.SignedIn -> if (s.user.mustChangePassword) ChangePasswordScreen(form, vm::changePassword) { vm.logout() }
                else AreaShell(s.user, s.offline, update, { vm.downloadUpdate(it) }, { vm.logout() }, { secret = true })
        }
    }
}

private data class Tab(val id: String, val label: String, val icon: ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AreaShell(user: SessionUser, offline: Boolean, update: UpdateInfo?, onUpdate: (UpdateInfo) -> Unit, onLogout: () -> Unit, onSecret: () -> Unit) {
    val tabs = when (user.area) {
        "shop" -> listOf(Tab("catalog", "الرئيسية", Icons.home), Tab("cart", "السلة", Icons.cart), Tab("orders", "طلباتي", Icons.orders), Tab("account", "حسابي", Icons.wallet))
        "admin" -> listOf(Tab("dashboard", "لوحة المعلومات", Icons.chart))
        "agent" -> listOf(Tab("tasks", "المهام", Icons.truck))
        else -> emptyList()
    }
    var tab by rememberSaveable { mutableStateOf(tabs.firstOrNull()?.id.orEmpty()) }
    val shopVm: ShopViewModel? = if (user.area == "shop") hiltViewModel() else null
    val cartCount = shopVm?.cartRows?.collectAsStateWithLifecycle()?.value?.size ?: 0
    var logoTaps by rememberSaveable { mutableStateOf(0) }
    var openOrder by rememberSaveable { mutableStateOf<String?>(null) }
    val checkout = shopVm?.checkout?.collectAsStateWithLifecycle()?.value
    androidx.compose.runtime.LaunchedEffect(checkout?.sentOrderId) { checkout?.sentOrderId?.let { openOrder = it; tab = "orders"; shopVm.consumeSent() } }
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(BrandConfig.NAME, style = MaterialTheme.typography.titleLarge) },
                navigationIcon = { IconButton({ if (++logoTaps >= 7) { logoTaps = 0; onSecret() } }) { LogoMark(28.dp, Mawred.colors.onPrimary, Mawred.colors.accent) } },
                actions = { IconButton(onLogout) { Icon(Icons.logout, "تسجيل الخروج") } },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = Mawred.colors.primary, titleContentColor = Mawred.colors.onPrimary, actionIconContentColor = Mawred.colors.onPrimary),
            )
        },
        bottomBar = {
            if (tabs.size > 1) NavigationBar(containerColor = Mawred.colors.raised) {
                tabs.forEach { t ->
                    NavigationBarItem(tab == t.id, { tab = t.id }, icon = {
                        if (t.id == "cart" && cartCount > 0) BadgedBox(badge = { Badge(containerColor = Mawred.colors.accent, contentColor = androidx.compose.ui.graphics.Color(com.mawred.app.BrandConfig.ON_ACCENT_HEX)) { Text("$cartCount") } }) { Icon(t.icon, null) } else Icon(t.icon, null)
                    }, label = { Text(t.label) })
                }
            }
        },
        containerColor = Mawred.colors.surface,
    ) { pad ->
        Column(Modifier.padding(top = pad.calculateTopPadding())) {
            if (offline) Box(Modifier.padding(12.dp)) { Notice("وضع بلا اتصال — تُعرض آخر بيانات محفوظة") }
            if (update != null) Box(Modifier.padding(12.dp)) { Notice("إصدار جديد ${update.version} متاح", "تنزيل") { onUpdate(update) } }
            AnimatedContent(tab, transitionSpec = { fadeIn(spring()) togetherWith fadeOut(spring()) }, label = "tab") { t ->
                when (t) {
                    "catalog" -> shopVm?.let { CatalogScreen(it.ui.collectAsStateWithLifecycle().value, it, pad) }
                    "cart" -> shopVm?.let { CartScreen(it.cartRows.collectAsStateWithLifecycle().value, it.checkout.collectAsStateWithLifecycle().value, it, pad) }
                    "orders" -> com.mawred.app.ui.shop.OrdersScreen(hiltViewModel(), pad, openOrder) { openOrder = null }
                    "account" -> com.mawred.app.ui.shop.AccountScreen(hiltViewModel(), pad)
                    "dashboard" -> DashboardScreen(hiltViewModel(), pad)
                    "tasks" -> TasksScreen(hiltViewModel(), pad)
                    else -> com.mawred.app.ui.common.Empty("لا توجد واجهة لحسابك، تواصل مع الإدارة")
                }
            }
        }
    }
}
