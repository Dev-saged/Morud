package com.mawred.app.core

import com.mawred.app.BrandConfig

/** المال int بالأغورة والكمية بالألف؛ لا float في أي مسار مالي (مطابق لـ worker/src/domain). */
object Money {
    fun format(agorot: Long, symbol: String = BrandConfig.CURRENCY_SYMBOL): String {
        val abs = kotlin.math.abs(agorot)
        val whole = (abs / 100).toString().reversed().chunked(3).joinToString(",").reversed()
        return "${if (agorot < 0) "-" else ""}$whole.${(abs % 100).toString().padStart(2, '0')} $symbol"
    }

    /** "12.5" ← 1250؛ أي صيغة أخرى ← null. */
    fun parse(s: String): Long? {
        val m = Regex("""^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$""").matchEntire(s) ?: return null
        return m.groupValues[1].toLong() * 100 + m.groupValues[2].padEnd(2, '0').toLong()
    }

    fun formatQty(qtyMilli: Long): String {
        val whole = qtyMilli / 1000
        val frac = kotlin.math.abs(qtyMilli % 1000)
        return if (frac == 0L) whole.toString() else "$whole.${frac.toString().padStart(3, '0').trimEnd('0')}"
    }

    /** عزل الأرقام داخل النص العربي باتجاه LTR. */
    fun ltr(s: String) = "⁦$s⁩"
}
