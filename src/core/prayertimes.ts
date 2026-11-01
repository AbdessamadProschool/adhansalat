/**
 * Prayer-time engine.
 *
 * Design constraints:
 *  - pure functions, no clock and no DOM: the same code runs in the browser, in
 *    Node tests and could be ported to Kotlin;
 *  - the engine returns absolute instants (UTC), never "local hours". Time-zone
 *    and DST conversion happens afterwards through the IANA zone, so a clock
 *    change can never shift a computed prayer by an hour;
 *  - when the sun never reaches the required angle, the affected prayer is
 *    `null` unless the user chose a high-latitude rule. We never invent a time
 *    silently.
 */

import {
  asrAltitude,
  horizonAltitude,
  hourAngleAtAltitude,
  julianDayFromInstant,
  sunPosition,
} from './astro.js';
import { getMethod } from './methods.js';
import { addDaysToKey, dateKeyInTimeZone, parseDateKey, timeKeyInTimeZone } from './timezone.js';
import type {
  CalculationSettings,
  Coordinates,
  HighLatitudeRule,
  PrayerKey,
  PrayerTimes,
} from './types.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface EngineLocation extends Coordinates {
  timeZone: string;
}

export class EngineInputError extends RangeError {}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new EngineInputError(`${name} must be a finite number, got ${value}`);
  }
}

export function validateLocation(loc: EngineLocation): void {
  assertFinite('latitude', loc.latitude);
  assertFinite('longitude', loc.longitude);
  if (loc.latitude < -90 || loc.latitude > 90) {
    throw new EngineInputError(`latitude out of range: ${loc.latitude}`);
  }
  if (loc.longitude < -180 || loc.longitude > 180) {
    throw new EngineInputError(`longitude out of range: ${loc.longitude}`);
  }
  if (loc.elevation !== undefined && (!Number.isFinite(loc.elevation) || loc.elevation < 0)) {
    throw new EngineInputError(`elevation must be >= 0, got ${loc.elevation}`);
  }
}

function diffDays(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS,
  );
}

/**
 * Instant of solar transit (true local noon) belonging to `dateKey` in the given
 * zone. The initial estimate is corrected until the instant really falls on the
 * requested local date, which matters near the date line where a political
 * offset (e.g. UTC+14 at longitude -157°) can be far from the longitude estimate.
 */
export function solarTransit(dateKey: string, loc: EngineLocation): number {
  const { year, month, day } = parseDateKey(dateKey);
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const longitudeShift = (loc.longitude / 15) * HOUR_MS;

  let dayShift = 0;
  let transit = noonUtc - longitudeShift;
  for (let i = 0; i < 3; i++) {
    const probe = noonUtc - longitudeShift + dayShift;
    const { equationOfTime } = sunPosition(julianDayFromInstant(probe));
    transit = probe - equationOfTime * HOUR_MS;
    const seen = dateKeyInTimeZone(transit, loc.timeZone);
    if (seen === dateKey) break;
    dayShift -= diffDays(seen, dateKey) * DAY_MS;
  }
  return transit;
}

function declinationAt(instantMs: number): number {
  return sunPosition(julianDayFromInstant(instantMs)).declination;
}

/** Re-evaluates the declination at the estimated instant, once. */
function refine(
  transit: number,
  initial: number | null,
  recompute: (declination: number) => number | null,
): number | null {
  if (initial === null) return null;
  const decl = declinationAt(transit + initial * HOUR_MS);
  const again = recompute(decl);
  return again === null ? initial : again;
}

export function calculatePrayerTimes(
  dateKey: string,
  loc: EngineLocation,
  settings: CalculationSettings,
): PrayerTimes {
  validateLocation(loc);
  parseDateKey(dateKey); // throws on a malformed key

  const method = getMethod(settings.methodId);
  const latitude = loc.latitude;
  const elevation = loc.elevation ?? 0;
  const shadowFactor = settings.asrSchool === 'hanafi' ? 2 : 1;
  const transit = solarTransit(dateKey, loc);
  const decl = declinationAt(transit);
  const horizon = horizonAltitude(elevation);

  const asrOffset = (d: number): number | null =>
    hourAngleAtAltitude(asrAltitude(shadowFactor, latitude, d), latitude, d);
  const horizonOffset = (d: number): number | null =>
    hourAngleAtAltitude(horizon, latitude, d);

  // Hour angles are positive; sunrise is before transit, so it is negated.
  let sunrise = refine(transit, negate(horizonOffset(decl)), (d) => negate(horizonOffset(d)));
  const sunset = negate(sunrise);
  let fajr =
    method.fajrAngle === undefined
      ? null
      : refine(transit, negate(hourAngleAtAltitude(-method.fajrAngle, latitude, decl)), (d) =>
          negate(hourAngleAtAltitude(-method.fajrAngle!, latitude, d)),
        );
  let asr = refine(transit, asrOffset(decl), asrOffset);
  let isha =
    method.ishaAngle === undefined
      ? null
      : refine(transit, hourAngleAtAltitude(-method.ishaAngle, latitude, decl), (d) =>
          hourAngleAtAltitude(-method.ishaAngle!, latitude, d),
        );

  // Night duration is needed by both the high-latitude rules and midnight.
  const nightHours = sunrise === null ? null : 24 - 2 * Math.abs(sunrise);

  // --- High latitude handling ------------------------------------------------
  const fallbackEvents: PrayerKey[] = [];
  const rule: HighLatitudeRule = settings.highLatitudeRule;
  if (rule === 'nearestLatitude') {
    // "Aqrab al-bilad": when the angle is unreachable here, borrow the duration
    // from the nearest reference latitude (45° in the same hemisphere).
    const referenceLatitude = latitude >= 0 ? 45 : -45;
    if (fajr === null && method.fajrAngle !== undefined) {
      fajr = negate(hourAngleAtAltitude(-method.fajrAngle, referenceLatitude, decl));
      if (fajr !== null) fallbackEvents.push('fajr');
    }
    if (isha === null && method.ishaAngle !== undefined) {
      isha = hourAngleAtAltitude(-method.ishaAngle, referenceLatitude, decl);
      if (isha !== null) fallbackEvents.push('isha');
    }
  } else if (rule !== 'none') {
    fajr = clampToNight(fajr, sunrise, nightHours, rule, method.fajrAngle, true, fallbackEvents, 'fajr');
    isha = clampToNight(isha, sunset, nightHours, rule, method.ishaAngle, false, fallbackEvents, 'isha');
  }
  const highLatitudeFallback: PrayerTimes['highLatitudeFallback'] =
    fallbackEvents.length > 0 ? 'applied' : fajr === null || isha === null ? 'unresolvable' : 'none';

  // Maghrib: plain sunset, sunset + minutes, or an angle below the horizon.
  let maghrib: number | null;
  if (method.maghribAngle !== undefined) {
    maghrib = refine(transit, hourAngleAtAltitude(-method.maghribAngle, latitude, decl), (d) =>
      hourAngleAtAltitude(-method.maghribAngle!, latitude, d),
    );
  } else if (method.maghribIntervalMinutes !== undefined) {
    maghrib = sunset === null ? null : sunset + method.maghribIntervalMinutes / 60;
  } else {
    maghrib = sunset;
  }

  if (method.ishaIntervalMinutes !== undefined) {
    isha = sunset === null ? null : sunset + method.ishaIntervalMinutes / 60;
  }

  // --- User corrections and final instants -----------------------------------
  // Method-level corrections are part of the method definition; user
  // corrections are added on top so both remain visible and auditable.
  const userAdj = settings.adjustments ?? {};
  const totalAdjustment = (key: PrayerKey | 'sunrise'): number =>
    (method.methodAdjustments?.[key] ?? 0) + (userAdj[key] ?? 0);

  const at = (hours: number | null, key: PrayerKey | 'sunrise'): Date | null =>
    hours === null ? null : new Date(transit + hours * HOUR_MS + totalAdjustment(key) * 60_000);

  const fajrDate = at(fajr, 'fajr');
  const sunriseDate = at(sunrise, 'sunrise');
  const dhuhrDate = at(0, 'dhuhr');
  const asrDate = at(asr, 'asr');
  const maghribDate = at(maghrib, 'maghrib');
  const ishaDate = at(isha, 'isha');

  // Islamic midnight: half of the night that starts at Maghrib.
  const midnight =
    maghribDate !== null && nightHours !== null
      ? new Date(maghribDate.getTime() + (nightHours / 2) * HOUR_MS)
      : null;

  return {
    date: dateKey,
    timeZone: loc.timeZone,
    fajr: fajrDate,
    sunrise: sunriseDate,
    dhuhr: dhuhrDate,
    asr: asrDate,
    maghrib: maghribDate,
    isha: ishaDate,
    midnight,
    solarNoon: new Date(transit),
    highLatitudeFallback,
    fallbackEvents,
    methodId: method.id,
    asrSchool: settings.asrSchool,
  };
}

function clampToNight(
  value: number | null,
  base: number | null,
  nightHours: number | null,
  rule: HighLatitudeRule,
  angle: number | undefined,
  beforeBase: boolean,
  fallbackEvents: PrayerKey[],
  key: PrayerKey,
): number | null {
  // The angle is reachable: keep it. This is the normal case, and it also
  // covers polar night, where the sun never rises but still dips below the
  // Fajr/Isha angle, so a correct time exists without any night portion.
  if (value !== null && (rule === 'none' || nightHours === null || base === null)) return value;

  // A clamp is needed but there may be no night to divide (polar day).
  if (nightHours === null || base === null) return null;
  if (rule === 'none') return value;

  const portion = nightPortion(nightHours, rule, angle);
  const limit = beforeBase ? base - portion : base + portion;
  const outside =
    value === null || (beforeBase ? base - value > portion + 1e-9 : value - base > portion + 1e-9);
  if (!outside) return value;
  fallbackEvents.push(key);
  return limit;
}

function nightPortion(nightHours: number, rule: HighLatitudeRule, angle?: number): number {
  switch (rule) {
    case 'middleOfNight':
      return nightHours / 2;
    case 'seventhOfNight':
      return nightHours / 7;
    case 'angleBased':
      // Conventional angle/60 proportion (PrayTimes "Angle Based").
      return (nightHours * (angle ?? 18)) / 60;
    case 'none':
    default:
      return 0;
  }
}

function negate(v: number | null): number | null {
  return v === null ? null : -v;
}

/** Wall-clock label rounded to the nearest minute, as prayer apps display it. */
export function labelFor(date: Date | null, timeZone: string): string {
  if (!date) return '—';
  return timeKeyInTimeZone(new Date(date.getTime() + 30_000), timeZone);
}

export function nextDateKey(dateKey: string): string {
  return addDaysToKey(dateKey, 1);
}
