import { describe, expect, it } from 'vitest';
import {
  analyzeKhatmahProgress,
  getMoroccanDailyHizb,
  type KhatmahState,
} from '../src/core/khatmah.js';

describe('Smart Quran Khatmah Engine', () => {
  it('correctly calculates Moroccan Hizb Ar-Ratib for any Hijri day', () => {
    // Day 1: Hizb 1 (Morning) and Hizb 2 (Evening)
    const day1 = getMoroccanDailyHizb(1);
    expect(day1.morningHizb).toBe(1);
    expect(day1.eveningHizb).toBe(2);

    // Day 15: Hizb 29 (Morning) and Hizb 30 (Evening)
    const day15 = getMoroccanDailyHizb(15);
    expect(day15.morningHizb).toBe(29);
    expect(day15.eveningHizb).toBe(30);

    // Day 30: Hizb 59 and Hizb 60 (completing the 60 Ahzab)
    const day30 = getMoroccanDailyHizb(30);
    expect(day30.morningHizb).toBe(59);
    expect(day30.eveningHizb).toBe(60);
  });

  it('accurately detects when a user is on-track or ahead', () => {
    const state: KhatmahState = {
      targetKhatmahs: 1,
      readAhzab: Array.from({ length: 20 }, (_, i) => i + 1), // 20 Ahzab read
      startDateKey: '2026-03-01',
      targetDays: 30,
    };

    // On day 10, target is 2 Ahzab/day. 20 Ahzab read on day 10 is exact target or ahead
    const analysis = analyzeKhatmahProgress(state, 10);
    expect(analysis.completedAhzab).toBe(20);
    expect(analysis.totalTargetAhzab).toBe(60);
    expect(analysis.progressPercent).toBe(33);
    expect(analysis.currentPacePerDay).toBe(2);
    expect(analysis.status).toBe('on-track');
  });

  it('identifies when reading has fallen behind and suggests compensatory pages per prayer', () => {
    const state: KhatmahState = {
      targetKhatmahs: 1,
      readAhzab: [1, 2, 3], // Only 3 Ahzab read
      startDateKey: '2026-03-01',
      targetDays: 30,
    };

    // On day 10, having read only 3 Ahzab means behind
    const analysis = analyzeKhatmahProgress(state, 10);
    expect(analysis.status).toBe('behind');
    expect(analysis.remainingAhzab).toBe(57);
    expect(analysis.requiredPacePerDay).toBeGreaterThan(2);
    expect(analysis.pagesPerPrayerRecommended).toBeGreaterThan(4);
  });
});
