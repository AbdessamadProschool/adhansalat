package app.azan.global

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Plays the Adhan as a foreground service.
 *
 * Why a service and not a notification sound: the Adhan is several minutes long,
 * must keep playing with the screen off, and must be stoppable from the
 * notification. A notification sound is capped and dies with the notification.
 *
 * There is exactly one service instance and one MediaPlayer. Starting a second
 * Adhan stops the first, so two prayers (or a test during a real Adhan) can never
 * play over each other.
 *
 * Audio is requested with `USAGE_ALARM` and transient focus. If focus is lost
 * (an incoming call, another alarm) playback stops instead of ducking: a
 * half-volume Adhan is worse than none, and the notification stays visible.
 */
class AdhanService : Service() {

    private var player: MediaPlayer? = null
    private var focusRequest: AudioFocusRequest? = null
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    private val audioManager by lazy { getSystemService(AudioManager::class.java) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            return START_NOT_STICKY
        }

        val spec = NativeAlarmScheduler.specFrom(intent ?: Intent()) ?: run {
            shutdown()
            return START_NOT_STICKY
        }
        val timeZone = ScheduleStore(this).payload()?.timeZone
            ?: java.util.TimeZone.getDefault().id
        val resId = Sounds.resFor(spec.soundId)
        val customFile = if (resId == null) CustomSounds.fileFor(this, spec.soundId) else null

        if (resId == null && customFile == null) {
            // Nothing to play: deliver a plain notification and let the service die.
            Notifications.showAdhan(this, spec, timeZone)
            stopSelf(startId)
            return START_NOT_STICKY
        }

        val notification = Notifications.adhanNotification(this, spec, timeZone, ongoing = true)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (error: RuntimeException) {
            // Android 12+ can refuse a background FGS start. An exact alarm is
            // exempt, but we never assume it: fall back to a notification.
            Log.e(TAG, "startForeground refused: ${error.message}")
            Notifications.showAdhan(this, spec, timeZone)
            stopSelf(startId)
            return START_NOT_STICKY
        }

        if (!play(resId, customFile)) {
            Notifications.showAdhan(this, spec, timeZone)
            shutdown()
        }
        return START_NOT_STICKY
    }

    /**
     * Starts playback from either a bundled raw resource or an imported file.
     *
     * A custom sound is read from the app's private storage, which is the only
     * location guaranteed readable when the alarm wakes a fresh process. When the
     * file vanished (user cleared data, deleted it), the caller has already
     * downgraded to a notification and this method is never reached.
     */
    private fun play(resId: Int?, customFile: java.io.File?): Boolean {
        stopPlayer()

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener { change ->
                if (change == AudioManager.AUDIOFOCUS_LOSS ||
                    change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
                    change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK
                ) {
                    mainHandler.post { shutdown() }
                }
            }
            .build()
        focusRequest = request
        audioManager?.requestAudioFocus(request)

        var mediaPlayer: MediaPlayer? = null
        return try {
            val mp = MediaPlayer()
            mediaPlayer = mp
            mp.setAudioAttributes(attributes)
            mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
            if (customFile != null) {
                mp.setDataSource(customFile.absolutePath)
            } else if (resId != null) {
                resources.openRawResourceFd(resId).use { descriptor ->
                    mp.setDataSource(
                        descriptor.fileDescriptor,
                        descriptor.startOffset,
                        descriptor.length,
                    )
                }
            } else {
                return false
            }
            mp.setOnCompletionListener { mainHandler.post { shutdown() } }
            mp.setOnErrorListener { _, what, extra ->
                Log.e(TAG, "MediaPlayer error what=$what extra=$extra")
                mainHandler.post { shutdown() }
                true
            }
            mp.prepare()
            mp.start()
            player = mp
            playing = true
            Log.i(TAG, "Adhan playback started (${customFile?.name ?: "raw=$resId"})")
            true
        } catch (error: Exception) {
            Log.e(TAG, "cannot play Adhan: ${error.message}")
            try {
                mediaPlayer?.release()
            } catch (_: Exception) {
                // Already released.
            }
            false
        }
    }

    private fun stopPlayer() {
        val current = player ?: return
        player = null
        try {
            if (current.isPlaying) current.stop()
        } catch (_: IllegalStateException) {
            // Already stopped.
        }
        try {
            current.release()
        } catch (_: Exception) {
            // Nothing useful to do.
        }
    }

    private fun abandonFocus() {
        val request = focusRequest ?: return
        focusRequest = null
        try {
            audioManager?.abandonAudioFocusRequest(request)
        } catch (_: Exception) {
            // Focus may already be gone.
        }
    }

    /** Stops audio and removes the foreground notification. Safe to call twice. */
    private fun shutdown() {
        stopPlayer()
        abandonFocus()
        playing = false
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
            // Not in foreground.
        }
        stopSelf()
    }

    override fun onDestroy() {
        stopPlayer()
        abandonFocus()
        playing = false
        super.onDestroy()
    }

    companion object {
        private const val TAG = "AzanAudio"
        const val ACTION_START = "app.azan.global.action.PLAY"
        const val ACTION_STOP = "app.azan.global.action.STOP_AUDIO"
        const val NOTIFICATION_ID = Notifications.ADHAN_NOTIFICATION_ID

        /**
         * True only while a MediaPlayer is actually running. The native diagnostics
         * screen uses it to show or hide "Stop the sound" instead of offering a
         * button that would do nothing.
         */
        @Volatile
        var playing: Boolean = false
            private set

        /** Returns false when Android refuses to start the service (then: notify only). */
        fun start(context: Context, spec: AlarmSpec): Boolean {
            val intent = Intent(context, AdhanService::class.java).apply {
                action = ACTION_START
                putExtra(NativeAlarmScheduler.EXTRA_EVENT_KEY, spec.eventKey)
                putExtra(NativeAlarmScheduler.EXTRA_PRAYER, spec.prayer)
                putExtra(NativeAlarmScheduler.EXTRA_KIND, spec.kind)
                putExtra(NativeAlarmScheduler.EXTRA_AT_MILLIS, spec.atMillis)
                putExtra(NativeAlarmScheduler.EXTRA_SOUND_ID, spec.soundId)
            }
            return try {
                ContextCompat.startForegroundService(context, intent)
                true
            } catch (error: RuntimeException) {
                Log.e(TAG, "startForegroundService refused: ${error.message}")
                false
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, AdhanService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(intent)
            } catch (_: Exception) {
                context.stopService(Intent(context, AdhanService::class.java))
            }
        }
    }
}
