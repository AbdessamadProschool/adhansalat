package app.azan.global

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.time.ZoneId

/**
 * Re-arms the stored schedule when the OS has invalidated it.
 *
 * Android drops every alarm when the device reboots, and a clock or time-zone
 * change can make the stored instants meaningless. Both cases must re-send the
 * same absolute instants to `AlarmManager`; recomputing prayer times here would
 * duplicate the tested web engine with an untested Kotlin copy.
 *
 * A time-zone change is the one case that cannot be repaired natively: the
 * instants are still correct, but the user expects the times of *their* new
 * location. The receiver therefore posts a notification asking them to open the
 * app, where the real engine recomputes. It never silently keeps the old city.
 */
class SystemEventReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val store = ScheduleStore(context)
        val localized = LocaleHelper.wrap(context, store.locale())
        Log.i(TAG, "system event ${intent.action}")

        when (intent.action) {
            Intent.ACTION_TIMEZONE_CHANGED -> {
                val payload = store.payload()
                if (payload != null) {
                    val deviceZone = ZoneId.systemDefault().id
                    if (deviceZone != payload.timeZone) {
                        Notifications.createChannels(localized)
                        Notifications.showZoneChanged(localized, payload.timeZone, deviceZone)
                    }
                }
                // The instants stay valid (they are UTC); only the displayed wall
                // clock changes. Re-arming is still correct and cheap.
                NativeAlarmScheduler.sync(context)
            }

            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            ACTION_EXACT_ALARM_PERMISSION_CHANGED,
            -> NativeAlarmScheduler.sync(context)
        }
    }

    companion object {
        private const val TAG = "AzanSystemReceiver"

        /**
         * Constant value of `AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`
         * (API 31). Spelled out to avoid a compile-time API-level check for a string
         * that is just an action name.
         */
        const val ACTION_EXACT_ALARM_PERMISSION_CHANGED =
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
    }
}
