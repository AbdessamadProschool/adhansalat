package app.azan.global

import org.json.JSONObject
import java.time.Instant

/**
 * One alarm as computed by the TypeScript engine.
 *
 * The choice of authority is deliberate: astronomy lives in one place (the web
 * engine, tested against reference data), and the native layer only knows how to
 * wake the device at an absolute instant. Duplicating the calculation in Kotlin
 * would create two sources of truth that can disagree.
 */
data class AlarmSpec(
    val eventKey: String,
    val prayer: String,
    val kind: String,
    val atMillis: Long,
    val soundId: String?,
) {
    val isAdhan: Boolean get() = kind == KIND_ADHAN

    companion object {
        const val KIND_ADHAN = "adhan"
        const val KIND_PRE = "pre-reminder"
    }
}

/**
 * The complete JSON document pushed by `AlarmEngine.pushToNative()`.
 *
 * Instants are absolute (UTC) so a device time-zone change can never move them;
 * `timeZone` is only used for display and for detecting that the device moved to
 * a different zone since the plan was computed.
 */
data class SchedulePayload(
    val timeZone: String,
    val latitude: Double,
    val longitude: Double,
    val scheduledAt: String,
    val locale: String,
    val alarms: List<AlarmSpec>,
) {
    companion object {
        /**
         * The engine pushes at most 31 days × 5 prayers × 2 kinds = 310 events.
         * A larger array is not a plan: it is a malformed or hostile document,
         * and persisting it would block the receiver on a synchronous commit.
         */
        const val MAX_ALARMS = 400

        /** eventKey (`2026-10-29:fajr:pre`), timeZone, soundId and locale all fit. */
        private const val MAX_FIELD = 64

        fun parse(raw: String): SchedulePayload {
            val root = JSONObject(raw)
            val timeZone = root.optString("timeZone", "")
            require(timeZone.isNotBlank()) { "payload.timeZone is required" }
            require(timeZone.length <= MAX_FIELD) { "payload.timeZone is too long" }
            val array = root.optJSONArray("alarms")
                ?: throw IllegalArgumentException("payload.alarms is required")
            require(array.length() <= MAX_ALARMS) { "payload.alarms is too large" }

            val alarms = ArrayList<AlarmSpec>(array.length())
            for (i in 0 until array.length()) {
                val item = array.optJSONObject(i) ?: continue
                val eventKey = item.optString("eventKey", "")
                val atIso = item.optString("atIso", "")
                if (eventKey.isBlank() || eventKey.length > MAX_FIELD) continue
                if (atIso.isBlank() || atIso.length > MAX_FIELD) continue
                val atMillis = try {
                    Instant.parse(atIso).toEpochMilli()
                } catch (_: Exception) {
                    continue
                }
                val kind = item.optString("kind", AlarmSpec.KIND_ADHAN)
                    .ifBlank { AlarmSpec.KIND_ADHAN }
                // An over-long id is dropped, not truncated: a different sound
                // must never be played in place of the one that was chosen.
                val soundId = item.optString("soundId", "")
                    .takeIf { it.isNotBlank() && it.length <= MAX_FIELD }
                alarms += AlarmSpec(
                    eventKey = eventKey,
                    prayer = item.optString("prayer", "").take(16),
                    kind = kind.take(16),
                    atMillis = atMillis,
                    soundId = soundId,
                )
            }
            return SchedulePayload(
                timeZone = timeZone,
                latitude = root.optDouble("latitude", Double.NaN),
                longitude = root.optDouble("longitude", Double.NaN),
                scheduledAt = root.optString("scheduledAt", "").take(MAX_FIELD),
                locale = root.optString("locale", "fr").take(16),
                alarms = alarms.sortedBy { it.atMillis },
            )
        }
    }
}

/**
 * Result of an attempt to hand alarms to `AlarmManager`. `deferred` means the
 * OS refused (exact alarms not granted) and the schedule was persisted but not
 * armed — the UI must say so instead of showing a green tick.
 */
data class ArmResult(
    val armed: Int,
    val skipped: Int,
    val deferred: Boolean,
    val reason: String?,
    /** How many events the persisted plan contains (armed or not). */
    val stored: Int = armed + skipped,
) {
    fun toJson(): String = JSONObject()
        .put("armed", armed)
        .put("skipped", skipped)
        .put("deferred", deferred)
        .put("reason", reason ?: JSONObject.NULL)
        .put("stored", stored)
        .toString()
}
