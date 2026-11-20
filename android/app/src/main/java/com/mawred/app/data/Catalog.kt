package com.mawred.app.data

import com.mawred.app.data.api.Api
import com.mawred.app.data.api.ApiException
import com.mawred.app.data.api.ApiJson
import com.mawred.app.data.local.CacheDao
import com.mawred.app.data.local.CacheEntry
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable data class SaleUnit(val unitId: String, val factorToBase: Long, val price: Long, val minQtyMilli: Long = 1000, val stepMilli: Long = 1000, val allowFraction: Boolean = false)
@Serializable data class ProductImage(val key: String, val thumb: String)
@Serializable data class Product(
    val id: String, val name: String, val sku: String = "", val categoryId: String = "", val baseUnitId: String = "", val units: List<SaleUnit> = emptyList(),
    val available: Boolean = true, val visible: Boolean = true, val altNames: List<String> = emptyList(), val barcodes: List<String> = emptyList(),
    val brand: String? = null, val images: List<ProductImage> = emptyList(),
)
@Serializable data class Category(val id: String, val name: String, val order: Int = 0)
@Serializable data class UnitDef(val id: String, val name: String)
@Serializable data class CatalogData(val products: List<Product> = emptyList(), val categories: List<Category> = emptyList(), val units: List<UnitDef> = emptyList(), val at: Long = 0)

data class CatalogResult(val data: CatalogData, val offline: Boolean, val cachedAt: Long?)

/** الكتالوج شبكة أولاً مع نسخة محلية؛ بلا نت تُعرض آخر نسخة مع تنبيه. */
class CatalogRepository(private val api: Api, private val cache: CacheDao, private val now: () -> Long = System::currentTimeMillis) {
    suspend fun load(): CatalogResult {
        return try {
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
