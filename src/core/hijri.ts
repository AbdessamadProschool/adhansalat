/**
 * Hijri (Umm al-Qura) date via ICU.
 *
 * We do not ship a hand-rolled arithmetic Hijri conversion: it drifts by a day
 * against the Umm al-Qura tables that Saudi Arabia and many apps use. ICU already
 * embeds those tables, so we ask it. The result is still an astronomical/calendar
 * estimate and can differ by one day from an actual local moon sighting, which
 * the UI states explicitly.
 *
 * The instant is shifted by the bundled time-zone offset first (see `tzdata.ts`),
 * so the calendar day is the local one even where the host carries stale rules.
 */

import { formatInZone, partsInZone } from './timezone.js';

export interface HijriDate {
  day: number;
  month: number;
  year: number;
  monthName: string;
  /** Formatted for display, in the requested locale. */
  formatted: string;
}

export function hijriDate(
  instant: Date,
  timeZone: string,
  locale: string,
  adjustmentDays = 0,
): HijriDate | null {
  try {
    const adjustedInstant = adjustmentDays === 0
      ? instant
      : new Date(instant.getTime() + adjustmentDays * 86400000);

    const tag = `${locale}-u-ca-islamic-umalqura`;
    const parts = partsInZone(adjustedInstant, timeZone, tag, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const bag: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') bag[p.type] = p.value;
    const day = Number(bag.day);
    const month = Number(bag.month);
    const year = Number(String(bag.year).replace(/[^\d]/g, ''));
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    const monthName = formatInZone(adjustedInstant, timeZone, tag, { month: 'long' });
    return {
      day,
      month,
      year,
      monthName,
      formatted: `${day} ${monthName} ${year}`,
    };
  } catch {
    return null;
  }
}
