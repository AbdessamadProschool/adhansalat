package app.azan.global

import android.content.Context
import android.net.Uri
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Imported Adhan recordings, copied into the app's private storage.
 *
 * Why a copy and not a persisted content URI: `ACTION_GET_CONTENT` grants a
 * temporary read permission to the activity, not to a service woken hours later
 * by `AlarmManager`. A prayer alarm fires in a fresh process, possibly after a
 * reboot; only a file under `filesDir` is guaranteed to be readable then.
 *
 * The web layer keeps the same id in IndexedDB so its own player and the native
 * alarm refer to one identity. Both copies are written from the file the user
 * picked in the same session; deleting one deletes the other.
 *
 * Filenames are the id itself, restricted to a conservative character set: no
 * path traversal, no user-controlled extension games.
 */
object CustomSounds {

    private const val TAG = "AzanSounds"
    private const val PREFS = "azan.sounds"
    private const val KEY_META = "meta"
    private const val DIR = "sounds"

    /** 30 MiB, mirrored by the web importer. An Adhan recording fits easily. */
    const val MAX_BYTES = 30L * 1024 * 1024

    private val ALLOWED = setOf("mp3", "m4a", "aac", "wav", "ogg", "opus", "flac", "mp4")

    private val ID_PATTERN = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")

    fun isValidId(id: String): Boolean = ID_PATTERN.matches(id) && !id.contains("..")

    private fun dir(context: Context): File =
        File(context.filesDir, DIR).apply { if (!exists()) mkdirs() }

    /** The private file backing `id`, or null when no readable copy exists. */
    fun fileFor(context: Context, id: String?): File? {
        if (id == null || !isValidId(id)) return null
        val file = File(dir(context), id)
        return if (file.isFile && file.length() > 0L) file else null
    }

    fun available(context: Context, id: String?): Boolean = fileFor(context, id) != null

    fun extensionOf(name: String): String =
        name.substringAfterLast('.', "").lowercase()

    fun looksLikeAudio(name: String, mime: String?): Boolean {
        if (!mime.isNullOrBlank() && mime.startsWith("audio/")) return true
        return extensionOf(name) in ALLOWED
    }

    data class ImportResult(
        val ok: Boolean,
        val id: String?,
        val bytes: Long,
        val mime: String?,
        val reason: String?,
    ) {
        fun toJson(): String = JSONObject()
            .put("ok", ok)
            .put("id", id ?: JSONObject.NULL)
            .put("bytes", bytes)
            .put("mime", mime ?: JSONObject.NULL)
            .put("reason", reason ?: JSONObject.NULL)
            .toString()
    }

    /**
     * Copies `uri` into private storage under `id`. Returns a real reason on
     * refusal; the caller must not claim a native sound exists unless `ok`.
     */
    fun import(
        context: Context,
        uri: Uri,
        id: String,
        displayName: String,
        mime: String?,
    ): ImportResult {
        if (!isValidId(id)) {
            return ImportResult(false, null, 0, mime, "invalid sound id")
        }
        if (!looksLikeAudio(displayName, mime)) {
            return ImportResult(false, null, 0, mime, "unsupported audio format")
        }
        val target = File(dir(context), id)
        val temp = File(dir(context), "$id.part")
        var written = 0L
        try {
            val input = context.contentResolver.openInputStream(uri)
                ?: return ImportResult(false, null, 0, mime, "cannot open the selected file")
            input.use { stream ->
                temp.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = stream.read(buffer)
                        if (read < 0) break
                        written += read
                        if (written > MAX_BYTES) {
                            temp.delete()
                            return ImportResult(false, null, 0, mime, "file exceeds 30 MiB")
                        }
                        out.write(buffer, 0, read)
                    }
                }
            }
            if (written <= 0L) {
                temp.delete()
                return ImportResult(false, null, 0, mime, "empty file")
            }
            if (target.exists()) target.delete()
            if (!temp.renameTo(target)) {
                temp.delete()
                return ImportResult(false, null, 0, mime, "cannot store the file")
            }
            remember(context, id, displayName, mime, written)
            Log.i(TAG, "imported $id ($written bytes)")
            return ImportResult(true, id, written, mime, null)
        } catch (error: Exception) {
            temp.delete()
            Log.e(TAG, "import failed for $id: ${error.message}")
            return ImportResult(false, null, 0, mime, error.message ?: error.javaClass.simpleName)
        }
    }

    fun delete(context: Context, id: String) {
        if (!isValidId(id)) return
        File(dir(context), id).delete()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val meta = readMeta(prefs)
        meta.remove(id)
        prefs.edit().putString(KEY_META, meta.toString()).commit()
    }

    /** Metadata of every imported sound, for the native diagnostics screen. */
    fun list(context: Context): JSONArray {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val meta = readMeta(prefs)
        val out = JSONArray()
        for (id in meta.keys()) {
            if (!available(context, id)) continue
            out.put(meta.getJSONObject(id).put("id", id).put("bytes", fileFor(context, id)?.length() ?: 0L))
        }
        return out
    }

    private fun remember(context: Context, id: String, name: String, mime: String?, bytes: Long) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val meta = readMeta(prefs)
        meta.put(
            id,
            JSONObject()
                .put("name", name)
                .put("mime", mime ?: "audio/*")
                .put("bytes", bytes)
                .put("createdAt", System.currentTimeMillis()),
        )
        prefs.edit().putString(KEY_META, meta.toString()).commit()
    }

    private fun readMeta(prefs: android.content.SharedPreferences): JSONObject =
        try {
            JSONObject(prefs.getString(KEY_META, "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }
}
