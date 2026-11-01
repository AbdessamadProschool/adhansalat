package app.azan.global

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import java.time.Instant

/**
 * Hands the computed plan to the OS.
 *
 * Design rules:
 *  - every Adhan is a `setAlarmClock()` alarm: the system treats it as a user
 *    alarm, never shifts its delivery time and leaves Doze to deliver it;
 *  - a pre-reminder is `setExactAndAllowWhileIdle()`, because it must not wake the
 *    screen like an alarm clock;
 *  - one `PendingIntent` per `eventKey` (unique data URI + request code), so
 *    re-syncing can cancel every alarm it created without touching another app's;
 *  - if the exact-alarm permission is missing, nothing is armed and the result
 *    says `deferred` — the schedule is kept so a later grant can arm it.
 *
 * Nothing here fakes delivery: no Handler, no WorkManager fallback with an
 * approximate time, and no "assume it fired" branch.
 */
object NativeAlarmScheduler {

    private const val TAG = "AzanAlarms"
    const val ACTION_FIRE = "app.azan.global.action.FIRE"
    const val EXTRA_EVENT_KEY = "eventKey"
    const val EXTRA_PRAYER = "prayer"
    const val EXTRA_KIND = "kind"
    const val EXTRA_AT_MILLIS = "atMillis"
    const val EXTRA_SOUND_ID = "soundId"

    private const val MIN_LEAD_MS = 5_000L

    /** Same grace window as [AdhanReceiver]: past this, an event is missed. */
    private const val MISSED_GRACE_MS = 120_000L

    fun canScheduleExactAlarms(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(AlarmManager::class.java) ?: return false
        return manager.canScheduleExactAlarms()
    }

    fun alarmManager(context: Context): AlarmManager? =
        context.getSystemService(AlarmManager::class.java)

    /**
     * Cancels what the stored plan had armed, then arms every future event of
     * that same plan. Safe to call after a reboot, a clock change or a permission
     * grant; calling it twice cannot duplicate an alarm because each event maps to
     * exactly one PendingIntent.
     *
     * The caller that *replaces* a plan (the bridge) must call [cancelObsolete]
     * with the previous payload first: this function only knows the current plan,
     * so events that disappeared from it would otherwise stay armed forever.
     */
    fun sync(context: Context): ArmResult {
        val store = ScheduleStore(context)
        val payload = store.payload()
            ?: return ArmResult(0, 0, false, "no-schedule", 0).also {
                store.recordSync(it, "sync")
            }

        // Android drops alarms across a reboot and never replays one whose time
        // passed while the device was off. Those events would otherwise vanish
        // silently: record the aggregate once, then consume them so they cannot be
        // reported (or played) a second time.
        auditMissed(context, payload)

        cancel(context, payload)

        if (!canScheduleExactAlarms(context)) {
            val result = ArmResult(0, 0, true, "exact-alarms-denied", payload.alarms.size)
            store.recordSync(result, "sync")
            Log.w(TAG, "exact alarms denied: ${payload.alarms.size} alarm(s) stored but not armed")
            return result
        }

        val now = System.currentTimeMillis()
        var armed = 0
        var skipped = 0
        for (spec in payload.alarms) {
            if (spec.atMillis <= now + MIN_LEAD_MS) {
                skipped++
                continue
            }
            if (arm(context, spec)) armed++ else skipped++
        }
        val result = ArmResult(armed, skipped, false, null, payload.alarms.size)
        store.recordSync(result, "sync")
        Log.i(TAG, "armed=$armed skipped=$skipped stored=${payload.alarms.size} deferred=false")

        // Update home screen widget on each sync
        try {
            AzanWidgetProvider.updateAll(context)
        } catch (_: Exception) {
            // Widget update is non-critical
        }

        // Update ongoing lock-screen notification to the next upcoming prayer
        updateOngoingSchedule(context)

        return result
    }

    /**
     * Updates the persistent lock-screen notification to display the NEXT upcoming prayer.
     * Called on sync, and whenever any prayer alarm fires so it automatically advances
     * without needing the user to open the app.
     */
    fun updateOngoingSchedule(context: Context) {
        try {
            val payload = ScheduleStore(context).payload() ?: return
            val nowMs = System.currentTimeMillis()
            // Pick the next upcoming Adhan strictly in the future (with 30s buffer so current prayer is skipped)
            val nextAlarm = payload.alarms
                .filter { it.isAdhan && it.atMillis > nowMs + 30_000 }
                .minByOrNull { it.atMillis }

            if (nextAlarm != null) {
                val nextPrayer = Notifications.prayerLabel(context, nextAlarm.prayer)
                val nextTime = Notifications.clock(nextAlarm.atMillis, payload.timeZone)
                val summary = "${payload.timeZone.substringAfterLast('/').replace('_', ' ')} · ${context.getString(R.string.app_name)}"
                Notifications.showOngoingSchedule(context, nextPrayer, nextTime, summary)
            }
        } catch (_: Exception) {
            // Notification is non-critical
        }
    }

    /**
     * Cancels alarms that belonged to the previous plan but are absent from the
     * next one, or whose instant moved (location or method change). Called while
     * replacing a plan, *after* the new payload is persisted, so a process death
     * at any point still leaves a durable plan to re-arm from.
     */
    fun cancelObsolete(context: Context, previous: SchedulePayload?, next: SchedulePayload) {
        val keep = next.alarms.associateBy { it.eventKey }
        previous?.alarms?.forEach { old ->
            val current = keep[old.eventKey]
            if (current == null || current.atMillis != old.atMillis) {
                cancelSpec(context, old)
            }
        }
    }

    /** Cancels exactly one event's PendingIntent, if it exists. */
    fun cancelSpec(context: Context, spec: AlarmSpec) {
        val manager = alarmManager(context) ?: return
        val pending = pendingIntent(context, spec, PendingIntent.FLAG_NO_CREATE) ?: return
        manager.cancel(pending)
        pending.cancel()
    }

    /** Arms one event. Returns false (never throws at the caller) on refusal. */
    fun arm(context: Context, spec: AlarmSpec): Boolean {
        val manager = alarmManager(context) ?: return false
        if (!canScheduleExactAlarms(context)) return false
        return try {
            // pendingIntent() can return null on some OEM ROMs even with FLAG_UPDATE_CURRENT;
            // guard against a NullPointerException crash at the AlarmManager call site.
            val pending = pendingIntent(context, spec, PendingIntent.FLAG_UPDATE_CURRENT)
                ?: run {
                    Log.w(TAG, "PendingIntent is null for ${spec.eventKey}, skipping arm")
                    return false
                }
            if (spec.isAdhan) {
                manager.setAlarmClock(
                    AlarmManager.AlarmClockInfo(spec.atMillis, showIntent(context)),
                    pending,
                )
            } else {
                manager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    spec.atMillis,
                    pending,
                )
            }
            true
        } catch (error: SecurityException) {
            Log.w(TAG, "SecurityException arming ${spec.eventKey}: ${error.message}")
            false
        } catch (error: RuntimeException) {
            Log.w(TAG, "RuntimeException arming ${spec.eventKey}: ${error.message}")
            false
        }
    }

    fun cancel(context: Context, payload: SchedulePayload) {
        for (spec in payload.alarms) cancelSpec(context, spec)
    }

    /**
     * Records, once, the Adhan events of `payload` that passed more than the grace
     * window ago and were never delivered. Called before replacing a plan and on
     * every re-arm (boot, clock change), because a reboot cancels alarms instead of
     * delivering them late.
     *
     * Only the most recent missed event is kept as a record; the detail carries the
     * count, so a device left off for a week produces one honest line instead of
     * dozens of rows. The events are marked fired so they are neither reported
     * again nor played if a stale intent ever surfaces.
     */
    fun auditMissed(context: Context, payload: SchedulePayload?) {
        payload ?: return
        // The plan contains every prayer of the current day, including the ones
        // already past when it was built. Those were never armed, so they must not
        // be reported as "missed": only events that were still ahead when the plan
        // was stored could have been expected to fire.
        val plannedFrom = runCatching { Instant.parse(payload.scheduledAt).toEpochMilli() }
            .getOrNull() ?: return
        val store = ScheduleStore(context)
        val now = System.currentTimeMillis()
        val missing = payload.alarms.filter { spec ->
            spec.isAdhan &&
                spec.atMillis > plannedFrom &&
                spec.atMillis < now - MISSED_GRACE_MS &&
                !store.hasFired(spec.eventKey)
        }
        if (missing.isEmpty()) return
        val latest = missing.maxByOrNull { it.atMillis } ?: return
        store.markFired(missing.map { it.eventKey })
        store.recordResult(
            FireRecord(
                eventKey = latest.eventKey,
                prayer = latest.prayer,
                kind = latest.kind,
                atMillis = latest.atMillis,
                firedAtMillis = now,
                outcome = "missed",
                detail = "${missing.size} Adhan alarm(s) never delivered (device off or alarm blocked); latest ${latest.eventKey}",
            ),
        )
        Log.w(TAG, "recorded ${missing.size} missed Adhan event(s); latest ${latest.eventKey}")
    }

    /** Cancels the stored plan and forgets it. The fired ledger is preserved. */
    fun cancelAll(context: Context) {
        val store = ScheduleStore(context)
        store.payload()?.let { cancel(context, it) }
        store.clearPayload()
    }

    /**
     * Arms a single alarm a few seconds ahead, without touching the real plan.
     * This is the only honest way to prove the native path works end to end: the
     * user locks the screen and the alarm must sound.
     */
    fun scheduleTest(context: Context, secondsFromNow: Long): ArmResult {
        if (!canScheduleExactAlarms(context)) {
            return ArmResult(0, 0, true, "exact-alarms-denied")
        }
        val at = System.currentTimeMillis() + secondsFromNow.coerceIn(5, 3600) * 1000
        val spec = AlarmSpec(
            eventKey = "test:$at",
            prayer = "fajr",
            kind = AlarmSpec.KIND_ADHAN,
            atMillis = at,
            soundId = "chime-alert",
        )
        val ok = arm(context, spec)
        return ArmResult(if (ok) 1 else 0, 0, false, if (ok) null else "arm-failed")
    }

    fun upcoming(context: Context, limit: Int = Int.MAX_VALUE): List<AlarmSpec> {
        val payload = ScheduleStore(context).payload() ?: return emptyList()
        val now = System.currentTimeMillis()
        return payload.alarms.asSequence()
            .filter { it.atMillis > now }
            .take(limit)
            .toList()
    }

    fun upcomingCount(context: Context): Int {
        val payload = ScheduleStore(context).payload() ?: return 0
        val now = System.currentTimeMillis()
        return payload.alarms.count { it.atMillis > now }
    }

    private fun pendingIntent(context: Context, spec: AlarmSpec, flags: Int): PendingIntent? {
        val intent = Intent(context, AdhanReceiver::class.java).apply {
            action = ACTION_FIRE
            // Unique per event: the identity of a PendingIntent includes its data
            // URI, so two events can never overwrite each other even if their
            // request codes collide.
            data = Uri.parse("azan://alarm/${Uri.encode(spec.eventKey)}")
            putExtra(EXTRA_EVENT_KEY, spec.eventKey)
            putExtra(EXTRA_PRAYER, spec.prayer)
            putExtra(EXTRA_KIND, spec.kind)
            putExtra(EXTRA_AT_MILLIS, spec.atMillis)
            putExtra(EXTRA_SOUND_ID, spec.soundId)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode(spec.eventKey),
            intent,
            flags or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun showIntent(context: Context): PendingIntent = PendingIntent.getActivity(
        context,
        200,
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun requestCode(eventKey: String): Int = eventKey.hashCode() and 0x7fffffff

    /** Reads an event back out of the firing intent. */
    fun specFrom(intent: Intent): AlarmSpec? {
        val eventKey = intent.getStringExtra(EXTRA_EVENT_KEY) ?: return null
        val atMillis = intent.getLongExtra(EXTRA_AT_MILLIS, 0L)
        if (atMillis <= 0L) return null
        return AlarmSpec(
            eventKey = eventKey,
            prayer = intent.getStringExtra(EXTRA_PRAYER) ?: "",
            kind = intent.getStringExtra(EXTRA_KIND) ?: AlarmSpec.KIND_ADHAN,
            atMillis = atMillis,
            soundId = intent.getStringExtra(EXTRA_SOUND_ID),
        )
    }
}
