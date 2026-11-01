/**
 * Time-zone utilities.
 *
 * The engine never derives a zone from a UTC offset: political time zones have
 * DST rules, historical changes and several offsets inside one country. We only
 * ever use IANA identifiers.
 *
 * Resolving an identifier to an offset does **not** trust the host: the bundled
 * transition table (`tzdata.ts`) is consulted first, because some operating
 * systems ship stale rules (Windows still applies the pre-2018 Morocco rule).
 * The platform is only a fallback for zones or dates the table does not cover,
 * and the diagnostics screen reports when the two disagree.
 */

import { bundledOffsetMinutes } from './tzdata.js';

const partsCache = new Map<string, Intl.DateTimeFormat>();
const utcFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function toMs(instant: Date | number): number {
  return typeof instant === 'number' ? instant : instant.getTime();
}

/** Offset straight from the platform, ignoring the bundled table. Diagnostics only. */
export function osOffsetMinutesAt(instant: Date | number, timeZone: string): number | null {
  const ms = toMs(instant);
  try {
    const parts = formatterFor(timeZone).formatToParts(new Date(ms));
    const bag: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') bag[p.type] = Number(p.value);
    }
    const asUtc = Date.UTC(
      bag.year ?? 1970,
      (bag.month ?? 1) - 1,
      bag.day ?? 1,
      bag.hour === 24 ? 0 : (bag.hour ?? 0),
      bag.minute ?? 0,
      bag.second ?? 0,
    );
    // formatToParts drops milliseconds; align to the second before subtracting.
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
  } catch {
    return null;
  }
}

/** Offset of the zone at that instant, in minutes east of UTC. */
export function offsetMinutesAt(instant: Date | number, timeZone: string): number {
  const ms = toMs(instant);
  const bundled = bundledOffsetMinutes(timeZone, ms);
  if (bundled !== null) return bundled;
  return osOffsetMinutesAt(ms, timeZone) ?? 0;
}

/** Where the offset for this instant actually came from. */
export type ZoneSource = 'bundled-table' | 'platform' | 'unknown';

/**
 * Provenance of the offset used by `offsetMinutesAt` for this instant.
 *
 * - `bundled-table`: the generated transition table answered (the normal case
 *   inside 2018 → 2045 for a known zone);
 * - `platform`: the host OS supplied the offset (zone unknown to the table, or
 *   an instant outside its range);
 * - `unknown`: even the platform failed, so `offsetMinutesAt` returns UTC by
 *   fallback. Any alarm scheduled from such a configuration must be reported
 *   as unreliable instead of being presented as correct.
 */
export function zoneSourceAt(instant: Date | number, timeZone: string): ZoneSource {
  const ms = toMs(instant);
  if (bundledOffsetMinutes(timeZone, ms) !== null) return 'bundled-table';
  if (osOffsetMinutesAt(ms, timeZone) !== null) return 'platform';
  return 'unknown';
}

/** True when the offset for this instant is trustworthy (never a silent UTC). */
export function zoneIsReliable(instant: Date | number, timeZone: string): boolean {
  return zoneSourceAt(instant, timeZone) !== 'unknown';
}

/** The instant's wall-clock fields in `timeZone`, independent of the host rules. */
export function partsInTimeZone(instant: Date | number, timeZone: string): ZonedParts {
  const ms = toMs(instant);
  const shifted = new Date(ms + offsetMinutesAt(ms, timeZone) * 60_000);
  const bag: Record<string, number> = {};
  for (const p of utcFormatter.formatToParts(shifted)) {
    if (p.type !== 'literal') bag[p.type] = Number(p.value);
  }
  return {
    year: bag.year ?? 1970,
    month: bag.month ?? 1,
    day: bag.day ?? 1,
    hour: bag.hour === 24 ? 0 : (bag.hour ?? 0),
    minute: bag.minute ?? 0,
    second: bag.second ?? 0,
  };
}

/** "YYYY-MM-DD" for the instant as seen in `timeZone`. */
export function dateKeyInTimeZone(instant: Date | number, timeZone: string): string {
  const p = partsInTimeZone(instant, timeZone);
  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "HH:MM" 24h wall clock for the instant as seen in `timeZone`. */
export function timeKeyInTimeZone(instant: Date | number, timeZone: string): string {
  const p = partsInTimeZone(instant, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Formats an instant as wall-clock time in `timeZone` without letting the host
 * reinterpret the zone: the instant is shifted by the table offset and rendered
 * as UTC. This is what every time on screen goes through.
 */
export function formatInZone(
  instant: Date | number,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const ms = toMs(instant);
  const shifted = new Date(ms + offsetMinutesAt(ms, timeZone) * 60_000);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(shifted);
}

/** Structured variant of `formatInZone`, for callers that need named fields. */
export function partsInZone(
  instant: Date | number,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatPart[] {
  const ms = toMs(instant);
  const shifted = new Date(ms + offsetMinutesAt(ms, timeZone) * 60_000);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(shifted);
}

/**
 * Converts a wall-clock time in `timeZone` to an absolute instant.
 * Two passes are enough to settle on the correct offset on DST boundaries.
 * A non-existent local time (spring-forward gap) resolves to the instant that
 * the clock jumps to, which is the least surprising behaviour for a user who
 * picked such a time by hand.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = target - offsetMinutesAt(target, timeZone) * 60_000;
  ts = target - offsetMinutesAt(ts, timeZone) * 60_000;
  return new Date(ts);
}

/** Parses "YYYY-MM-DD" without going through the (UTC) Date string parser. */
export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`Invalid date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatDateKey(d: { year: number; month: number; day: number }): string {
  return `${pad4(d.year)}-${pad2(d.month)}-${pad2(d.day)}`;
}

export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Local "today" in the given zone. */
export function todayKeyIn(timeZone: string, now: Date = new Date()): string {
  return dateKeyInTimeZone(now, timeZone);
}

/** Human offset label such as "UTC+01:00". */
export function offsetLabel(timeZone: string, instant: Date | number = new Date()): string {
  const minutes = offsetMinutesAt(instant, timeZone);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export function pad2(n: number): string {
  return String(Math.abs(n)).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}
