/**
 * Changing the city must change both the displayed times and the alarm plan.
 *
 * These tests cover the whole chain — store update, schedule rebuild, engine
 * replan — because the most dangerous bug in a prayer app is a plan that still
 * points at the previous city after the user moved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSchedule } from '../src/core/schedule.js';
import { defaultCalculation, SettingsStore } from '../src/app/store.js';
import { AlarmEngine } from '../src/app/alarm-engine.js';
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

const PARIS: GeoLocation = {
  latitude: 48.8566,
  longitude: 2.3522,
  timeZone: 'Europe/Paris',
  countryCode: 'FR',
  cityName: 'Paris',
  source: 'manual-city',
  determinedAt: 0,
};

const memory = new Map<string, string>();

function installBrowserStubs(): void {
  (globalThis as unknown as { window: unknown }).window = {};
  (globalThis as unknown as { document: unknown }).document = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  };
}

function fakePlayer(): AdhanPlayer {
  return {
    currentId: null,
    onChange: () => () => {},
    play: async () => {},
    stop: () => {},
    preview: async () => {},
    dispose: () => {},
  } as unknown as AdhanPlayer;
}

describe('location change', () => {
  let engine: AlarmEngine | null = null;

  beforeEach(() => {
    memory.clear();
    installBrowserStubs();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T10:00:00Z'));
  });

  afterEach(() => {
    engine?.stop();
    engine = null;
    vi.useRealTimers();
    memory.clear();
  });

  it('recomputes the schedule for the new coordinates and zone', () => {
    const settings = defaultCalculation('MA');
    const now = new Date('2026-06-21T10:00:00Z');
    const before = buildSchedule(now, CASABLANCA, settings);
    const after = buildSchedule(now, PARIS, settings);

    expect(before.times.timeZone).toBe('Africa/Casablanca');
    expect(after.times.timeZone).toBe('Europe/Paris');
    expect(before.times.fajr).not.toBeNull();
    expect(after.times.fajr).not.toBeNull();

    const diffMinutes =
      Math.abs(before.times.fajr!.getTime() - after.times.fajr!.getTime()) / 60_000;
    // Same date, same method, ~15° of latitude and ~10° of longitude apart:
    // a silent no-op would give zero, a timezone-only bug would give ~60.
    expect(diffMinutes).toBeGreaterThan(30);
    expect(diffMinutes).toBeLessThan(600);
  });

  it('rebuilds the alarm plan when the city changes', () => {
    const store = new SettingsStore();
    store.update((draft) => {
      draft.location = CASABLANCA;
      draft.onboarded = true;
    });

    engine = new AlarmEngine(store, fakePlayer());
    engine.start();
    const before = engine.snapshot();
    const beforeFajr = before.alarms.find((alarm) => alarm.prayer === 'fajr');

    // Mirrors main.ts: any settings change invalidates the whole plan.
    store.subscribe(() => engine!.replan('location'));

    store.update((draft) => {
      draft.location = PARIS;
    });

    const after = engine.snapshot();
    expect(store.get().location?.cityName).toBe('Paris');
    expect(after.alarms.length).toBeGreaterThan(0);
    const afterFajr = after.alarms.find((alarm) => alarm.prayer === 'fajr');
    expect(beforeFajr).toBeDefined();
    expect(afterFajr).toBeDefined();
    expect(afterFajr!.atIso).not.toBe(beforeFajr!.atIso);

    const shiftMinutes =
      Math.abs(Date.parse(afterFajr!.atIso) - Date.parse(beforeFajr!.atIso)) / 60_000;
    expect(shiftMinutes).toBeGreaterThan(30);
  });

  it('does not replay an alarm already fired when the city changes', async () => {
    const store = new SettingsStore();
    store.update((draft) => {
      draft.location = CASABLANCA;
      draft.onboarded = true;
    });
    engine = new AlarmEngine(store, fakePlayer());
    engine.start();

    const first = engine.snapshot().alarms[0];
    expect(first).toBeDefined();
    vi.setSystemTime(new Date(Date.parse(first!.atIso) + 2_000));
    engine.replan('due');
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
    expect(store.hasFired(first!.eventKey)).toBe(true);

    store.update((draft) => {
      draft.location = PARIS;
    });
    engine.replan('location');

    const fired = engine.snapshot().alarms.find((alarm) => alarm.eventKey === first!.eventKey);
    expect(fired === undefined || fired.state === 'fired').toBe(true);
  });
});
