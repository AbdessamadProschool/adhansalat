package app.azan.global

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The native screen reuses the web design tokens (deep green, ivory, sand, gold)
 * so opening diagnostics from the app does not look like leaving it.
 *
 * Light only on purpose: the native screen is a short-lived system dialog. The web
 * app owns the real theme choice (including dark navy) and is not duplicated here.
 */
private val AzanColors = lightColorScheme(
    primary = Color(0xFF0E3F32),
    onPrimary = Color(0xFFF8F5EB),
    primaryContainer = Color(0xFF1B5747),
    onPrimaryContainer = Color(0xFFF8F5EB),
    secondary = Color(0xFFC9A227),
    onSecondary = Color(0xFF231B00),
    background = Color(0xFFF8F5EB),
    onBackground = Color(0xFF14201B),
    surface = Color(0xFFFFFDF7),
    onSurface = Color(0xFF14201B),
    surfaceVariant = Color(0xFFE7E1D2),
    onSurfaceVariant = Color(0xFF4B4639),
    error = Color(0xFF8C1D18),
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
)

@Composable
fun AzanTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AzanColors,
        typography = Typography(),
        content = content,
    )
}
