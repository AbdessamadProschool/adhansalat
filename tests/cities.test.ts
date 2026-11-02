/**
 * City catalogue tests.
 *
 * The catalogue is generated, so these tests are the guardrail against a rebuild
 * that silently drops Morocco, introduces duplicate ids, stores coordinates that
 * would move a prayer time by hours, or lets the split files drift apart.
 *
 * They read the real generated files. The full dataset (`src/core/data/cities.json`)
 * is the test source of truth; the application bundle only imports
 * `cities-core.json`, which is asserted here too.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_CITIES,
  CITY_DATA_ATTRIBUTION,
  CITY_DATA_LICENSE,
  CITY_INDEX_URL,
  CITY_STATS,
  REGION_BUCKETS,
  REGIONS,
  buildSearchIndex,
  cityDisplayName,
  cityRegionLabel,
  nearestCity,
  normalisePlaceName,
  searchIndex,
  type City,
} from '../src/app/cities.js';
import { isValidTimeZone } from '../src/core/timezone.js';

const ROOT = process.cwd();

interface FullDataset {
  cities: City[];
  countryCodes: string[];
  counts: Record<string, number>;
}

const full = JSON.parse(
  readFileSync(join(ROOT, 'src', 'core', 'data', 'cities.json'), 'utf8'),
) as FullDataset;
const morocco = full.cities.filter((city) => city.cc === 'MA');
const world = full.cities.filter((city) => city.cc !== 'MA');

interface RegionFile {
  region: string | null;
  count: number;
  cities: City[];
}

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8')) as T;
}

const regionFiles = Object.entries(REGION_BUCKETS).map(([key, bucket]) => ({
  key,
  bucket,
  payload: readJson<RegionFile>('public', 'data', 'cities', bucket.file),
}));

interface IndexFile {
  total: number;
  regions: Record<string, { file: string; count: number }>;
  cities: Array<[number, string, string, number, number]>;
  population: Record<string, number>;
  arabic: Record<string, string>;
  zones: Record<string, string>;
}

const index = readJson<IndexFile>('public', 'data', 'cities', 'index.json');

const MIN_LAT = 20.7;
const MAX_LAT = 36.0;
const MIN_LON = -17.2;
const MAX_LON = -0.8;
const ZONES = new Set(['Africa/Casablanca', 'Africa/El_Aaiun']);

describe('filtered catalogue shape', () => {
  it('keeps every Moroccan locality and the world top cities', () => {
    expect(morocco.length).toBe(46_039);
    expect(world.length).toBe(2_566);
    expect(full.cities.length).toBe(48_605);
    expect(full.countryCodes.length).toBe(244);
    expect(CITY_STATS.morocco).toBe(46_039);
    expect(CITY_STATS.total).toBe(48_605);
    expect(CITY_STATS.countries).toBe(244);
  });

  it('exposes the GeoNames attribution', () => {
    expect(CITY_DATA_LICENSE).toBe('CC BY 4.0');
    expect(CITY_DATA_ATTRIBUTION).toContain('GeoNames');
  });

  it('has 12 Moroccan regions with names and Arabic names', () => {
    const codes = Object.keys(REGIONS).sort();
    expect(codes).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    for (const code of codes) {
      expect(REGIONS[code]?.name.length).toBeGreaterThan(1);
      expect(REGIONS[code]?.ar?.length).toBeGreaterThan(1);
    }
  });

  it('has no duplicate id or duplicate name+coordinate pair', () => {
    const ids = new Set<number>();
    const places = new Set<string>();
    const duplicateIds: number[] = [];
    const duplicatePlaces: string[] = [];
    for (const city of full.cities) {
      if (ids.has(city.id)) duplicateIds.push(city.id);
      ids.add(city.id);
      const key = `${city.name}|${city.lat}|${city.lon}`;
      if (places.has(key)) duplicatePlaces.push(key);
      places.add(key);
    }
    expect(duplicateIds).toEqual([]);
    expect(duplicatePlaces).toEqual([]);
  });

  it('stores valid coordinates and IANA zones', () => {
    const invalid = full.cities
      .filter(
        (city) =>
          !Number.isFinite(city.lat) ||
          !Number.isFinite(city.lon) ||
          Math.abs(city.lat) > 90 ||
          Math.abs(city.lon) > 180,
      )
      .map((city) => city.name);
    // `isValidTimeZone` builds an Intl formatter; caching the ~400 distinct
    // zones keeps this check fast instead of running it 47 000 times.
    const zoneCache = new Map<string, boolean>();
    const valid = (tz: string) => {
      const known = zoneCache.get(tz);
      if (known === undefined) {
        zoneCache.set(tz, isValidTimeZone(tz));
        return zoneCache.get(tz)!;
      }
      return known;
    };
    const badZones = full.cities.filter((city) => !valid(city.tz)).map((city) => city.tz);
    expect(invalid).toEqual([]);
    expect(badZones).toEqual([]);
  });

  it('keeps Moroccan localities inside the Morocco + Western Sahara envelope', () => {
    const outside = morocco
      .filter(
        (city) =>
          city.lat < MIN_LAT ||
          city.lat > MAX_LAT ||
          city.lon < MIN_LON ||
          city.lon > MAX_LON ||
          !ZONES.has(city.tz),
      )
      .map((city) => `${city.name} ${city.lat},${city.lon} ${city.tz}`);
    expect(outside).toEqual([]);
  });

  it('does not contain the three GeoNames entries with implausible data', () => {
    const ids = new Set(morocco.map((city) => city.id));
    // Zaouia bou Saïd (3.7 N, in the Gulf of Guinea), Aziader (in Spain),
    // Falaklak (Mauritania, Africa/Nouakchott).
    expect(ids.has(2_526_369)).toBe(false);
    expect(ids.has(2_556_625)).toBe(false);
    expect(ids.has(7_413_962)).toBe(false);
  });

  it('keeps the two localities with an uncertain administrative code', () => {
    const uncertain = morocco.filter((city) => !city.admin);
    expect(uncertain.length).toBe(2);
    expect(REGION_BUCKETS['00']).toBeDefined();
  });
});

describe('bundle split', () => {
  it('bundles only the core: world cities plus the 300 largest Moroccan ones', () => {
    expect(CORE_CITIES.length).toBe(2_866);
    expect(CORE_CITIES.filter((city) => city.cc === 'MA')).toHaveLength(300);
    expect(CORE_CITIES.filter((city) => city.cc !== 'MA')).toHaveLength(2_566);
    expect(CITY_STATS.bundled).toBe(2_866);
    expect(CITY_STATS.bundledMorocco).toBe(300);
  });

  it('keeps the core small enough for the initial JavaScript', () => {
    const bytes = readFileSync(join(ROOT, 'src', 'core', 'data', 'cities-core.json')).byteLength;
    expect(bytes).toBeLessThan(600 * 1024);
    expect(bytes).toBeGreaterThan(100 * 1024);
  });

  it('publishes the index at the URL the app fetches', () => {
    expect(CITY_INDEX_URL).toBe('/data/cities/index.json');
    expect(index.total).toBe(46_039);
    expect(index.cities).toHaveLength(46_039);
  });

  it('splits Morocco into one file per region, without gaps or duplicates', () => {
    const seen = new Set<number>();
    const duplicates: number[] = [];
    const mismatchedCounts: string[] = [];
    let total = 0;
    for (const { key, bucket, payload } of regionFiles) {
      if (payload.count !== payload.cities.length || payload.count !== bucket.count) {
        mismatchedCounts.push(`${key}: ${payload.count}/${payload.cities.length}/${bucket.count}`);
      }
      if (index.regions[key]?.file !== bucket.file) mismatchedCounts.push(`${key}: wrong file`);
      for (const city of payload.cities) {
        if (city.cc !== 'MA') mismatchedCounts.push(`${city.id}: country ${city.cc}`);
        if (seen.has(city.id)) duplicates.push(city.id);
        seen.add(city.id);
      }
      total += payload.cities.length;
    }
    const missing = morocco.filter((city) => !seen.has(city.id)).map((city) => city.name);
    expect(mismatchedCounts).toEqual([]);
    expect(duplicates).toEqual([]);
    expect(total).toBe(46_039);
    expect(missing).toEqual([]);
  });

  it('keeps the light index consistent with the region files', () => {
    const ids = new Set<number>();
    const problems: string[] = [];
    const byId = new Map(morocco.map((city) => [city.id, city]));
    for (const [id, name, region, lat, lon] of index.cities) {
      if (ids.has(id)) problems.push(`duplicate id ${id}`);
      ids.add(id);
      if (!name) problems.push(`empty name for ${id}`);
      if (!index.regions[region]) problems.push(`unknown region ${region} for ${name}`);
      if (lat < MIN_LAT || lat > MAX_LAT || lon < MIN_LON || lon > MAX_LON) {
        problems.push(`outside envelope: ${name}`);
      }
      // Coordinates in the index must match the full record, so picking a result
      // before its region is fetched cannot move the prayer time.
      const city = byId.get(id);
      if (!city) problems.push(`index id ${id} missing from the full dataset`);
      else if (city.lat !== lat || city.lon !== lon) problems.push(`coordinates drift for ${name}`);
    }
    const badZones = Object.values(index.zones).filter((zone) => !ZONES.has(zone));
    expect(problems.slice(0, 20)).toEqual([]);
    expect(badZones).toEqual([]);
  });
});

describe('Moroccan localities', () => {
  it('contains small douars as well as the big cities', () => {
    const small = morocco.filter((city) => city.pop === 0);
    expect(small.length).toBeGreaterThan(40_000);
    expect(morocco.some((city) => city.name.includes('Douar'))).toBe(true);
  });

  it('carries region and province labels where GeoNames provides them', () => {
    const casablanca = morocco.find((city) => city.name === 'Casablanca');
    expect(casablanca).toBeDefined();
    expect(casablanca?.region).toBe('Casablanca-Settat');
    expect(casablanca?.province).toBe('Casablanca');
    expect(cityRegionLabel(casablanca!, 'fr')).toBe('Casablanca-Settat');
    expect(cityRegionLabel(casablanca!, 'ar')).toBe('الدار البيضاء سطات');
  });

  it('shows Arabic names for the cities that have a verified spelling', () => {
    const fes = morocco.find((city) => city.name === 'Fes');
    expect(cityDisplayName(fes!, 'ar')).toBe('فاس');
    expect(cityDisplayName(fes!, 'fr')).toBe('Fes');
    const casablanca = morocco.find((city) => city.name === 'Casablanca');
    expect(cityDisplayName(casablanca!, 'ar')).toBe('الدار البيضاء');
  });
});

describe('offline search', () => {
  const fullIndex = buildSearchIndex(full.cities);
  const searchAll = (query: string, limit = 40, cc?: string) =>
    searchIndex(fullIndex, query, limit, cc);

  it('normalises accents, case and Arabic variants', () => {
    expect(normalisePlaceName('Fès')).toBe('fes');
    expect(normalisePlaceName('TÉTOUAN')).toBe('tetouan');
    expect(normalisePlaceName('Dar-el-Beida')).toBe('dar el beida');
    expect(normalisePlaceName('الدار البيضاء')).toBe('الدار البيضاء');
    expect(normalisePlaceName('فاس')).toBe('فاس');
    expect(normalisePlaceName('  Sidi   Slimane ')).toBe('sidi slimane');
  });

  it('finds an accented city with an unaccented query', () => {
    const found = searchAll('Tetouan', 5, 'MA');
    expect(found[0]?.name).toBe('Tétouan');
  });

  it('finds Fes and Casablanca from Arabic', () => {
    expect(searchAll('فاس', 5, 'MA')[0]?.name).toBe('Fes');
    expect(searchAll('الدار البيضاء', 5, 'MA')[0]?.name).toBe('Casablanca');
  });

  it('finds international cities from Arabic search', () => {
    expect(searchAll('باريس', 5)[0]?.name).toBe('Paris');
    expect(searchAll('الجزائر', 5)[0]?.name).toBe('Algiers');
    expect(searchAll('تونس', 5)[0]?.name).toBe('Tunis');
    expect(searchAll('مكة', 5)[0]?.name).toBe('Makkah');
    expect(searchAll('مدريد', 5)[0]?.name).toBe('Madrid');
    expect(searchAll('بروكسل', 5)[0]?.name).toBe('Brussels');
  });

  it('matches alternate spellings', () => {
    const found = searchAll('dar el beida', 5, 'MA');
    expect(found[0]?.name).toBe('Casablanca');
  });

  it('ranks prefix matches before substrings and respects population', () => {
    const found = searchAll('casab', 10, 'MA');
    expect(found[0]?.name).toBe('Casablanca');
  });

  it('returns nothing for an unknown place or a one-letter query', () => {
    expect(searchAll('zzzznotaplace', 10, 'MA')).toEqual([]);
    expect(searchAll('f', 10, 'MA')).toEqual([]);
  });

  it('scopes search to one country', () => {
    const moroccan = searchAll('Rabat', 10, 'MA');
    expect(moroccan.length).toBeGreaterThan(0);
    expect(moroccan.every((city) => city.cc === 'MA')).toBe(true);
    const all = searchAll('Rabat', 20);
    expect(all.length).toBeGreaterThanOrEqual(moroccan.length);
    expect(all.some((city) => city.cc === 'MA')).toBe(true);
  });
});

describe('nearest locality', () => {
  it('labels a Casablanca GPS fix with a nearby Moroccan locality', () => {
    const near = nearestCity(33.5731, -7.5898);
    expect(near).not.toBeNull();
    expect(near!.city.cc).toBe('MA');
    expect(near!.distanceKm).toBeLessThan(15);
  });

  it('returns the same distance for the same point', () => {
    const a = nearestCity(31.63, -8.0);
    const b = nearestCity(31.63, -8.0);
    expect(a?.city.id).toBe(b?.city.id);
    expect(a?.distanceKm).toBeCloseTo(b!.distanceKm, 6);
  });

  it('only uses the bundled core until the extended index is loaded', () => {
    const bundled = nearestCity(31.63, -8.0);
    expect(CORE_CITIES.some((city) => city.id === bundled?.city.id)).toBe(true);
  });
});
