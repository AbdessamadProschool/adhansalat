/**
 * Solar position, following the well-known low-precision algorithm used by
 * PrayTimes (Hamid Zarrabi-Zadeh, MIT licence) and by most prayer-time
 * libraries. Accuracy is roughly ±1 minute for the years 1900-2100, which is
 * below the uncertainty introduced by calculation-method differences.
 *
 * Everything here is pure: no clock, no time zone, no locale.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Julian Day number at 00:00 UT for the given Gregorian calendar date. */
export function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  );
}

/** Julian Day for an absolute instant (milliseconds since epoch). */
export function julianDayFromInstant(ms: number): number {
  return 2440587.5 + ms / 86400000;
}

export interface SunPosition {
  /** Apparent declination of the sun, degrees. */
  declination: number;
  /** Equation of time, hours. Positive when the sundial is ahead of the clock. */
  equationOfTime: number;
}

export function sunPosition(julian: number): SunPosition {
  const d = julian - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const l = fixAngle(q + 1.915 * sin(g) + 0.02 * sin(2 * g));
  const e = 23.439 - 0.00000036 * d;
  const ra = fixHour(atan2(cos(e) * sin(l), cos(l)) / 15);
  return {
    declination: asin(sin(e) * sin(l)),
    equationOfTime: q / 15 - ra,
  };
}

/**
 * Hour angle (in hours) at which the sun reaches `altitude` degrees, for the
 * given latitude and solar declination. Returns null when the sun never reaches
 * that altitude during the day (polar day/night or a very deep angle).
 */
export function hourAngleAtAltitude(
  altitude: number,
  latitude: number,
  declination: number,
): number | null {
  const numerator = sin(altitude) - sin(latitude) * sin(declination);
  const denominator = cos(latitude) * cos(declination);
  if (Math.abs(denominator) < 1e-12) return null;
  const cosH = numerator / denominator;
  if (!Number.isFinite(cosH) || cosH > 1 || cosH < -1) return null;
  return acos(cosH) / 15;
}

/**
 * Sun altitude for the Asr shadow ratio: when an object casts a shadow equal to
 * `shadowFactor` times its own height (plus the noon shadow).
 */
export function asrAltitude(shadowFactor: number, latitude: number, declination: number): number {
  const noonShadow = Math.tan(Math.abs(latitude - declination) * D2R);
  const ratio = shadowFactor + noonShadow;
  // arccot(ratio) expressed as arctan(1/ratio); ratio is always > 0.
  return Math.atan(1 / ratio) * R2D;
}

/**
 * Apparent sunrise/sunset altitude: refraction plus the solar disc radius,
 * corrected for the observer's elevation.
 */
export function horizonAltitude(elevationMetres = 0): number {
  const e = Math.max(0, elevationMetres);
  return -(0.833 + 0.0347 * Math.sqrt(e));
}

/** Day of year (1-366) from a Gregorian date. */
export function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.round((current - start) / 86400000) + 1;
}

function sin(deg: number): number {
  return Math.sin(deg * D2R);
}
function cos(deg: number): number {
  return Math.cos(deg * D2R);
}
function asin(x: number): number {
  return Math.asin(x) * R2D;
}
function acos(x: number): number {
  return Math.acos(x) * R2D;
}
function atan2(y: number, x: number): number {
  return Math.atan2(y, x) * R2D;
}
function fixAngle(a: number): number {
  return fix(a, 360);
}
function fixHour(a: number): number {
  return fix(a, 24);
}
function fix(a: number, b: number): number {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
}

export const degrees = { toRad: (d: number) => d * D2R, toDeg: (r: number) => r * R2D };
