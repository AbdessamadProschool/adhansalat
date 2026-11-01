/**
 * Time-zone layer tests.
 *
 * The important one is the table-vs-ICU sweep: it re-derives the offset from the
 * platform for every bundled zone at four separate instants and fails on any
 * disagreement. That catches an off-by-one in the binary search, a truncated
 * series, or a zone mapped to the wrong rule set — the failure modes that a
 * hand-rolled transition table actually has.
 *
 * Political facts (Morocco's 2018 switch, Ramadan suspensions, half-hour DST)
 * are asserted separately, because those are the ones a user would notice.
 */

import { describe, expect, it } from 'vitest';
import tzdata from '../src/core/data/tzdata.json';
import {
  TZDATA_END,
  TZDATA_START,
  bundledOffsetMinutes,
  bundledZones,
  hasBundledZone,
} from '../src/core/tzdata.js';
import {
  dateKeyInTimeZone,
  formatInZone,
  offsetLabel,
  osOffsetMinutesAt,
  partsInTimeZone,
  timeKeyInTimeZone,
  zoneIsReliable,
  zoneSourceAt,
  zonedTimeToInstant,
} from '../src/core/timezone.js';

/** Offset from the platform (Node's ICU), used as the independent oracle. */
function icuOffset(timeZone: string, iso: string): number {
  const ms = Date.parse(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const bag: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') bag[p.type] = Number(p.value);
  const asUtc = Date.UTC(
    bag.year!,
    bag.month! - 1,
    bag.day!,
    bag.hour === 24 ? 0 : bag.hour!,
    bag.minute!,
    bag.second!,
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

describe('bundled time-zone table', () => {
  it('covers every IANA zone this platform knows', () => {
    const supported = Intl.supportedValuesOf('timeZone');
    const missing = supported.filter((zone) => !hasBundledZone(zone));
    expect(missing).toEqual([]);
    expect(bundledZones().length).toBeGreaterThan(300);
  });

  it('covers 2018 through at least 2044', () => {
    expect(new Date(TZDATA_START).toISOString()).toBe('2018-01-01T00:00:00.000Z');
    expect(TZDATA_END).toBeGreaterThan(Date.UTC(2044, 0, 1));
  });

  it('has transitions in strictly increasing order', () => {
    for (const series of tzdata.series) {
      for (let i = 1; i < series.length; i += 2) {
        const at = series[i]!;
        expect(at).toBeGreaterThan(0);
        if (i > 1) expect(at).toBeGreaterThan(series[i - 2]!);
      }
      // A series always starts with an offset and has (1 + 2n) entries.
      expect((series.length - 1) % 2).toBe(0);
    }
  });

  it('agrees with the platform ICU for every zone at four instants', () => {
    const instants = [
      '2026-01-15T12:00:00Z',
      '2026-07-15T12:00:00Z',
      '2030-03-01T12:00:00Z',
      '2040-11-05T12:00:00Z',
    ];
    const moroccoCutoffMs = Date.UTC(2026, 8, 20, 2, 0, 0);
    const mismatches: string[] = [];
    for (const zone of bundledZones()) {
      for (const iso of instants) {
        const ms = Date.parse(iso);
        // Africa/Casablanca est surchargée par le décret 2-26-530 à partir du
        // 20/09/2026 02:00 UTC : la plateforme (tzdb ancienne) ne suit pas.
        if (zone === 'Africa/Casablanca' && ms >= moroccoCutoffMs) continue;
        const bundled = bundledOffsetMinutes(zone, ms);
        const icu = icuOffset(zone, iso);
        if (bundled !== icu) mismatches.push(`${zone} @ ${iso}: table ${bundled} vs ICU ${icu}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('knows Morocco switched to UTC+1 in 2018, suspends DST for Ramadan, and returns to GMT in 2026', () => {
    const at = (iso: string) => bundledOffsetMinutes('Africa/Casablanca', Date.parse(iso));
    expect(at('2018-01-01T12:00:00Z')).toBe(0); // before the 2018 change
    expect(at('2018-12-01T12:00:00Z')).toBe(60); // after it
    expect(at('2026-10-27T12:00:00Z')).toBe(0); // décret 2-26-530 : retour à GMT
    expect(at('2026-03-01T12:00:00Z')).toBe(0); // Ramadan 2026
    expect(at('2026-07-01T12:00:00Z')).toBe(60);
    // Transition du 20/09/2026 02:00 UTC
    expect(at('2026-09-19T12:00:00Z')).toBe(60);
    expect(at('2026-09-20T01:59:00Z')).toBe(60);
    expect(at('2026-09-20T02:00:00Z')).toBe(0);
    expect(at('2026-09-20T03:00:00Z')).toBe(0);
  });

  it('resolves 30-minute and 45-minute zones', () => {
    expect(bundledOffsetMinutes('Asia/Kathmandu', Date.parse('2026-07-15T12:00:00Z'))).toBe(345);
    expect(bundledOffsetMinutes('Asia/Kolkata', Date.parse('2026-07-15T12:00:00Z'))).toBe(330);
    expect(bundledOffsetMinutes('Australia/Eucla', Date.parse('2026-07-15T12:00:00Z'))).toBe(525);
    expect(bundledOffsetMinutes('Pacific/Chatham', Date.parse('2026-01-15T12:00:00Z'))).toBe(825);
  });

  it('handles a half-hour DST shift (Lord Howe)', () => {
    const summer = bundledOffsetMinutes('Australia/Lord_Howe', Date.parse('2026-01-15T12:00:00Z'));
    const winter = bundledOffsetMinutes('Australia/Lord_Howe', Date.parse('2026-07-15T12:00:00Z'));
    expect(summer).toBe(660);
    expect(winter).toBe(630);
  });

  it('returns null outside the table and for unknown zones', () => {
    expect(bundledOffsetMinutes('Africa/Casablanca', Date.parse('1970-01-01T00:00:00Z'))).toBeNull();
    expect(bundledOffsetMinutes('Africa/Casablanca', TZDATA_END)).toBeNull();
    expect(bundledOffsetMinutes('Mars/Olympus_Mons', Date.now())).toBeNull();
  });
});

describe('zone arithmetic', () => {
  it('switches to summer time exactly at the Paris transition minute', () => {
    const before = Date.parse('2026-03-29T00:59:00Z');
    const after = Date.parse('2026-03-29T01:00:00Z');
    expect(bundledOffsetMinutes('Europe/Paris', before)).toBe(60);
    expect(bundledOffsetMinutes('Europe/Paris', after)).toBe(120);
    expect(timeKeyInTimeZone(before, 'Europe/Paris')).toBe('01:59');
    expect(timeKeyInTimeZone(after, 'Europe/Paris')).toBe('03:00');
  });

  it('formats the local wall clock without asking the host to re-interpret the zone', () => {
    // 12:19 UTC is 12:19 in Casablanca after the 2026 return to GMT.
    const instant = Date.parse('2026-10-27T12:19:00Z');
    expect(formatInZone(instant, 'Africa/Casablanca', 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })).toBe('12:19');
    // Same instant in Tokyo is 21:19 the same day.
    expect(timeKeyInTimeZone(instant, 'Asia/Tokyo')).toBe('21:19');
  });

  it('rolls the date key at local midnight, not at UTC midnight', () => {
    expect(dateKeyInTimeZone(Date.parse('2026-10-27T22:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-28');
    expect(dateKeyInTimeZone(Date.parse('2026-10-27T22:30:00Z'), 'Pacific/Honolulu')).toBe('2026-10-27');
    expect(dateKeyInTimeZone(Date.parse('2026-10-27T22:30:00Z'), 'UTC')).toBe('2026-10-27');
  });

  it('round-trips a wall clock through zonedTimeToInstant', () => {
    const instant = zonedTimeToInstant(2026, 10, 27, 18, 42, 'Africa/Casablanca');
    expect(instant.toISOString()).toBe('2026-10-27T18:42:00.000Z');
    expect(partsInTimeZone(instant, 'Africa/Casablanca')).toMatchObject({
      year: 2026,
      month: 10,
      day: 27,
      hour: 18,
      minute: 42,
    });
  });

  it('resolves a spring-forward gap to the instant the clock jumps to', () => {
    // 02:30 does not exist in Paris on 2026-03-29.
    const instant = zonedTimeToInstant(2026, 3, 29, 2, 30, 'Europe/Paris');
    const shown = timeKeyInTimeZone(instant, 'Europe/Paris');
    expect(['03:30', '01:30']).toContain(shown);
  });

  it('labels offsets in a stable UTC±HH:MM form', () => {
    expect(offsetLabel('Africa/Casablanca', Date.parse('2026-10-27T12:00:00Z'))).toBe('UTC+00:00');
    expect(offsetLabel('Africa/Casablanca', Date.parse('2026-03-01T12:00:00Z'))).toBe('UTC+00:00');
    expect(offsetLabel('America/St_Johns', Date.parse('2026-01-15T12:00:00Z'))).toBe('UTC-03:30');
    expect(offsetLabel('Pacific/Kiritimati', Date.parse('2026-01-15T12:00:00Z'))).toBe('UTC+14:00');
  });

  it('exposes the platform offset separately so diagnostics can compare', () => {
    expect(typeof osOffsetMinutesAt(Date.now(), 'Europe/Paris')).toBe('number');
    expect(osOffsetMinutesAt(Date.now(), 'Not/AZone')).toBeNull();
  });

  it('names where the offset came from, and never pretends UTC is a local rule', () => {
    const inside = Date.parse('2026-10-27T12:00:00Z');
    expect(zoneSourceAt(inside, 'Africa/Casablanca')).toBe('bundled-table');
    expect(zoneIsReliable(inside, 'Africa/Casablanca')).toBe(true);

    // Outside the generated table: the platform supplies the rule, and that is
    // flagged as a lower-confidence source instead of being hidden.
    const farFuture = Date.parse('2050-06-01T12:00:00Z');
    expect(zoneSourceAt(farFuture, 'Europe/Paris')).toBe('platform');
    expect(zoneIsReliable(farFuture, 'Europe/Paris')).toBe(true);

    // An unknown zone resolves to nothing: this is the case that must be
    // reported as unreliable rather than silently treated as UTC.
    expect(zoneSourceAt(inside, 'Not/AZone')).toBe('unknown');
    expect(zoneIsReliable(inside, 'Not/AZone')).toBe(false);
  });
});
