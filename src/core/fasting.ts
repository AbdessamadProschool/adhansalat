/**
 * Fasting (Sawm) calculations: Imsak, Iftar, fasting duration,
 * live countdowns, and Hijri calendar fasting recommendations
 * (Ramadan, White Days / Ayyam al-Beed, Sunnah Mondays & Thursdays, Ashura, Arafah).
 *
 * Pure TypeScript, zero DOM, zero dependencies.
 */

import type { HijriDate } from './hijri.js';
import type { PrayerTimes } from './types.js';

export type FastingPhase =
  | 'before-imsak' // Night before Imsak (Suhoor window)
  | 'imsak-buffer' // Between Imsak and Fajr (Buffer period)
  | 'fasting' // Between Fajr and Maghrib (Active fast)
  | 'after-iftar'; // After Maghrib (Post-fast / Completed)

export type FastingType =
  | 'ramadan'
  | 'white-days'
  | 'monday-thursday'
  | 'ashura'
  | 'arafah'
  | 'shawwal-six'
  | 'forbidden'
  | 'voluntary';

export interface FastingRecommendation {
  type: FastingType;
  reasonKey: string;
  isRecommended: boolean;
  isForbidden: boolean;
  isObligatory: boolean;
}

export interface DayFastingTimes {
  date: string;
  imsak: Date | null;
  fajr: Date | null;
  maghrib: Date | null;
  durationMinutes: number | null;
}

export interface FastingStatus {
  phase: FastingPhase;
  /** Percentage of the fasting day completed (0 to 100). */
  progressPercent: number;
  /** The next milestone instant (Imsak if before/after, or Maghrib if currently fasting). */
  targetDate: Date | null;
  /** Milliseconds remaining until the target milestone. */
  remainingMs: number;
  recommendation: FastingRecommendation;
  imsak: Date | null;
  iftar: Date | null;
  durationMinutes: number | null;
}

/**
 * Calculates the Imsak instant, which is traditionally a buffer of 10 to 15
 * minutes before the true dawn (Fajr).
 */
export function calculateImsak(fajr: Date | null, offsetMinutes = 10): Date | null {
  if (!fajr) return null;
  return new Date(fajr.getTime() - offsetMinutes * 60 * 1000);
}

/**
 * Extracts the fasting times (Imsak, Fajr, Maghrib / Iftar) for a given day.
 */
export function getDayFastingTimes(times: PrayerTimes, imsakOffsetMinutes = 10): DayFastingTimes {
  const fajr = times.fajr;
  const maghrib = times.maghrib;
  const imsak = calculateImsak(fajr, imsakOffsetMinutes);

  let durationMinutes: number | null = null;
  if (fajr && maghrib) {
    durationMinutes = Math.max(0, Math.round((maghrib.getTime() - fajr.getTime()) / 60000));
  }

  return {
    date: times.date,
    imsak,
    fajr,
    maghrib,
    durationMinutes,
  };
}

/**
 * Determines whether fasting on this Hijri date is obligatory (Ramadan),
 * strongly recommended (White Days, Arafah, Ashura, Mon/Thu), forbidden (Eids, Tashreeq),
 * or standard voluntary.
 */
export function getFastingRecommendation(
  hijri: HijriDate | null,
  gregorianDate: Date,
): FastingRecommendation {
  if (!hijri) {
    const dayOfWeek = gregorianDate.getDay();
    if (dayOfWeek === 1 || dayOfWeek === 4) {
      return {
        type: 'monday-thursday',
        reasonKey: 'fasting.rec.mondayThursday',
        isRecommended: true,
        isForbidden: false,
        isObligatory: false,
      };
    }
    return {
      type: 'voluntary',
      reasonKey: 'fasting.rec.voluntary',
      isRecommended: false,
      isForbidden: false,
      isObligatory: false,
    };
  }

  const { month, day } = hijri;

  // 1. Forbidden days (1 Shawwal = Eid al-Fitr, 10-13 Dhu al-Hijjah = Eid al-Adha & Tashreeq)
  if (month === 10 && day === 1) {
    return {
      type: 'forbidden',
      reasonKey: 'fasting.rec.eidFitr',
      isRecommended: false,
      isForbidden: true,
      isObligatory: false,
    };
  }
  if (month === 12 && day >= 10 && day <= 13) {
    return {
      type: 'forbidden',
      reasonKey: 'fasting.rec.eidAdha',
      isRecommended: false,
      isForbidden: true,
      isObligatory: false,
    };
  }

  // 2. Month of Ramadan (Obligatory fast)
  if (month === 9) {
    return {
      type: 'ramadan',
      reasonKey: 'fasting.rec.ramadan',
      isRecommended: true,
      isForbidden: false,
      isObligatory: true,
    };
  }

  // 3. Day of Arafah (9 Dhu al-Hijjah)
  if (month === 12 && day === 9) {
    return {
      type: 'arafah',
      reasonKey: 'fasting.rec.arafah',
      isRecommended: true,
      isForbidden: false,
      isObligatory: false,
    };
  }

  // 4. Ashura & Tasu'a (9, 10, 11 of Muharram)
  if (month === 1 && (day === 9 || day === 10 || day === 11)) {
    return {
      type: 'ashura',
      reasonKey: 'fasting.rec.ashura',
      isRecommended: true,
      isForbidden: false,
      isObligatory: false,
    };
  }

  // 5. White Days / Ayyam al-Beed (13, 14, 15 of every lunar month)
  if (day === 13 || day === 14 || day === 15) {
    return {
      type: 'white-days',
      reasonKey: 'fasting.rec.whiteDays',
      isRecommended: true,
      isForbidden: false,
      isObligatory: false,
    };
  }

  // 6. Six days of Shawwal (throughout month 10 after Day 1)
  if (month === 10 && day > 1) {
    return {
      type: 'shawwal-six',
      reasonKey: 'fasting.rec.shawwalSix',
      isRecommended: true,
      isForbidden: false,
      isObligatory: false,
    };
  }

  // 7. Sunnah weekly days: Monday (1) and Thursday (4)
  const dayOfWeek = gregorianDate.getDay();
  if (dayOfWeek === 1 || dayOfWeek === 4) {
    return {
      type: 'monday-thursday',
      reasonKey: 'fasting.rec.mondayThursday',
      isRecommended: true,
      isForbidden: false,
      isObligatory: false,
    };
  }

  return {
    type: 'voluntary',
    reasonKey: 'fasting.rec.voluntary',
    isRecommended: false,
    isForbidden: false,
    isObligatory: false,
  };
}

/**
 * Computes the real-time fasting status, phase, remaining duration, and progress.
 */
export function computeFastingStatus(
  now: Date,
  todayTimes: PrayerTimes,
  tomorrowTimes: PrayerTimes | null,
  hijri: HijriDate | null,
  imsakOffsetMinutes = 10,
): FastingStatus {
  const recommendation = getFastingRecommendation(hijri, now);
  const nowMs = now.getTime();

  const fajr = todayTimes.fajr;
  const maghrib = todayTimes.maghrib;
  const imsak = calculateImsak(fajr, imsakOffsetMinutes);

  let durationMinutes: number | null = null;
  if (fajr && maghrib) {
    durationMinutes = Math.max(0, Math.round((maghrib.getTime() - fajr.getTime()) / 60000));
  }

  // If astronomy times couldn't resolve (e.g. extreme polar day)
  if (!fajr || !maghrib || !imsak) {
    return {
      phase: 'after-iftar',
      progressPercent: 0,
      targetDate: null,
      remainingMs: 0,
      recommendation,
      imsak: null,
      iftar: null,
      durationMinutes: null,
    };
  }

  const imsakMs = imsak.getTime();
  const fajrMs = fajr.getTime();
  const maghribMs = maghrib.getTime();

  // 1. Before Imsak (Suhoor window)
  if (nowMs < imsakMs) {
    return {
      phase: 'before-imsak',
      progressPercent: 0,
      targetDate: imsak,
      remainingMs: imsakMs - nowMs,
      recommendation,
      imsak,
      iftar: maghrib,
      durationMinutes,
    };
  }

  // 2. Buffer window between Imsak and Fajr
  if (nowMs >= imsakMs && nowMs < fajrMs) {
    return {
      phase: 'imsak-buffer',
      progressPercent: 0,
      targetDate: fajr,
      remainingMs: fajrMs - nowMs,
      recommendation,
      imsak,
      iftar: maghrib,
      durationMinutes,
    };
  }

  // 3. Active fasting (between Fajr and Maghrib)
  if (nowMs >= fajrMs && nowMs < maghribMs) {
    const elapsed = nowMs - fajrMs;
    const totalFast = maghribMs - fajrMs;
    const progressPercent = totalFast > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalFast) * 100))) : 0;

    return {
      phase: 'fasting',
      progressPercent,
      targetDate: maghrib,
      remainingMs: maghribMs - nowMs,
      recommendation,
      imsak,
      iftar: maghrib,
      durationMinutes,
    };
  }

  // 4. After Maghrib (Iftar done)
  // Target next milestone is tomorrow's Imsak
  let tomorrowImsak: Date | null = null;
  if (tomorrowTimes && tomorrowTimes.fajr) {
    tomorrowImsak = calculateImsak(tomorrowTimes.fajr, imsakOffsetMinutes);
  }

  const remainingMs = tomorrowImsak ? Math.max(0, tomorrowImsak.getTime() - nowMs) : 0;

  return {
    phase: 'after-iftar',
    progressPercent: 100,
    targetDate: tomorrowImsak,
    remainingMs,
    recommendation,
    imsak,
    iftar: maghrib,
    durationMinutes,
  };
}

/**
 * Prophetic Dua for breaking the fast (Iftar).
 */
export const IFTAR_DUA = {
  arabic: 'ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ',
  translit: 'Dhahaba adh-dhama’u wabtallatil-‘urooq, wa thabatal-ajru in sha’ Allah',
  translationFr: 'La soif est étanchée, les veines sont irriguées, et la récompense est assurée si Allah le veut.',
  translationEn: 'The thirst is gone, the veins are moistened, and the reward is confirmed, if Allah wills.',
  source: 'Abou Daoud (n° 2357)',
};
