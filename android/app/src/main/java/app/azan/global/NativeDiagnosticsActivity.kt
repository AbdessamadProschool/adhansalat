package app.azan.global

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

/**
 * Native diagnostics: the only screen that can show what the OS really has armed.
 *
 * A web page cannot list `AlarmManager` entries, read `canScheduleExactAlarms()` or
 * prove that a process was woken while the screen was locked. This screen does all
 * three, and it never shows a green state it has not read from the system.
 */
class NativeDiagnosticsActivity : ComponentActivity() {

    override fun attachBaseContext(newBase: android.content.Context) {
        super.attachBaseContext(LocaleHelper.wrap(newBase, ScheduleStore.readLocale(newBase)))
    }

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AzanTheme {
                var refresh by remember { mutableIntStateOf(0) }
                var playing by remember { mutableIntStateOf(if (AdhanService.playing) 1 else 0) }

                val context = this
                val store = remember { ScheduleStore(context) }
                val exact = NativeAlarmScheduler.canScheduleExactAlarms(context)
                val notificationsOn = Notifications.areNotificationsEnabled(context)
                val batteryExempt = (getSystemService(android.os.PowerManager::class.java))
                    ?.isIgnoringBatteryOptimizations(packageName) ?: false
                val lastResult = remember(refresh) { store.lastResult() }
                val lastSync = remember(refresh) { store.lastSync() }
                val lastSyncSource = remember(refresh) { store.lastSyncSource() }
                val importedSounds = remember(refresh) { CustomSounds.list(context) }
                val payload = remember(refresh) { store.payload() }
                val upcoming = remember(refresh) { NativeAlarmScheduler.upcoming(context, 10) }
                val upcomingCount = remember(refresh) { NativeAlarmScheduler.upcomingCount(context) }

                Scaffold(
                    containerColor = MaterialTheme.colorScheme.background,
                    topBar = {
                        TopAppBar(
                            title = { Text(stringResource(R.string.native_diagnostics_title)) },
                            colors = TopAppBarDefaults.topAppBarColors(
                                containerColor = MaterialTheme.colorScheme.primary,
                                titleContentColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                            actions = {
                                TextButton(onClick = { refresh++ }) {
                                    Text(
                                        stringResource(R.string.diag_refresh),
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                }
                            },
                        )
                    },
                ) { padding ->
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(padding),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item {
                            Text(
                                stringResource(R.string.native_diagnostics_subtitle),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        item {
                            StatusCard(
                                title = stringResource(R.string.diag_exact_title),
                                body = stringResource(
                                    if (exact) R.string.diag_exact_ok else R.string.diag_exact_missing,
                                ),
                                ok = exact,
                                action = if (!exact) {
                                    {
                                        startActivity(
                                            Intent(
                                                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                                android.net.Uri.parse("package:$packageName"),
                                            ),
                                        )
                                    }
                                } else {
                                    null
                                },
                                actionLabel = if (!exact) stringResource(R.string.diag_grant) else null,
                            )
                        }

                        item {
                            StatusCard(
                                title = stringResource(R.string.diag_notif_title),
                                body = stringResource(
                                    if (notificationsOn) R.string.diag_notif_ok
                                    else R.string.diag_notif_missing,
                                ),
                                ok = notificationsOn,
                                action = if (!notificationsOn) {
                                    {
                                        startActivity(
                                            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                                        )
                                    }
                                } else {
                                    null
                                },
                                actionLabel = if (!notificationsOn) {
                                    stringResource(R.string.diag_open_settings)
                                } else {
                                    null
                                },
                            )
                        }

                        item {
                            StatusCard(
                                title = stringResource(R.string.diag_battery_title),
                                body = stringResource(
                                    if (batteryExempt) R.string.diag_battery_ok
                                    else R.string.diag_battery_missing,
                                ),
                                ok = batteryExempt,
                                action = if (!batteryExempt) {
                                    {
                                        try {
                                            startActivity(
                                                Intent(
                                                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                                    android.net.Uri.parse("package:$packageName"),
                                                ),
                                            )
                                        } catch (_: Exception) {
                                            startActivity(
                                                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                                            )
                                        }
                                    }
                                } else {
                                    null
                                },
                                actionLabel = if (!batteryExempt) {
                                    stringResource(R.string.diag_open_settings)
                                } else {
                                    null
                                },
                            )
                        }

                        item {
                            SectionCard(title = stringResource(R.string.diag_armed_title)) {
                                val total = payload?.alarms?.size ?: 0
                                if (total == 0) {
                                    Text(
                                        stringResource(R.string.diag_armed_none),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                } else {
                                    Text(
                                        stringResource(R.string.diag_armed_count, upcomingCount, total),
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    for (spec in upcoming) {
                                        val zone = payload?.timeZone ?: "UTC"
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Text(
                                                Notifications.prayerLabel(context, spec.prayer) +
                                                    if (spec.isAdhan) "" else " · −",
                                                style = MaterialTheme.typography.bodyMedium,
                                                fontWeight = FontWeight.Medium,
                                            )
                                            Text(
                                                Notifications.clock(spec.atMillis, zone),
                                                style = MaterialTheme.typography.bodyMedium,
                                            )
                                        }
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    stringResource(R.string.diag_window_note),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        item {
                            SectionCard(title = stringResource(R.string.diag_last_title)) {
                                if (lastResult == null) {
                                    Text(
                                        stringResource(R.string.diag_last_none),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                } else {
                                    val zone = payload?.timeZone ?: "UTC"
                                    Text(
                                        "${Notifications.prayerLabel(context, lastResult.prayer)} · " +
                                            Notifications.clock(lastResult.firedAtMillis, zone),
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    Text(
                                        buildString {
                                            append(lastResult.outcome)
                                            lastResult.detail?.let { append(" · ").append(it) }
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        item {
                            SectionCard(title = stringResource(R.string.diag_sync_title)) {
                                val sync: JSONObject? = lastSync
                                if (sync == null) {
                                    Text(
                                        stringResource(R.string.diag_sync_none),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                } else {
                                    val armed = sync.optInt("armed", 0)
                                    val skipped = sync.optInt("skipped", 0)
                                    val stored = sync.optInt("stored", armed + skipped)
                                    val deferred = sync.optBoolean("deferred", false)
                                    val reason = sync.optString("reason")
                                    val source = lastSyncSource ?: "?"
                                    Text(
                                        if (deferred) {
                                            stringResource(
                                                R.string.diag_sync_deferred,
                                                source,
                                                reason,
                                                stored,
                                            )
                                        } else {
                                            stringResource(
                                                R.string.diag_sync_body,
                                                source,
                                                armed,
                                                skipped,
                                                stored,
                                            )
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (deferred) {
                                            MaterialTheme.colorScheme.error
                                        } else {
                                            MaterialTheme.colorScheme.onSurface
                                        },
                                    )
                                }
                            }
                        }

                        item {
                            SectionCard(title = stringResource(R.string.diag_sounds_title)) {
                                if (importedSounds.length() == 0) {
                                    Text(
                                        stringResource(R.string.diag_sounds_none),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                } else {
                                    for (index in 0 until importedSounds.length()) {
                                        val sound = importedSounds.optJSONObject(index) ?: continue
                                        Text(
                                            stringResource(
                                                R.string.diag_sounds_item,
                                                sound.optString("name", sound.optString("id")),
                                                sound.optLong("bytes", 0L) / 1024L,
                                            ),
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }
                                }
                            }
                        }

                        item {
                            SectionCard(title = stringResource(R.string.diag_test_title)) {
                                Text(
                                    stringResource(R.string.diag_test_hint),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(8.dp))
                                Button(
                                    onClick = {
                                        val result = NativeAlarmScheduler.scheduleTest(context, 20)
                                        val message = when {
                                            result.deferred || result.armed == 0 ->
                                                getString(R.string.diag_test_blocked)
                                            else -> getString(R.string.diag_test_scheduled)
                                        }
                                        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                                    },
                                ) {
                                    Text(stringResource(R.string.diag_test_button))
                                }
                                if (playing == 1) {
                                    Spacer(Modifier.height(8.dp))
                                    OutlinedButton(onClick = {
                                        AdhanService.stop(context)
                                        playing = 0
                                    }) {
                                        Text(stringResource(R.string.diag_stop_audio))
                                    }
                                } else {
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        stringResource(R.string.diag_stop_audio_idle),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        item {
                            Text(
                                stringResource(R.string.diag_sound_note),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        item {
                            OutlinedButton(
                                onClick = { finish() },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(stringResource(R.string.diag_close))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusCard(
    title: String,
    body: String,
    ok: Boolean,
    action: (() -> Unit)?,
    actionLabel: String?,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (ok) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium)
            if (action != null && actionLabel != null) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = action) { Text(actionLabel) }
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(6.dp))
            content()
        }
    }
}
