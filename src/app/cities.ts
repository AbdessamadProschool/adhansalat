/**
 * City catalogue access.
 *
 * Loading strategy (see docs/GEONAMES.md for the generated numbers):
 *
 *  - the **initial bundle** only contains `cities-core.json`: every non-Moroccan
 *    city from `cities15000` (1 696) and the 300 largest Moroccan localities;
 *  - the first search lazily fetches `/data/cities/index.json`, a compact index
 *    of all 46 039 Moroccan localities (id, name, region, coordinates);
 *  - `/data/cities/ma-XX.json` holds the full records of one region (alternate
 *    spellings, province, population) and is fetched only when that region is
 *    browsed or when the user asks for the whole Moroccan catalogue offline.
 *
 * Every layer is cached by the service worker, so a place that has been
 * downloaded once keeps working with no network. A failed fetch never hides the
 * bundled core: search simply reports that the extended index is unavailable.
 *
 * Country *names* are not stored: they come from ICU via `Intl.DisplayNames`.
 *
 * Licence: GeoNames CC BY 4.0 — https://www.geonames.org/
 */

import coreJson from '../core/data/cities-core.json';
import { countryName } from '../core/profiles.js';

export interface City {
  id: number;
  name: string;
  ascii: string;
  cc: string;
  lat: number;
  lon: number;
  tz: string;
  pop: number;
  admin?: string;
  /** First-order administrative division name (region). Morocco only. */
  region?: string;
  /** Second-order administrative division name (province/prefecture). Morocco only. */
  province?: string;
  /** Arabic display name when GeoNames or a verified official spelling provides one. */
  ar?: string;
  /** Searchable alternate spellings (Latin, Arabic, Tifinagh). */
  alts?: string[];
}

export interface RegionInfo {
  name: string;
  ar?: string;
  count?: number;
}

export interface RegionBucket extends RegionInfo {
  /** File name under `/data/cities/`, e.g. `ma-07.json`. */
  file: string;
  count: number;
}

interface CoreDataset {
  cities: City[];
  countryCodes: string[];
  countryCounts?: Record<string, number>;
  regions?: Record<string, RegionInfo>;
  regionBuckets?: Record<string, RegionBucket>;
  counts?: Record<string, number>;
  source?: string;
  license?: string;
  attribution?: string;
  sourceUrls?: string[];
}

const dataset = coreJson as unknown as CoreDataset;

/** Cities present in the initial bundle, usable before any network call. */
export const CORE_CITIES: readonly City[] = dataset.cities;
export const COUNTRY_CODES: readonly string[] = dataset.countryCodes.filter((c) => c !== 'EH');
const COUNTRY_COUNTS: Readonly<Record<string, number>> = dataset.countryCounts ?? {};
export const REGIONS: Readonly<Record<string, RegionInfo>> = dataset.regions ?? {};
export const REGION_BUCKETS: Readonly<Record<string, RegionBucket>> = dataset.regionBuckets ?? {};
export const CITY_DATA_SOURCE = dataset.source ?? 'GeoNames';
export const CITY_DATA_LICENSE = dataset.license ?? 'CC BY 4.0';
export const CITY_DATA_ATTRIBUTION = dataset.attribution ?? '© GeoNames contributors';
export const CITY_DATA_URLS: readonly string[] = dataset.sourceUrls ?? [];
export const CITY_STATS = {
  total: dataset.counts?.total ?? CORE_CITIES.length,
  morocco: dataset.counts?.morocco ?? CORE_CITIES.filter((city) => city.cc === 'MA').length,
  otherCountries: dataset.counts?.otherCountries ?? 0,
  countries: dataset.counts?.countries ?? COUNTRY_CODES.length,
  bundled: dataset.counts?.bundled ?? CORE_CITIES.length,
  bundledMorocco: dataset.counts?.bundledMorocco ?? 0,
};

/** Lazy search index for the Moroccan localities that are not bundled. */
export const CITY_INDEX_URL = '/data/cities/index.json';

function regionFile(key: string): string {
  return REGION_BUCKETS[key]?.file ?? `ma-${key}.json`;
}

/**
 * Normalises a place name for search.
 *
 * Handles French accents (`Fès` → `fes`), Arabic diacritics/tatweel, the
 * interchangeable alef/ya/ta-marbuta forms (`أ`, `إ`, `آ`, `ى`, `ة`), Arabic
 * digits, and punctuation so `Dar-el-Beida` matches `Dar el Beida`.
 */
export function normalisePlaceName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/[’'`´ʻʾʿ]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

interface IndexedCity {
  city: City;
  fields: string[];
  blob: string;
}

export interface CitySearchIndex {
  entries: IndexedCity[];
  byCountry: Map<string, IndexedCity[]>;
  regions: Readonly<Record<string, RegionInfo>>;
}

function fieldsFor(city: City, regions: Readonly<Record<string, RegionInfo>>): string[] {
  const region = city.admin ? regions[city.admin] : undefined;
  const values = [
    city.name,
    city.ascii,
    city.ar,
    city.region,
    city.province,
    region?.ar,
    ...(city.alts ?? []),
  ];
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const folded = normalisePlaceName(value);
    if (folded.length < 2 || seen.has(folded)) continue;
    seen.add(folded);
    fields.push(folded);
  }
  return fields;
}

/**
 * Builds a searchable index. Exported so tests can run the exact same ranking
 * over the full dataset without loading it into the application bundle.
 */
export function buildSearchIndex(
  cities: readonly City[],
  regions: Readonly<Record<string, RegionInfo>> = REGIONS,
): CitySearchIndex {
  const entries: IndexedCity[] = [];
  const byCountry = new Map<string, IndexedCity[]>();
  for (const city of cities) {
    const fields = fieldsFor(city, regions);
    const entry: IndexedCity = { city, fields, blob: fields.join(' | ') };
    entries.push(entry);
    const list = byCountry.get(city.cc);
    if (list) list.push(entry);
    else byCountry.set(city.cc, [entry]);
  }
  return { entries, byCountry, regions };
}

/**
 * Ranked, accent/script-insensitive search.
 *
 * Scoring: exact name/variant (0), prefix (1), all words present (2), substring
 * (3). Ties go to the larger population, then to the shorter name, so searching
 * "fes" returns Fès before a hamlet called "Fesna".
 */
export function searchIndex(
  index: CitySearchIndex,
  query: string,
  limit = 40,
  countryCode?: string,
): City[] {
  const q = normalisePlaceName(query);
  if (q.length < 2) return [];
  const tokens = q.split(' ').filter(Boolean);
  const pool = countryCode ? (index.byCountry.get(countryCode.toUpperCase()) ?? []) : index.entries;
  const out: Array<{ city: City; score: number; length: number }> = [];

  for (const entry of pool) {
    let best = 4;
    for (const field of entry.fields) {
      if (field === q) {
        best = 0;
        break;
      }
      if (field.startsWith(q)) {
        if (best > 1) best = 1;
      } else if (field.includes(q) && best > 3) {
        best = 3;
      }
    }
    if (best === 4 && tokens.length > 1 && tokens.every((token) => entry.blob.includes(token))) {
      best = 2;
    }
    if (best < 4) out.push({ city: entry.city, score: best, length: entry.city.name.length });
  }

  out.sort(
    (a, b) =>
      a.score - b.score ||
      b.city.pop - a.city.pop ||
      a.length - b.length ||
      a.city.name.localeCompare(b.city.name, 'fr'),
  );
  return out.slice(0, limit).map((row) => row.city);
}

// ------------------------------------------------------------- runtime catalog

/** Every city known so far: the bundle plus whatever has been downloaded. */
const catalog = new Map<number, City>();
for (const city of CORE_CITIES) catalog.set(city.id, city);

let searchIndexCache: CitySearchIndex = buildSearchIndex(CORE_CITIES);
let rebuildPending = false;

function rebuildIndex(): void {
  searchIndexCache = buildSearchIndex([...catalog.values()]);
  rebuildPending = false;
}

function addCities(cities: readonly City[], replaceExisting = false): boolean {
  let changed = false;
  for (const city of cities) {
    // A full region record always wins over the minimal index record; the
    // index itself never overwrites a richer bundled record.
    if (replaceExisting || !catalog.has(city.id)) {
      catalog.set(city.id, city);
      changed = true;
    }
  }
  if (changed) rebuildPending = true;
  return changed;
}

export type CityDataState = 'core' | 'loading' | 'ready' | 'failed';

let indexState: CityDataState = 'core';
let indexPromise: Promise<boolean> | null = null;
const regionState = new Map<string, CityDataState>();
const regionPromises = new Map<string, Promise<City[]>>();

export function cityDataState(): CityDataState {
  return indexState;
}

interface RemoteIndexFile {
  version?: number;
  total?: number;
  regions?: Record<string, RegionBucket>;
  cities: Array<[number, string, string, number, number]>;
  population?: Record<string, number>;
  arabic?: Record<string, string>;
  zones?: Record<string, string>;
}

function materialiseIndex(file: RemoteIndexFile): City[] {
  const out: City[] = [];
  const population = file.population ?? {};
  const arabic = file.arabic ?? {};
  const zones = file.zones ?? {};
  for (const [id, name, key, lat, lon] of file.cities) {
    const region = key === '00' ? undefined : REGIONS[key];
    out.push({
      id,
      name,
      ascii: name,
      cc: 'MA',
      lat,
      lon,
      tz: zones[id] ?? 'Africa/Casablanca',
      pop: population[id] ?? 0,
      admin: key === '00' ? undefined : key,
      region: region?.name,
      ar: arabic[id],
    });
  }
  return out;
}

/**
 * Downloads the compact Moroccan search index. Called on the first search; on
 * failure the bundled core keeps working and the UI says the extended catalogue
 * is not available offline.
 */
export function ensureCityIndex(): Promise<boolean> {
  if (indexState === 'ready') return Promise.resolve(true);
  if (indexPromise) return indexPromise;
  indexState = 'loading';
  indexPromise = (async () => {
    try {
      const response = await fetch(CITY_INDEX_URL, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const file = (await response.json()) as RemoteIndexFile;
      if (!Array.isArray(file.cities)) throw new Error('invalid index payload');
      addCities(materialiseIndex(file));
      if (rebuildPending) rebuildIndex();
      indexState = 'ready';
      return true;
    } catch {
      indexState = 'failed';
      return false;
    } finally {
      indexPromise = null;
    }
  })();
  return indexPromise;
}

/** Fetches one Moroccan region with its full records. */
export function loadRegion(key: string): Promise<City[]> {
  const cached = regionPromises.get(key);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await fetch(`/data/cities/${regionFile(key)}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { cities?: City[] };
      if (!Array.isArray(payload.cities)) throw new Error('invalid region payload');
      addCities(payload.cities, true);
      if (rebuildPending) rebuildIndex();
      regionState.set(key, 'ready');
      return payload.cities;
    } catch {
      regionState.set(key, 'failed');
      regionPromises.delete(key);
      return [];
    }
  })();
  regionState.set(key, 'loading');
  regionPromises.set(key, promise);
  return promise;
}

export function regionDataState(key: string): CityDataState {
  return regionState.get(key) ?? 'core';
}

/**
 * Ensures the whole Moroccan catalogue is in the browser cache. Region files are
 * fetched one by one so a slow connection can still report progress, and the
 * service worker stores each successful response.
 */
export async function downloadMoroccoCatalogue(
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; failed: string[] }> {
  const keys = Object.keys(REGION_BUCKETS).sort();
  const total = keys.length + 1;
  const failed: string[] = [];
  if (!(await ensureCityIndex())) failed.push(CITY_INDEX_URL);
  let done = 1;
  onProgress?.(done, total);
  for (const key of keys) {
    const cities = await loadRegion(key);
    if (cities.length === 0) failed.push(regionFile(key));
    done += 1;
    onProgress?.(done, total);
  }
  return { ok: failed.length === 0, failed };
}

/**
 * Search over everything known: the bundled core immediately, then the full
 * Moroccan index once it has been fetched. Results from the index already carry
 * coordinates and a zone, so choosing one never needs another request.
 */
export async function searchCities(query: string, limit = 40, countryCode?: string): Promise<City[]> {
  const pooled = countryCode ? countryCode.toUpperCase() : undefined;
  // The extended index only holds Moroccan places: another country is fully
  // covered by the bundle.
  const needsIndex = (!pooled || pooled === 'MA') && indexState !== 'failed';
  if (needsIndex && indexState !== 'ready') await ensureCityIndex();
  if (rebuildPending) rebuildIndex();
  return searchIndex(searchIndexCache, query, limit, countryCode);
}

/** Synchronous search over what is already loaded. Used for instant feedback. */
export function searchCitiesLoaded(query: string, limit = 40, countryCode?: string): City[] {
  if (rebuildPending) rebuildIndex();
  return searchIndex(searchIndexCache, query, limit, countryCode);
}

export function citiesOf(countryCode: string): City[] {
  return (searchIndexCache.byCountry.get(countryCode.toUpperCase()) ?? []).map((entry) => entry.city);
}

export function cityById(id: number | undefined): City | undefined {
  if (id === undefined) return undefined;
  return catalog.get(id);
}

export function countriesSorted(locale: string): Array<{ code: string; name: string; count: number }> {
  return COUNTRY_CODES.map((code) => ({
    code,
    name: countryName(code, locale),
    count: COUNTRY_COUNTS[code] ?? searchIndexCache.byCountry.get(code)?.length ?? 0,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Name shown in the current language; falls back to the GeoNames Latin name. */
export function cityDisplayName(city: City, locale: string): string {
  if (locale === 'ar' && city.ar) return city.ar;
  return city.name;
}

export function cityRegionLabel(city: City, locale: string): string | undefined {
  if (!city.admin) return city.region ?? city.province;
  const region = REGIONS[city.admin];
  if (!region) return city.region ?? city.province;
  return locale === 'ar' && region.ar ? region.ar : region.name;
}

export function cityLabel(city: City, locale: string): string {
  const country = countryName(city.cc, locale);
  return `${cityDisplayName(city, locale)} — ${country}`;
}

export function cityCount(): number {
  return CITY_STATS.total;
}

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest city among the loaded records (bundled core, or more once fetched). */
export function nearestCities(
  latitude: number,
  longitude: number,
  limit = 3,
): Array<{ city: City; distanceKm: number }> {
  const best: Array<{ city: City; distanceKm: number }> = [];
  for (const city of catalog.values()) {
    const distanceKm = haversineKm(latitude, longitude, city.lat, city.lon);
    if (best.length < limit) {
      best.push({ city, distanceKm });
      best.sort((a, b) => a.distanceKm - b.distanceKm);
    } else if (distanceKm < best[best.length - 1]!.distanceKm) {
      best[best.length - 1] = { city, distanceKm };
      best.sort((a, b) => a.distanceKm - b.distanceKm);
    }
  }
  return best;
}

/**
 * Nearest catalogue city, used only to *label* a GPS fix. The time zone for a
 * GPS position comes from the operating system (`Intl.resolvedOptions`), not
 * from the nearest city, because a city 40 km away can sit in another zone.
 */
export function nearestCity(
  latitude: number,
  longitude: number,
): { city: City; distanceKm: number } | null {
  return nearestCities(latitude, longitude, 1)[0] ?? null;
}
