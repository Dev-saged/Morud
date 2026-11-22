package com.mawred.app.ui.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mawred.app.update.ReleaseNotes
import com.mawred.app.update.UpdateManager
import com.mawred.app.update.UpdatePhase
import com.mawred.app.update.UpdatePrefs
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class UpdateViewModel @Inject constructor(val manager: UpdateManager) : ViewModel() {
    val phase: StateFlow<UpdatePhase> = manager.phase
    val prefs: StateFlow<UpdatePrefs> = manager.prefs
    val notes: StateFlow<ReleaseNotes?> = manager.phase.map { p -> infoOf(p)?.notes?.takeIf { it.isNotBlank() }?.let(ReleaseNotes::parse) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun check() = viewModelScope.launch { manager.check() }
    fun download() = manager.download()
    fun pause() = manager.pause()
    fun cancel() = manager.cancel()
    fun install() = manager.install()
    fun setPrefs(p: UpdatePrefs) = manager.setPrefs(p)
    fun storage() = manager.files.usedBytes()
    fun clean() { manager.files.cleanup(manager.currentBuild, keep = manager.known?.build) }

    companion object {
        fun infoOf(p: UpdatePhase) = when (p) {
            is UpdatePhase.Available -> p.info
            is UpdatePhase.Downloading -> p.info
            is UpdatePhase.Waiting -> p.info
            is UpdatePhase.Verifying -> p.info
            is UpdatePhase.Ready -> p.info
            is UpdatePhase.Failed -> p.info
            else -> null
        }
    }
}
