package com.mawred.app.shots

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.mawred.app.data.api.Api
import com.mawred.app.data.auth.SessionUser
import com.mawred.app.ui.admin.SettingsSection
import com.mawred.app.ui.admin.TeamSection
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.background
import androidx.compose.ui.Modifier
import com.mawred.app.ui.theme.Mawred
import com.mawred.app.ui.admin.AdminVm
import com.mawred.app.ui.theme.MawredTheme
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * لقطات مراجعة بصرية لشاشات الإدارة على أندرويد بلا محاكي.
 * تُشغَّل يدوياً: ./gradlew testDebugUnitTest --tests '*ScreensShot*' -Dshots=1 -Proborazzi.test.record=true
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi")
class ScreensShot {
    @get:Rule val rule = createComposeRule()
    private val server = MockWebServer()
    private val spec = File("../../spec").takeIf { it.exists() } ?: File("../spec")

    private val routes = mapOf(
        "/admin/roles" to { """{"roles":${roles()},"permissions":${perms()}}""" },
        "/admin/users" to { """{"users":[
            {"uid":"own","displayName":"ساجد العبادلة","username":"sajed","status":"active","roles":["super_admin"],"grant":[],"deny":[],"lastLoginAt":${System.currentTimeMillis() - 3_600_000}},
            {"uid":"u2","displayName":"محمد أبو سلمية","username":"m.salmiya","status":"active","roles":["orders_employee"],"grant":["reports.view"],"deny":[],"lastLoginAt":${System.currentTimeMillis() - 86_400_000}},
            {"uid":"u3","displayName":"سماح الشوا","username":"samah","status":"active","roles":["accountant"],"grant":[],"deny":[],"lastLoginAt":null},
            {"uid":"u5","displayName":"خالد الحلو","username":"khaled","status":"suspended","roles":["catalog_employee","orders_employee"],"grant":[],"deny":["orders.cancel"],"lastLoginAt":null}]}""" },
        "/dashboard/summary" to { """{"ordersToday":23,"new":4,"review":2,"preparing":5,"ready":3,"overdue":1,"delivering":6,"completed":9,"salesToday":2874350,"collectedToday":1962000,"totalDue":4318700,"activeShops":38,"availableProducts":130,"unavailableProducts":1,"topProducts":[{"productId":"a","name":"سكر أبيض","count":41},{"productId":"b","name":"طحين أبيض","count":36},{"productId":"c","name":"جبنة نابلسية 1 كغ","count":29}],"ordersLast7Days":[14,19,17,22,18,26,23],"recent":[{"id":"o1","number":"MW-O-2026-000430","shopId":"s","shopName":"بقالة النور","status":"new","total":38000},{"id":"o2","number":"MW-O-2026-000429","shopId":"s","shopName":"سوبرماركت الأمل","status":"preparing","total":45919}]}""" },
        "/support" to { """{"tickets":[{"id":"t1","type":"complaint","subject":"نقص كرتونة في طلب الأسبوع الماضي","body":"وصلت كرتونتا زيت بدل ثلاث","status":"resolved","createdAt":${System.currentTimeMillis() - 8 * 86_400_000},"replies":[{"text":"نعتذر، أضفنا الكرتونة لطلبك القادم بدون مقابل","at":0}]}]}""" },
        "/settings" to { """{"settings":{"platformName":"مورد","workDays":[0,1,2,3,4,6],"orderIntakeStart":"06:00","orderIntakeEnd":"23:00","deliveryStart":"06:00","deliveryEnd":"23:00","slaWorkingHours":6,"defaultPrepMinutes":90,"holidays":["2026-12-25"],"paymentMethods":[{"id":"cash","label":"نقداً","enabled":true},{"id":"bank_transfer","label":"تحويل بنكي","enabled":false}],"creditWarnPercent":80,"backupRetentionDays":30,"creditBlocksDeferredOrders":true,"newOrderSound":true,"mfaFeature":false,"supplier":{"name":"مورد للتوريد","phone":"","address":"غزة","taxId":""}}}""" },
    )

    private fun roles() = Regex("\"roles\"\\s*:\\s*(\\[.*])", RegexOption.DOT_MATCHES_ALL).find(File(spec, "roles.json").readText())!!.groupValues[1].substringBeforeLast("]") + "]"
    private fun perms() = Regex("\"permissions\"\\s*:\\s*(\\[.*])", RegexOption.DOT_MATCHES_ALL).find(File(spec, "permissions.json").readText())!!.groupValues[1].substringBeforeLast("]") + "]"

    @After fun stop() = server.shutdown()

    private fun shoot(section: String, name: String, user: SessionUser, then: List<Pair<String, String>> = emptyList()) = shootWith(name, then) { vm, api ->
        when (section) {
            "users" -> TeamSection(vm, user.can("roles.manage"), PaddingValues(top = 8.dp))
            "dashboard" -> com.mawred.app.ui.admin.DashboardScreen(com.mawred.app.ui.admin.DashboardViewModel(api, com.mawred.app.core.OrderStates(File(spec, "order-states.json").readText())), PaddingValues(0.dp), name = "ساجد العبادلة")
            "help" -> com.mawred.app.ui.common.HelpScreen(shopUser, "shop", PaddingValues(16.dp), vm = com.mawred.app.ui.common.HelpViewModel(api, androidx.test.core.app.ApplicationProvider.getApplicationContext()))
            else -> SettingsSection(vm, PaddingValues(16.dp))
        }
    }

    private val shopUser = SessionUser("so1", "أبو أحمد", roles = listOf("shop_owner"), home = "shop.home", permissions = listOf("support.create"), shopIds = listOf("s1"))

    private fun shootWith(name: String, then: List<Pair<String, String>>, content: @androidx.compose.runtime.Composable (AdminVm, Api) -> Unit) {
        assumeTrue(System.getProperty("shots") == "1")
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = routes[request.path!!.substringBefore('?')]?.let { MockResponse().setBody(it()) } ?: MockResponse().setResponseCode(404).setBody("""{"error":{"code":"NOT_FOUND","message":"x"}}""")
        }
        server.start()
        val api = Api(OkHttpClient(), { server.url("").toString().trimEnd('/') }) { "t" }
        val vm = AdminVm(api)
        rule.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MawredTheme(dark = false) { Box(Modifier.fillMaxSize().background(Mawred.colors.surface)) { content(vm, api) } }
            }
        }
        rule.waitUntil(5000) { server.requestCount >= 1 || name.contains("help") }
        Thread.sleep(800); rule.mainClock.advanceTimeBy(1000); rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/shots/$name.png")
        // خطوات إضافية: نقرة على نص ثم لقطة باسمها
        then.forEach { (text, shot) ->
            val target = androidx.compose.ui.test.hasText(text, substring = true) and androidx.compose.ui.test.hasClickAction()
            val lists = rule.onAllNodes(androidx.compose.ui.test.hasScrollToNodeAction())
            for (i in 0 until lists.fetchSemanticsNodes().size) if (runCatching { lists[i].performScrollToNode(target) }.isSuccess) break
            rule.onAllNodes(target)[0].performClick()
            Thread.sleep(300); rule.mainClock.advanceTimeBy(600); rule.waitForIdle()
            rule.onRoot().captureRoboImage("build/shots/$shot.png")
        }
    }

    private val owner = SessionUser("own", "ساجد", roles = listOf("super_admin"), home = "admin.dashboard", permissions = listOf("*", "users.manage", "roles.manage", "settings.manage"))

    @Test fun users() = shoot("users", "android-users", owner, listOf("محمد أبو سلمية" to "android-user-form"))
    @Test fun roleEditor() = shoot("users", "android-roles", owner, listOf("الأدوار" to "android-roles-list", "موظف الطلبات" to "android-role-edit"))
    @Test fun settings() = shoot("settings", "android-settings", owner)
    @Test fun dashboard() = shoot("dashboard", "android-dashboard", owner)
    @Test fun help() = shoot("help", "android-help", owner, listOf("تواصل مع الدعم" to "android-support"))
}
