/**
 * Async loading of the split catalogue.
 *
 * The application ships only `cities-core.json`; the full Moroccan index and the
 * per-region files are fetched on demand. These tests exercise the real loader
 * with a stubbed `fetch` that serves the real generated files, including the
 * offline failure path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CORE_CITIES,
  CITY_INDEX_URL,
  cityById,
  cityDataState,
  ensureCityIndex,
  loadRegion,
  regionDataState,
  searchCities,
  searchCitiesLoaded,
} from '../src/app/cities.js';

const ROOT = process.cwd();
const indexText = readFileSync(join(ROOT, 'public', 'data', 'cities', 'index.json'), 'utf8');
const regionText = readFileSync(join(ROOT, 'public', 'data', 'cities', 'ma-07.json'), 'utf8');

interface IndexFile {
  cities: Array<[number, string, string, number, number]>;
}

const index = JSON.parse(indexText) as IndexFile;
const coreIds = new Set(CORE_CITIES.map((city) => city.id));
const sample = index.cities.find(([id, name]) => !coreIds.has(id) && name.length > 8 && /^[A-Z]/.test(name))!;

const calls: string[] = [];

beforeAll(() => {
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url === CITY_INDEX_URL) return new Response(indexText, { status: 200 });
    if (url === '/data/cities/ma-07.json') return new Response(regionText, { status: 200 });
    return new Response('not found', { status: 404 });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('lazy catalogue loading', () => {
  it('starts with the bundled core only', () => {
    expect(cityDataState()).toBe('core');
    expect(cityById(sample[0])).toBeUndefined();
    expect(searchCitiesLoaded('Casablanca', 5, 'MA')[0]?.name).toBe('Casablanca');
  });

  it('fetches the light index once and exposes every Moroccan locality', async () => {
    expect(await ensureCityIndex()).toBe(true);
    expect(cityDataState()).toBe('ready');
    expect(calls.filter((url) => url === CITY_INDEX_URL)).toHaveLength(1);

    const city = cityById(sample[0]);
    expect(city).toBeDefined();
    expect(city?.name).toBe(sample[1]);
    expect(city?.lat).toBe(sample[3]);
    expect(city?.lon).toBe(sample[4]);
    expect(city?.cc).toBe('MA');
    expect(city?.tz.startsWith('Africa/')).toBe(true);

    const found = await searchCities(sample[1], 5, 'MA');
    expect(found.some((entry) => entry.id === sample[0])).toBe(true);
  }, 15000);

  it('does not re-fetch the index on a second search', async () => {
    const before = calls.length;
    await ensureCityIndex();
    await searchCities('Casablanca', 5);
    expect(calls.length).toBe(before);
  });

  it('loads one region on demand and upgrades its records', async () => {
    expect(regionDataState('07')).toBe('core');
    const cities = await loadRegion('07');
    expect(cities.length).toBe(12_376);
    expect(regionDataState('07')).toBe('ready');

    const enriched = cities.find((city) => city.province);
    expect(enriched).toBeDefined();
    expect(cityById(enriched!.id)?.province).toBe(enriched!.province);
    // A loaded region is served from memory afterwards.
    const again = await loadRegion('07');
    expect(again).toBe(cities);
  }, 15000);

  it('reports a region it cannot fetch instead of inventing records', async () => {
    const missing = await loadRegion('11');
    expect(missing).toEqual([]);
    expect(regionDataState('11')).toBe('failed');
  });
});

describe('offline behaviour', () => {
  it('falls back to the bundled core when the index cannot be fetched', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const fresh = await import('../src/app/cities.js');
    expect(await fresh.ensureCityIndex()).toBe(false);
    expect(fresh.cityDataState()).toBe('failed');
    const found = await fresh.searchCities('Casablanca', 5, 'MA');
    expect(found[0]?.name).toBe('Casablanca');
    expect(fresh.searchCitiesLoaded('Casablanca', 5, 'MA')[0]?.name).toBe('Casablanca');
  });
});
