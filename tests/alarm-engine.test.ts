/**
 * Delivery tests for the alarm engine.
 *
 * These run the real `AlarmEngine` and the real `SettingsStore` ledger; only the
 * browser APIs it touches (`window`, `document`, notifications) and the audio
 * player are replaced. What is asserted is therefore the actual control flow:
 *
 *  - a due event is delivered once and only once, even after a simulated restart;
 *  - an event that came due while nothing was listening is recorded as *missed*
 *    and is never played late;
 *  - the first plan of a session does not invent missed events for the past;
 *  - in native mode the JS timer is never used and a full 31-day plan is pushed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmEngine, MISSED_GRACE_MS, NATIVE_WINDOW_DAYS } from '../src/app/alarm-engine.js';
import { DEFAULT_SOUND_ID } from '../src/app/audio-catalog.js';
import { SettingsStore } from '../src/app/store.js';
import type { AdhanPlayer } from '../src/app/audio.js';
import type { GeoLocation } from '../src/core/types.js';

const CASABLANCA: GeoLocation = {
  latitude: 33.5731,
  longitude: -7.5898,
  timeZone: 'Africa/Casablanca',
  countryCode: 'MA',
  cityName: 'Casablanca',
  source: 'manual-city',
  determinedAt: 0,
};

const visibilityListeners = new Map<string, () => void>();

function installBrowserStubs(native?: Record<string, unknown>): void {
  (globalThis as unknown as { window: unknown }).window = native ? { AzanNative: native } : {};
  (globalThis as unknown as { document: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: () => void) => {
      visibilityListeners.set(type, fn);
    },
    removeEventListener: (type: string) => {
      visibilityListeners.delete(type);
    },
  };
}

/** Drains the microtasks of `void this.fire(...)`; no fake timer is advanced. */
async function flush(): Promise<void> {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

function fakePlayer(): { player: AdhanPlayer; calls: string[] } {
  const calls: string[] = [];
  const player = {
    currentId: null,
    onChange: () => () => {},
    play: async (id: string) => {
      calls.push(id);
    },
    stop: () => {},
    preview: async (id: string) => {
      calls.push(id);
    },
    dispose: () => {},
  } as unknown as AdhanPlayer;
  return { player, calls };
}

function newStore(): SettingsStore {
  const store = new SettingsStore();
  store.update((draft) => {
    draft.location = CASABLANCA;
    draft.onboarded = true;
  });
  return store;
}

describe('alarm engine', () => {
  let engine: AlarmEngine | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T00:00:00Z'));
    installBrowserStubs();
  });

  afterEach(() => {
    engine?.stop();
    engine = null;
    vi.useRealTimers();
    visibilityListeners.clear();
  });

  it('delivers a due prayer exactly once and marks it fired', async () => {
    const store = newStore();
    const { player, calls } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    expect(engine.snapshot().mode).toBe('web-foreground');
    const fajr = engine
      .snapshot()
      .alarms.find((a) => a.prayer === 'fajr' && a.kind === 'adhan');
    expect(fajr).toBeDefined();

    vi.setSystemTime(new Date(Date.parse(fajr!.atIso) + 20_000));
    engine.replan('test');
    await flush();

    expect(calls).toEqual([DEFAULT_SOUND_ID]);
    expect(store.hasFired(fajr!.eventKey)).toBe(true);
    expect(store.wasMissed(fajr!.eventKey)).toBe(false);

    const fired = engine.snapshot().alarms.find((a) => a.eventKey === fajr!.eventKey);
    expect(fired?.state).toBe('fired');

    // A second plan (settings change, visibility, reschedule) must not replay it.
    engine.replan('again');
    await flush();
    expect(calls).toHaveLength(1);

    // The persisted ledger, not the timer, is what guarantees this: a brand new
    // engine over the same store (i.e. after a restart) stays silent too.
    engine.stop();
    const restarted = new AlarmEngine(store, player);
    engine = restarted;
    restarted.start();
    restarted.replan('restart');
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('records a late event as missed and never plays it', async () => {
    const store = newStore();
    const { player, calls } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    const fajr = engine
      .snapshot()
      .alarms.find((a) => a.prayer === 'fajr' && a.kind === 'adhan')!;

    // Five minutes late: well outside the 120 s grace window.
    vi.setSystemTime(new Date(Date.parse(fajr.atIso) + 5 * 60_000));
    engine.replan('wake-up');
    await flush();

    expect(calls).toEqual([]);
    expect(store.wasMissed(fajr.eventKey)).toBe(true);
    const state = engine.snapshot().alarms.find((a) => a.eventKey === fajr.eventKey);
    expect(state?.state).toBe('missed');
    expect(engine.snapshot().lastFire?.outcome).toBe('missed');

    // "Next" must move on to a prayer that is still ahead: a missed event is
    // closed, and the home countdown must never point at it.
    const nextAt = engine.snapshot().nextAtIso;
    expect(nextAt).not.toBe(fajr.atIso);
    expect(Date.parse(nextAt!)).toBeGreaterThan(Date.now());
  });

  it('does not back-fill missed events on the first plan of a session', async () => {
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
    const store = newStore();
    const { player, calls } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();
    await flush();

    expect(calls).toEqual([]);
    expect(store.get().missedKeys).toEqual([]);
    expect(engine.snapshot().lastFire).toBeNull();
    expect(store.get().log.some((e) => e.event === 'alarms.history')).toBe(true);
  });

  it('fires inside the grace window but not one second beyond it', async () => {
    const store = newStore();
    const first = fakePlayer();
    engine = new AlarmEngine(store, first.player);
    engine.start();
    const fajr = engine
      .snapshot()
      .alarms.find((a) => a.prayer === 'fajr' && a.kind === 'adhan')!;

    vi.setSystemTime(new Date(Date.parse(fajr.atIso) + MISSED_GRACE_MS - 1_000));
    engine.replan('inside-grace');
    await flush();
    expect(first.calls).toEqual([DEFAULT_SOUND_ID]);
    expect(store.wasMissed(fajr.eventKey)).toBe(false);

    // Same prayer, a fresh installation, one second past the window.
    engine.stop();
    vi.setSystemTime(new Date('2026-06-21T00:00:00Z'));
    const lateStore = newStore();
    const second = fakePlayer();
    engine = new AlarmEngine(lateStore, second.player);
    engine.start();
    const lateFajr = engine
      .snapshot()
      .alarms.find((a) => a.prayer === 'fajr' && a.kind === 'adhan')!;

    vi.setSystemTime(new Date(Date.parse(lateFajr.atIso) + MISSED_GRACE_MS + 1_000));
    engine.replan('outside-grace');
    await flush();
    expect(second.calls).toEqual([]);
    expect(lateStore.wasMissed(lateFajr.eventKey)).toBe(true);
  });

  it('pushes a 31-day plan to the native bridge in a single atomic call', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    installBrowserStubs({
      schedule: (raw: string) => {
        calls.push('schedule');
        payloads.push(JSON.parse(raw) as Record<string, unknown>);
        return JSON.stringify({ armed: 31, skipped: 0, deferred: false, reason: null, stored: 31 });
      },
      cancelAll: () => {
        calls.push('cancelAll');
      },
      notificationPermission: () => 'granted',
      platform: () => 'test',
    });

    const store = newStore();
    const { player, calls: audio } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    expect(engine.snapshot().mode).toBe('native');
    // The obsolete `cancelAll()` + `schedule()` pair left a window where the plan
    // was cleared and nothing could re-arm it. One bridge call now owns the whole
    // transition; the Kotlin side reconciles the previous plan.
    expect(calls).toEqual(['schedule']);
    expect(payloads).toHaveLength(1);
    expect(store.get().log.some((e) => e.event === 'alarms.native' && e.detail?.includes('armed=31'))).toBe(true);

    const payload = payloads[0] as {
      timeZone: string;
      locale: string;
      alarms: Array<{ eventKey: string; atIso: string }>;
    };
    expect(payload.timeZone).toBe('Africa/Casablanca');
    // The native shell localizes channels and notifications with this value; if
    // it is missing, Android silently falls back to French.
    expect(payload.locale).toBe(store.get().locale);
    // The plan reaches one day further than the window (computeWindow is inclusive
    // of the current day), so allow that boundary instead of pinning an off-by-one.
    // Alarms include both Adhan and pre-reminders (up to 10 alarms per day).
    expect(payload.alarms.length).toBeGreaterThanOrEqual(NATIVE_WINDOW_DAYS * 5);
    expect(payload.alarms.length).toBeLessThanOrEqual((NATIVE_WINDOW_DAYS + 1) * 10);
    for (const alarm of payload.alarms) {
      expect(Number.isFinite(Date.parse(alarm.atIso))).toBe(true);
    }

    // A prayer becoming due while the app is open must not be announced by the
    // page as well: the OS owns delivery in native mode.
    const fajr = payload.alarms.find((a) => a.eventKey.endsWith(':fajr'))!;
    vi.setSystemTime(new Date(Date.parse(fajr.atIso) + 5_000));
    engine.replan('native-due');
    await flush();
    expect(audio).toEqual([]);
  });

  it('records a deferred native result as a warning, never as success', () => {
    installBrowserStubs({
      schedule: () =>
        JSON.stringify({
          armed: 0,
          skipped: 0,
          deferred: true,
          reason: 'exact-alarms-denied',
          stored: 155,
        }),
      cancelAll: () => {},
      notificationPermission: () => 'granted',
    });
    const store = newStore();
    const { player } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    const entry = store.get().log.find((e) => e.event === 'alarms.native.deferred');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('warn');
    expect(entry?.detail).toContain('NOT armed');
    expect(entry?.detail).toContain('exact-alarms-denied');
  });

  it('does not claim a plan was persisted when the native side rejected it outright', () => {
    installBrowserStubs({
      schedule: () =>
        JSON.stringify({
          armed: 0,
          skipped: 0,
          deferred: true,
          reason: 'schedule-rejected: payload.alarms is required',
          stored: 0,
        }),
      cancelAll: () => {},
      notificationPermission: () => 'granted',
    });
    const store = newStore();
    const { player } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    const entry = store.get().log.find((e) => e.event === 'alarms.native.deferred');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('warn');
    expect(entry?.detail).toContain('rejected before persisting');
    expect(entry?.detail).not.toContain('persisted but NOT armed');
  });

  it('marks the native arm state unknown when the bridge returns no result', () => {
    installBrowserStubs({
      schedule: () => undefined,
      cancelAll: () => {},
      notificationPermission: () => 'granted',
    });
    const store = newStore();
    const { player } = fakePlayer();
    engine = new AlarmEngine(store, player);
    engine.start();

    const entry = store.get().log.find((e) => e.event === 'alarms.native.result-unknown');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('warn');
  });
});
