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
            {"uid":"own","displayName":"ساجد العبادلة","username":"sajed","phone":"0597857250","status":"active","roles":["super_admin"],"grant":[],"deny":[],"lastLoginAt":${System.currentTimeMillis() - 3_600_000}},
            {"uid":"u2","displayName":"محمد أبو سلمية","username":"m.salmiya","phone":"0599123456","status":"active","roles":["orders_employee"],"grant":["reports.view"],"deny":[],"lastLoginAt":${System.currentTimeMillis() - 86_400_000}},
            {"uid":"u3","displayName":"سماح الشوا","username":"samah","status":"active","roles":["accountant"],"grant":[],"deny":[],"lastLoginAt":null},
            {"uid":"u5","displayName":"خالد الحلو","username":"khaled","status":"suspended","roles":["catalog_employee","orders_employee"],"grant":[],"deny":["orders.cancel"],"lastLoginAt":null}]}""" },
        "/settings" to { """{"settings":{"platformName":"مورد","workDays":[0,1,2,3,4,6],"orderIntakeStart":"06:00","orderIntakeEnd":"23:00","deliveryStart":"06:00","deliveryEnd":"23:00","slaWorkingHours":6,"defaultPrepMinutes":90,"holidays":["2026-12-25"],"paymentMethods":[{"id":"cash","label":"نقداً","enabled":true},{"id":"bank_transfer","label":"تحويل بنكي","enabled":false}],"creditWarnPercent":80,"backupRetentionDays":30,"creditBlocksDeferredOrders":true,"newOrderSound":true,"mfaFeature":false,"supplier":{"name":"مورد للتوريد","phone":"0597857250","address":"غزة","taxId":""}}}""" },
    )

    private fun roles() = Regex("\"roles\"\\s*:\\s*(\\[.*])", RegexOption.DOT_MATCHES_ALL).find(File(spec, "roles.json").readText())!!.groupValues[1].substringBeforeLast("]") + "]"
    private fun perms() = Regex("\"permissions\"\\s*:\\s*(\\[.*])", RegexOption.DOT_MATCHES_ALL).find(File(spec, "permissions.json").readText())!!.groupValues[1].substringBeforeLast("]") + "]"

    @After fun stop() = server.shutdown()

    private fun shoot(section: String, name: String, user: SessionUser, then: List<Pair<String, String>> = emptyList()) {
        assumeTrue(System.getProperty("shots") == "1")
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest) = routes[request.path!!.substringBefore('?')]?.let { MockResponse().setBody(it()) } ?: MockResponse().setResponseCode(404).setBody("""{"error":{"code":"NOT_FOUND","message":"x"}}""")
        }
        server.start()
        val vm = AdminVm(Api(OkHttpClient(), { server.url("").toString().trimEnd('/') }) { "t" })
        rule.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MawredTheme(dark = false) { Box(Modifier.fillMaxSize().background(Mawred.colors.surface)) { if (section == "users") TeamSection(vm, user.can("roles.manage"), PaddingValues(top = 8.dp)) else SettingsSection(vm, PaddingValues(16.dp)) } }
            }
        }
        rule.waitUntil(5000) { server.requestCount >= 1 }
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
}
