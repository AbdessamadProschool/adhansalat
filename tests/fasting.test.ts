import { describe, expect, it } from 'vitest';
import {
  calculateImsak,
  computeFastingStatus,
  getDayFastingTimes,
  getFastingRecommendation,
  IFTAR_DUA,
} from '../src/core/fasting.js';
import type { HijriDate } from '../src/core/hijri.js';
import type { PrayerTimes } from '../src/core/types.js';

describe('Fasting module (Sawm)', () => {
  it('calculates Imsak as 10 minutes before Fajr by default', () => {
    const fajr = new Date('2026-05-15T04:30:00Z');
    const imsak = calculateImsak(fajr, 10);
    expect(imsak).not.toBeNull();
    expect(imsak!.toISOString()).toBe('2026-05-15T04:20:00.000Z');
  });

  it('allows custom Imsak offset (e.g. 15 minutes)', () => {
    const fajr = new Date('2026-05-15T04:30:00Z');
    const imsak = calculateImsak(fajr, 15);
    expect(imsak!.toISOString()).toBe('2026-05-15T04:15:00.000Z');
  });

  it('calculates total fasting duration in minutes', () => {
    const mockTimes: PrayerTimes = {
      date: '2026-05-15',
      timeZone: 'UTC',
      fajr: new Date('2026-05-15T04:00:00Z'),
      sunrise: new Date('2026-05-15T05:30:00Z'),
      dhuhr: new Date('2026-05-15T12:00:00Z'),
      asr: new Date('2026-05-15T15:30:00Z'),
      maghrib: new Date('2026-05-15T19:30:00Z'),
      isha: new Date('2026-05-15T21:00:00Z'),
      midnight: new Date('2026-05-15T23:30:00Z'),
      solarNoon: new Date('2026-05-15T12:00:00Z'),
      highLatitudeFallback: 'none',
      fallbackEvents: [],
      methodId: 1,
      asrSchool: 'standard',
    };

    const dayFasting = getDayFastingTimes(mockTimes, 10);
    // 04:00 to 19:30 = 15 hours and 30 minutes = 930 minutes
    expect(dayFasting.durationMinutes).toBe(930);
    expect(dayFasting.imsak!.toISOString()).toBe('2026-05-15T03:50:00.000Z');
  });

  describe('Fasting recommendations and Hijri calendar rules', () => {
    it('identifies Ramadan as obligatory fasting', () => {
      const ramadanDate: HijriDate = {
        day: 15,
        month: 9,
        year: 1447,
        monthName: 'Ramadan',
        formatted: '15 Ramadan 1447',
      };
      const rec = getFastingRecommendation(ramadanDate, new Date('2026-03-05'));
      expect(rec.isObligatory).toBe(true);
      expect(rec.isRecommended).toBe(true);
      expect(rec.type).toBe('ramadan');
    });

    it('identifies White Days (Ayyam al-Beed) as recommended', () => {
      const whiteDay: HijriDate = {
        day: 14,
        month: 2,
        year: 1448,
        monthName: 'Safar',
        formatted: '14 Safar 1448',
      };
      const rec = getFastingRecommendation(whiteDay, new Date('2026-07-28'));
      expect(rec.type).toBe('white-days');
      expect(rec.isRecommended).toBe(true);
      expect(rec.isForbidden).toBe(false);
    });

    it('identifies Eid al-Fitr as strictly forbidden for fasting', () => {
      const eidFitr: HijriDate = {
        day: 1,
        month: 10,
        year: 1447,
        monthName: 'Shawwal',
        formatted: '1 Shawwal 1447',
      };
      const rec = getFastingRecommendation(eidFitr, new Date('2026-03-20'));
      expect(rec.type).toBe('forbidden');
      expect(rec.isForbidden).toBe(true);
    });

    it('identifies Eid al-Adha and Tashreeq days as strictly forbidden', () => {
      const eidAdha: HijriDate = {
        day: 10,
        month: 12,
        year: 1447,
        monthName: 'Dhu al-Hijjah',
        formatted: '10 Dhu al-Hijjah 1447',
      };
      const rec = getFastingRecommendation(eidAdha, new Date('2026-05-27'));
      expect(rec.type).toBe('forbidden');
      expect(rec.isForbidden).toBe(true);

      const tashreeqDay: HijriDate = {
        day: 12,
        month: 12,
        year: 1447,
        monthName: 'Dhu al-Hijjah',
        formatted: '12 Dhu al-Hijjah 1447',
      };
      const rec2 = getFastingRecommendation(tashreeqDay, new Date('2026-05-29'));
      expect(rec2.isForbidden).toBe(true);
    });

    it('identifies Day of Arafah (9 Dhu al-Hijjah)', () => {
      const arafah: HijriDate = {
        day: 9,
        month: 12,
        year: 1447,
        monthName: 'Dhu al-Hijjah',
        formatted: '9 Dhu al-Hijjah 1447',
      };
      const rec = getFastingRecommendation(arafah, new Date('2026-05-26'));
      expect(rec.type).toBe('arafah');
      expect(rec.isRecommended).toBe(true);
    });

    it('identifies Ashura (10 Muharram)', () => {
      const ashura: HijriDate = {
        day: 10,
        month: 1,
        year: 1448,
        monthName: 'Muharram',
        formatted: '10 Muharram 1448',
      };
      const rec = getFastingRecommendation(ashura, new Date('2026-06-25'));
      expect(rec.type).toBe('ashura');
      expect(rec.isRecommended).toBe(true);
    });

    it('identifies Monday and Thursday Sunnah fasting', () => {
      // 2026-05-18 is a Monday
      const monday = new Date('2026-05-18T10:00:00Z');
      const standardDate: HijriDate = {
        day: 2,
        month: 12,
        year: 1447,
        monthName: 'Dhu al-Hijjah',
        formatted: '2 Dhu al-Hijjah 1447',
      };
      const rec = getFastingRecommendation(standardDate, monday);
      expect(rec.type).toBe('monday-thursday');
      expect(rec.isRecommended).toBe(true);
    });
  });

  describe('Real-time Fasting Status & Countdown Phases', () => {
    const todayTimes: PrayerTimes = {
      date: '2026-05-15',
      timeZone: 'UTC',
      fajr: new Date('2026-05-15T04:00:00Z'),
      sunrise: new Date('2026-05-15T05:30:00Z'),
      dhuhr: new Date('2026-05-15T12:00:00Z'),
      asr: new Date('2026-05-15T15:30:00Z'),
      maghrib: new Date('2026-05-15T20:00:00Z'),
      isha: new Date('2026-05-15T21:30:00Z'),
      midnight: new Date('2026-05-15T23:30:00Z'),
      solarNoon: new Date('2026-05-15T12:00:00Z'),
      highLatitudeFallback: 'none',
      fallbackEvents: [],
      methodId: 1,
      asrSchool: 'standard',
    };

    it('reports before-imsak status during the night', () => {
      // At 02:00 (Imsak is 03:50)
      const now = new Date('2026-05-15T02:00:00Z');
      const status = computeFastingStatus(now, todayTimes, null, null, 10);
      expect(status.phase).toBe('before-imsak');
      expect(status.remainingMs).toBe(110 * 60 * 1000); // 1h50m = 110 min
      expect(status.progressPercent).toBe(0);
    });

    it('reports imsak-buffer status between Imsak and Fajr', () => {
      // At 03:55 (Imsak was 03:50, Fajr is 04:00)
      const now = new Date('2026-05-15T03:55:00Z');
      const status = computeFastingStatus(now, todayTimes, null, null, 10);
      expect(status.phase).toBe('imsak-buffer');
      expect(status.remainingMs).toBe(5 * 60 * 1000); // 5 min until Fajr
    });

    it('reports active fasting with accurate progress between Fajr and Maghrib', () => {
      // Fajr 04:00, Maghrib 20:00 (total 16 hours = 960 min)
      // At 12:00 (8 hours in = 50% completed)
      const now = new Date('2026-05-15T12:00:00Z');
      const status = computeFastingStatus(now, todayTimes, null, null, 10);
      expect(status.phase).toBe('fasting');
      expect(status.progressPercent).toBe(50);
      expect(status.remainingMs).toBe(8 * 3600 * 1000); // 8 hours to Iftar
    });

    it('reports after-iftar status once Maghrib has arrived', () => {
      // At 20:30 (Maghrib was 20:00)
      const now = new Date('2026-05-15T20:30:00Z');
      const status = computeFastingStatus(now, todayTimes, null, null, 10);
      expect(status.phase).toBe('after-iftar');
      expect(status.progressPercent).toBe(100);
    });
  });

  it('provides authentic Iftar Dua with translation', () => {
    expect(IFTAR_DUA.arabic).toContain('ذَهَبَ الظَّمَأُ');
    expect(IFTAR_DUA.source).toBe('Abou Daoud (n° 2357)');
  });
});
