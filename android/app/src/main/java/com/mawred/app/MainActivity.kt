package com.mawred.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.mawred.app.ui.MawredRoot
import com.mawred.app.ui.theme.MawredTheme
import com.mawred.app.update.UpdateManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var updates: UpdateManager
    /** فتح مركز التحديث من الإشعار. */
    private val openUpdate = MutableStateFlow(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handle(intent)
        setContent { MawredTheme { MawredRoot(openUpdate) } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(i: Intent?) {
        when (i?.action) {
            UpdateManager.ACTION_INSTALL -> { updates.restore(); if (!updates.install()) openUpdate.value = true }
            UpdateManager.ACTION_OPEN -> openUpdate.value = true
        }
    }
}
