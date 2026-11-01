package app.azan.global

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * Applies the language chosen inside the web app to the native shell.
 *
 * Android would otherwise use the system language, so a user who reads the web UI
 * in Arabic could get French notifications. Both activities call [wrap] from
 * `attachBaseContext`, and receivers/services wrap the context they use for text.
 */
object LocaleHelper {
    fun wrap(base: Context, languageTag: String): Context {
        val locale = if (languageTag.isBlank()) {
            Locale.getDefault()
        } else {
            Locale.forLanguageTag(languageTag)
        }
        val configuration = Configuration(base.resources.configuration)
        configuration.setLocale(locale)
        configuration.setLayoutDirection(locale)
        return base.createConfigurationContext(configuration)
    }
}
