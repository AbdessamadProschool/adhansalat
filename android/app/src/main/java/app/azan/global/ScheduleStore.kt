package app.azan.global

import android.content.Context
import org.json.JSONObject

/**
 * Local persistence for the schedule, the at-most-once ledger and the last
 * delivery result.
 *
 * Why SharedPreferences and not DataStore or Room: every write that matters here
 * happens inside a `BroadcastReceiver.onReceive`, which must finish quickly and
 * must not lose a "this prayer already fired" marker if the process is killed
 * right after. `commit()` is synchronous and has no coroutine scope to outlive;
 * a queued write could re-deliver a prayer after a crash. The payload itself is a
 * single small JSON string, so a relational database would add nothing.
 *
 * The fired ledger is pruned to the keys of the current payload on every save, so
 * it cannot grow without bound while still guaranteeing one delivery per
 * `date:prayer[:pre]` key.
 */
class ScheduleStore(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Raw JSON as received from the web layer; kept for exact re-parsing. */
    fun rawPayload(): String? = prefs.getString(KEY_PAYLOAD, null)

    fun payload(): SchedulePayload? {
        val raw = rawPayload() ?: return null
        return try {
            SchedulePayload.parse(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun locale(): String =
        prefs.getString(KEY_LOCALE, null) ?: payload()?.locale ?: "fr"

    fun save(payload: SchedulePayload, raw: String) {
        val liveKeys = payload.alarms.map { it.eventKey }.toSet()
        val fired = firedKeys().apply { retainAll(liveKeys) }
        prefs.edit()
            .putString(KEY_PAYLOAD, raw)
            .putString(KEY_LOCALE, payload.locale)
            .putStringSet(KEY_FIRED, fired)
            .putLong(KEY_SAVED_AT, System.currentTimeMillis())
            .commit()
    }

    fun clearPayload() {
        prefs.edit().remove(KEY_PAYLOAD).commit()
    }

    /**
     * Marks an event as delivered. Returns false when it was already delivered,
     * which is what makes a double alarm (reboot + race, or two PendingIntents)
     * impossible to play twice.
     */
    fun markFired(eventKey: String): Boolean = markFired(listOf(eventKey)) == 1

    /**
     * Marks several events as consumed in one synchronous write. Used when the
     * scheduler records alarms the OS never delivered (device off, alarm blocked)
     * so they are reported once and never replayed afterwards.
     */
    fun markFired(eventKeys: Collection<String>): Int {
        if (eventKeys.isEmpty()) return 0
        val fired = firedKeys()
        val added = eventKeys.filter { fired.add(it) }
        if (added.isEmpty()) return 0
        prefs.edit().putStringSet(KEY_FIRED, fired).commit()
        return added.size
    }

    fun hasFired(eventKey: String): Boolean = firedKeys().contains(eventKey)

    fun firedKeys(): MutableSet<String> =
        (prefs.getStringSet(KEY_FIRED, emptySet()) ?: emptySet()).toMutableSet()

    fun recordResult(record: FireRecord) {
        prefs.edit().putString(KEY_LAST_RESULT, record.toJson()).commit()
    }

    fun lastResult(): FireRecord? {
        val raw = prefs.getString(KEY_LAST_RESULT, null) ?: return null
        return try {
            FireRecord.fromJson(JSONObject(raw))
        } catch (_: Exception) {
            null
        }
    }

    fun recordSync(result: ArmResult, source: String) {
        prefs.edit()
            .putString(KEY_LAST_SYNC, result.toJson())
            .putString(KEY_LAST_SYNC_SOURCE, source)
            .putLong(KEY_LAST_SYNC_AT, System.currentTimeMillis())
            .commit()
    }

    fun lastSync(): JSONObject? {
        val raw = prefs.getString(KEY_LAST_SYNC, null) ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun lastSyncSource(): String? = prefs.getString(KEY_LAST_SYNC_SOURCE, null)
    fun lastSyncAt(): Long = prefs.getLong(KEY_LAST_SYNC_AT, 0L)
    fun savedAt(): Long = prefs.getLong(KEY_SAVED_AT, 0L)

    /**
     * Whether the runtime notification permission has already been requested.
     *
     * Needed to answer the web layer honestly: before the first request the state
     * is "default" (the system can still show the dialog), afterwards a missing
     * grant is a real "denied" the app must not silently retry.
     */
    fun markNotificationAsked() {
        prefs.edit().putBoolean(KEY_NOTIF_ASKED, true).commit()
    }

    fun notificationAsked(): Boolean = prefs.getBoolean(KEY_NOTIF_ASKED, false)

    fun recordBridgeError(method: String, detail: String) {
        recordResult(
            FireRecord(
                eventKey = "bridge:$method",
                prayer = "",
                kind = "error",
                atMillis = System.currentTimeMillis(),
                firedAtMillis = System.currentTimeMillis(),
                outcome = "bridge-error",
                detail = detail,
            ),
        )
    }

    fun clearAll() {
        prefs.edit().clear().commit()
    }

    companion object {
        private const val PREFS = "azan.schedule"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_LOCALE = "locale"
        private const val KEY_FIRED = "fired"
        private const val KEY_SAVED_AT = "savedAt"
        private const val KEY_LAST_RESULT = "lastResult"
        private const val KEY_LAST_SYNC = "lastSync"
        private const val KEY_LAST_SYNC_AT = "lastSyncAt"
        private const val KEY_LAST_SYNC_SOURCE = "lastSyncSource"
        private const val KEY_NOTIF_ASKED = "notificationAsked"

        /**
         * Reads the locale without constructing the whole store. Used from
         * `attachBaseContext`, where `applicationContext` may not be available yet,
         * so this deliberately uses the context it is given.
         */
        fun readLocale(context: Context): String =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_LOCALE, null) ?: "fr"
    }
}

/** One delivery attempt, mirroring the web layer's `FireRecord`. */
data class FireRecord(
    val eventKey: String,
    val prayer: String,
    val kind: String,
    val atMillis: Long,
    val firedAtMillis: Long,
    val outcome: String,
    val detail: String?,
) {
    fun toJson(): String = JSONObject()
        .put("eventKey", eventKey)
        .put("prayer", prayer)
        .put("kind", kind)
        .put("atMillis", atMillis)
        .put("firedAtMillis", firedAtMillis)
        .put("outcome", outcome)
        .put("detail", detail ?: JSONObject.NULL)
        .toString()

    companion object {
        fun fromJson(o: JSONObject): FireRecord = FireRecord(
            eventKey = o.optString("eventKey", ""),
            prayer = o.optString("prayer", ""),
            kind = o.optString("kind", ""),
            atMillis = o.optLong("atMillis", 0L),
            firedAtMillis = o.optLong("firedAtMillis", 0L),
            outcome = o.optString("outcome", ""),
            detail = if (o.isNull("detail")) null else o.optString("detail"),
        )
    }
}
