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
import androidx.compose.runtime.remember
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

/** التوجيه حسب الجلسة والدور (SRS 2.2): كل حساب إلى واجهته مباشرة. */
@Composable
fun MawredRoot(openUpdate: kotlinx.coroutines.flow.MutableStateFlow<Boolean> = remember { kotlinx.coroutines.flow.MutableStateFlow(false) }, openRef: kotlinx.coroutines.flow.MutableStateFlow<com.mawred.app.data.NoticeRef?> = remember { kotlinx.coroutines.flow.MutableStateFlow(null) }, vm: SessionViewModel = hiltViewModel(), updVm: com.mawred.app.ui.update.UpdateViewModel = hiltViewModel()) {
    val session by vm.session.collectAsStateWithLifecycle()
    val form by vm.form.collectAsStateWithLifecycle()
    val phase by updVm.phase.collectAsStateWithLifecycle()
    val showUpdates by openUpdate.collectAsStateWithLifecycle()
    val update = com.mawred.app.ui.update.UpdateViewModel.infoOf(phase)
    val prefs by vm.prefs.collectAsStateWithLifecycle()
    val stale by vm.stale.collectAsStateWithLifecycle()
    var secret by rememberSaveable { mutableStateOf(false) }
    if (secret) { BackHandler { secret = false }; TestScreen(session, update) { secret = false }; return }
    if (showUpdates) { BackHandler { openUpdate.value = false }; com.mawred.app.ui.update.UpdateCenter(updVm) { openUpdate.value = false }; return }
    AnimatedContent(session, transitionSpec = { fadeIn(spring()) togetherWith fadeOut(spring()) }, contentKey = { it::class to ((it as? SessionState.SignedIn)?.user?.mustChangePassword) }, label = "root") { s ->
        when (s) {
            SessionState.Loading -> Box(Modifier.fillMaxSize().background(Mawred.colors.surface), contentAlignment = Alignment.Center) { LogoMark(72.dp, Mawred.colors.primary, Mawred.colors.accent) }
            SessionState.SignedOut -> LoginScreen(form, prefs, vm::login, vm::forgot, { secret = true }, vm::clearForm, vm::loginMfa)
            is SessionState.SignedIn -> if (s.user.mustChangePassword) ChangePasswordScreen(form, vm::changePassword) { vm.logout() }
                else androidx.compose.runtime.CompositionLocalProvider(com.mawred.app.ui.update.LocalOpenUpdates provides { openUpdate.value = true }) {
                    AreaShell(s.user, s.offline || stale != null, phase, { openUpdate.value = true }, { if (!updVm.install()) openUpdate.value = true }, { vm.logout() }, { secret = true }, openRef)
                }
        }
    }
}

private data class Tab(val id: String, val label: String, val icon: ImageVector)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AreaShell(user: SessionUser, offline: Boolean, phase: com.mawred.app.update.UpdatePhase, onOpenUpdate: () -> Unit, onInstall: () -> Unit, onLogout: () -> Unit, onSecret: () -> Unit, openRef: kotlinx.coroutines.flow.MutableStateFlow<com.mawred.app.data.NoticeRef?>) {
    val tabs = when (user.area) {
        "shop" -> listOf(Tab("catalog", "الرئيسية", Icons.home), Tab("cart", "السلة", Icons.cart), Tab("orders", "طلباتي", Icons.orders), Tab("account", "حسابي", Icons.wallet))
        "admin" -> listOfNotNull(
            Tab("dashboard", "لوحة المعلومات", Icons.chart).takeIf { user.can("orders.view") },
            Tab("adminOrders", "الطلبات", Icons.orders).takeIf { user.can("orders.view") },
            Tab("adminProducts", "المنتجات", Icons.box).takeIf { user.can("products.availability.update") || user.can("products.update") },
            Tab("adminMore", "المزيد", Icons.gear).takeIf { com.mawred.app.ui.admin.hasMoreSections(user) },
        )
        "agent" -> listOf(Tab("tasks", "المهام", Icons.truck))
        else -> emptyList()
    }
    var tab by rememberSaveable { mutableStateOf(tabs.firstOrNull()?.id.orEmpty()) }
    var focus by remember { mutableStateOf<com.mawred.app.ui.admin.Focus?>(null) }
    val canOpen: (String, com.mawred.app.ui.admin.Focus) -> Boolean = { t, f -> tabs.any { it.id == t } && (t != "adminMore" || f.id == null || com.mawred.app.ui.admin.canOpenSection(user, f.id)) }
    val go: (String, com.mawred.app.ui.admin.Focus) -> Unit = { t, f -> if (canOpen(t, f)) { focus = f; tab = t } }
    val shopVm: ShopViewModel? = if (user.area == "shop") hiltViewModel() else null
    val cartCount = shopVm?.cartRows?.collectAsStateWithLifecycle()?.value?.size ?: 0
    var logoTaps by rememberSaveable { mutableStateOf(0) }
    var openOrder by rememberSaveable { mutableStateOf<String?>(null) }
    val checkout = shopVm?.checkout?.collectAsStateWithLifecycle()?.value
    val inboxVm: com.mawred.app.ui.inbox.InboxViewModel = hiltViewModel()
    val inbox by inboxVm.page.collectAsStateWithLifecycle()
    var showInbox by rememberSaveable { mutableStateOf(false) }
    /** كل إشعار يفتح مرجعه حسب دور المستخدم. */
    val openNotice: (com.mawred.app.data.NoticeRef) -> Unit = { r ->
        when (user.area) {
            "shop" -> when (r.kind) { "order" -> { openOrder = r.id; tab = "orders" }; "shop", "ticket" -> tab = "account"; else -> tab = "catalog" }
            "admin" -> when (r.kind) {
                "order" -> go("adminOrders", com.mawred.app.ui.admin.Focus("all", r.id))
                "shop" -> go("adminMore", com.mawred.app.ui.admin.Focus(id = "shops"))
                "ticket" -> go("adminMore", com.mawred.app.ui.admin.Focus(id = "support"))
                "backup" -> go("adminMore", com.mawred.app.ui.admin.Focus(id = "backups"))
                else -> {}
            }
            else -> tab = tabs.firstOrNull()?.id.orEmpty()
        }
    }
    val pendingRef by openRef.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(pendingRef) { pendingRef?.let { openNotice(it); inboxVm.refresh(); openRef.value = null } }
    if (showInbox) com.mawred.app.ui.inbox.InboxSheet(inboxVm, { showInbox = false }, openNotice)
    androidx.compose.runtime.LaunchedEffect(checkout?.sentOrderId) { checkout?.sentOrderId?.let { openOrder = it; tab = "orders"; shopVm.consumeSent() } }
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(BrandConfig.NAME, style = MaterialTheme.typography.titleLarge) },
                navigationIcon = { IconButton({ if (++logoTaps >= 7) { logoTaps = 0; onSecret() } }) { LogoMark(28.dp, Mawred.colors.onPrimary, Mawred.colors.accent) } },
                actions = {
                    com.mawred.app.ui.inbox.BellButton(inbox?.unread ?: 0) { showInbox = true }
                    IconButton(onLogout) { Icon(Icons.logout, "تسجيل الخروج") }
                },
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
            com.mawred.app.ui.update.UpdateBanner(phase, onOpenUpdate, onInstall)
            AnimatedContent(tab, transitionSpec = { fadeIn(spring()) togetherWith fadeOut(spring()) }, label = "tab") { t ->
                when (t) {
                    "catalog" -> shopVm?.let { sv ->
                        val cu = sv.ui.collectAsStateWithLifecycle().value
                        val pend = sv.pendingCount.collectAsStateWithLifecycle().value
                        val me: com.mawred.app.ui.common.MeViewModel = hiltViewModel()
                        val st: com.mawred.app.ui.admin.DashboardViewModel = hiltViewModel()
                        CatalogScreen(cu, sv, pad) {
                            com.mawred.app.ui.shop.ShopDesk(me, user.displayName, cu.data, pend, st.states, { openOrder = null; tab = "orders" }, { openOrder = it; tab = "orders" }, { tab = "account" }) { p, u -> sv.addById(p, u) }
                        }
                    }
                    "cart" -> shopVm?.let { CartScreen(it.cartRows.collectAsStateWithLifecycle().value, it.checkout.collectAsStateWithLifecycle().value, it, pad) }
                    "orders" -> com.mawred.app.ui.shop.OrdersScreen(hiltViewModel(), pad, openOrder) { openOrder = null }
                    "account" -> com.mawred.app.ui.shop.AccountScreen(hiltViewModel(), pad)
                    "dashboard" -> DashboardScreen(hiltViewModel(), pad, canOpen, go, user.displayName)
                    "tasks" -> TasksScreen(hiltViewModel(), pad, user.displayName)
                    "adminOrders" -> com.mawred.app.ui.admin.AdminOrdersScreen(hiltViewModel(), pad, focus) { focus = null }
                    "adminProducts" -> com.mawred.app.ui.admin.AdminProductsScreen(hiltViewModel(), pad, user.can("products.update"), focus) { focus = null }
                    "adminMore" -> com.mawred.app.ui.admin.AdminMoreScreen(user, pad, focus, { focus = null })
                    else -> com.mawred.app.ui.common.Empty("لا توجد واجهة لحسابك، تواصل مع الإدارة")
                }
            }
        }
    }
}
