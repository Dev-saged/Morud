package com.mawred.app

import com.mawred.app.data.InboxPage
import com.mawred.app.data.InboxRepository
import com.mawred.app.data.Notice
import com.mawred.app.data.NoticeRef
import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiJson
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

class InboxTest {
    private val repo = InboxRepository(Api(OkHttpClient(), { "http://x" }) { null })
    private fun n(id: String, at: Long, read: Long? = null) = Notice(id, "order.status", "t$id", "", NoticeRef("order", "o$id"), read, at)

    @Test fun freshOnlyUnreadNewerThanLastNotifiedOldestFirst() {
        val page = InboxPage(listOf(n("3", 300), n("2", 200, read = 250), n("1", 100), n("4", 400)), 3)
        assertEquals(listOf("3", "4"), repo.fresh(page, lastNotified = 150).map { it.id })
        assertEquals(emptyList<String>(), repo.fresh(page, lastNotified = 400).map { it.id })
    }

    @Test fun parsesServerInbox() {
        val json = """{"unread":1,"notifications":[{"id":"n1","userId":"u","type":"order.status","title":"طلبك قيد التجهيز","body":"الطلب MW-5","ref":{"kind":"order","id":"o5"},"readAt":null,"createdAt":1700}]}"""
        val p = ApiJson.decodeFromString(InboxPage.serializer(), json)
        assertEquals(1, p.unread); assertEquals(NoticeRef("order", "o5"), p.notifications[0].ref); assertEquals(null, p.notifications[0].readAt)
    }
}
