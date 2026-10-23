package com.quizduel.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand = Color(0xFF5B4FE9)

@Composable
fun QuizDuelTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) {
        darkColorScheme(primary = Color(0xFFB3ACFF))
    } else {
        lightColorScheme(primary = Brand)
    }
    MaterialTheme(colorScheme = colors, content = content)
}
