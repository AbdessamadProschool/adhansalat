import { describe, expect, it } from 'vitest';
import fixture from '../src/core/__fixtures__/aladhan-reference.json';
import { calculatePrayerTimes, labelFor, type EngineLocation } from '../src/core/prayertimes.js';
import { dateKeyInTimeZone, offsetMinutesAt, parseDateKey, zonedTimeToInstant } from '../src/core/timezone.js';
import type { CalculationSettings, PrayerKey } from '../src/core/types.js';

const FIELDS: Array<PrayerKey | 'sunrise'> = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

interface Case {
  id: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  methodId: number;
  school: 0 | 1;
  timings: Record<string, Record<string, unknown>>;
}

function toMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`bad time ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function signedDiffMinutes(mine: string, reference: string): number {
  let diff = toMinutes(mine) - toMinutes(reference);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

function apiDateToKey(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m}-${d}`;
}

function settingsFor(c: Case): CalculationSettings {
  return {
    methodId: c.methodId,
    asrSchool: c.school === 1 ? 'hanafi' : 'standard',
    // AlAdhan defaults to ANGLE_BASED, which only engages when the angle is
    // actually unreachable or beyond the night portion.
    highLatitudeRule: 'angleBased',
    adjustments: {},
  };
}

function locFor(c: Case): EngineLocation {
  return { latitude: c.lat, longitude: c.lon, timeZone: c.tz };
}

const cases = fixture.cases as unknown as Case[];

/**
 * Reference rows we deliberately do not assert against, with the evidence.
 * Keeping the list explicit means a new divergence cannot be hidden by simply
 * widening a tolerance.
 */
const EXCLUSIONS: Record<string, { dates: string[]; reason: string }> = {
  'casablanca-summer': {
    dates: ['21-12-2026'],
    reason:
      'The API returned this day in UTC+0 while tzdata/ICU (and the batoulapps reference library) ' +
      'place Africa/Casablanca at UTC+1 in December 2026: every field is exactly 60 minutes early. ' +
      'Morocco is UTC+1 outside Ramadan, so the local engine keeps UTC+1. See docs/CALCULATION.md.',
  },
  'tromso-extreme': {
    dates: ['21-06-2026', '21-12-2026'],
    reason:
      'Polar day (21 June): the sun never sets, so no night portion exists and Fajr/Isha are undefined. ' +
      'Polar night (21 December): the sun never rises, so sunrise/sunset are undefined. In both cases the ' +
      'API returns a clamped placeholder (00:46 / 11:42) while the engine returns null and flags the day ' +
      'as unresolvable, which is the honest result. See docs/LIMITATIONS.md.',
  },
};

function isExcluded(caseId: string, apiDate: string): boolean {
  return EXCLUSIONS[caseId]?.dates.includes(apiDate) ?? false;
}

describe('reference comparison against the AlAdhan API', () => {
  const rows: string[] = [];
  let worst = 0;
  let worstLabel = '';

  for (const c of cases) {
    it(`${c.id} matches the reference within 3 minutes`, () => {
      for (const [apiDate, expected] of Object.entries(c.timings)) {
        if (isExcluded(c.id, apiDate)) continue;
        const dateKey = apiDateToKey(apiDate);
        const times = calculatePrayerTimes(dateKey, locFor(c), settingsFor(c));
        for (const field of FIELDS) {
          const reference = expected[field];
          if (typeof reference !== 'string') continue;
          const value = times[field];
          if (!value) {
            throw new Error(
              `${c.id} ${dateKey} ${field}: engine returned null but the reference has ${reference}`,
            );
          }
          const label = labelFor(value, c.tz);
          const diff = signedDiffMinutes(label, reference);
          const abs = Math.abs(diff);
          if (abs > worst) {
            worst = abs;
            worstLabel = `${c.id} ${dateKey} ${field}: ${label} vs ${reference}`;
          }
          rows.push(`${c.id}\t${dateKey}\t${field}\t${label}\t${reference}\t${diff}`);
          expect(abs, `${c.id} ${dateKey} ${field}: got ${label}, reference ${reference}`).toBeLessThanOrEqual(3);
        }
      }
    });
  }

  it('reports the observed divergence (informational)', () => {
    // Written to the test log so docs/TEST-REPORT.md can quote real numbers.
    console.log(`[engine] ${rows.length} field comparisons, worst |diff| = ${worst} min (${worstLabel})`);
    expect(worst).toBeLessThanOrEqual(3);
  });

  it('documents every excluded reference row', () => {
    expect(Object.keys(EXCLUSIONS).sort()).toEqual(['casablanca-summer', 'tromso-extreme']);
    expect(Object.keys(EXCLUSIONS['casablanca-summer']!.dates)).toHaveLength(1);
    expect(Object.keys(EXCLUSIONS['tromso-extreme']!.dates)).toHaveLength(2);
  });
});

describe('chronological invariants', () => {
  for (const c of cases) {
    it(`${c.id} keeps fajr < sunrise < dhuhr < asr < maghrib < isha`, () => {
      for (const apiDate of Object.keys(c.timings)) {
        const times = calculatePrayerTimes(apiDateToKey(apiDate), locFor(c), settingsFor(c));
        const seq: Array<[string, Date | null]> = [
          ['fajr', times.fajr],
          ['sunrise', times.sunrise],
          ['dhuhr', times.dhuhr],
          ['asr', times.asr],
          ['maghrib', times.maghrib],
          ['isha', times.isha],
        ];
        const present = seq.filter((s): s is [string, Date] => s[1] !== null);
        for (let i = 1; i < present.length; i++) {
          const prev = present[i - 1]!;
          const cur = present[i]!;
          expect(cur[1].getTime(), `${c.id} ${apiDate}: ${cur[0]} after ${prev[0]}`).toBeGreaterThan(
            prev[1].getTime(),
          );
        }
      }
    });
  }
});

describe('time zone handling', () => {
  const loc: EngineLocation = { latitude: 40.7128, longitude: -74.006, timeZone: 'America/New_York' };
  const settings: CalculationSettings = {
    methodId: 2,
    asrSchool: 'standard',
    highLatitudeRule: 'angleBased',
    adjustments: {},
  };

  it('returns the same instants regardless of how the zone offset is obtained', () => {
    const a = calculatePrayerTimes('2026-03-08', loc, settings);
    const b = calculatePrayerTimes('2026-03-08', { ...loc }, settings);
    expect(a.fajr?.getTime()).toBe(b.fajr?.getTime());
  });

  it('crosses the US spring-forward transition without a one-hour error', () => {
    // 2026-03-08: 02:00 EST -> 03:00 EDT. Fajr (06:04) is already on EDT.
    const times = calculatePrayerTimes('2026-03-08', loc, settings);
    const fajrParts = dateKeyInTimeZone(times.fajr!, loc.timeZone);
    expect(fajrParts).toBe('2026-03-08');
    expect(offsetMinutesAt(times.fajr!, loc.timeZone)).toBe(-240); // EDT
    expect(offsetMinutesAt(times.dhuhr!, loc.timeZone)).toBe(-240); // EDT
    // The span between Fajr and Dhuhr follows the sun: ~7h of real time even
    // though the wall clock only advances 6h across the jump.
    const spanHours = (times.dhuhr!.getTime() - times.fajr!.getTime()) / 3_600_000;
    expect(spanHours).toBeGreaterThan(6.8);
    expect(spanHours).toBeLessThan(7.2);
  });

  it('crosses the US fall-back transition', () => {
    // 2026-11-01: 02:00 EDT -> 01:00 EST, before Fajr. Both are on EST.
    const times = calculatePrayerTimes('2026-11-01', loc, settings);
    expect(offsetMinutesAt(times.fajr!, loc.timeZone)).toBe(-300); // EST
    expect(offsetMinutesAt(times.dhuhr!, loc.timeZone)).toBe(-300); // EST
    // The Fajr->Dhuhr interval follows the sun, so it stays ~6.6h of real time.
    const spanHours = (times.dhuhr!.getTime() - times.fajr!.getTime()) / 3_600_000;
    expect(spanHours).toBeGreaterThan(6.3);
    expect(spanHours).toBeLessThan(6.9);
  });

  it('resolves the requested local date near the date line', () => {
    const kiritimati: EngineLocation = { latitude: 1.87, longitude: -157.4, timeZone: 'Pacific/Kiritimati' };
    const times = calculatePrayerTimes('2026-06-21', kiritimati, settings);
    for (const value of [times.fajr, times.dhuhr, times.maghrib]) {
      expect(dateKeyInTimeZone(value!, kiritimati.timeZone)).toBe('2026-06-21');
    }
  });

  it('round-trips a wall clock time through zonedTimeToInstant', () => {
    const instant = zonedTimeToInstant(2026, 7, 15, 13, 30, 'Africa/Casablanca');
    expect(dateKeyInTimeZone(instant, 'Africa/Casablanca')).toBe('2026-07-15');
    const label = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
    expect(label).toBe('13:30');
  });
});

describe('method behaviour', () => {
  const loc: EngineLocation = { latitude: 21.4225, longitude: 39.8262, timeZone: 'Asia/Riyadh' };

  it('applies Umm al-Qura 90-minute Isha exactly', () => {
    const times = calculatePrayerTimes('2026-06-21', loc, {
      methodId: 4,
      asrSchool: 'standard',
      highLatitudeRule: 'none',
      adjustments: {},
    });
    const minutes =
      (times.isha!.getTime() - times.maghrib!.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(90);
  });

  it('Hanafi Asr is later than the standard school', () => {
    const base = {
      methodId: 3,
      highLatitudeRule: 'none' as const,
      adjustments: {},
    };
    const shafi = calculatePrayerTimes('2026-06-21', loc, { ...base, asrSchool: 'standard' });
    const hanafi = calculatePrayerTimes('2026-06-21', loc, { ...base, asrSchool: 'hanafi' });
    expect(hanafi.asr!.getTime()).toBeGreaterThan(shafi.asr!.getTime());
  });

  it('different methods produce different Fajr/Isha, as expected', () => {
    const base = { asrSchool: 'standard' as const, highLatitudeRule: 'none' as const, adjustments: {} };
    const mwl = calculatePrayerTimes('2026-06-21', loc, { ...base, methodId: 3 });
    const isna = calculatePrayerTimes('2026-06-21', loc, { ...base, methodId: 2 });
    expect(mwl.fajr!.getTime()).not.toBe(isna.fajr!.getTime());
  });

  it('applies per-prayer corrections in whole minutes', () => {
    const base = { methodId: 3, asrSchool: 'standard' as const, highLatitudeRule: 'none' as const };
    const plain = calculatePrayerTimes('2026-06-21', loc, { ...base, adjustments: {} });
    const shifted = calculatePrayerTimes('2026-06-21', loc, {
      ...base,
      adjustments: { fajr: 5, isha: -3 },
    });
    expect(shifted.fajr!.getTime() - plain.fajr!.getTime()).toBe(5 * 60_000);
    expect(shifted.isha!.getTime() - plain.isha!.getTime()).toBe(-3 * 60_000);
  });

  it('falls back to the default method for an unknown id instead of crashing', () => {
    const times = calculatePrayerTimes('2026-06-21', loc, {
      methodId: 9999,
      asrSchool: 'standard',
      highLatitudeRule: 'none',
      adjustments: {},
    });
    expect(times.methodId).toBe(3);
    expect(times.fajr).not.toBeNull();
  });
});

describe('high latitudes', () => {
  const tromso: EngineLocation = { latitude: 69.6492, longitude: 18.9553, timeZone: 'Europe/Oslo' };
  const oslo: EngineLocation = { latitude: 59.9139, longitude: 10.7522, timeZone: 'Europe/Oslo' };
  const base = { methodId: 3, asrSchool: 'standard' as const, adjustments: {} };

  it('reports null rather than inventing a time when the rule is "none"', () => {
    const times = calculatePrayerTimes('2026-06-21', tromso, { ...base, highLatitudeRule: 'none' });
    expect(times.fajr).toBeNull();
    expect(times.isha).toBeNull();
    expect(times.highLatitudeFallback).toBe('unresolvable');
  });

  it('keeps a valid angle during polar night, where the sun never rises', () => {
    const times = calculatePrayerTimes('2026-12-21', tromso, { ...base, highLatitudeRule: 'angleBased' });
    // The sun never rises, but it does dip below 18°, so Fajr and Isha exist.
    expect(times.sunrise).toBeNull();
    expect(times.fajr).not.toBeNull();
    expect(times.isha).not.toBeNull();
  });

  it('cannot divide a night that does not exist during polar day', () => {
    const times = calculatePrayerTimes('2026-06-21', tromso, { ...base, highLatitudeRule: 'angleBased' });
    expect(times.sunrise).toBeNull();
    expect(times.fajr).toBeNull();
    expect(times.highLatitudeFallback).toBe('unresolvable');
  });

  it('nearest-latitude rule produces usable times during polar day', () => {
    const times = calculatePrayerTimes('2026-06-21', tromso, { ...base, highLatitudeRule: 'nearestLatitude' });
    expect(times.fajr).not.toBeNull();
    expect(times.isha).not.toBeNull();
    expect(times.highLatitudeFallback).toBe('applied');
    expect(times.fajr!.getTime()).toBeLessThan(times.asr!.getTime());
  });

  it('one-seventh rule stays closer to midnight than the half-night rule', () => {
    // Oslo in June: the sun sets, but the 18° angle is unreachable.
    const seventh = calculatePrayerTimes('2026-06-21', oslo, { ...base, highLatitudeRule: 'seventhOfNight' });
    const middle = calculatePrayerTimes('2026-06-21', oslo, { ...base, highLatitudeRule: 'middleOfNight' });
    expect(seventh.fajr).not.toBeNull();
    expect(middle.fajr).not.toBeNull();
    expect(seventh.fajr!.getTime()).toBeGreaterThan(middle.fajr!.getTime());
    expect(seventh.highLatitudeFallback).toBe('applied');
  });
});

describe('input validation', () => {
  const settings: CalculationSettings = {
    methodId: 3,
    asrSchool: 'standard',
    highLatitudeRule: 'none',
    adjustments: {},
  };

  it('rejects an out-of-range latitude', () => {
    expect(() =>
      calculatePrayerTimes('2026-06-21', { latitude: 91, longitude: 0, timeZone: 'UTC' }, settings),
    ).toThrow(RangeError);
  });

  it('rejects a malformed date key', () => {
    expect(() =>
      calculatePrayerTimes('21/06/2026', { latitude: 0, longitude: 0, timeZone: 'UTC' }, settings),
    ).toThrow(RangeError);
  });

  it('accepts the poles without producing NaN', () => {
    const times = calculatePrayerTimes(
      '2026-06-21',
      { latitude: 90, longitude: 0, timeZone: 'UTC' },
      settings,
    );
    expect(times.dhuhr).not.toBeNull();
    expect(Number.isNaN(times.dhuhr!.getTime())).toBe(false);
  });
});

describe('solar geometry sanity', () => {
  it('equator: roughly 12h day all year', () => {
    const loc: EngineLocation = { latitude: 0, longitude: 0, timeZone: 'UTC' };
    const times = calculatePrayerTimes('2026-03-20', loc, {
      methodId: 3,
      asrSchool: 'standard',
      highLatitudeRule: 'none',
      adjustments: {},
    });
    const dayHours = (times.maghrib!.getTime() - times.sunrise!.getTime()) / 3_600_000;
    expect(dayHours).toBeGreaterThan(11.9);
    expect(dayHours).toBeLessThan(12.2);
  });

  it('solar noon lies between sunrise and sunset', () => {
    const loc: EngineLocation = { latitude: 48.8566, longitude: 2.3522, timeZone: 'Europe/Paris' };
    const times = calculatePrayerTimes('2026-12-21', loc, {
      methodId: 12,
      asrSchool: 'standard',
      highLatitudeRule: 'angleBased',
      adjustments: {},
    });
    expect(times.solarNoon!.getTime()).toBeGreaterThan(times.sunrise!.getTime());
    expect(times.solarNoon!.getTime()).toBeLessThan(times.maghrib!.getTime());
  });

  it('parses fixture dates as expected', () => {
    expect(apiDateToKey('21-06-2026')).toBe('2026-06-21');
    expect(parseDateKey('2026-06-21').month).toBe(6);
  });
});
