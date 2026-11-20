package com.mawred.app.data.local

/** منطق السلة: الدمج عند الإضافة، والحذف عند الصفر. */
class CartRepository(private val dao: CartDao, private val now: () -> Long = System::currentTimeMillis) {
    val lines = dao.observe()

    suspend fun add(productId: String, unitId: String, qtyMilli: Long) {
        require(qtyMilli > 0) { "الكمية يجب أن تكون موجبة" }
        val cur = dao.find(productId, unitId)
        dao.put(CartLine(productId, unitId, (cur?.qtyMilli ?: 0) + qtyMilli, cur?.addedAt ?: now()))
    }

    suspend fun set(productId: String, unitId: String, qtyMilli: Long) {
        if (qtyMilli <= 0) dao.remove(productId, unitId)
        else dao.put(CartLine(productId, unitId, qtyMilli, dao.find(productId, unitId)?.addedAt ?: now()))
    }

    suspend fun clear() = dao.clear()
}
