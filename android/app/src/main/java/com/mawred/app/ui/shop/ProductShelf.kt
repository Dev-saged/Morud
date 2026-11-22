package com.mawred.app.ui.shop

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.mawred.app.BrandConfig
import com.mawred.app.data.Product
import com.mawred.app.ui.Icons
import com.mawred.app.ui.theme.Mawred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL

/** صور مفكوكة في الذاكرة (حتى ثُمن ذاكرة التطبيق): الرجوع لصنف مرّ عليه التمرير يظهر فوراً بلا وميض. */
private object ShelfImages {
    private val cache = object : LruCache<String, ImageBitmap>((Runtime.getRuntime().maxMemory() / 8 / 1024).toInt()) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4 / 1024
    }
    fun get(key: String): ImageBitmap? = cache.get(key)
    fun put(key: String, b: ImageBitmap) { cache.put(key, b) }
}

/** صورة المنتج المفرّغة على «رف» خفيف؛ تُخزَّن على الجهاز لتعمل بلا نت، وفي الذاكرة للتمرير السلس. */
@Composable
fun ProductShelf(p: Product, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val key = p.images.firstOrNull()?.thumb
    var bmp by remember(key) { mutableStateOf(key?.let(ShelfImages::get)) }
    LaunchedEffect(key) {
        if (key == null || bmp != null || !BrandConfig.configured) return@LaunchedEffect
        bmp = withContext(Dispatchers.IO) {
            runCatching {
                val f = File(ctx.cacheDir, "img/" + key.substringAfterLast('/')).apply { parentFile?.mkdirs() }
                if (!f.exists()) {
                    // تنزيل لملف مؤقت ثم إعادة تسمية: انقطاع النت لا يترك صورة تالفة للأبد
                    val tmp = File(f.parentFile, f.name + ".part")
                    URL("${BrandConfig.apiUrl}/files/$key").openStream().use { i -> tmp.outputStream().use { i.copyTo(it) } }
                    if (!tmp.renameTo(f)) tmp.delete()
                }
                BitmapFactory.decodeFile(f.path)?.asImageBitmap()?.also { ShelfImages.put(key, it) }
            }.getOrNull()
        }
    }
    Box(modifier.background(Mawred.colors.surface, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b, p.name, Modifier.fillMaxSize().padding(12.dp), contentScale = ContentScale.Fit)
        else Icon(Icons.box, null, tint = Mawred.colors.mute)
    }
}
