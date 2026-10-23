package com.quizduel.app.ui.startup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizduel.app.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface StartupState {
    data object Loading : StartupState
    data class Ready(val uid: String) : StartupState
    data class Failed(val message: String) : StartupState
}

@HiltViewModel
class StartupViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<StartupState>(StartupState.Loading)
    val state: StateFlow<StartupState> = _state.asStateFlow()

    init {
        start()
    }

    fun start() {
        _state.value = StartupState.Loading
        viewModelScope.launch {
            _state.value = try {
                authRepository.ensureSignedIn()
                StartupState.Ready(authRepository.verifyWithServer())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                StartupState.Failed(e.message ?: e.javaClass.simpleName)
            }
        }
    }
}
