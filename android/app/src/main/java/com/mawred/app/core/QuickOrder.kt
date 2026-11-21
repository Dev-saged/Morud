package com.mawred.app.core

import com.mawred.app.data.Product
import com.mawred.app.data.SaleUnit

/** وحدة الطلب الافتراضية: المحددة للمنتج، وإلا أول وحدة بيع (مطابق لـ worker/src/domain/catalog.ts). */
fun Product.defaultUnit(): SaleUnit? = units.firstOrNull { it.unitId == defaultUnitId } ?: units.firstOrNull()

data class QuickLine(val text: String, val productId: String, val unitId: String, val qtyMilli: Long, val assumedUnit: Boolean)
data class QuickProblem(val text: String, val reason: String, val candidates: List<String> = emptyList(), val unitId: String? = null)
data class QuickResult(val lines: List<QuickLine>, val problems: List<QuickProblem>)

/**
 * الطلب السريع: «10 سمك بوري، كرتونتين جبنة، نص كيلو زعتر».
 * نفس قواعد worker/src/domain/quickorder.ts حرفياً حتى يتطابق الفهم بين الويب والتطبيق.
 */
object QuickOrder {
    private val NUMBER_WORDS = mapOf(
        "واحد" to 1, "وحده" to 1, "اثنين" to 2, "اتنين" to 2, "ثنتين" to 2, "اثنان" to 2, "ثلاث" to 3, "ثلاثه" to 3, "تلات" to 3, "تلاته" to 3, "اربع" to 4, "اربعه" to 4,
        "خمس" to 5, "خمسه" to 5, "ست" to 6, "سته" to 6, "سبع" to 7, "سبعه" to 7, "ثمان" to 8, "ثماني" to 8, "ثمانيه" to 8, "تمن" to 8, "تمنيه" to 8, "تسع" to 9, "تسعه" to 9,
        "عشر" to 10, "عشره" to 10, "عشرين" to 20, "ثلاثين" to 30, "اربعين" to 40, "خمسين" to 50, "ميه" to 100, "مايه" to 100, "مئه" to 100,
    )
    private val FRACTION_WORDS = mapOf("نص" to 500L, "نصف" to 500L, "ربع" to 250L)
    private val UNIT_WORDS = mapOf(
        "كيلو" to "kg", "كيلوغرام" to "kg", "كيلوجرام" to "kg", "كغ" to "kg", "كجم" to "kg", "كيلوات" to "kg", "كيلوهات" to "kg",
        "غرام" to "g", "جرام" to "g", "غم" to "g", "لتر" to "liter", "لترات" to "liter", "لتره" to "liter",
        "كرتونه" to "carton", "كرتون" to "carton", "كراتين" to "carton", "كرتونات" to "carton", "علبه" to "box", "علب" to "box", "علبات" to "box",
        "حبه" to "piece", "حبات" to "piece", "حب" to "piece", "قطعه" to "piece", "قطع" to "piece", "كيس" to "bag", "اكياس" to "bag",
        "شوال" to "sack", "شوالات" to "sack", "شواله" to "sack", "دسته" to "dozen", "دست" to "dozen", "دزينه" to "dozen",
        "عبوه" to "pack", "عبوات" to "pack", "باكيت" to "pack", "باكيتات" to "pack", "باكو" to "pack", "ربطه" to "pack", "جالون" to "gallon", "جالونات" to "gallon", "جلن" to "gallon",
    )
    private val DUAL = mapOf("كرتونتين" to "carton", "علبتين" to "box", "كيسين" to "bag", "حبتين" to "piece", "كيلوين" to "kg", "شوالين" to "sack", "دستتين" to "dozen", "عبوتين" to "pack", "جالونين" to "gallon", "لترين" to "liter")
    private val FRACTION_UNITS = mapOf("نص_كيلو" to "half_kg", "نصف_كيلو" to "half_kg", "ربع_كيلو" to "quarter_kg")
    private val FILLER = setOf("من", "و", "الى", "لو", "سمحت", "بدي", "بدنا", "اريد", "نريد", "اعطيني", "هات", "كمان", "ايضا", "تبع", "نوع")

    fun normalize(s: String): String = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFKC)
        .replace(Regex("[ؐ-ًؚ-ٰٟۖ-ۭـ]"), "")
        .replace(Regex("[أإآٱ]"), "ا").replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
        .map { c -> if (c in '٠'..'٩') '0' + (c - '٠') else if (c in '۰'..'۹') '0' + (c - '۰') else c }.joinToString("")
        .lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim().replace(Regex("\\s+"), " ")

    fun split(text: String): List<String> = text.split(Regex("[\\n،,؛;+]|(?:\\s+و\\s+)")).map { it.trim() }.filter { it.isNotEmpty() }

    data class Parsed(val qtyMilli: Long?, val unitId: String?, val words: List<String>)

    fun parseSegment(segment: String): Parsed {
        val tokens = normalize(segment.replace(Regex("(\\d)[.٫](\\d)"), "$1DOT$2").replace(Regex("(\\d)/(\\d)"), "$1SLASH$2")).split(' ').filter { it.isNotEmpty() }
            .map { it.replace("dot", ".").replace("slash", "/") }
        var qty: Long? = null
        var unit: String? = null
        val words = mutableListOf<String>()
        var i = 0
        while (i < tokens.size) {
            val t = tokens[i]
            val pair = if (i + 1 < tokens.size) "${t}_${tokens[i + 1]}" else ""
            when {
                pair.isNotEmpty() && pair in FRACTION_UNITS -> { unit = FRACTION_UNITS[pair]; if (qty == null) qty = 1000; i++ }
                Regex("^\\d+(\\.\\d{1,3})?$").matches(t) -> qty = Math.round(t.toDouble() * 1000)
                Regex("^\\d+/\\d+$").matches(t) -> { val (a, b) = t.split('/').map { it.toLong() }; if (b != 0L) qty = Math.round(a.toDouble() / b * 1000) }
                t in DUAL -> { unit = DUAL[t]; qty = 2000 }
                t in UNIT_WORDS -> unit = UNIT_WORDS[t]
                t in NUMBER_WORDS -> { val n = NUMBER_WORDS.getValue(t); val q = qty; qty = (if (q != null && q % 1000 == 0L && q < 10000 && n >= 20) q else 0L) + n * 1000L }
                t in FRACTION_WORDS -> qty = (qty ?: 0L) + FRACTION_WORDS.getValue(t)
                t in FILLER -> Unit
                else -> words += t
            }
            i++
        }
        return Parsed(qty, unit, words)
    }

    private fun hay(p: Product) = (listOf(p.name) + p.altNames + listOfNotNull(p.brand)).flatMap { normalize(it).split(' ') }
    private fun codes(p: Product) = (listOf(p.sku) + p.barcodes).map { normalize(it).replace(" ", "") }

    /** نفس matches() في worker/src/domain/search.ts. */
    fun matches(query: String, p: Product): Boolean {
        val q = normalize(query).split(' ').filter { it.isNotEmpty() }
        if (q.isEmpty()) return true
        val h = hay(p); val c = codes(p); val whole = q.joinToString("")
        if (c.any { it.startsWith(whole) }) return true
        return q.all { t -> h.any { it.startsWith(t) } || c.any { it == t || it.startsWith(t) } }
    }

    fun findProduct(words: List<String>, products: List<Product>): Pair<Product?, List<Product>> {
        if (words.isEmpty()) return null to emptyList()
        val q = words.joinToString(" ")
        val live = products.filter { it.visible }
        var hits = live.filter { matches(q, it) }
        if (hits.isEmpty()) {
            val scored = live.map { p -> p to words.count { matches(it, p) } }.filter { it.second > 0 && it.second >= (words.size + 1) / 2 }
            val best = scored.maxOfOrNull { it.second } ?: 0
            hits = scored.filter { it.second == best }.map { it.first }
        }
        if (hits.size <= 1) return hits.firstOrNull() to hits
        fun extra(p: Product) = normalize(p.name).split(' ').size - words.size
        val exact = hits.filter { normalize(it.name) == q || it.altNames.any { a -> normalize(a) == q } }
        if (exact.size == 1) return exact[0] to hits
        val sorted = hits.sortedBy { extra(it) }
        if (extra(sorted[0]) < extra(sorted[1])) return sorted[0] to hits
        return null to sorted.take(5)
    }

    fun parse(text: String, products: List<Product>): QuickResult {
        val lines = mutableListOf<QuickLine>()
        val problems = mutableListOf<QuickProblem>()
        for (seg in split(text)) {
            val parsed = parseSegment(seg)
            val (product, candidates) = findProduct(parsed.words, products)
            if (product == null) {
                problems += if (candidates.size > 1) QuickProblem(seg, "AMBIGUOUS", candidates.map { it.id }) else QuickProblem(seg, "NOT_FOUND")
                continue
            }
            if (!product.available) { problems += QuickProblem(seg, "UNAVAILABLE", listOf(product.id)); continue }
            val assumed = parsed.unitId == null
            val unit = if (assumed) product.defaultUnit() else product.units.firstOrNull { it.unitId == parsed.unitId }
            if (unit == null) { problems += QuickProblem(seg, "UNIT_NOT_SOLD", listOf(product.id), parsed.unitId); continue }
            val qty = parsed.qtyMilli ?: maxOf(unit.minQtyMilli, 1000)
            if (!unit.allowFraction && qty % 1000 != 0L) { problems += QuickProblem(seg, "FRACTION_NOT_ALLOWED", listOf(product.id), unit.unitId); continue }
            val i = lines.indexOfFirst { it.productId == product.id && it.unitId == unit.unitId }
            if (i >= 0) lines[i] = lines[i].copy(qtyMilli = lines[i].qtyMilli + qty)
            else lines += QuickLine(seg, product.id, unit.unitId, qty, assumed)
        }
        return QuickResult(lines, problems)
    }

    val PROBLEM_TEXT = mapOf("NOT_FOUND" to "لم أجد هذا الصنف", "AMBIGUOUS" to "أكثر من صنف يطابق، اكتب الاسم أوضح", "UNIT_NOT_SOLD" to "لا يُباع بهذه الوحدة", "UNAVAILABLE" to "غير متوفر حالياً", "FRACTION_NOT_ALLOWED" to "يُباع بالعدد الصحيح فقط")
}
