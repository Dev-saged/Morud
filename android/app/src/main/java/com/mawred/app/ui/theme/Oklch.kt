package com.mawred.app.ui.theme

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** تحويل OKLCH (كما في spec) إلى sRGB 0xAARRGGBB مع قصّ النطاق. */
object Oklch {
    private val RE = Regex("""oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)""")

    fun parse(s: String): Int {
        val m = RE.matchEntire(s.trim()) ?: throw IllegalArgumentException("صيغة OKLCH غير صالحة: $s")
        val (l, c, h) = m.destructured
        return toArgb(l.toDouble() / 100, c.toDouble(), h.toDouble())
    }

    fun toArgb(l: Double, c: Double, hDeg: Double): Int {
        val h = hDeg * PI / 180
        val a = c * cos(h)
        val b = c * sin(h)
        val l1 = (l + 0.3963377774 * a + 0.2158037573 * b).pow(3)
        val m1 = (l - 0.1055613458 * a - 0.0638541728 * b).pow(3)
        val s1 = (l - 0.0894841775 * a - 1.2914855480 * b).pow(3)
        val r = 4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1
        val g = -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1
        val bl = -0.0041960863 * l1 - 0.7034186147 * m1 + 1.7076147010 * s1
        return (0xFF shl 24) or (enc(r) shl 16) or (enc(g) shl 8) or enc(bl)
    }

    private fun enc(x: Double): Int {
        val v = x.coerceIn(0.0, 1.0)
        val s = if (v <= 0.0031308) 12.92 * v else 1.055 * v.pow(1 / 2.4) - 0.055
        return (s * 255).roundToInt().coerceIn(0, 255)
    }

    /** نسبة التباين WCAG بين لونين ARGB. */
    fun contrast(a: Int, b: Int): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    private fun luminance(c: Int): Double {
        fun ch(v: Int): Double { val s = v / 255.0; return if (s <= 0.04045) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4) }
        return 0.2126 * ch((c shr 16) and 0xFF) + 0.7152 * ch((c shr 8) and 0xFF) + 0.0722 * ch(c and 0xFF)
    }

}
