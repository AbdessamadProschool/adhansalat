package app.azan.global

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationManagerCompat

/**
 * The only surface through which the web app can reach the operating system.
 *
 * Contract (mirrored by `NativeBridge` in `src/app/notifications.ts`):
 *  - it never claims success: `canScheduleExactAlarms()` reflects the real OS
 *    state, and a refused schedule is recorded, not swallowed;
 *  - it never computes prayer times: it stores absolute instants produced by the
 *    tested TypeScript engine;
 *  - methods are called on WebView's JavaBridge thread, so the shared-preferences
 *    writes here are allowed to block. Anything touching the UI is posted.
 */
class AzanBridge(private val activity: MainActivity) {

    /**
     * Replaces the stored plan and hands it to `AlarmManager` in one call.
     *
     * Order matters and is the fix for the old web-side `cancelAll(); schedule()`
     * pair, which could leave the device with no plan at all if the process died
     * in between:
     *
     *  1. parse and validate the incoming JSON;
     *  2. persist it (durable) — a crash after this point leaves a plan that
     *     `SystemEventReceiver` can re-arm;
     *  3. cancel only the previous plan's alarms that are obsolete (removed, or
     *     moved because the location/method changed) — the events that remain are
     *     never disarmed in between;
     *  4. arm the new plan and return what the OS actually did.
     *
     * The returned JSON is consumed by the web engine and shown in diagnostics; a
     * refusal is reported as `deferred`/`reason`, never as success.
     */
    @JavascriptInterface
    fun schedule(payload: String): String {
        val store = ScheduleStore(activity)
        var stored = 0
        return try {
            val parsed = SchedulePayload.parse(payload)
            val previous = store.payload()
            // Record alarms the OS never delivered while this plan was current,
            // before the new payload replaces it and prunes the ledger.
            NativeAlarmScheduler.auditMissed(activity, previous)
            store.save(parsed, payload)
            stored = parsed.alarms.size
            Notifications.createChannels(LocaleHelper.wrap(activity, parsed.locale))
            // A failure to cancel an obsolete alarm must not prevent arming the new
            // plan: the worst case is one stale alarm, not a silenced device.
            runCatching {
                previous?.let { NativeAlarmScheduler.cancelObsolete(activity, it, parsed) }
            }.onFailure { error ->
                Log.w(TAG, "cancelObsolete failed: ${error.message}")
            }
            val result = NativeAlarmScheduler.sync(activity)
            store.recordSync(result, "web")
            Log.i(
                TAG,
                "schedule: ${parsed.alarms.size} stored, armed=${result.armed} " +
                    "skipped=${result.skipped} deferred=${result.deferred}",
            )
            result.toJson()
        } catch (error: Exception) {
            Log.e(TAG, "schedule failed: ${error.message}")
            val reason = error.message ?: error.javaClass.simpleName
            store.recordBridgeError("schedule", reason)
            // `stored` is non-zero only once the payload was durably saved, so the
            // reason distinguishes "nothing exists" from "stored but not armed".
            ArmResult(0, 0, true, "schedule-rejected: $reason", stored).toJson()
        }
    }

    @JavascriptInterface
    fun cancelAll() {
        try {
            NativeAlarmScheduler.cancelAll(activity)
        } catch (error: Exception) {
            ScheduleStore(activity)
                .recordBridgeError("cancelAll", error.message ?: error.javaClass.simpleName)
        }
    }

    /** Last `ArmResult` recorded by any sync, with its source and timestamp. */
    @JavascriptInterface
    fun lastSyncResult(): String? {
        val store = ScheduleStore(activity)
        val sync = store.lastSync() ?: return null
        return try {
            sync.put("source", store.lastSyncSource() ?: "unknown")
                .put("atMillis", store.lastSyncAt())
                .toString()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Copies the audio file the user just picked into private storage, so the
     * native player can read it hours later. Returns `ImportResult` JSON.
     */
    @JavascriptInterface
    fun importSound(id: String, name: String): String {
        val picked = activity.takePickedSound()
            ?: return CustomSounds.ImportResult(
                ok = false,
                id = null,
                bytes = 0,
                mime = null,
                reason = "no file picked through the Android chooser in this session",
            ).toJson()
        val result = CustomSounds.import(
            activity,
            picked.uri,
            id,
            name.ifBlank { picked.name },
            picked.mime,
        )
        if (!result.ok) {
            Log.w(TAG, "importSound refused: ${result.reason}")
        }
        return result.toJson()
    }

    @JavascriptInterface
    fun deleteImportedSound(id: String) {
        CustomSounds.delete(activity, id)
    }

    /** Imported sound metadata for the native diagnostics screen. */
    @JavascriptInterface
    fun listImportedSounds(): String = CustomSounds.list(activity).toString()

    @JavascriptInterface
    fun canScheduleExactAlarms(): Boolean = NativeAlarmScheduler.canScheduleExactAlarms(activity)

    @JavascriptInterface
    fun requestExactAlarmPermission() {
        activity.runOnUiThread {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@runOnUiThread
            val intent = Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:${activity.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                activity.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            }
        }
    }

    @JavascriptInterface
    fun isIgnoringBatteryOptimizations(): Boolean {
        val manager = activity.getSystemService(PowerManager::class.java) ?: return false
        return manager.isIgnoringBatteryOptimizations(activity.packageName)
    }

    @JavascriptInterface
    fun openNotificationSettings() {
        activity.runOnUiThread {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                activity.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                openSettings(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            }
        }
    }

    @JavascriptInterface
    fun platform(): String =
        "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"

    /**
     * WebView does not implement the web Notification API: it always reports
     * `denied`. Reporting Android's real state is the only way the web diagnostics
     * screen can be truthful inside the wrapper.
     */
    @JavascriptInterface
    fun notificationPermission(): String {
        if (isNotificationGranted()) return "granted"
        return if (ScheduleStore(activity).notificationAsked()) "denied" else "default"
    }

    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                    PackageManager.PERMISSION_GRANTED
                if (granted) {
                    // Granted at runtime but switched off in the app settings: only
                    // the system screen can turn it back on.
                    openNotificationSettings()
                    return@runOnUiThread
                }
                ScheduleStore(activity).markNotificationAsked()
                activity.requestNotificationPermission()
            } else {
                openNotificationSettings()
            }
        }
    }

    @JavascriptInterface
    fun openNativeDiagnostics() {
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, NativeDiagnosticsActivity::class.java))
        }
    }

    private fun isNotificationGranted(): Boolean {
        if (!NotificationManagerCompat.from(activity).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun openSettings(action: String) {
        val intent = Intent(action, Uri.parse("package:${activity.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
        } catch (error: ActivityNotFoundException) {
            Log.w(TAG, "no activity for $action: ${error.message}")
        }
    }

    companion object {
        private const val TAG = "AzanBridge"
    }
}
