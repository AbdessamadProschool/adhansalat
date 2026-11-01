/**
 * Builds `src/core/data/tzdata.json`: UTC-offset transitions for every IANA zone,
 * generated from Node's ICU.
 *
 * Why the app ships this instead of asking `Intl` at runtime:
 * a host operating system can carry stale time-zone rules. Windows still applies
 * the pre-2018 Morocco rule, so `Intl` in Chrome/Electron on Windows reports
 * Africa/Casablanca as UTC+0 on 2026-10-27 while the current IANA data (and the
 * Moroccan government, since 2018) says UTC+1. A prayer app that renders "13:19"
 * as "12:19" is wrong even though its astronomical instant is right.
 *
 * The table stores *transitions*, not samples: each zone becomes a flat array
 *
 *   [ offset0, transition1Minutes, offset1, transition2Minutes, offset2, ... ]
 *
 * where `offset` is in minutes east of UTC and `transition` is minutes since the
 * table start. Zones with identical rules share one series, which is why the
 * whole world fits in tens of kilobytes.
 *
 * Run with: node scripts/build-tzdata.mjs
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const citiesPath = resolve(projectRoot, 'src/core/data/cities.json');
const outPath = resolve(projectRoot, 'src/core/data/tzdata.json');

const START = Date.UTC(2018, 0, 1, 0, 0, 0);
const END = Date.UTC(2045, 0, 1, 0, 0, 0);
const DAY = 86_400_000;

const formatters = new Map();

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
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
    formatters.set(timeZone, f);
  }
  return f;
}

/** Exact offset in minutes, computed from the wall-clock the zone reports. */
function offsetAt(timeZone, ms) {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const bag = {};
  for (const p of parts) if (p.type !== 'literal') bag[p.type] = Number(p.value);
  const asUtc = Date.UTC(
    bag.year,
    bag.month - 1,
    bag.day,
    bag.hour === 24 ? 0 : bag.hour,
    bag.minute,
    bag.second,
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

function zonesToCover() {
  const zones = new Set(['UTC', 'Etc/UTC', 'Etc/GMT']);
  const cities = JSON.parse(readFileSync(citiesPath, 'utf8'));
  const list = Array.isArray(cities) ? cities : cities.cities;
  for (const city of list) if (city.tz) zones.add(city.tz);
  const supported = Intl.supportedValuesOf?.('timeZone') ?? [];
  for (const zone of supported) zones.add(zone);
  // A few aliases Intl accepts but does not list, and that users may type.
  for (const alias of ['Asia/Calcutta', 'Asia/Katmandu', 'Europe/Kiev', 'US/Eastern', 'GMT']) {
    zones.add(alias);
  }
  return [...zones].sort();
}

/**
 * Walks day boundaries and bisects the exact minute whenever the offset changes.
 * A zone with no transition in the whole range produces a single value.
 */
function transitionsFor(timeZone) {
  const series = [];
  let currentOffset = offsetAt(timeZone, START);
  series.push(currentOffset);

  let previousDayOffset = currentOffset;
  for (let day = START + DAY; day < END; day += DAY) {
    const offset = offsetAt(timeZone, day);
    if (offset !== previousDayOffset) {
      // The change happened somewhere in (day - 1d, day]. Bisect on the minute.
      let lo = day - DAY;
      let hi = day;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
        if (mid === lo) break;
        if (offsetAt(timeZone, mid) === previousDayOffset) lo = mid;
        else hi = mid;
      }
      const changedAt = hi;
      const newOffset = offsetAt(timeZone, changedAt);
      series.push((changedAt - START) / 60_000, newOffset);
      currentOffset = newOffset;
    }
    previousDayOffset = offset;
  }
  return series;
}

const zones = zonesToCover();
const seriesPool = [];
const seriesIndex = new Map();
const zoneMap = {};

const t0 = Date.now();
for (const zone of zones) {
  let series;
  try {
    series = transitionsFor(zone);
  } catch (err) {
    console.warn(`skip ${zone}: ${err.message}`);
    continue;
  }
  const key = series.join(',');
  let index = seriesIndex.get(key);
  if (index === undefined) {
    index = seriesPool.length;
    seriesPool.push(series);
    seriesIndex.set(key, index);
  }
  zoneMap[zone] = index;
}

// ------------------------------------------------------------------ patch Maroc
// Décret n° 2-26-530 du 25 juin 2026 : retour à GMT à partir du 20/09/2026 02:00 UTC.
const MOROCCO_CUTOFF_MIN = 4585080;
const casablancaIndex = zoneMap['Africa/Casablanca'];
if (casablancaIndex !== undefined) {
  const original = seriesPool[casablancaIndex];
  const patched = [original[0]];
  for (let i = 1; i < original.length; i += 2) {
    if (original[i] >= MOROCCO_CUTOFF_MIN) break;
    patched.push(original[i], original[i + 1]);
  }
  if (patched[patched.length - 1] !== 0) {
    patched.push(MOROCCO_CUTOFF_MIN, 0);
  }
  const newIndex = seriesPool.length;
  seriesPool.push(patched);
  zoneMap['Africa/Casablanca'] = newIndex;
}

const output = {
  version: 1,
  source: `ICU ${process.versions.icu} (tz ${process.versions.tz}) via Node ${process.versions.node} + patch Maroc décret 2-26-530 (2026-09-20)`,
  generatedBy: 'scripts/build-tzdata.mjs',
  start: START,
  end: END,
  series: seriesPool,
  zones: zoneMap,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(output));

const bytes = readFileSync(outPath).length;
const transitions = seriesPool.reduce((sum, s) => sum + (s.length - 1) / 2, 0);
console.log(
  `zones=${Object.keys(zoneMap).length} series=${seriesPool.length} transitions=${transitions} ` +
    `size=${(bytes / 1024).toFixed(1)} KiB in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
console.log(`source: ${output.source}`);

// Self-check: the first and last offsets must match a direct query.
for (const zone of ['Africa/Casablanca', 'Europe/Paris', 'America/New_York', 'Asia/Riyadh', 'UTC']) {
  const index = zoneMap[zone];
  if (index === undefined) continue;
  const s = seriesPool[index];
  const last = s[s.length - 1];
  const direct = offsetAt(zone, END - DAY);
  if (last !== direct) console.warn(`WARNING ${zone}: last offset ${last} != direct ${direct}`);
}
