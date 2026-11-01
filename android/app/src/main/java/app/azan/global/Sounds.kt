package app.azan.global

/**
 * Maps the bundled sound ids used by the web app to raw resources shipped in the
 * APK.
 *
 * Shipped: the verified CC0 recording « Beautiful adhan » (Wikimedia Commons,
 * CC0 1.0) and the three synthesised chimes. The eight recordings supplied to
 * the project are **not** in the APK: their redistribution licence is not
 * established (see docs/AUDIO.md), and `scripts/check-release-assets.mjs` fails
 * the build if one of them reappears under `res/raw/`.
 *
 * A user-imported id deliberately returns null here: the native copy is looked
 * up by [CustomSounds] instead, and the service plays that private file. If
 * neither source has the id, the caller posts a notification without audio and
 * says so rather than playing a different sound and pretending it matched.
 */
object Sounds {
    fun resFor(soundId: String?): Int? = when (soundId) {
        "adhan-cc0" -> R.raw.adhan_cc0
        "chime-calm" -> R.raw.chime_calm
        "chime-dawn" -> R.raw.chime_dawn
        "chime-alert" -> R.raw.chime_alert
        else -> null
    }
}
