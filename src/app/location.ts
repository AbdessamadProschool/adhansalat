/**
 * Location picker.
 *
 * Three ways to get a position, as the brief requires: device GPS, a bundled
 * city catalogue, or manual coordinates. All three are optional and the app keeps
 * working if the user refuses geolocation.
 *
 * Two rules are enforced here:
 *  - the IANA zone always comes from a real source (the city record, the OS for a
 *    GPS fix, or an explicit user choice) — never from a UTC offset;
 *  - a GPS fix is labelled with the nearest catalogue city but does NOT take that
 *    city's zone, because a point 30 km away can be in another zone.
 */

import { isValidTimeZone } from '../core/timezone.js';
import { bundledZones } from '../core/tzdata.js';
import type { GeoLocation } from '../core/types.js';
import { getCountryProfile, countryName } from '../core/profiles.js';
import {
  CITY_STATS,
  CORE_CITIES,
  REGION_BUCKETS,
  citiesOf,
  cityById,
  cityDataState,
  cityDisplayName,
  cityRegionLabel,
  countriesSorted,
  downloadMoroccoCatalogue,
  ensureCityIndex,
  loadRegion,
  nearestCity,
  normalisePlaceName,
  searchCities,
  searchCitiesLoaded,
  type City,
} from './cities.js';
import type { AppContext } from './context.js';
import { alertBox, el, emptyState, icon, segmented } from './ui.js';

function allTimeZones(): string[] {
  // The bundled table understands every IANA zone, so the picker offers exactly
  // those — no dependency on what this particular host happens to ship.
  const bundled = bundledZones();
  if (bundled.length > 0) return bundled;
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone');
    if (list && list.length > 0) return list;
  } catch {
    /* older browser: fall back to the zones present in the city catalogue */
  }
  return [...new Set(CORE_CITIES.map((c) => c.tz))].sort();
}

export function applyGeoLocation(
  ctx: AppContext,
  geo: GeoLocation,
  options: { applyCountryProfile: boolean },
): void {
  ctx.store.update((draft) => {
    draft.location = geo;
    if (options.applyCountryProfile && geo.countryCode) {
      const profile = getCountryProfile(geo.countryCode);
      draft.calculation.methodId = profile.defaultMethodId;
      draft.calculation.asrSchool = profile.defaultAsrSchool;
    }
  });
  ctx.toast(ctx.t('loc.updated'));
  ctx.refresh();
}

function fromCity(city: City): GeoLocation {
  return {
    latitude: city.lat,
    longitude: city.lon,
    timeZone: city.tz,
    countryCode: city.cc,
    cityId: String(city.id),
    cityName: city.name,
    source: 'manual-city',
    determinedAt: Date.now(),
  };
}

function cityButton(ctx: AppContext, city: City, close: () => void): HTMLElement {
  const details = [
    countryName(city.cc, ctx.intl),
    cityRegionLabel(city, ctx.locale),
    city.province && city.province !== city.region ? city.province : undefined,
  ].filter(Boolean);
  return el(
    'button',
    {
      class: 'city-option',
      attrs: { type: 'button' },
      on: {
        click: () => {
          applyGeoLocation(ctx, fromCity(city), { applyCountryProfile: !ctx.store.get().onboarded });
          close();
        },
      },
    },
    el('span', { class: 'prayer-icon' }, icon('pin', 17)),
    el(
      'span',
      { class: 'grow' },
      el('strong', { text: cityDisplayName(city, ctx.locale) }),
      el('span', {
        text: `${details.join(' · ')}${details.length ? ' · ' : ''}${city.tz} · ${city.lat.toFixed(2)}, ${city.lon.toFixed(2)}`,
      }),
    ),
    icon('chevron', 16),
  );
}

export function openLocationSheet(ctx: AppContext, close: () => void): HTMLElement {
  const t = ctx.t;
  const container = el('div', { class: 'stack' });

  // ---------------------------------------------------------------- GPS
  const gpsStatus = el('div', { class: 'small muted', attrs: { role: 'status', 'aria-live': 'polite' } });
  const gpsProposal = el('div', { class: 'stack sm', attrs: { 'aria-live': 'polite' } });
  const defaultGpsContent = [icon('pin', 17), el('span', { text: t('loc.gps') })];
  const gpsButton = el(
    'button',
    {
      class: 'btn primary block',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (!('geolocation' in navigator)) {
            gpsStatus.textContent = t('loc.gpsUnavailable');
            return;
          }
          gpsStatus.textContent = t('loc.detecting');
          gpsProposal.replaceChildren();
          gpsButton.setAttribute('disabled', 'true');
          gpsButton.classList.add('is-loading');
          gpsButton.replaceChildren(
            el('span', { class: 'spinner' }),
            el('span', { text: t('loc.detecting') }),
          );
          navigator.geolocation.getCurrentPosition(
            (position) => {
              gpsButton.removeAttribute('disabled');
              gpsButton.classList.remove('is-loading');
              gpsButton.replaceChildren(...defaultGpsContent);
              const { latitude, longitude, altitude } = position.coords;
              let tz = 'UTC';
              try {
                tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
              } catch {
                /* keep UTC */
              }
              if (!isValidTimeZone(tz)) tz = 'UTC';
              const near = nearestCity(latitude, longitude);
              const geo: GeoLocation = {
                latitude: Math.round(latitude * 1e5) / 1e5,
                longitude: Math.round(longitude * 1e5) / 1e5,
                timeZone: tz,
                countryCode: near && near.distanceKm < 250 ? near.city.cc : '',
                cityName:
                  near && near.distanceKm < 250
                    ? `${near.city.name} (${Math.round(near.distanceKm)} ${t('loc.km')})`
                    : undefined,
                source: 'gps',
                determinedAt: Date.now(),
              };
              if (altitude !== null && Number.isFinite(altitude) && altitude > 0) {
                geo.elevation = Math.round(altitude);
              }

              const current = ctx.store.get().location;
              if (current?.source === 'manual-city' && current.cityName) {
                // A manual choice is never replaced silently. The GPS fix is
                // proposed with its nearest catalogue city and the user decides.
                gpsStatus.textContent = t('loc.gpsProposal');
                const nearLabel = near
                  ? `${cityDisplayName(near.city, ctx.locale)} · ${Math.round(near.distanceKm)} ${t('loc.km')}`
                  : t('loc.noNearby');
                gpsProposal.replaceChildren(
                  el(
                    'div',
                    { class: 'card tight proposal' },
                    el('strong', { text: t('loc.gpsProposalTitle') }),
                    el('span', {
                      class: 'small muted',
                      text: `${nearLabel} · ${geo.latitude.toFixed(3)}, ${geo.longitude.toFixed(3)} · ${geo.timeZone}`,
                    }),
                    el(
                      'span',
                      { class: 'small' },
                      t('loc.gpsProposalBody', { city: current.cityName }),
                    ),
                    el(
                      'div',
                      { class: 'btn-row' },
                      el(
                        'button',
                        {
                          class: 'btn primary sm',
                          attrs: { type: 'button' },
                          on: {
                            click: () => {
                              applyGeoLocation(ctx, geo, {
                                applyCountryProfile: !ctx.store.get().onboarded,
                              });
                              close();
                            },
                          },
                        },
                        t('loc.gpsUse'),
                      ),
                      el(
                        'button',
                        {
                          class: 'btn ghost sm',
                          attrs: { type: 'button' },
                          on: {
                            click: () => {
                              gpsProposal.replaceChildren();
                              gpsStatus.textContent = t('loc.gpsKept', { city: current.cityName ?? '' });
                            },
                          },
                        },
                        t('loc.gpsKeep', { city: current.cityName }),
                      ),
                    ),
                  ),
                );
                return;
              }

              applyGeoLocation(ctx, geo, { applyCountryProfile: !ctx.store.get().onboarded });
              close();
            },
            (error) => {
              gpsButton.removeAttribute('disabled');
              gpsButton.classList.remove('is-loading');
              gpsButton.replaceChildren(...defaultGpsContent);
              gpsStatus.textContent =
                error.code === error.PERMISSION_DENIED
                  ? t('loc.gpsDenied')
                  : error.code === error.TIMEOUT
                    ? t('loc.gpsTimeout')
                    : t('loc.gpsUnavailable');
            },
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
          );
        },
      },
    },
    ...defaultGpsContent,
  );

  container.append(
    alertBox('info', t('loc.current'), t('loc.autoTz')),
    gpsButton,
    gpsStatus,
    gpsProposal,
  );

  // ---------------------------------------------------------------- tabs
  let tab: 'search' | 'country' | 'coords' = 'search';
  const body = el('div', { class: 'stack' });
  const tabsWrap = el('div');

  const renderTabs = () => {
    tabsWrap.replaceChildren(
      segmented<'search' | 'country' | 'coords'>(
        tab,
        [
          { value: 'search', label: t('loc.tab.search') },
          { value: 'country', label: t('loc.tab.country') },
          { value: 'coords', label: t('loc.tab.coords') },
        ],
        (next) => {
          tab = next;
          renderTabs();
          renderBody();
        },
      ),
    );
  };

  const renderBody = () => {
    body.replaceChildren();
    if (tab === 'search') {
      const input = el('input', {
        attrs: { type: 'search', placeholder: t('loc.searchCity'), 'aria-label': t('loc.searchCity') },
      });
      const status = el('p', { class: 'tiny muted', attrs: { role: 'status', 'aria-live': 'polite' } });
      const results = el('div', { class: 'stack sm' });
      let sequence = 0;

      const renderResults = (found: City[]) => {
        results.replaceChildren();
        if (input.value.trim().length >= 2 && found.length === 0) {
          results.appendChild(emptyState({ art: 'compass', title: t('loc.noResults') }));
        }
        for (const city of found) results.appendChild(cityButton(ctx, city, close));
      };

      const run = async () => {
        const query = input.value;
        const mine = ++sequence;
        // The bundled core answers instantly; the full Moroccan index may need
        // one fetch on the first search. Results are replaced only when the
        // answer still belongs to the current query.
        renderResults(searchCitiesLoaded(query, 30));
        if (query.trim().length < 2) {
          status.textContent = '';
          return;
        }
        if (cityDataState() === 'failed') {
          status.textContent = t('loc.catalogueFailed');
          return;
        }
        status.textContent = cityDataState() === 'ready' ? '' : t('loc.loadingCatalogue');
        const found = await searchCities(query, 30);
        if (mine !== sequence) return;
        status.textContent = cityDataState() === 'failed' ? t('loc.catalogueFailed') : '';
        renderResults(found);
      };

      let timer: ReturnType<typeof setTimeout> | null = null;
      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void run(), 120);
      });
      ctx.registerCleanup(() => {
        if (timer) clearTimeout(timer);
      });
      // Opening the picker is a clear intent to search: start fetching the
      // index now, without blocking the first screen.
      if (cityDataState() === 'core') void ensureCityIndex();
      body.append(el('div', { class: 'search-field' }, icon('search', 18), input), status, results);
    } else if (tab === 'country') {
      const countries = countriesSorted(ctx.intl);
      const countrySelect = el('select', { attrs: { 'aria-label': t('loc.country') } });
      for (const country of countries) {
        countrySelect.appendChild(
          el('option', { text: `${country.name} (${country.code}) · ${country.count}`, attrs: { value: country.code } }),
        );
      }
      const chooser = el('div', { class: 'stack sm' });
      const current = ctx.store.get().location;
      if (current?.countryCode && countries.some((c) => c.code === current.countryCode)) {
        countrySelect.value = current.countryCode;
      }

      const choose = (city: City) => {
        applyGeoLocation(ctx, fromCity(city), {
          applyCountryProfile: !ctx.store.get().onboarded,
        });
        close();
      };

      let searchTimer: ReturnType<typeof setTimeout> | null = null;

      /**
       * Morocco is too large for a `<select>` and is split into one file per
       * region. The region is fetched the first time it is opened, then kept by
       * the service worker so the same place works offline afterwards.
       */
      const renderMorocco = () => {
        const buckets = Object.keys(REGION_BUCKETS).sort((a, b) =>
          a === '00' ? 1 : b === '00' ? -1 : a.localeCompare(b),
        );
        const regionSelect = el('select', { attrs: { 'aria-label': t('loc.region') } });
        for (const key of buckets) {
          const bucket = REGION_BUCKETS[key]!;
          const label = ctx.locale === 'ar' && bucket.ar ? bucket.ar : bucket.name;
          regionSelect.appendChild(
            el('option', { text: `${label} · ${bucket.count}`, attrs: { value: key } }),
          );
        }
        const currentCity =
          current?.countryCode === 'MA' && current.cityId
            ? cityById(Number(current.cityId))
            : undefined;
        const preferred = currentCity?.admin;
        regionSelect.value = preferred && REGION_BUCKETS[preferred] ? preferred : '07';

        const status = el('p', { class: 'tiny muted', attrs: { role: 'status', 'aria-live': 'polite' } });
        const filter = el('input', {
          attrs: { type: 'search', placeholder: t('loc.searchCity'), 'aria-label': t('loc.searchCity') },
        });
        const listNode = el('div', { class: 'stack sm' });
        const downloadStatus = el('p', { class: 'tiny muted', attrs: { role: 'status', 'aria-live': 'polite' } });
        let loadedKey = '';
        let loadedCities: City[] = [];

        const renderList = () => {
          const folded = normalisePlaceName(filter.value);
          const found =
            folded.length < 2
              ? loadedCities.slice(0, 60)
              : loadedCities
                  .filter((city) => {
                    const haystack = [city.name, city.ascii, city.ar, ...(city.alts ?? [])]
                      .filter(Boolean)
                      .map((value) => normalisePlaceName(value as string));
                    return haystack.some((value) => value.includes(folded));
                  })
                  .slice(0, 60);
          listNode.replaceChildren();
          if (filter.value.trim().length >= 2 && found.length === 0) {
            listNode.appendChild(emptyState({ art: 'compass', title: t('loc.noResults') }));
          }
          for (const city of found) listNode.appendChild(cityButton(ctx, city, close));
        };

        const openRegion = async (key: string) => {
          loadedKey = key;
          loadedCities = [];
          listNode.replaceChildren();
          status.textContent = t('loc.regionLoading');
          const cities = await loadRegion(key);
          if (loadedKey !== key) return;
          loadedCities = cities;
          status.textContent =
            cities.length === 0
              ? t('loc.regionUnavailable')
              : t('loc.regionLoaded', { count: cities.length });
          renderList();
        };

        regionSelect.addEventListener('change', () => void openRegion(regionSelect.value));
        filter.addEventListener('input', () => {
          if (searchTimer) clearTimeout(searchTimer);
          searchTimer = setTimeout(renderList, 140);
        });

        const download = el(
          'button',
          { class: 'btn sm block', attrs: { type: 'button' } },
          icon('download', 17),
          t('loc.downloadMorocco'),
        );
        download.addEventListener('click', async () => {
          download.setAttribute('disabled', 'true');
          downloadStatus.textContent = t('loc.downloading', { done: 0, total: Object.keys(REGION_BUCKETS).length + 1 });
          const result = await downloadMoroccoCatalogue((done, total) => {
            downloadStatus.textContent = t('loc.downloading', { done, total });
          });
          download.removeAttribute('disabled');
          downloadStatus.textContent = result.ok
            ? t('loc.downloadDone')
            : t('loc.downloadFailed', { count: result.failed.length });
        });

        chooser.append(
          el('div', { class: 'field' }, el('label', { text: t('loc.region') }), regionSelect),
          el('div', { class: 'search-field' }, icon('search', 18), filter),
          status,
          listNode,
          el('hr'),
          download,
          downloadStatus,
          el('p', { class: 'tiny muted', text: t('loc.localityCount', { count: CITY_STATS.morocco }) }),
        );
        void openRegion(regionSelect.value);
      };

      const renderChooser = () => {
        const code = countrySelect.value;
        chooser.replaceChildren();
        if (code === 'MA') {
          renderMorocco();
          return;
        }

        // Other countries hold at most twelve bundled cities, so the familiar
        // dropdown stays. A bigger dataset would follow the region pattern.
        const list = citiesOf(code);
        const citySelect = el('select', { attrs: { 'aria-label': t('loc.city') } });
        for (const city of list) {
          citySelect.appendChild(
            el('option', {
              text: cityDisplayName(city, ctx.locale),
              attrs: { value: String(city.id) },
            }),
          );
        }
        if (current?.cityId && list.some((c) => String(c.id) === current.cityId)) {
          citySelect.value = current.cityId;
        }
        chooser.append(
          el('div', { class: 'field' }, el('label', { text: t('loc.city') }), citySelect),
          el(
            'button',
            {
              class: 'btn primary block',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const city = list.find((c) => String(c.id) === citySelect.value);
                  if (city) choose(city);
                },
              },
            },
            t('loc.apply'),
          ),
        );
      };

      countrySelect.addEventListener('change', renderChooser);
      ctx.registerCleanup(() => {
        if (searchTimer) clearTimeout(searchTimer);
      });
      renderChooser();
      body.append(
        el('div', { class: 'field' }, el('label', { text: t('loc.country') }), countrySelect),
        chooser,
      );
    } else {
      const latInput = el('input', { attrs: { type: 'number', step: '0.0001', min: '-90', max: '90', 'aria-label': t('loc.latitude') } });
      const lonInput = el('input', { attrs: { type: 'number', step: '0.0001', min: '-180', max: '180', 'aria-label': t('loc.longitude') } });
      const elevInput = el('input', { attrs: { type: 'number', step: '1', min: '0', 'aria-label': t('loc.elevation') } });
      const tzSelect = el('select', { attrs: { 'aria-label': t('loc.timezone') } });
      const zones = allTimeZones();
      const deviceTz = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          return 'UTC';
        }
      })();
      for (const zone of zones) tzSelect.appendChild(el('option', { text: zone, attrs: { value: zone } }));
      if (zones.includes(deviceTz)) tzSelect.value = deviceTz;
      const current = ctx.store.get().location;
      if (current?.source === 'manual-coordinates') {
        latInput.value = String(current.latitude);
        lonInput.value = String(current.longitude);
        if (current.elevation) elevInput.value = String(current.elevation);
        tzSelect.value = current.timeZone;
      }
      const error = el('p', { class: 'field-error', attrs: { role: 'alert' } });
      body.append(
        el('div', { class: 'field' }, el('label', { text: t('loc.latitude') }), latInput),
        el('div', { class: 'field' }, el('label', { text: t('loc.longitude') }), lonInput),
        el('div', { class: 'field' }, el('label', { text: t('loc.elevation') }), elevInput),
        el('div', { class: 'field' }, el('label', { text: t('loc.timezone') }), tzSelect),
        el(
          'button',
          {
            class: 'btn primary block',
            attrs: { type: 'button' },
            on: {
              click: () => {
                const lat = Number(latInput.value);
                const lon = Number(lonInput.value);
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
                  error.textContent = t('loc.invalidCoords');
                  return;
                }
                const elevation = Number(elevInput.value);
                const geo: GeoLocation = {
                  latitude: lat,
                  longitude: lon,
                  timeZone: tzSelect.value,
                  countryCode: '',
                  source: 'manual-coordinates',
                  determinedAt: Date.now(),
                };
                if (Number.isFinite(elevation) && elevation > 0) geo.elevation = Math.round(elevation);
                applyGeoLocation(ctx, geo, { applyCountryProfile: false });
                close();
              },
            },
          },
          t('loc.use'),
        ),
        error,
      );
    }
  };

  renderTabs();
  renderBody();
  container.append(el('hr'), tabsWrap, body);
  return container;
}
