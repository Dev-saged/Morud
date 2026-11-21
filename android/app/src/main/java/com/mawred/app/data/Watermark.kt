package com.mawred.app.data

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.vector.PathParser
import com.mawred.app.BrandConfig

/** علامة مورد على صور المنتجات — نفس قواعد web/src/lib/cutout.ts (markRect). */
object Watermark {
    const val MARK_PATH = "M43 59V191a15 15 0 0 0 30 0V100l42 47a15 15 0 0 0 22 0l42-47v41a15 15 0 0 0 30 0V59a15 15 0 0 0-26-10l-57 64-57-64a15 15 0 0 0-26 10z"

    data class Rect(val x: Int, val y: Int, val size: Int)

    /** مربع في الزاوية السفلية اليسرى: 14% من الضلع الأقصر (حد أدنى 40px) بهامش 3%. */
    fun markRect(w: Int, h: Int): Rect {
        val size = maxOf(40, Math.round(minOf(w, h) * 0.14f))
        val pad = Math.round(minOf(w, h) * 0.03f)
        return Rect(pad, h - size - pad, size)
    }

    fun stamp(src: Bitmap): Bitmap {
        val out = if (src.isMutable) src else src.copy(Bitmap.Config.ARGB_8888, true)
        val c = Canvas(out)
        val r = markRect(out.width, out.height)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = 0xEBFFFFFF.toInt()
        c.drawRoundRect(RectF(r.x.toFloat(), r.y.toFloat(), (r.x + r.size).toFloat(), (r.y + r.size).toFloat()), r.size * 0.22f, r.size * 0.22f, paint)
        c.save()
        c.translate(r.x + r.size * 0.12f, r.y + r.size * 0.12f)
        val k = r.size * 0.76f / 256f
        c.scale(k, k)
        paint.color = BrandConfig.BLUE_HEX.toInt()
        c.drawPath(PathParser().parsePathString(MARK_PATH).toPath().asAndroidPath(), paint)
        paint.color = BrandConfig.ORANGE_HEX.toInt()
        c.drawCircle(194f, 193f, 19f, paint)
        c.restore()
        return out
    }
}
