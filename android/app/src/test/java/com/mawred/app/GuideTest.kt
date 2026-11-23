package com.mawred.app

import com.mawred.app.ui.common.Guide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class GuideTest {
    private val guide = Guide.parse(File("../../spec/guide.json").readText())
    private val perms = File("../../spec/permissions.json").readText()

    @Test fun everyRoleHasTopicsWithSteps() {
        for (r in listOf("shop", "admin", "agent")) {
            val t = guide[r].orEmpty()
            assertTrue(r, t.isNotEmpty())
            assertTrue(r, t.all { it.steps.isNotEmpty() && it.title.isNotBlank() })
            assertEquals(r, t.size, t.map { it.id }.toSet().size)
        }
    }

    @Test fun adminTopicsFollowPermissions() {
        val only = Guide.topics(guide, "admin") { it == "orders.view" }.map { it.id }
        assertEquals(listOf("dash", "orders"), only)
        val all = Guide.topics(guide, "admin") { true }
        assertEquals(guide["admin"]!!.size, all.size)
    }

    @Test fun everyGuidePermissionExists() {
        guide.values.flatten().flatMap { it.perms }.forEach { assertTrue(it, perms.contains("\"$it\"")) }
    }

    @Test fun searchIgnoresHamzaAndTaMarbuta() {
        val shop = guide["shop"]!!
        assertTrue(Guide.search(shop, "الفاتوره").any { it.id == "money" })
        assertEquals(shop, Guide.search(shop, "  "))
        assertTrue(Guide.search(shop, "كلمةلاتوجد").isEmpty())
    }
}

class ShortNameTest {
    @Test fun kunyaStaysWhole() {
        assertEquals("أبو أحمد", com.mawred.app.ui.common.shortName("أبو أحمد الشوا"))
        assertEquals("أم محمد", com.mawred.app.ui.common.shortName("أم محمد"))
        assertEquals("عبد الله", com.mawred.app.ui.common.shortName("عبد الله النجار"))
        assertEquals("سماح", com.mawred.app.ui.common.shortName("سماح الشوا"))
        assertEquals("خالد", com.mawred.app.ui.common.shortName("  خالد  "))
    }
}
