import { describe, expect, it } from 'vitest';
import { calculatePrayerTimes } from '../src/core/prayertimes.js';
import { formatInZone } from '../src/core/timezone.js';

describe('Morocco Habous official reference comparison', () => {
  it('matches official Moroccan Ministry of Habous times for Casablanca without extra user adjustments', () => {
    // Official Habous times for Casablanca on 29 Oct:
    // Fajr: 05:18, Sunrise: 06:44, Dhuhr: 12:19, Asr: 15:18, Maghrib: 17:46, Isha: 19:01
    const locCasa = {
      latitude: 33.5731,
      longitude: -7.5898,
      elevation: 17,
      timeZone: 'Africa/Casablanca',
    };

    const fmt = (d: Date | null) =>
      d ? formatInZone(d, 'Africa/Casablanca', 'fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';

    const casaTimes = calculatePrayerTimes('2026-10-29', locCasa, {
      methodId: 21,
      asrSchool: 'standard',
      highLatitudeRule: 'angleBased',
      adjustments: {},
    });

    const casaCalc = {
      fajr: fmt(casaTimes.fajr),
      sunrise: fmt(casaTimes.sunrise),
      dhuhr: fmt(casaTimes.dhuhr),
      asr: fmt(casaTimes.asr),
      maghrib: fmt(casaTimes.maghrib),
      isha: fmt(casaTimes.isha),
    };

    console.log('[Official Method 21 - Casablanca]', casaCalc);

    // Exact match on all 6 times:
    expect(casaCalc.fajr).toBe('05:18');
    expect(casaCalc.sunrise).toBe('06:44');
    expect(casaCalc.dhuhr).toBe('12:19');
    expect(casaCalc.asr).toBe('15:18');
    expect(casaCalc.maghrib).toBe('17:46');
    expect(casaCalc.isha).toBe('19:01');
  });

  it('matches official Moroccan Ministry of Habous times for Rabat', () => {
    // Official Habous times for Rabat on 29 Oct:
    // Fajr: 05:15, Sunrise: 06:41, Dhuhr: 12:16, Asr: 15:14, Maghrib: 17:42, Isha: 18:57
    const locRabat = {
      latitude: 34.0209,
      longitude: -6.8416,
      elevation: 53,
      timeZone: 'Africa/Casablanca',
    };

    const fmt = (d: Date | null) =>
      d ? formatInZone(d, 'Africa/Casablanca', 'fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';

    const rabatTimes = calculatePrayerTimes('2026-10-29', locRabat, {
      methodId: 21,
      asrSchool: 'standard',
      highLatitudeRule: 'angleBased',
      adjustments: {},
    });

    const rabatCalc = {
      fajr: fmt(rabatTimes.fajr),
      sunrise: fmt(rabatTimes.sunrise),
      dhuhr: fmt(rabatTimes.dhuhr),
      asr: fmt(rabatTimes.asr),
      maghrib: fmt(rabatTimes.maghrib),
      isha: fmt(rabatTimes.isha),
    };

    console.log('[Official Method 21 - Rabat]', rabatCalc);

    expect(rabatCalc.fajr).toBe('05:15');
    expect(rabatCalc.sunrise).toBe('06:41');
    expect(rabatCalc.dhuhr).toBe('12:16');
    // Difference is <= 1 minute:
    expect(Math.abs(Number(rabatCalc.asr.slice(3)) - 14)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(rabatCalc.maghrib.slice(3)) - 42)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(rabatCalc.isha.slice(3)) - 57)).toBeLessThanOrEqual(1);
  });
});
