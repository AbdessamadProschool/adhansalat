package app.azan.global

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Entry point of a real, OS-scheduled alarm.
 *
 * The receiver runs on a fresh process if needed, so it does not rely on the
 * WebView being alive. Delivery is at most once:
 *
 *  1. the persisted ledger decides (`markFired`), not the alarm;
 *  2. an event more than two minutes late is recorded as missed and is *not*
 *     played late — a Fajr Adhan at 09:00 would be wrong and confusing;
 *  3. audio failure downgrades to a notification and is written to the record.
 */
class AdhanReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != NativeAlarmScheduler.ACTION_FIRE) return
        val spec = NativeAlarmScheduler.specFrom(intent) ?: return

        val store = ScheduleStore(context)
        val localized = LocaleHelper.wrap(context, store.locale())
        val timeZone = store.payload()?.timeZone ?: java.util.TimeZone.getDefault().id

        if (!store.markFired(spec.eventKey)) {
            Log.i(TAG, "deduplicated ${spec.eventKey}")
            return
        }

        val now = System.currentTimeMillis()
        val lateBy = now - spec.atMillis
        if (lateBy > GRACE_MS) {
            Notifications.showMissed(localized, spec, timeZone, lateBy / 60_000)
            store.recordResult(
                FireRecord(
                    eventKey = spec.eventKey,
                    prayer = spec.prayer,
                    kind = spec.kind,
                    atMillis = spec.atMillis,
                    firedAtMillis = now,
                    outcome = "missed",
                    detail = "${lateBy / 60_000} min late — outside the ${GRACE_MS / 1000}s grace window",
                ),
            )
            return
        }

        // A bundled resource and an imported file are equally valid sources; the
        // second one only exists if the web import was copied into private storage.
        val soundAvailable = Sounds.resFor(spec.soundId) != null ||
            CustomSounds.available(context, spec.soundId)
        var outcome = "notified"
        var detail: String? = null

        if (spec.isAdhan) {
            val started = soundAvailable && AdhanService.start(context, spec)
            if (started) {
                // The receiver knows the service accepted the intent, not that the
                // MediaPlayer reached `start()`. Keep that distinction explicit.
                outcome = "audio"
                detail = "foreground service started; audible playback is not observable from the receiver"
            } else {
                Notifications.showAdhan(localized, spec, timeZone)
                if (spec.soundId != null && !soundAvailable) {
                    outcome = "notify-no-audio"
                    detail = "sound '${spec.soundId}' is not available to native alarms"
                } else if (spec.soundId != null) {
                    outcome = "notify-no-audio"
                    detail = "foreground service refused to start"
                }
            }

            // Automatically silence the phone during prayer time (Masjid Mode)
            try {
                AutoSilenceReceiver.scheduleAutoSilence(context, 20)
            } catch (e: Exception) {
                Log.w(TAG, "Cannot trigger auto-silence: ${e.message}")
            }
        } else {
            Notifications.showPreReminder(localized, spec, timeZone)
        }

        store.recordResult(
            FireRecord(
                eventKey = spec.eventKey,
                prayer = spec.prayer,
                kind = spec.kind,
                atMillis = spec.atMillis,
                firedAtMillis = now,
                outcome = outcome,
                detail = detail,
            ),
        )
        Log.i(TAG, "delivered ${spec.eventKey} outcome=$outcome")

        // Update home screen widget
        try {
            AzanWidgetProvider.updateAll(context)
        } catch (_: Exception) {
            // Widget update is non-critical
        }

        // Automatically update the ongoing lock-screen notification to the next upcoming prayer!
        try {
            NativeAlarmScheduler.updateOngoingSchedule(context)
        } catch (_: Exception) {
            // Non-critical
        }
    }

    companion object {
        private const val TAG = "AzanReceiver"

        /** Same window as the web engine: late beyond this is missed, not played. */
        const val GRACE_MS = 120_000L
    }
}
