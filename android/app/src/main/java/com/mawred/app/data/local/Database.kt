package com.mawred.app.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import kotlinx.coroutines.flow.Flow

/** نسخة الكتالوج وغيره كما جاءت من الخادم للعمل بلا نت. */
@Entity(tableName = "cache")
data class CacheEntry(@PrimaryKey val key: String, val json: String, val at: Long)

/** مسودة السلة: سطر لكل (منتج، وحدة). */
@Entity(tableName = "cart_lines", primaryKeys = ["productId", "unitId"])
data class CartLine(val productId: String, val unitId: String, val qtyMilli: Long, val addedAt: Long)

/** طلبات بانتظار الإرسال؛ المفتاح ثابت لكل محاولة فلا يتكرر الطلب عند إعادة الإرسال. */
@Entity(tableName = "outbox")
data class OutboxItem(@PrimaryKey val idempotencyKey: String, val path: String, val body: String, val createdAt: Long, val attempts: Int = 0, val lastError: String? = null)

@Dao
interface CacheDao {
    @Query("SELECT * FROM cache WHERE `key` = :key") suspend fun get(key: String): CacheEntry?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun put(e: CacheEntry)
    @Query("DELETE FROM cache") suspend fun clear()
    @Query("DELETE FROM cache WHERE `key` LIKE :prefix || '%'") suspend fun clearPrefix(prefix: String)
}

/** النسخ المحفوظة في Room؛ المفتاح «uid|path» فلا يرى حساب بيانات حساب آخر على جهاز مشترك. */
class RoomReadCache(private val dao: CacheDao, private val now: () -> Long = System::currentTimeMillis) : com.mawred.app.data.api.ReadCache {
    override suspend fun get(key: String) = dao.get("r:$key")?.let { it.json to it.at }
    override suspend fun put(key: String, json: String) = dao.put(CacheEntry("r:$key", json, now()))
    override suspend fun clearScope(scope: String) = dao.clearPrefix("r:$scope|")
    override suspend fun clearAll() = dao.clearPrefix("r:")
}

@Dao
interface CartDao {
    @Query("SELECT * FROM cart_lines ORDER BY addedAt") fun observe(): Flow<List<CartLine>>
    @Query("SELECT * FROM cart_lines ORDER BY addedAt") suspend fun all(): List<CartLine>
    @Query("SELECT * FROM cart_lines WHERE productId = :p AND unitId = :u") suspend fun find(p: String, u: String): CartLine?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun put(l: CartLine)
    @Query("DELETE FROM cart_lines WHERE productId = :p AND unitId = :u") suspend fun remove(p: String, u: String)
    @Query("DELETE FROM cart_lines") suspend fun clear()
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY createdAt") suspend fun pending(): List<OutboxItem>
    @Query("SELECT COUNT(*) FROM outbox") fun count(): Flow<Int>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun add(i: OutboxItem)
    @Query("UPDATE outbox SET attempts = attempts + 1, lastError = :error WHERE idempotencyKey = :key") suspend fun failed(key: String, error: String)
    @Query("DELETE FROM outbox WHERE idempotencyKey = :key") suspend fun done(key: String)
}

@Database(entities = [CacheEntry::class, CartLine::class, OutboxItem::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao
    abstract fun cart(): CartDao
    abstract fun outbox(): OutboxDao
}

/** الترحيلات مرقّمة وإلحاقية فقط: أضف MIGRATION_1_2 هنا مع رفع version ولا تعدّل السابقة. */
object Migrations {
    val ALL: Array<Migration> = arrayOf()
}
