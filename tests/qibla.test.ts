import { describe, expect, it } from 'vitest';
import {
  calculateQibla,
  compassPointFromBearing,
  KAABA_COORDINATES,
} from '../src/core/qibla.js';

describe('Qibla calculation', () => {
  it('identifies when the observer is at the Kaaba', () => {
    const qibla = calculateQibla({
      latitude: KAABA_COORDINATES.latitude,
      longitude: KAABA_COORDINATES.longitude,
    });
    expect(qibla.atKaaba).toBe(true);
    expect(qibla.distanceKm).toBe(0);
    expect(qibla.bearingRounded).toBe(0);
  });

  it('calculates accurate Qibla for Paris, France', () => {
    const qibla = calculateQibla({ latitude: 48.8566, longitude: 2.3522 });
    expect(qibla.bearingRounded).toBe(119);
    expect(qibla.compassPoint).toBe('ESE');
    expect(qibla.distanceKm).toBeGreaterThan(4400);
    expect(qibla.distanceKm).toBeLessThan(4500);
  });

  it('calculates accurate Qibla for Casablanca, Morocco', () => {
    const qibla = calculateQibla({ latitude: 33.5731, longitude: -7.5898 });
    // Casablanca Qibla is 93.68° (approx 94° East)
    expect(qibla.bearingRounded).toBe(94);
    expect(qibla.compassPoint).toBe('E');
    expect(qibla.distanceKm).toBeGreaterThan(4700);
    expect(qibla.distanceKm).toBeLessThan(4850);
  });

  it('calculates accurate Qibla for New York City, USA', () => {
    // Great-circle path from New York to Mecca heads North-East (approx 58.5°)
    const qibla = calculateQibla({ latitude: 40.7128, longitude: -74.006 });
    expect(qibla.bearingRounded).toBe(58);
    expect(qibla.compassPoint).toBe('ENE');
    expect(qibla.distanceKm).toBeGreaterThan(10200);
    expect(qibla.distanceKm).toBeLessThan(10400);
  });

  it('calculates accurate Qibla for Cairo, Egypt', () => {
    const qibla = calculateQibla({ latitude: 30.0444, longitude: 31.2357 });
    expect(qibla.bearingRounded).toBe(136);
    expect(qibla.compassPoint).toBe('SE');
    expect(qibla.distanceKm).toBeGreaterThan(1200);
    expect(qibla.distanceKm).toBeLessThan(1350);
  });

  it('calculates accurate Qibla for Tokyo, Japan', () => {
    const qibla = calculateQibla({ latitude: 35.6762, longitude: 139.6503 });
    expect(qibla.bearingRounded).toBe(293);
    expect(qibla.compassPoint).toBe('WNW');
    expect(qibla.distanceKm).toBeGreaterThan(9400);
    expect(qibla.distanceKm).toBeLessThan(9600);
  });

  it('calculates accurate Qibla for Medina (North of Mecca heading South)', () => {
    const qibla = calculateQibla({ latitude: 24.4672, longitude: 39.6111 });
    // From Medina, Kaaba is almost due South (176°)
    expect(qibla.bearingRounded).toBe(176);
    expect(qibla.compassPoint).toBe('S');
    expect(qibla.distanceKm).toBeGreaterThan(330);
    expect(qibla.distanceKm).toBeLessThan(350);
  });

  it('calculates accurate Qibla for Rabat and Marrakech, Morocco', () => {
    const rabat = calculateQibla({ latitude: 34.0209, longitude: -6.8416 });
    expect(rabat.bearingRounded).toBe(95);
    expect(rabat.compassPoint).toBe('E');

    const marrakech = calculateQibla({ latitude: 31.6295, longitude: -7.9811 });
    expect(marrakech.bearingRounded).toBe(91);
    expect(marrakech.compassPoint).toBe('E');
  });

  it('calculates accurate Qibla for Dubai and Jakarta', () => {
    const dubai = calculateQibla({ latitude: 25.2048, longitude: 55.2708 });
    expect(dubai.bearingRounded).toBe(258);
    expect(dubai.compassPoint).toBe('WSW');

    const jakarta = calculateQibla({ latitude: -6.2088, longitude: 106.8456 });
    expect(jakarta.bearingRounded).toBe(295);
    expect(jakarta.compassPoint).toBe('WNW');
  });

  it('maps degrees to correct 16-point compass headings', () => {
    expect(compassPointFromBearing(0)).toBe('N');
    expect(compassPointFromBearing(360)).toBe('N');
    expect(compassPointFromBearing(45)).toBe('NE');
    expect(compassPointFromBearing(90)).toBe('E');
    expect(compassPointFromBearing(135)).toBe('SE');
    expect(compassPointFromBearing(180)).toBe('S');
    expect(compassPointFromBearing(225)).toBe('SW');
    expect(compassPointFromBearing(270)).toBe('W');
    expect(compassPointFromBearing(315)).toBe('NW');
    expect(compassPointFromBearing(119)).toBe('ESE');
    expect(compassPointFromBearing(58)).toBe('ENE');
  });

  it('handles negative or overflow degrees cleanly', () => {
    expect(compassPointFromBearing(-90)).toBe('W');
    expect(compassPointFromBearing(450)).toBe('E');
  });
});
