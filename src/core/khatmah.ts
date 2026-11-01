/**
 * Smart Quran Khatmah & Moroccan Daily Hizb Engine.
 *
 * Implements:
 *  - Interactive 60-Hizb tracker (traditional Moroccan division).
 *  - Daily Moroccan "Al-Hizb Ar-Ratib" (الحزب الراتب) mosque synchronization:
 *    Morning Hizb (2*d - 1) and Evening Hizb (2*d).
 *  - Adaptive smart pace calculation and completion date projections.
 *
 * Pure TypeScript, zero DOM, zero dependencies.
 */

export interface KhatmahState {
  targetKhatmahs: number; // 1, 2, or 3
  readAhzab: number[]; // Array of completed Hizb numbers (1 to 60)
  startDateKey: string; // YYYY-MM-DD
  targetDays: number; // Default 30 (or 27 for Laylat al-Qadr)
}

export interface KhatmahAnalysis {
  completedAhzab: number;
  totalTargetAhzab: number;
  progressPercent: number;
  remainingAhzab: number;
  elapsedDays: number;
  remainingDays: number;
  currentPacePerDay: number;
  requiredPacePerDay: number;
  pagesPerPrayerRecommended: number; // Assuming 10 pages per Hizb, 5 daily prayers
  status: 'ahead' | 'on-track' | 'behind';
  projectedFinishDay: number | null;
}

/**
 * Calculates the authentic Moroccan daily mosque Ahzab (الحزب الراتب).
 * For centuries in Moroccan mosques:
 *  - Morning after Subh: Hizb (2 * day - 1)
 *  - Evening after Maghrib: Hizb (2 * day)
 * Completes all 60 Ahzab every month.
 */
export function getMoroccanDailyHizb(hijriDay: number): { morningHizb: number; eveningHizb: number } {
  const normalizedDay = Math.max(1, Math.min(30, hijriDay || 1));
  const morning = ((2 * normalizedDay - 1 - 1) % 60) + 1;
  const evening = ((2 * normalizedDay - 1) % 60) + 1;
  return {
    morningHizb: morning,
    eveningHizb: evening,
  };
}

/**
 * Analyzes the user's reading pace and projects completion dates and catch-up recommendations.
 */
export function analyzeKhatmahProgress(
  state: KhatmahState,
  currentDayIndex: number, // 1 to 30
): KhatmahAnalysis {
  const targetKhatmahs = Math.max(1, state.targetKhatmahs || 1);
  const totalTargetAhzab = targetKhatmahs * 60;
  const completedAhzab = Math.min(totalTargetAhzab, state.readAhzab.length);
  const remainingAhzab = Math.max(0, totalTargetAhzab - completedAhzab);

  const targetDays = Math.max(1, state.targetDays || 30);
  const elapsedDays = Math.max(1, Math.min(targetDays, currentDayIndex));
  const remainingDays = Math.max(1, targetDays - elapsedDays + 1);

  const currentPace = Number((completedAhzab / elapsedDays).toFixed(2));
  const requiredPace = Number((remainingAhzab / remainingDays).toFixed(2));

  // 1 Hizb in Moroccan Mushaf is approximately 10 pages (Warsh).
  // 5 prayers a day: pages per prayer = (requiredPace * 10) / 5 = requiredPace * 2
  const pagesPerPrayer = Math.max(1, Math.ceil(requiredPace * 2));

  // Expected progress for on-track is (totalTargetAhzab / targetDays) * elapsedDays
  const expectedAhzab = (totalTargetAhzab / targetDays) * elapsedDays;

  let status: 'ahead' | 'on-track' | 'behind' = 'on-track';
  if (completedAhzab >= expectedAhzab + 1) {
    status = 'ahead';
  } else if (completedAhzab < expectedAhzab - 1.5) {
    status = 'behind';
  }

  let projectedFinishDay: number | null = null;
  if (currentPace > 0) {
    const daysNeeded = Math.ceil(remainingAhzab / currentPace);
    projectedFinishDay = Math.min(60, elapsedDays + daysNeeded);
  }

  const progressPercent = Math.min(100, Math.round((completedAhzab / totalTargetAhzab) * 100));

  return {
    completedAhzab,
    totalTargetAhzab,
    progressPercent,
    remainingAhzab,
    elapsedDays,
    remainingDays,
    currentPacePerDay: currentPace,
    requiredPacePerDay: requiredPace,
    pagesPerPrayerRecommended: pagesPerPrayer,
    status,
    projectedFinishDay,
  };
}

const KHATMAH_STORAGE_KEY = 'azanglobal_quran_khatmah_v1';

export function loadKhatmahState(): KhatmahState {
  try {
    const raw = localStorage.getItem(KHATMAH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.readAhzab)) {
        return {
          targetKhatmahs: Number(parsed.targetKhatmahs) || 1,
          readAhzab: parsed.readAhzab.map(Number).filter((n: number) => n >= 1 && n <= 60),
          startDateKey: String(parsed.startDateKey || new Date().toISOString().slice(0, 10)),
          targetDays: Number(parsed.targetDays) || 30,
        };
      }
    }
  } catch {
    // fallback to clean state
  }

  return {
    targetKhatmahs: 1,
    readAhzab: [],
    startDateKey: new Date().toISOString().slice(0, 10),
    targetDays: 30,
  };
}

export function saveKhatmahState(state: KhatmahState): void {
  try {
    localStorage.setItem(KHATMAH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
