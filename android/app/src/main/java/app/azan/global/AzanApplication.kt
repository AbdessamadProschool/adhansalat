package app.azan.global

import android.app.Application

/**
 * Creates the notification channels once, before any alarm can fire.
 *
 * A receiver can run in a process where no Activity ever started, so channels must
 * be registered here rather than in `MainActivity`. The localized labels are
 * refreshed whenever the app is opened, because the user can change the web UI
 * language independently of the system language.
 */
class AzanApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
    }
}
