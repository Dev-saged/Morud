package com.mawred.app.ui.shop

import android.graphics.BitmapFactory
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

/** صورة المنتج المفرّغة على «رف» خفيف؛ تُخزَّن في مجلد مؤقت لتعمل بلا نت. */
@Composable
fun ProductShelf(p: Product, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val key = p.images.firstOrNull()?.thumb
    var bmp by remember(key) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(key) {
        if (key == null || !BrandConfig.configured) return@LaunchedEffect
        bmp = withContext(Dispatchers.IO) {
            runCatching {
                val f = File(ctx.cacheDir, "img/" + key.substringAfterLast('/')).apply { parentFile?.mkdirs() }
                if (!f.exists()) URL("${BrandConfig.apiUrl}/files/$key").openStream().use { i -> f.outputStream().use { i.copyTo(it) } }
                BitmapFactory.decodeFile(f.path)?.asImageBitmap()
            }.getOrNull()
        }
    }
    Box(modifier.background(Mawred.colors.surface, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b, p.name, Modifier.fillMaxSize().padding(12.dp), contentScale = ContentScale.Fit)
        else Icon(Icons.box, null, tint = Mawred.colors.mute)
    }
}
