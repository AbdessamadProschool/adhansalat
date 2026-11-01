/**
 * Turns computed prayer times into a chronological event list, which is what
 * both the UI countdown and the alarm scheduler consume.
 *
 * The same `eventKey` (`YYYY-MM-DD:fajr`) is used by the alarm layer as its
 * de-duplication key, so a re-schedule after a reboot cannot fire twice.
 */

import { calculatePrayerTimes, labelFor, type EngineLocation } from './prayertimes.js';
import { addDaysToKey, dateKeyInTimeZone } from './timezone.js';
import type {
  CalculationSettings,
  DaySchedule,
  PrayerEvent,
  PrayerKey,
  PrayerTimes,
} from './types.js';
import { PRAYER_KEYS } from './types.js';

export function eventKeyFor(dateKey: string, prayer: PrayerKey): string {
  return `${dateKey}:${prayer}`;
}

export function buildDayEvents(times: PrayerTimes): PrayerEvent[] {
  const events: PrayerEvent[] = [];
  for (const prayer of PRAYER_KEYS) {
    const at = times[prayer];
    if (!at) continue;
    events.push({
      prayer,
      at,
      label: labelFor(at, times.timeZone),
      date: times.date,
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return events;
}

/** Prayer windows: a prayer is "current" between its time and the next one. */
export function findNext(
  events: PrayerEvent[],
  now: Date,
): { next: PrayerEvent | null; current: PrayerEvent | null; index: number } {
  const nowMs = now.getTime();
  let index = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e && e.at.getTime() > nowMs) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return { next: null, current: events.length > 0 ? events[events.length - 1] ?? null : null, index: -1 };
  }
  return {
    next: events[index] ?? null,
    current: index > 0 ? events[index - 1] ?? null : null,
    index,
  };
}

/**
 * Builds the schedule for `now`, fetching tomorrow's Fajr so the countdown keeps
 * working after Isha instead of showing "no next prayer".
 */
export function buildSchedule(
  now: Date,
  loc: EngineLocation,
  settings: CalculationSettings,
): DaySchedule {
  const todayKey = dateKeyInTimeZone(now, loc.timeZone);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const today = calculatePrayerTimes(todayKey, loc, settings);
  const tomorrow = calculatePrayerTimes(tomorrowKey, loc, settings);

  const events = [...buildDayEvents(today), ...buildDayEvents(tomorrow)].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const { next, current } = findNext(events, now);
  return { times: today, events, next, current };
}

/** A multi-day window, used by the calendar and the alarm scheduler. */
export function computeWindow(
  startDateKey: string,
  days: number,
  loc: EngineLocation,
  settings: CalculationSettings,
): PrayerTimes[] {
  const out: PrayerTimes[] = [];
  for (let i = 0; i < days; i++) {
    out.push(calculatePrayerTimes(addDaysToKey(startDateKey, i), loc, settings));
  }
  return out;
}

/** All prayer instants in the window at or after `now`, in chronological order. */
export function upcomingEvents(
  window: PrayerTimes[],
  now: Date,
): PrayerEvent[] {
  const nowMs = now.getTime();
  return window
    .flatMap(buildDayEvents)
    .filter((e) => e.at.getTime() > nowMs)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface Countdown {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export function countdownTo(target: Date, now: Date): Countdown {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}
