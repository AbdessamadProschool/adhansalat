package app.azan.global

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.util.Log

/**
 * Handles automatic silencing of the phone during prayer time (Masjid Mode).
 * Mutes or switches to vibrate for a customizable duration (e.g., 20 minutes)
 * after the Adhan, then automatically restores the original audio mode.
 */
class AutoSilenceReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val action = intent.action ?: return

        when (action) {
            ACTION_SILENCE -> {
                val durationMinutes = intent.getIntExtra(EXTRA_DURATION, 20)
                val previousRingerMode = audioManager.ringerMode
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().putInt(KEY_PREVIOUS_RINGER_MODE, previousRingerMode).apply()

                try {
                    // Switch to Vibrate mode
                    audioManager.ringerMode = AudioManager.RINGER_MODE_VIBRATE
                    Log.i(TAG, "Switched ringer to vibrate for $durationMinutes minutes.")
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot change ringer mode: ${e.message}")
                }

                // Schedule Restore
                val restoreIntent = Intent(context, AutoSilenceReceiver::class.java).apply {
                    this.action = ACTION_RESTORE
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    REQUEST_CODE_RESTORE,
                    restoreIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                val triggerAt = System.currentTimeMillis() + (durationMinutes * 60 * 1000L)
                try {
                    alarmManager?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot schedule restore alarm: ${e.message}")
                }
            }

            ACTION_RESTORE -> {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val previousRingerMode = prefs.getInt(KEY_PREVIOUS_RINGER_MODE, AudioManager.RINGER_MODE_NORMAL)

                try {
                    audioManager.ringerMode = previousRingerMode
                    Log.i(TAG, "Restored original ringer mode: $previousRingerMode")
                } catch (e: Exception) {
                    Log.w(TAG, "Cannot restore ringer mode: ${e.message}")
                }
            }
        }
    }

    companion object {
        const val ACTION_SILENCE = "app.azan.global.ACTION_SILENCE"
        const val ACTION_RESTORE = "app.azan.global.ACTION_RESTORE"
        const val EXTRA_DURATION = "extra_duration_minutes"

        private const val PREFS_NAME = "auto_silence_prefs"
        private const val KEY_PREVIOUS_RINGER_MODE = "prev_ringer_mode"
        private const val REQUEST_CODE_RESTORE = 9081
        private const val TAG = "AutoSilenceReceiver"

        fun scheduleAutoSilence(context: Context, durationMinutes: Int = 20) {
            val intent = Intent(context, AutoSilenceReceiver::class.java).apply {
                action = ACTION_SILENCE
                putExtra(EXTRA_DURATION, durationMinutes)
            }
            context.sendBroadcast(intent)
        }
    }
}
