package com.mawred.app

import com.mawred.app.core.QuickOrder
import com.mawred.app.core.defaultUnit
import com.mawred.app.data.Product
import com.mawred.app.data.SaleUnit
import org.junit.Assert.assertEquals
import org.junit.Test

/** نفس حالات worker/test/quickorder.test.ts حتى يتطابق الفهم بين الويب وAndroid. */
class QuickOrderTest {
    private fun u(id: String, price: Long, factor: Long = 1000, frac: Boolean = false, min: Long = 1000) = SaleUnit(id, factor, price, min, if (frac) 250 else 1000, frac)
    private val catalog = listOf(
        Product("fish", "سمك بوري مجمد", units = listOf(u("kg", 2800, frac = true, min = 500), u("carton", 25000, 10000)), defaultUnitId = "kg", altNames = listOf("اسماك", "بوري")),
        Product("tilapia", "سمك بلطي مجمد", units = listOf(u("kg", 1800, frac = true, min = 500)), defaultUnitId = "kg", altNames = listOf("بلطي")),
        Product("feta", "جبنة بيضاء فيتا", units = listOf(u("box", 900), u("carton", 10000, 12000)), defaultUnitId = "carton", altNames = listOf("جبنه", "جبن")),
        Product("zaatar", "زعتر بلدي", units = listOf(u("kg", 3000, frac = true, min = 250), u("half_kg", 1600, 500), u("quarter_kg", 850, 250)), defaultUnitId = "kg"),
        Product("cola", "مشروب غازي كولا 330 مل", units = listOf(u("carton", 4200, 24000), u("piece", 200)), defaultUnitId = "carton", altNames = listOf("كولا", "بيبسي")),
        Product("gone", "زيت ذرة", units = listOf(u("carton", 9000)), available = false),
    )

    @Test fun fishIsKgCheeseIsCarton() {
        val r = QuickOrder.parse("10 سمك بوري\n2 جبنة\n3 علب جبنة", catalog)
        assertEquals(listOf(Triple("fish", "kg", 10000L), Triple("feta", "carton", 2000L), Triple("feta", "box", 3000L)), r.lines.map { Triple(it.productId, it.unitId, it.qtyMilli) })
        assertEquals(listOf(true, true, false), r.lines.map { it.assumedUnit })
    }

    @Test fun arabicNumeralsWordsDualsFractions() {
        val r = QuickOrder.parse("٥ كيلو بلطي، كرتونتين كولا، نص كيلو زعتر، خمسه حبات كولا، 1.5 كيلو بوري", catalog)
        assertEquals(listOf(Triple("tilapia", "kg", 5000L), Triple("cola", "carton", 2000L), Triple("zaatar", "half_kg", 1000L), Triple("cola", "piece", 5000L), Triple("fish", "kg", 1500L)), r.lines.map { Triple(it.productId, it.unitId, it.qtyMilli) })
    }

    @Test fun mergeAndPlural() {
        assertEquals(3000L, QuickOrder.parse("بدي جبنة و 2 جبنة", catalog).lines.single().qtyMilli)
        assertEquals("fish", QuickOrder.parse("4 اسماك", catalog).lines.single().productId)
    }

    @Test fun problems() {
        val r = QuickOrder.parse("3 تفاح، 2 سمك، 4 شوال كولا، زيت ذرة، 1.5 كرتونة جبنة", catalog)
        assertEquals(emptyList<Any>(), r.lines)
        assertEquals(listOf("NOT_FOUND", "AMBIGUOUS", "UNIT_NOT_SOLD", "UNAVAILABLE", "FRACTION_NOT_ALLOWED"), r.problems.map { it.reason })
    }

    @Test fun segments() {
        assertEquals(QuickOrder.Parsed(20000, "kg", listOf("بطاطا")), QuickOrder.parseSegment("عشرين كيلو بطاطا"))
        assertEquals(QuickOrder.Parsed(750, "kg", listOf("جبنه")), QuickOrder.parseSegment("3/4 كيلو جبنه"))
        assertEquals("carton", catalog[2].defaultUnit()!!.unitId)
        assertEquals("box", Product("x", "x", units = listOf(u("box", 1))).defaultUnit()!!.unitId)
    }
}
