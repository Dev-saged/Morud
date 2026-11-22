package com.mawred.app

import com.mawred.app.core.Money
import com.mawred.app.core.OrderStates
import com.mawred.app.data.CatalogData
import com.mawred.app.data.Product
import com.mawred.app.data.SaleUnit
import com.mawred.app.data.UnitDef
import com.mawred.app.data.local.CartLine
import com.mawred.app.schema.Field
import com.mawred.app.schema.FieldType
import com.mawred.app.schema.ModuleSchema
import com.mawred.app.schema.Column
import com.mawred.app.schema.SchemaEngine
import com.mawred.app.ui.shop.CatalogUi
import com.mawred.app.ui.shop.cartRows
import com.mawred.app.ui.theme.Oklch
import com.mawred.app.update.UpdateChecker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CoreTest {
    private val spec = File("../../spec")

    @Test fun money() {
        assertEquals("1,234.50 ₪", Money.format(123450))
        assertEquals("-0.05 ₪", Money.format(-5))
        assertEquals(1250L, Money.parse("12.5"))
        assertEquals(1205L, Money.parse("12,05"))
        assertNull(Money.parse("1.234"))
        assertNull(Money.parse("-3"))
        assertEquals("2.5", Money.formatQty(2500))
        assertEquals("3", Money.formatQty(3000))
        assertEquals("0.125", Money.formatQty(125))
    }

    @Test fun oklchMatchesBrandAndContrast() {
        val blue = Oklch.parse("oklch(48.8% 0.217 264.4)")
        val r = (blue shr 16) and 0xFF; val g = (blue shr 8) and 0xFF; val b = blue and 0xFF
        assertTrue("أزرق مورد #1D4ED8 تقريباً: $r,$g,$b", kotlin.math.abs(r - 0x1D) <= 3 && kotlin.math.abs(g - 0x4E) <= 3 && kotlin.math.abs(b - 0xD8) <= 3)
        val tokens = com.mawred.app.ui.theme.DesignTokens
        for (dark in listOf(false, true)) {
            fun c(p: Pair<String, String>) = Oklch.parse(if (dark) p.second else p.first)
            val pairs = listOf(tokens.ink to tokens.surface, tokens.ink to tokens.raised, tokens.mute to tokens.surface, tokens.mute to tokens.raised, tokens.onPrimary to tokens.primary,
                tokens.primary to tokens.surface, tokens.accentInk to tokens.surface, tokens.ok to tokens.surface, tokens.danger to tokens.surface, tokens.danger to tokens.raised, tokens.ok to tokens.raised)
            for ((fg, bg) in pairs) assertTrue("$fg/$bg dark=$dark", Oklch.contrast(c(fg), c(bg)) >= 4.5)
            assertTrue(Oklch.contrast(BrandConfig.ON_ACCENT_HEX.toInt(), c(tokens.accent)) >= 4.5)
        }
    }

    @Test fun orderStatesFromSpec() {
        val s = OrderStates(File(spec, "order-states.json").readText())
        assertEquals("جديد", s.label("new"))
        assertTrue(s.all.size >= 12)
        assertEquals(OrderStates.stageIndex("out_for_delivery"), OrderStates.stageIndex("on_the_way"))
        assertEquals(6, OrderStates.stageIndex("financially_completed"))
        assertEquals("x", s.label("x"))
    }

    private val schema = ModuleSchema(
        "shops", "المحلات", "shops.view",
        fields = listOf(
            Field("name", "اسم المحل", required = true, maxLength = 10),
            Field("phone", "الهاتف", FieldType.PHONE, required = true),
            Field("limit", "الحد", FieldType.MONEY, min = 0, max = 100_000, permission = "shops.credit.manage"),
            Field("qty", "الكمية", FieldType.QTY),
            Field("active", "نشط", FieldType.BOOL),
            Field("kind", "النوع", FieldType.SELECT, options = listOf("a" to "أ", "b" to "ب")),
            Field("day", "اليوم", FieldType.DATE),
        ),
        columns = listOf(Column("name", "الاسم"), Column("city", "المدينة")),
    )

    @Test fun schemaValidation() {
        val (ok, errs) = SchemaEngine.validate(schema, mapOf("name" to " بقالة ", "phone" to "059 9111 222", "limit" to "12.5", "qty" to "1.5", "active" to "true", "kind" to "a", "day" to "2026-11-20"))
        assertTrue(errs.toString(), errs.isEmpty())
        assertEquals(mapOf("name" to "بقالة", "phone" to "0599111222", "limit" to 1250L, "qty" to 1500L, "active" to true, "kind" to "a", "day" to "2026-11-20"), ok)
        val (_, bad) = SchemaEngine.validate(schema, mapOf("name" to "اسم طويل جداً جداً", "phone" to "x", "limit" to "2000", "qty" to "a", "kind" to "z", "day" to "20-11"))
        assertEquals(setOf("name", "phone", "limit", "qty", "kind", "day"), bad.keys)
        val (_, missing) = SchemaEngine.validate(schema, emptyMap())
        assertEquals(setOf("name", "phone"), missing.keys)
        val (noPerm, _) = SchemaEngine.validate(schema, mapOf("name" to "أ", "phone" to "0599111222", "limit" to "5"), can = { false })
        assertTrue("limit" !in noPerm)
    }

    @Test fun schemaFilterAndArabicSearch() {
        val rows = listOf(mapOf("name" to "بقالة النور", "city" to "غزة", "status" to "active"), mapOf("name" to "سوبر ماركت الأمل", "city" to "خانيونس", "status" to "suspended"))
        assertEquals(1, SchemaEngine.filter(schema, rows, "بقاله", emptyMap()).size)
        assertEquals(1, SchemaEngine.filter(schema, rows, "الامل", emptyMap()).size)
        assertEquals(listOf(rows[1]), SchemaEngine.filter(schema, rows, "", mapOf("status" to "suspended")))
        assertEquals(2, SchemaEngine.filter(schema, rows, "", mapOf("status" to null)).size)
        assertEquals("1,000.00 ₪", SchemaEngine.display(FieldType.MONEY, 100000))
        assertEquals("—", SchemaEngine.display(FieldType.TEXT, null))
    }

    private val feta = Product("feta", "جبنة فيتا", sku = "DAI-001", categoryId = "dairy", units = listOf(SaleUnit("box", 1000, 800), SaleUnit("carton", 12000, 9000)), altNames = listOf("فيتا"))
    private val off = Product("off", "منتج نافد", available = false, units = listOf(SaleUnit("box", 1000, 100)))
    private val data = CatalogData(listOf(feta, off), units = listOf(UnitDef("box", "علبة"), UnitDef("carton", "كرتونة")))

    @Test fun catalogFiltering() {
        assertEquals(listOf(feta), CatalogUi(data = data).visible)
        assertEquals(2, CatalogUi(data = data, availableOnly = false).visible.size)
        assertEquals(listOf(feta), CatalogUi(data = data, query = "جبنه").visible)
        assertEquals(listOf(feta), CatalogUi(data = data, query = "dai-001").visible)
        assertTrue(CatalogUi(data = data, category = "drinks").visible.isEmpty())
    }

    @Test fun cartEstimate() {
        val rows = cartRows(listOf(CartLine("feta", "carton", 2000, 1), CartLine("feta", "box", 1500, 2), CartLine("gone", "box", 1000, 3)), data)
        assertEquals(listOf(18000L, 1200L, 0L), rows.map { it.total })
        assertEquals("كرتونة", rows[0].unitName)
        assertNull(rows[2].product)
    }

    @Test fun updateTagParsing() {
        val json = """{"tag_name":"v0.2.0-b57","body":"ملاحظات","assets":[{"name":"Morud-v0.2.0-build57.apk","browser_download_url":"https://github.com/x.apk"}]}"""
        val u = UpdateChecker.parse(json)!!
        assertEquals(57, u.build); assertEquals("0.2.0", u.version); assertEquals("https://github.com/x.apk", u.apkUrl)
        val d = UpdateChecker.parse("""{"tag_name":"v0.3.0-b11","published_at":"2026-11-22T07:09:56Z","assets":[{"name":"M.apk","size":3200000,"digest":"sha256:abc123","browser_download_url":"u"}]}""")!!
        assertEquals(3_200_000L, d.size); assertEquals("abc123", d.sha256)
        assertNull(UpdateChecker.parse("""{"tag_name":"latest","assets":[]}"""))
        assertNull(UpdateChecker.parse("""{"tag_name":"v1.0.0-b2","assets":[{"name":"notes.txt","browser_download_url":"u"}]}"""))
        assertEquals(57, UpdateChecker.buildOf("mawred-57.apk"))
        assertNull(UpdateChecker.buildOf("other.apk"))
    }

    @Test fun roomSchemaExported() {
        assertTrue(File("schemas/com.mawred.app.data.local.AppDatabase/1.json").exists())
    }
}
