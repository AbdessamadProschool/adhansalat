package app.azan.global

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Android Home Screen Widget for Azan Global.
 *
 * Displays:
 *  - Location name
 *  - Next prayer & exact scheduled time
 *  - Spiritual dedication note: "صاحب التطبيق يسألكم صالح الدعاء · صدقة جارية"
 *  - Tap opens the application.
 */
class AzanWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, AzanWidgetProvider::class.java))
            if (ids != null && ids.isNotEmpty()) {
                val intent = Intent(context, AzanWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            }
        }

        private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_azan)

            val store = ScheduleStore(context)
            val payload = store.payload()

            // Open app on click
            val launchIntent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            if (payload != null && payload.alarms.isNotEmpty()) {
                val now = System.currentTimeMillis()
                // Find next upcoming prayer alarm
                val nextAlarm = payload.alarms
                    .filter { it.isAdhan && it.atMillis >= now - 60_000 }
                    .minByOrNull { it.atMillis }

                views.setTextViewText(R.id.widget_location, payload.timeZone.substringAfterLast('/').replace('_', ' '))

                if (nextAlarm != null) {
                    val prayerName = prayerDisplayName(context, nextAlarm.prayer, store.locale())
                    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
                    val timeString = timeFormat.format(Date(nextAlarm.atMillis))

                    views.setTextViewText(R.id.widget_next_prayer, prayerName)
                    views.setTextViewText(R.id.widget_next_time, timeString)
                } else {
                    views.setTextViewText(R.id.widget_next_prayer, "—")
                    views.setTextViewText(R.id.widget_next_time, "--:--")
                }
            } else {
                views.setTextViewText(R.id.widget_location, context.getString(R.string.app_name))
                views.setTextViewText(R.id.widget_next_prayer, "—")
                views.setTextViewText(R.id.widget_next_time, "--:--")
            }

            // Always display the spiritual dedication note
            views.setTextViewText(
                R.id.widget_dua_note,
                context.getString(R.string.widget_spiritual_note)
            )

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun prayerDisplayName(context: Context, key: String, locale: String): String {
            return when (key.lowercase()) {
                "fajr" -> context.getString(R.string.prayer_fajr)
                "dhuhr" -> context.getString(R.string.prayer_dhuhr)
                "asr" -> context.getString(R.string.prayer_asr)
                "maghrib" -> context.getString(R.string.prayer_maghrib)
                "isha" -> context.getString(R.string.prayer_isha)
                else -> key.replaceFirstChar { it.uppercase() }
            }
        }
    }
}
