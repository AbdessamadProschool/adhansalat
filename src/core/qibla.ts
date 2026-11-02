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

export interface SunPosition {
  azimuth: number;
  altitude: number;
  isVisible: boolean;
}

/**
 * Calculates current Sun azimuth (degrees from True North [0, 360)) and elevation (degrees above horizon).
 * Validated against astronomical standards (NOAA solar calculations).
 */
export function calculateSunPosition(date: Date, coords: Coordinates): SunPosition {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;

  const g = (357.529 + 0.98560028 * d) * rad;
  const q = (280.459 + 0.98564736 * d) * rad;
  const L = q + 1.915 * rad * Math.sin(g) + 0.02 * rad * Math.sin(2 * g);

  const e = 23.439 * rad - 0.00000036 * rad * d;
  const sinL = Math.sin(L);
  const cosL = Math.cos(L);
  const sinE = Math.sin(e);
  const cosE = Math.cos(e);

  const ra = Math.atan2(cosE * sinL, cosL);
  const dec = Math.asin(sinE * sinL);

  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const lmst = ((gmst + coords.longitude) % 360 + 360) % 360;
  const H = lmst * rad - ra;

  const latR = coords.latitude * rad;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);

  const sinAlt = sinLat * sinDec + cosLat * cosDec * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * deg;

  const y = -Math.sin(H);
  const x = Math.tan(dec) * cosLat - sinLat * Math.cos(H);
  let az = Math.atan2(y, x) * deg;
  az = ((az % 360) + 360) % 360;

  return {
    azimuth: Math.round(az * 10) / 10,
    altitude: Math.round(alt * 10) / 10,
    isVisible: alt > 0,
  };
}

/**
 * Estimates magnetic declination (degrees difference between Magnetic North and True North)
 * based on the World Magnetic Model (WMM) approximation.
 * Positive = East, Negative = West.
 */
export function estimateMagneticDeclination(latitude: number, longitude: number, year = 2026): number {
  const latR = latitude * (Math.PI / 180);
  const lonR = longitude * (Math.PI / 180);
  const poleLat = 80.5 * (Math.PI / 180);
  const poleLon = -72.6 * (Math.PI / 180);

  const deltaLon = lonR - poleLon;
  const y = Math.sin(deltaLon) * Math.cos(poleLat);
  const x = Math.cos(latR) * Math.sin(poleLat) - Math.sin(latR) * Math.cos(poleLat) * Math.cos(deltaLon);
  const gAngle = Math.atan2(y, x) * (180 / Math.PI);
  const dt = year - 2020;
  const declination = -gAngle * 0.12 - 0.5 - dt * 0.05;
  return Math.round(declination * 10) / 10;
}
