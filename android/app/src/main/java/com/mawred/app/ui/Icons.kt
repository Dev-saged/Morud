package com.mawred.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.toPath
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** عائلة أيقونات مورد: شبكة 24، خط 1.75، أطراف دائرية — نفس مسارات الويب. الاتجاهية تنعكس في RTL. */
object Icons {
    val home: ImageVector by lazy { icon("home", "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z") }
    val search: ImageVector by lazy { icon("search", "M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM16 16l4 4") }
    val cart: ImageVector by lazy { icon("cart", "M3.5 5h2l2 10h10l2-7H7M9.5 19.5h.01M16.5 19.5h.01", mirror = true) }
    val orders: ImageVector by lazy { icon("orders", "M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h4") }
    val user: ImageVector by lazy { icon("user", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0") }
    val bell: ImageVector by lazy { icon("bell", "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0") }
    val plus: ImageVector by lazy { icon("plus", "M12 5v14M5 12h14") }
    val minus: ImageVector by lazy { icon("minus", "M5 12h14") }
    val trash: ImageVector by lazy { icon("trash", "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13") }
    val box: ImageVector by lazy { icon("box", "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8") }
    val truck: ImageVector by lazy { icon("truck", "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01", mirror = true) }
    val logout: ImageVector by lazy { icon("logout", "M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9", mirror = true) }
    val chevron: ImageVector by lazy { icon("chevron", "M15 6l-6 6 6 6", mirror = true) }
    val clock: ImageVector by lazy { icon("clock", "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 8v4l3 2") }
    val check: ImageVector by lazy { icon("check", "M5 12.5l4.5 4.5L19 7.5") }
    val alert: ImageVector by lazy { icon("alert", "M12 4l9 16H3zM12 10v4M12 17h.01") }
    val wallet: ImageVector by lazy { icon("wallet", "M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4zM4 7l11-3v3M16 13h.01") }
    val chart: ImageVector by lazy { icon("chart", "M5 19V11M10 19V6M15 19v-5M20 19V9") }
    val store: ImageVector by lazy { icon("store", "M4 9l1.5-5h13L20 9M4 9h16M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11v9h14v-9M10 20v-5h4v5") }
    val users: ImageVector by lazy { icon("users", "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3 5.5") }
    val tag: ImageVector by lazy { icon("tag", "M4 4h7l9 9-7 7-9-9zM8.5 8.5h.01") }
    val gear: ImageVector by lazy { icon("gear", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8") }
    val lock: ImageVector by lazy { icon("lock", "M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2") }
    val close: ImageVector by lazy { icon("close", "M6 6l12 12M18 6L6 18") }
    val list: ImageVector by lazy { icon("list", "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01") }
    val shield: ImageVector by lazy { icon("shield", "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4") }
    val chat: ImageVector by lazy { icon("chat", "M4 5h16v11H9l-5 4z") }
    val print: ImageVector by lazy { icon("print", "M7 9V4h10v5M6 17H4v-7h16v7h-2M7 14h10v6H7z") }
    val eye: ImageVector by lazy { icon("eye", "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z") }
    val pin: ImageVector by lazy { icon("pin", "M12 21s-6-5.5-6-10.5a6 6 0 1 1 12 0C18 15.5 12 21 12 21zM12 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z") }
    val phone: ImageVector by lazy { icon("phone", "M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 5 5.5 1.5 1.5 0 0 1 6.5 4z") }
    val download: ImageVector by lazy { icon("download", "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14") }
    val pause: ImageVector by lazy { icon("pause", "M9 6v12M15 6v12") }
    val folder: ImageVector by lazy { icon("folder", "M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z") }
    val sparkle: ImageVector by lazy { icon("sparkle", "M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8zM18 16l.8 1.7 1.7.8-1.7.8L18 21l-.8-1.7-1.7-.8 1.7-.8z") }
    val share: ImageVector by lazy { icon("share", "M12 4v11M8 8l4-4 4 4M5 13v6h14v-6", mirror = true) }

    private fun icon(name: String, d: String, mirror: Boolean = false) = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f, autoMirror = mirror)
        .addPath(pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 1.75f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
        .build()

    val all: Map<String, ImageVector> get() = mapOf("home" to home, "search" to search, "cart" to cart, "orders" to orders, "user" to user, "bell" to bell, "plus" to plus, "minus" to minus, "trash" to trash, "box" to box, "truck" to truck, "logout" to logout, "chevron" to chevron, "clock" to clock, "check" to check, "alert" to alert, "wallet" to wallet, "chart" to chart, "store" to store, "users" to users, "tag" to tag, "gear" to gear, "shield" to shield, "chat" to chat, "print" to print, "eye" to eye, "pin" to pin, "phone" to phone, "share" to share, "download" to download, "pause" to pause, "folder" to folder, "sparkle" to sparkle, "lock" to lock, "list" to list, "close" to close)
}

private val logoPath = PathParser().parsePathString("M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z").toPath()

/** علامة «M بالنقطة» المعتمدة. */
@Composable
fun LogoMark(size: Dp, mark: Color, dot: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) {
        val k = this.size.minDimension / 256f
        scale(k, k, pivot = Offset.Zero) {
            drawPath(logoPath, mark)
            drawCircle(dot, radius = 19f, center = Offset(194f, 193f))
        }
    }
}
