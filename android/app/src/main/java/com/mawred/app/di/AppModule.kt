package com.mawred.app.di

import android.content.Context
import androidx.room.Room
import com.mawred.app.BrandConfig
import com.mawred.app.core.OrderStates
import com.mawred.app.data.api.Api
import com.mawred.app.data.auth.AuthRepository
import com.mawred.app.data.auth.DataStoreSessionStore
import com.mawred.app.data.auth.IdentityRest
import com.mawred.app.data.auth.KeystoreCipher
import com.mawred.app.data.local.AppDatabase
import com.mawred.app.data.local.CartRepository
import com.mawred.app.data.local.Migrations
import com.mawred.app.update.UpdateChecker
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton
    fun http(): OkHttpClient = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).retryOnConnectionFailure(true).build()

    @Provides @Singleton
    fun auth(@ApplicationContext ctx: Context, http: OkHttpClient): AuthRepository {
        val repo = AuthRepository(DataStoreSessionStore(ctx, KeystoreCipher()), IdentityRest(http, { BrandConfig.firebaseApiKey }))
        repo.api = Api(http, { BrandConfig.apiUrl }) { repo.idToken() }
        return repo
    }

    @Provides @Singleton
    fun api(auth: AuthRepository, db: AppDatabase): Api = auth.api.also { it.cache = com.mawred.app.data.local.RoomReadCache(db.cache()) }

    @Provides @Singleton
    fun db(@ApplicationContext ctx: Context): AppDatabase = Room.databaseBuilder(ctx, AppDatabase::class.java, "mawred.db").addMigrations(*Migrations.ALL).build()

    @Provides @Singleton
    fun cart(db: AppDatabase) = CartRepository(db.cart())

    @Provides @Singleton
    fun catalog(api: Api, db: AppDatabase) = com.mawred.app.data.CatalogRepository(api, db.cache())

    @Provides @Singleton
    fun orders(api: Api, db: AppDatabase) = com.mawred.app.data.OrderRepository(api, db.outbox())

    @Provides @Singleton
    fun admin(api: Api) = com.mawred.app.data.AdminRepository(api)

    @Provides @Singleton
    fun states(@ApplicationContext ctx: Context) = OrderStates(ctx.assets.open("spec/order-states.json").bufferedReader().use { it.readText() })

    @Provides @Singleton
    fun updateChecker(http: OkHttpClient) = UpdateChecker(http)

    @Provides @Singleton
    fun downloader(http: OkHttpClient) = com.mawred.app.update.ApkDownloader(http.newBuilder().readTimeout(60, java.util.concurrent.TimeUnit.SECONDS).build())

    @Provides @Singleton
    fun inbox(api: com.mawred.app.data.api.Api) = com.mawred.app.data.InboxRepository(api)

    /** مجلد التحديثات داخل ملفات التطبيق الخاصة (لا يحتاج أذونات تخزين، ويُحذف مع التطبيق). */
    @Provides @Singleton
    fun updates(@ApplicationContext ctx: Context, checker: UpdateChecker) = com.mawred.app.update.UpdateManager(ctx, checker, com.mawred.app.update.UpdateFiles(java.io.File(ctx.filesDir, "updates")))
}
