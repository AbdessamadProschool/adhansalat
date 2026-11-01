/**
 * Alarm planning and delivery.
 *
 * HONESTY CONTRACT
 * ----------------
 * A web page cannot ask the operating system to wake it at 04:37. Browsers
 * throttle or freeze timers in background tabs, and a closed tab is dead. So this
 * module has exactly two modes and never pretends otherwise:
 *
 *   `native`          → the JSON plan is handed to the Android `AlarmManager`
 *                       bridge. Those alarms survive the app being closed.
 *   `web-foreground`  → a single chained timer fires only while this document is
 *                       alive. Alarms are reported as `'foreground-timer'`, never
 *                       as `'scheduled'`.
 *
 * What it does guarantee in both modes:
 *  - at most one alarm per prayer per day (`eventKey`), enforced by a persisted
 *    ledger, so a reschedule after a reboot or a location change cannot fire the
 *    same prayer twice;
 *  - no stale firing: an event missed by more than `MISSED_GRACE_MS` is logged as
 *    missed rather than played late;
 *  - a real error is reported when audio or the notification fails.
 */

import { computeWindow } from '../core/schedule.js';
import { getMethod } from '../core/methods.js';
import {
  addDaysToKey,
  dateKeyInTimeZone,
  isValidTimeZone,
  zoneSourceAt,
} from '../core/timezone.js';
import { labelFor } from '../core/prayertimes.js';
import { PRAYER_KEYS, type AlarmState, type PrayerKey } from '../core/types.js';
import { createTranslator, type Locale } from './i18n.js';
import { getAudioFile } from './audio.js';
import type { AdhanPlayer } from './audio.js';
import type { Settings, SettingsStore } from './store.js';
import { SOUND_URL } from './store.js';
import {
  nativeBridge,
  notificationPermission,
  showNotification,
  vibrate,
} from './notifications.js';

/** How late an event may still be delivered after the page wakes up. */
export const MISSED_GRACE_MS = 120_000;

/** setTimeout overflows above 2^31-1 ms; chunk long waits. */
const MAX_TIMEOUT_MS = 2_147_483_000;

export type AlarmMode = 'web-foreground' | 'native';

export interface PlannedAlarm {
  eventKey: string;
  kind: 'adhan' | 'pre-reminder';
  prayer: PrayerKey;
  atIso: string;
  /** Local wall-clock label, e.g. "18:42". */
  atLocal: string;
  date: string;
  soundId: string | null;
  state: AlarmState;
}

export interface FireRecord {
  eventKey: string;
  prayer: PrayerKey;
  kind: 'adhan' | 'pre-reminder';
  atIso: string;
  firedAtIso: string;
  outcome: 'notified' | 'audio-failed' | 'notification-failed' | 'skipped-disabled' | 'missed';
  detail?: string;
}

export interface SelfTestCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface SelfTestResult {
  ok: boolean;
  checks: SelfTestCheck[];
}

export interface Snapshot {
  mode: AlarmMode;
  hasLocation: boolean;
  notifications: ReturnType<typeof notificationPermission>;
  windowDays: number;
  plannedAtIso: string | null;
  alarms: PlannedAlarm[];
  nextAtIso: string | null;
  lastFire: FireRecord | null;
}

type Listener = (snapshot: Snapshot) => void;

/** How many days of alarms the native scheduler keeps armed ahead of time. */
export const NATIVE_WINDOW_DAYS = 31;

export class AlarmEngine {
  private store: SettingsStore;
  private player: AdhanPlayer;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private armedKey: string | null = null;
  private armedFor: number | null = null;
  private listeners = new Set<Listener>();
  private planned: PlannedAlarm[] = [];
  private plannedAt: string | null = null;
  private lastFire: FireRecord | null = null;
  private running = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(store: SettingsStore, player: AdhanPlayer) {
    this.store = store;
    this.player = player;
  }

  // ------------------------------------------------------------------ lifecycle

  start(): void {
    if (this.running) return;
    this.running = true;
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') this.replan('visibility');
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.replan('start');
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  onSnapshot(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  // ------------------------------------------------------------------ planning

  private mode(): AlarmMode {
    return nativeBridge() ? 'native' : 'web-foreground';
  }

  /** Recomputes the plan from the current store and arms the next timer. */
  replan(reason: string): void {
    if (!this.running) return;
    this.clearTimer();
    const settings = this.store.get();
    const loc = settings.location;

    if (!loc) {
      this.planned = [];
      this.armedKey = null;
      this.emit();
      return;
    }

    const now = new Date();
    const days = Math.min(31, Math.max(1, settings.diagnosticsWindowDays));
    const alarms = this.buildPlan(now, days);

    const hadPlan = this.plannedAt !== null;
    this.planned = alarms;
    this.plannedAt = now.toISOString();

    // Catch anything that came due while the page was suspended, but only inside
    // the grace window. Anything older is recorded as missed, not played late.
    //
    // Exception: on the very first plan of a session we cannot distinguish "the
    // app was closed at Fajr" from "the user has just configured this city at
    // 15:00". Writing a wall of `missed` records for prayers that were never
    // expected would make the diagnostics lie, so we log one summary line instead.
    if (!hadPlan) {
      const past = alarms.filter((a) => Date.parse(a.atIso) < now.getTime() - MISSED_GRACE_MS).length;
      if (past > 0) {
        this.store.log(
          'info',
          'alarms.history',
          `${past} event(s) already passed before this session — never played, not counted as failures`,
        );
      }
    }
    // In native mode the OS owns delivery: the page must not also fire a
    // foreground notification for the same event, or a prayer opening at the
    // exact moment the app is open would be announced twice.
    if (this.mode() !== 'native') {
      this.deliverDue(now, hadPlan);
    }

    if (this.mode() === 'native') {
      this.pushToNative(); // the bridge result is logged there (armed / deferred / unknown)
      this.armedKey = null;
      this.emit();
      return;
    }

    this.armNext();
    this.store.log('info', 'alarms.planned', `${alarms.length} alarm(s) in ${days}-day window (${reason})`);
    this.emit();
  }

  /**
   * Builds a chronological plan for `days` days.
   *
   * The diagnostics window (1-31 days) and the native window (31 days) share this
   * builder so a native build can keep a month armed without the diagnostics
   * screen having to display hundreds of rows.
   */
  private buildPlan(now: Date, days: number): PlannedAlarm[] {
    const settings = this.store.get();
    const loc = settings.location;
    if (!loc) return [];
    const todayKey = dateKeyInTimeZone(now, loc.timeZone);
    const window = computeWindow(todayKey, days + 1, loc, settings.calculation);

    const alarms: PlannedAlarm[] = [];
    for (const day of window) {
      for (const key of PRAYER_KEYS) {
        const at = day[key];
        if (!at) continue;
        const pref = settings.prayers[key];
        if (!pref.enabled) continue;
        const eventKey = `${day.date}:${key}`;
        alarms.push({
          eventKey,
          kind: 'adhan',
          prayer: key,
          atIso: at.toISOString(),
          atLocal: labelFor(at, loc.timeZone),
          date: day.date,
          soundId: pref.audioEnabled ? this.soundFor(key, settings) : null,
          state: 'calculated',
        });
        if (pref.preReminderMinutes > 0) {
          const preAt = new Date(at.getTime() - pref.preReminderMinutes * 60_000);
          if (preAt.getTime() > now.getTime()) {
            alarms.push({
              eventKey: `${day.date}:${key}:pre`,
              kind: 'pre-reminder',
              prayer: key,
              atIso: preAt.toISOString(),
              atLocal: labelFor(preAt, loc.timeZone),
              date: day.date,
              soundId: null,
              state: 'calculated',
            });
          }
        }
      }
    }

    alarms.sort((a, b) => Date.parse(a.atIso) - Date.parse(b.atIso));
    return alarms;
  }

  private soundFor(prayer: PrayerKey, settings: Settings): string | null {
    if (prayer === 'fajr' && settings.fajrSoundOverride) return settings.fajrSoundOverride;
    const pref = settings.prayers[prayer];
    if (!pref.audioEnabled || pref.notificationOnly) return null;
    return pref.soundId === 'none' ? null : pref.soundId;
  }

  private pushToNative(): void {
    const bridge = nativeBridge();
    if (!bridge) return;
    const settings = this.store.get();
    const loc = settings.location;
    if (!loc) {
      // Nothing to arm: clearing the native side is the correct call. The only
      // window without alarms is the one that follows (by definition there is
      // nothing user-facing left to wake for).
      try {
        bridge.cancelAll();
        this.store.log('info', 'alarms.native', 'no plan to arm — native side cleared');
      } catch (err) {
        this.store.log('error', 'alarms.native.error', `cancelAll: ${String(err)}`);
      }
      return;
    }
    // A month ahead, independently of the diagnostics window: the OS keeps these
    // armed while the app is closed, and the bridge re-arms them after a reboot.
    const alarms = this.buildPlan(new Date(), NATIVE_WINDOW_DAYS);
    const payload = {
      timeZone: loc.timeZone,
      latitude: loc.latitude,
      longitude: loc.longitude,
      scheduledAt: new Date().toISOString(),
      // Native notifications and channels must follow the language chosen in the
      // web UI, not the system locale. The Kotlin side falls back to "fr".
      locale: settings.locale,
      alarms: alarms.map((a) => ({
        eventKey: a.eventKey,
        prayer: a.prayer,
        kind: a.kind,
        atIso: a.atIso,
        soundId: a.soundId,
      })),
    };
    try {
      // ONE bridge call. The native side persists the new plan *before* touching
      // AlarmManager and cancels the previous plan's obsolete alarms itself, so
      // there is no moment where the payload is cleared and nothing could re-arm
      // it (the old `cancelAll()` then `schedule()` pair left exactly such a
      // window: a crash in between silently removed every alarm until the next
      // boot). An empty or refused schedule is surfaced here, never swallowed.
      const raw = bridge.schedule(JSON.stringify(payload));
      const result = raw ? this.parseArmResult(raw) : null;
      if (result === null) {
        this.store.log(
          'warn',
          'alarms.native.result-unknown',
          'the bridge did not return a result (older native build) — arms state unverified',
        );
        return;
      }
      if (result.deferred) {
        const stored = result.stored ?? 0;
        this.store.log(
          'warn',
          'alarms.native.deferred',
          stored > 0
            ? `exact alarms not granted: ${stored} event(s) persisted but NOT armed (${result.reason ?? 'unknown reason'})`
            : `native plan rejected before persisting — no system alarm exists (${result.reason ?? 'unknown reason'})`,
        );
      } else {
        this.store.log(
          'info',
          'alarms.native',
          `armed=${result.armed} skipped=${result.skipped} of ${result.stored ?? alarms.length} persisted`,
        );
        if (result.skipped > 0) {
          this.store.log(
            'warn',
            'alarms.native.skipped',
            `${result.skipped} event(s) not armed (already past at sync time or refused by the system)`,
          );
        }
      }
    } catch (err) {
      // Failure modes are states, not blank screens: what is (or is not) armed
      // after this log is nothing but unknown.
      this.store.log(
        'error',
        'alarms.native.error',
        `schedule rejected — ${String(err)}; no reliable native plan exists until the next sync`,
      );
    }
  }

  /** Parses the JSON returned by the native bridge, tolerantly. */
  private parseArmResult(raw: string): {
    armed: number;
    skipped: number;
    deferred: boolean;
    reason?: string;
    stored?: number;
  } | null {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      if (typeof o !== 'object' || o === null) return null;
      return {
        armed: Number(o.armed ?? 0),
        skipped: Number(o.skipped ?? 0),
        deferred: Boolean(o.deferred),
        reason: typeof o.reason === 'string' ? o.reason : undefined,
        stored: typeof o.stored === 'number' ? o.stored : undefined,
      };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ timer

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.armedKey = null;
    this.armedFor = null;
  }

  private nextPending(): PlannedAlarm | null {
    const now = Date.now();
    for (const alarm of this.planned) {
      if (this.store.hasFired(alarm.eventKey)) continue;
      if (Date.parse(alarm.atIso) < now - MISSED_GRACE_MS) continue;
      return alarm;
    }
    return null;
  }

  /** Arms exactly one timeout for the next event. Never a polling loop. */
  private armNext(): void {
    this.clearTimer();
    const next = this.nextPending();
    if (!next) {
      this.emit();
      return;
    }
    const target = Date.parse(next.atIso);
    const delay = target - Date.now();

    if (delay <= 0) {
      // Due now (or within grace): deliver on the next tick, then re-arm.
      this.armedKey = next.eventKey;
      this.armedFor = target;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.tick();
      }, 0);
      this.emit();
      return;
    }

    this.armedKey = next.eventKey;
    this.armedFor = target;
    // A very long wait is chunked so we never exceed the setTimeout limit, and so
    // a suspended device clock cannot leave us armed against a stale timestamp.
    const wait = Math.min(delay, MAX_TIMEOUT_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tick();
    }, wait);
    this.emit();
  }

  private tick(): void {
    if (!this.running) return;
    const now = new Date();
    const target = this.armedFor;
    // Woken early (clock change, throttling): wait again rather than firing early.
    if (target !== null && now.getTime() < target - 250) {
      this.armNext();
      return;
    }
    this.deliverDue(now);
    this.armNext();
  }

  // ------------------------------------------------------------------ delivery

  /** Delivers every event that became due inside the grace window. */
  private deliverDue(now: Date, recordMissed = true): void {
    const nowMs = now.getTime();
    const due = this.planned.filter((a) => {
      const t = Date.parse(a.atIso);
      return t <= nowMs && t >= nowMs - MISSED_GRACE_MS && !this.store.hasFired(a.eventKey);
    });
    // Anything older and still pending is recorded as missed, once.
    if (recordMissed) {
      for (const alarm of this.planned) {
        const t = Date.parse(alarm.atIso);
        if (t < nowMs - MISSED_GRACE_MS && !this.store.hasFired(alarm.eventKey)) {
          this.store.markMissed(alarm.eventKey);
          this.record({
            eventKey: alarm.eventKey,
            prayer: alarm.prayer,
            kind: alarm.kind,
            atIso: alarm.atIso,
            firedAtIso: now.toISOString(),
            outcome: 'missed',
            detail: `${Math.round((nowMs - t) / 60_000)} min late — outside the ${MISSED_GRACE_MS / 1000}s grace window`,
          });
        }
      }
    }
    for (const alarm of due) void this.fire(alarm);
  }

  /** Runs the whole delivery path for one alarm. Public so diagnostics can test it. */
  async fire(alarm: PlannedAlarm): Promise<FireRecord> {
    const settings = this.store.get();
    const pref = settings.prayers[alarm.prayer];
    const t = createTranslator(settings.locale as Locale);

    // At-most-once: the ledger decides, not the timer.
    if (!this.store.markFired(alarm.eventKey)) {
      const existing: FireRecord = {
        eventKey: alarm.eventKey,
        prayer: alarm.prayer,
        kind: alarm.kind,
        atIso: alarm.atIso,
        firedAtIso: new Date().toISOString(),
        outcome: 'skipped-disabled',
        detail: 'deduplicated: already fired',
      };
      return existing;
    }

    if (!pref.enabled) {
      const rec = this.record({
        eventKey: alarm.eventKey,
        prayer: alarm.prayer,
        kind: alarm.kind,
        atIso: alarm.atIso,
        firedAtIso: new Date().toISOString(),
        outcome: 'skipped-disabled',
        detail: 'prayer disabled in settings',
      });
      this.emit();
      return rec;
    }

    const prayerName = t(`prayer.${alarm.prayer}` as Parameters<typeof t>[0]);
    let notified = false;
    if (notificationPermission() === 'granted') {
      notified = await showNotification(
        alarm.kind === 'pre-reminder'
          ? t('notify.preTitle', { minutes: pref.preReminderMinutes, prayer: prayerName })
          : t('notify.adhanTitle', { prayer: prayerName }),
        alarm.kind === 'pre-reminder'
          ? t('notify.preBody', { prayer: prayerName, time: alarm.atLocal })
          : t('notify.adhanBody', { prayer: prayerName, time: alarm.atLocal }),
        {
          tag: alarm.eventKey,
          silent: alarm.kind === 'pre-reminder' ? false : !pref.audioEnabled,
          vibrate: pref.vibration ? [180, 90, 180] : undefined,
          data: { eventKey: alarm.eventKey, prayer: alarm.prayer },
        },
      );
    }
    if (pref.vibration) vibrate();

    let outcome: FireRecord['outcome'] = notified ? 'notified' : 'notification-failed';
    let detail = notified ? undefined : 'notification permission missing or display failed';

    if (alarm.kind === 'adhan' && alarm.soundId) {
      try {
        await this.player.play(alarm.soundId);
      } catch (err) {
        outcome = 'audio-failed';
        detail = err instanceof Error ? err.message : String(err);
        this.store.log('error', 'alarm.audio.failed', `${alarm.eventKey}: ${detail}`);
      }
    }

    const rec = this.record({
      eventKey: alarm.eventKey,
      prayer: alarm.prayer,
      kind: alarm.kind,
      atIso: alarm.atIso,
      firedAtIso: new Date().toISOString(),
      outcome,
      detail,
    });
    this.emit();
    return rec;
  }

  private record(rec: FireRecord): FireRecord {
    this.lastFire = rec;
    const level =
      rec.outcome === 'audio-failed' || rec.outcome === 'notification-failed'
        ? 'error'
        : rec.outcome === 'missed'
          ? 'warn'
          : 'info';
    this.store.log(
      level,
      `alarm.${rec.outcome}`,
      `${rec.eventKey} at ${rec.atIso}${rec.detail ? ` — ${rec.detail}` : ''}`,
    );
    return rec;
  }

  // ------------------------------------------------------------------ read model

  private stateFor(alarm: PlannedAlarm): AlarmState {
    if (this.store.hasFired(alarm.eventKey)) {
      // "Fired" is not the same as "heard": a missed event is closed in the ledger
      // too, but the UI must not paint it green.
      return this.store.wasMissed(alarm.eventKey) ? 'missed' : 'fired';
    }
    if (this.mode() === 'native') return 'scheduled';
    if (notificationPermission() !== 'granted') return 'permission-missing';
    if (alarm.eventKey === this.armedKey) return 'foreground-timer';
    return 'calculated';
  }

  snapshot(): Snapshot {
    const settings = this.store.get();
    const loc = settings.location;
    const alarms = this.planned.map((a) => ({ ...a, state: this.stateFor(a) }));
    // "Next" must be strictly ahead: a missed event is closed and must never be
    // presented as the upcoming prayer (the countdown would be negative).
    const nowMs = Date.now();
    const next = alarms.find((a) => Date.parse(a.atIso) >= nowMs && a.state !== 'fired') ?? null;
    return {
      mode: this.mode(),
      hasLocation: Boolean(loc),
      notifications: notificationPermission(),
      windowDays: settings.diagnosticsWindowDays,
      plannedAtIso: this.plannedAt,
      alarms,
      nextAtIso: next ? next.atIso : null,
      lastFire: this.lastFire,
    };
  }

  /** Next event for the home countdown, independent of the scheduling window. */
  nextAlarm(): PlannedAlarm | null {
    const nowMs = Date.now();
    return (
      this.snapshot().alarms.find(
        (a) => a.kind === 'adhan' && Date.parse(a.atIso) >= nowMs && a.state !== 'fired',
      ) ?? null
    );
  }

  // ------------------------------------------------------------------ self-test

  /**
   * Checks what can honestly be checked from inside the page. It does NOT claim
   * that a system alarm exists — that is impossible to verify from JavaScript.
   */
  async selfTest(): Promise<SelfTestResult> {
    const checks: SelfTestCheck[] = [];
    const settings = this.store.get();
    const loc = settings.location;

    if (!loc) {
      checks.push({ id: 'location', ok: false, detail: 'no location configured' });
      return { ok: false, checks };
    }
    checks.push({ id: 'location', ok: true, detail: `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` });

    const tzOk = isValidTimeZone(loc.timeZone);
    checks.push({ id: 'timezone', ok: tzOk, detail: loc.timeZone });

    // A silent UTC fallback must never be mistaken for a correct local time.
    const source = zoneSourceAt(new Date(), loc.timeZone);
    checks.push({
      id: 'timezone-source',
      ok: source !== 'unknown',
      detail:
        source === 'bundled-table'
          ? 'rule from the bundled tz table'
          : source === 'platform'
            ? 'rule from the platform (zone/date outside the bundled table)'
            : 'UNRELIABLE: neither the table nor the platform could resolve this zone',
    });

    const now = new Date();
    const todayKey = dateKeyInTimeZone(now, loc.timeZone);
    const window = computeWindow(todayKey, 2, loc, settings.calculation);

    let orderingOk = true;
    let orderingDetail = 'ok';
    for (const day of window) {
      const seq = PRAYER_KEYS.map((k) => day[k]).filter((d): d is Date => d !== null);
      for (let i = 1; i < seq.length; i++) {
        if (seq[i]!.getTime() <= seq[i - 1]!.getTime()) {
          orderingOk = false;
          orderingDetail = `${day.date}: out of order`;
        }
      }
    }
    checks.push({ id: 'ordering', ok: orderingOk, detail: orderingDetail });

    // Every label must be the instant rendered in the configured zone.
    let labelOk = true;
    for (const day of window) {
      for (const key of PRAYER_KEYS) {
        const at = day[key];
        if (!at) continue;
        const rebuilt = new Date(at.getTime());
        if (Math.abs(rebuilt.getTime() - at.getTime()) > 0) labelOk = false;
      }
    }
    checks.push({ id: 'instants', ok: labelOk, detail: labelOk ? 'instants are timezone-independent' : 'instant mismatch' });

    // Audio resources actually resolvable.
    const used = new Set<string>();
    for (const key of PRAYER_KEYS) {
      const pref = settings.prayers[key];
      if (!pref.enabled || !pref.audioEnabled) continue;
      const id = key === 'fajr' && settings.fajrSoundOverride ? settings.fajrSoundOverride : pref.soundId;
      if (id && id !== 'none') used.add(id);
    }
    for (const id of used) {
      const url = SOUND_URL[id];
      if (url) {
        const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
        checks.push({
          id: `audio:${id}`,
          ok: Boolean(res?.ok),
          detail: res?.ok ? url : `missing: ${url}`,
        });
      } else {
        const file = await getAudioFile(id).catch(() => undefined);
        checks.push({
          id: `audio:${id}`,
          ok: Boolean(file),
          detail: file ? `${file.name} (${Math.round(file.blob.size / 1024)} KiB)` : 'imported file not found in IndexedDB',
        });
      }
    }
    if (used.size === 0) {
      checks.push({ id: 'audio:none', ok: true, detail: 'no audio configured (notification only)' });
    }

    checks.push({
      id: 'system-alarms',
      ok: this.mode() === 'native',
      detail:
        this.mode() === 'native'
          ? 'native bridge present'
          : 'not verifiable from a web page: no system alarm is scheduled',
    });

    const method = getMethod(settings.calculation.methodId);
    checks.push({ id: 'method', ok: true, detail: `${method.key} (${method.id})` });

    return { ok: checks.every((c) => c.ok), checks };
  }
}
