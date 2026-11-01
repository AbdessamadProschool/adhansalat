package app.azan.global

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Channels and notification builders.
 *
 * The Adhan channel is silent on purpose: the sound is played by a foreground
 * service with `USAGE_ALARM`, so it keeps playing when the notification is
 * dismissed and stops exactly when the service stops. Two sound sources would
 * overlap and could not be stopped from the notification.
 */
object Notifications {

    const val CHANNEL_ADHAN = "adhan_v2"
    const val CHANNEL_PRE = "pre_v2"
    const val CHANNEL_STATUS = "status_v2"
    const val CHANNEL_ONGOING = "ongoing_v2"

    const val ADHAN_NOTIFICATION_ID = 4201
    const val PRE_REMINDER_ID = 4202
    private const val STATUS_ID = 4100
    private const val ONGOING_ID = 4050

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val adhan = NotificationChannel(
            CHANNEL_ADHAN,
            context.getString(R.string.channel_adhan),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_adhan_desc)
            setSound(null, null)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }

        val pre = NotificationChannel(
            CHANNEL_PRE,
            context.getString(R.string.channel_pre),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_pre_desc)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 180, 90, 180)
        }

        val status = NotificationChannel(
            CHANNEL_STATUS,
            context.getString(R.string.channel_status),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_status_desc)
        }

        val ongoing = NotificationChannel(
            CHANNEL_ONGOING,
            context.getString(R.string.channel_ongoing),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.channel_ongoing_desc)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        manager.createNotificationChannels(listOf(adhan, pre, status, ongoing))
    }

    fun areNotificationsEnabled(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun prayerLabel(context: Context, prayer: String): String = context.getString(
        when (prayer) {
            "fajr" -> R.string.prayer_fajr
            "dhuhr" -> R.string.prayer_dhuhr
            "asr" -> R.string.prayer_asr
            "maghrib" -> R.string.prayer_maghrib
            "isha" -> R.string.prayer_isha
            else -> R.string.prayer_fajr
        },
    )

    /** Wall clock in the plan's zone, Western digits, matching the web UI. */
    fun clock(atMillis: Long, timeZone: String): String {
        val zone = try {
            ZoneId.of(timeZone)
        } catch (_: Exception) {
            ZoneId.systemDefault()
        }
        return DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT)
            .format(Instant.ofEpochMilli(atMillis).atZone(zone))
    }

    fun adhanNotification(
        context: Context,
        spec: AlarmSpec,
        timeZone: String,
        ongoing: Boolean,
    ): Notification {
        val title = context.getString(
            R.string.notif_adhan_title,
            prayerLabel(context, spec.prayer),
        )
        val body = context.getString(
            R.string.notif_adhan_body,
            clock(spec.atMillis, timeZone),
        )
        val builder = base(context, CHANNEL_ADHAN, title, body)
            .setOngoing(ongoing)
            .addAction(0, context.getString(R.string.notif_stop), stopIntent(context))
            .addAction(0, context.getString(R.string.notif_diagnostics), diagnosticsIntent(context))

        // Warn only when no audio source can resolve the id: a bundled chime, or a
        // private copy of an imported file. Both are valid; saying "unavailable"
        // while the imported Adhan is actually playing would be a false alarm.
        if (spec.soundId != null &&
            Sounds.resFor(spec.soundId) == null &&
            !CustomSounds.available(context, spec.soundId)
        ) {
            builder.setSubText(context.getString(R.string.notif_sound_unavailable))
        }
        return builder.build()
    }

    fun cancelNotification(context: Context, id: Int) {
        try {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.cancel(id)
        } catch (_: Exception) {}
    }

    fun showAdhan(context: Context, spec: AlarmSpec, timeZone: String) {
        // Clear any pre-reminder notification when the real Adhan arrives
        cancelNotification(context, PRE_REMINDER_ID)
        notifySafely(
            context,
            ADHAN_NOTIFICATION_ID,
            adhanNotification(context, spec, timeZone, ongoing = false),
        )
    }

    fun showPreReminder(context: Context, spec: AlarmSpec, timeZone: String) {
        val title = context.getString(
            R.string.notif_pre_title,
            prayerLabel(context, spec.prayer),
        )
        val body = context.getString(
            R.string.notif_pre_body,
            prayerLabel(context, spec.prayer),
            clock(spec.atMillis, timeZone),
        )
        val notification = base(context, CHANNEL_PRE, title, body)
            .setAutoCancel(true)
            .build()
        notifySafely(context, PRE_REMINDER_ID, notification)
    }

    fun showMissed(context: Context, spec: AlarmSpec, timeZone: String, lateMinutes: Long) {
        val prayer = prayerLabel(context, spec.prayer)
        val title = context.getString(R.string.notif_missed_title, prayer)
        val body = context.getString(R.string.notif_missed_body, prayer)
        val notification = base(context, CHANNEL_STATUS, title, body)
            .setSubText(
                context.getString(
                    R.string.notif_missed_late,
                    lateMinutes,
                    clock(spec.atMillis, timeZone),
                ),
            )
            .setAutoCancel(true)
            .build()
        notifySafely(context, STATUS_ID + (spec.eventKey.hashCode() and 0x00FF), notification)
    }

    /**
     * Used when the schedule was cleared between arming and firing. The alarm is
     * still real, so it must still tell the user something.
     */
    fun showOrphanAdhan(context: Context, spec: AlarmSpec) {
        val title = context.getString(
            R.string.notif_adhan_title,
            prayerLabel(context, spec.prayer),
        )
        val notification = base(
            context,
            CHANNEL_ADHAN,
            title,
            context.getString(R.string.notif_fallback_body),
        ).setAutoCancel(true).build()
        notifySafely(context, ADHAN_NOTIFICATION_ID, notification)
    }

    /** Tells the user the device moved to another zone and the plan should be recomputed. */
    fun showZoneChanged(context: Context, payloadZone: String, deviceZone: String) {
        val notification = base(
            context,
            CHANNEL_STATUS,
            context.getString(R.string.notif_tz_title),
            context.getString(R.string.notif_tz_body, payloadZone, deviceZone),
        ).setAutoCancel(true).build()
        notifySafely(context, STATUS_ID, notification)
    }

    fun showOngoingSchedule(context: Context, nextPrayer: String, nextTime: String, summary: String) {
        val notification = base(
            context,
            CHANNEL_ONGOING,
            context.getString(R.string.notif_ongoing_title, nextPrayer, nextTime),
            summary,
        )
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(false)
            .build()
        notifySafely(context, ONGOING_ID, notification)
    }

    fun dismissOngoing(context: Context) {
        NotificationManagerCompat.from(context).cancel(ONGOING_ID)
    }

    private fun base(
        context: Context,
        channel: String,
        title: String,
        body: String,
    ): NotificationCompat.Builder = NotificationCompat.Builder(context, channel)
        .setSmallIcon(R.drawable.ic_stat_adhan)
        .setColor(context.getColor(R.color.azan_green))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(openAppIntent(context))
        .setAutoCancel(true)

    private fun notifySafely(context: Context, id: Int, notification: Notification) {
        // On Android 13+ this is a no-op without POST_NOTIFICATIONS. The native
        // diagnostics screen reports that state; the service still plays audio.
        if (!areNotificationsEnabled(context)) return
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Permission revoked between the check and the call.
        }
    }

    private fun openAppIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context,
        100,
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun diagnosticsIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context,
        101,
        Intent(context, NativeDiagnosticsActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun stopIntent(context: Context): PendingIntent = PendingIntent.getService(
        context,
        102,
        Intent(context, AdhanService::class.java).setAction(AdhanService.ACTION_STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
