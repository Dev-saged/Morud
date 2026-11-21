package com.mawred.app.data

import android.graphics.Bitmap
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** تفريغ صورة المنتج على الجهاز بـ ML Kit Subject Segmentation ثم PNG شفاف (≤1600px). */
object Cutout {
    private val segmenter by lazy {
        SubjectSegmentation.getClient(SubjectSegmenterOptions.Builder().enableForegroundBitmap().build())
    }

    suspend fun toPng(source: Bitmap): ByteArray {
        val scaled = scale(source, 1600)
        val result = segmenter.process(InputImage.fromBitmap(scaled, 0)).await()
        val fg = result.foregroundBitmap ?: throw IllegalStateException("لم يُعثر على منتج واضح في الصورة")
        val marked = Watermark.stamp(fg)
        return ByteArrayOutputStream().use { out -> marked.compress(Bitmap.CompressFormat.PNG, 100, out); out.toByteArray() }
    }

    fun scale(b: Bitmap, max: Int): Bitmap {
        val k = minOf(1f, max.toFloat() / maxOf(b.width, b.height))
        return if (k >= 1f) b else Bitmap.createScaledBitmap(b, (b.width * k).toInt().coerceAtLeast(64), (b.height * k).toInt().coerceAtLeast(64), true)
    }

    private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { c ->
        addOnSuccessListener { c.resume(it) }
        addOnFailureListener { c.resumeWithException(it) }
    }
}
