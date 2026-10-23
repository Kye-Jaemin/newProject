package com.quizduel.app.ui.startup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.quizduel.app.R

/**
 * Phase 0 완료 기준 확인 화면: 익명 로그인 → 서버 확인 → uid 표시.
 * Phase 1에서 스플래시 → 닉네임 입력 → 홈 흐름으로 바뀐다.
 */
@Composable
fun StartupScreen(viewModel: StartupViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium)
            when (val s = state) {
                StartupState.Loading -> {
                    CircularProgressIndicator()
                    Text(stringResource(R.string.startup_signing_in))
                }
                is StartupState.Ready -> {
                    Text(stringResource(R.string.startup_ready))
                    Text("uid: ${s.uid}", style = MaterialTheme.typography.bodySmall)
                }
                is StartupState.Failed -> {
                    Text(stringResource(R.string.startup_error), color = MaterialTheme.colorScheme.error)
                    Text(s.message, style = MaterialTheme.typography.bodySmall)
                    Button(onClick = viewModel::start) { Text(stringResource(R.string.startup_retry)) }
                }
            }
        }
    }
}
