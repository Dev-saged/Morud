package com.mawred.app.data.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface Cipherer {
    fun encrypt(plain: String): String
    fun decrypt(sealed: String): String?
}

/** تشفير رمز التحديث بمفتاح AES-GCM غير قابل للاستخراج داخل Android Keystore. */
class KeystoreCipher(private val alias: String = "mawred.session") : Cipherer {
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    override fun encrypt(plain: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val enc = Base64.getEncoder()
        return enc.encodeToString(c.iv) + ":" + enc.encodeToString(c.doFinal(plain.toByteArray()))
    }

    override fun decrypt(sealed: String): String? = runCatching {
        val (iv, ct) = sealed.split(':').let { it[0] to it[1] }
        val dec = Base64.getDecoder()
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, dec.decode(iv))) }
        String(c.doFinal(dec.decode(ct)))
    }.getOrNull()
}
