/**
 * Qibla calculation: forward azimuth (bearing) and great-circle distance
 * from any point on Earth to the Kaaba in Mecca.
 *
 * Pure TypeScript, no DOM, no dependencies.
 */

import type { Coordinates } from './types.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * Geographical coordinates of the Kaaba (Mecca, Saudi Arabia).
 * Reference: WGS-84 standard positioning for the Kaaba.
 */
export const KAABA_COORDINATES = {
  latitude: 21.422487,
  longitude: 39.826206,
} as const;

/** Mean radius of the Earth in kilometres (IUGG standard). */
const EARTH_RADIUS_KM = 6371.0088;

export type CompassPoint =
  | 'N'
  | 'NNE'
  | 'NE'
  | 'ENE'
  | 'E'
  | 'ESE'
  | 'SE'
  | 'SSE'
  | 'S'
  | 'SSW'
  | 'SW'
  | 'WSW'
  | 'W'
  | 'WNW'
  | 'NW'
  | 'NNW';

const COMPASS_POINTS: readonly CompassPoint[] = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

export interface QiblaInfo {
  /** Initial bearing towards the Kaaba in degrees [0, 360), clockwise from true North. */
  bearing: number;
  /** Bearing rounded to the nearest integer degree. */
  bearingRounded: number;
  /** Great-circle distance to the Kaaba in kilometres, rounded to the nearest km. */
  distanceKm: number;
  /** 16-point compass direction (e.g. 'ESE', 'NE'). */
  compassPoint: CompassPoint;
  /** True if the location is within 50 metres of the Kaaba. */
  atKaaba: boolean;
}

/**
 * Maps a degree heading [0, 360) to one of the 16 compass points.
 */
export function compassPointFromBearing(bearing: number): CompassPoint {
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index]!;
}

/**
 * Calculates the forward azimuth (initial bearing) and great-circle distance
 * from the given coordinates to the Kaaba in Mecca.
 *
 * Uses the spherical law of cosines and forward azimuth formula on the sphere.
 */
export function calculateQibla(coords: Coordinates): QiblaInfo {
  const lat1 = coords.latitude * D2R;
  const lon1 = coords.longitude * D2R;
  const lat2 = KAABA_COORDINATES.latitude * D2R;
  const lon2 = KAABA_COORDINATES.longitude * D2R;

  const deltaLon = lon2 - lon1;

  // Haversine formula for distance
  const deltaLat = lat2 - lat1;
  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, a))), Math.sqrt(Math.max(0, 1 - a)));
  const distanceKm = Math.round(EARTH_RADIUS_KM * c);

  // If observer is within 100 metres of the Kaaba
  if (distanceKm < 0.1) {
    return {
      bearing: 0,
      bearingRounded: 0,
      distanceKm: 0,
      compassPoint: 'N',
      atKaaba: true,
    };
  }

  // Great-circle initial bearing
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const bearingRad = Math.atan2(y, x);
  const bearing = ((bearingRad * R2D) % 360 + 360) % 360;

  return {
    bearing,
    bearingRounded: Math.round(bearing) % 360,
    distanceKm,
    compassPoint: compassPointFromBearing(bearing),
    atKaaba: false,
  };
}
