package com.mawred.app.data

import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.ApiJson
import com.mawred.app.data.local.CacheDao
import com.mawred.app.data.local.CacheEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable data class SaleUnit(val unitId: String, val factorToBase: Long, val price: Long, val minQtyMilli: Long = 1000, val stepMilli: Long = 1000, val allowFraction: Boolean = false)
@Serializable data class ProductImage(val key: String, val thumb: String)
@Serializable data class Product(
    val id: String, val name: String, val sku: String = "", val categoryId: String = "", val baseUnitId: String = "", val units: List<SaleUnit> = emptyList(),
    val available: Boolean = true, val visible: Boolean = true, val altNames: List<String> = emptyList(), val barcodes: List<String> = emptyList(),
    val brand: String? = null, val images: List<ProductImage> = emptyList(), val defaultUnitId: String? = null,
    val featured: Boolean = false, val order: Int = 999,
)
@Serializable data class Category(val id: String, val name: String, val order: Int = 0)
@Serializable data class UnitDef(val id: String, val name: String)
/** عرض فعّال كما يرسله الخادم مع الكتالوج؛ الخادم وحده يحسب الخصم الفعلي عند الإرسال. */
@Serializable data class Promotion(
    val id: String, val name: String, val type: String, val productIds: List<String> = emptyList(),
    val percentBp: Long? = null, val amountPerUnit: Long? = null, val minQtyMilli: Long? = null, val buyQty: Long? = null, val getQty: Long? = null,
    val startsAt: Long = 0, val endsAt: Long = 0, val terms: String? = null,
) {
    fun activeAt(now: Long) = startsAt <= now && endsAt > now
    val label: String get() {
        val pct = percentBp?.let { "${com.mawred.app.core.Money.formatQty(it * 10)}٪" }.orEmpty()
        return when (type) {
            "item_percent" -> "خصم $pct"
            "item_amount" -> "خصم ${com.mawred.app.core.Money.format(amountPerUnit ?: 0)} للوحدة"
            "qty_percent" -> "$pct عند ${com.mawred.app.core.Money.formatQty(minQtyMilli ?: 0)} فأكثر"
            "bxgy" -> "اشترِ ${buyQty ?: 0} واحصل على ${getQty ?: 0}"
            "bundle_percent" -> "$pct على المجموعة"
            else -> "عرض"
        }
    }
}

@Serializable data class CatalogData(
    val products: List<Product> = emptyList(), val categories: List<Category> = emptyList(), val units: List<UnitDef> = emptyList(), val at: Long = 0,
    val promotions: List<Promotion> = emptyList(), val popular: List<String> = emptyList(), val ver: String? = null,
)

data class CatalogResult(val data: CatalogData, val offline: Boolean, val cachedAt: Long?)

/** الكتالوج: النسخة المحفوظة تُعرض فوراً ثم تُستبدل بالحديثة؛ بلا نت تبقى المحفوظة مع تنبيه. */
class CatalogRepository(private val api: Api, private val cache: CacheDao, private val now: () -> Long = System::currentTimeMillis) {
    /** آخر نسخة محفوظة فوراً (تُعرض قبل أي انتظار للشبكة)؛ التحليل خارج خيط الواجهة. */
    suspend fun cached(): CatalogResult? = withContext(Dispatchers.Default) {
        cache.get(KEY)?.let { c -> runCatching { CatalogResult(ApiJson.decodeFromString(CatalogData.serializer(), c.json), true, c.at) }.getOrNull() }
    }

    suspend fun load(): CatalogResult = withContext(Dispatchers.Default) {
        try {
            val o: JsonObject = api.get("/catalog")
            val text = o.toString()
            cache.put(CacheEntry(KEY, text, now()))
            CatalogResult(ApiJson.decodeFromString(CatalogData.serializer(), text), false, null)
        } catch (e: ApiException) {
            val c = cache.get(KEY) ?: throw e
            CatalogResult(ApiJson.decodeFromString(CatalogData.serializer(), c.json), true, c.at)
        }
    }

    companion object { const val KEY = "catalog" }
}
