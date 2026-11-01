/**
 * Core domain types. This layer has no dependency on the UI, the DOM, storage
 * or the network: it can be unit-tested in isolation and reused by the Android
 * module (via a Kotlin port) or a backend.
 */

/** The five obligatory prayers. Sunrise is deliberately NOT a prayer. */
export type PrayerKey = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_KEYS: readonly PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Astronomical markers that are displayed but never trigger an Adhan. */
export type SolarKey = 'sunrise' | 'solarNoon' | 'midnight';

export type AsrSchool = 'standard' | 'hanafi';

/** How Fajr/Isha are estimated when the sun never reaches the required angle. */
export type HighLatitudeRule =
  | 'none'
  | 'middleOfNight'
  | 'seventhOfNight'
  | 'angleBased'
  /** "Aqrab al-bilad": fall back to the nearest reference latitude (45°). */
  | 'nearestLatitude';

export interface Coordinates {
  latitude: number;
  longitude: number;
  /** Metres above sea level. Affects sunrise/sunset by a few seconds to minutes. */
  elevation?: number;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  elevation?: number;
  /** IANA identifier, e.g. "Africa/Casablanca". Never a raw UTC offset. */
  timeZone: string;
  countryCode: string;
  cityId?: string;
  cityName?: string;
  /** How the position was obtained. Shown in the privacy screen. */
  source: 'gps' | 'manual-city' | 'manual-coordinates';
  /** Epoch ms of the fix; manual entries use the time of entry. */
  determinedAt: number;
}

export interface CalculationSettings {
  methodId: number;
  asrSchool: AsrSchool;
  highLatitudeRule: HighLatitudeRule;
  /** Per-prayer minute corrections, user controlled. */
  adjustments: Partial<Record<PrayerKey | 'sunrise', number>>;
}

/** A resolved instant, or null when the sun never reaches the required angle. */
export type MaybeDate = Date | null;

export interface PrayerTimes {
  /** Local calendar date the times belong to, as "YYYY-MM-DD". */
  date: string;
  timeZone: string;
  fajr: MaybeDate;
  sunrise: MaybeDate;
  dhuhr: MaybeDate;
  asr: MaybeDate;
  maghrib: MaybeDate;
  isha: MaybeDate;
  /** Islamic midnight (start of the night portion). Informational only. */
  midnight: MaybeDate;
  /** Solar transit (true noon). */
  solarNoon: MaybeDate;
  /** High latitude rule actually applied, and which events it corrected. */
  highLatitudeFallback: 'none' | 'applied' | 'unresolvable';
  fallbackEvents: PrayerKey[];
  methodId: number;
  asrSchool: AsrSchool;
}

export interface PrayerEvent {
  prayer: PrayerKey;
  /** Absolute instant of the prayer. */
  at: Date;
  /** Local wall-clock label, e.g. "18:42". */
  label: string;
  /** Local date the event belongs to, "YYYY-MM-DD". */
  date: string;
}

export interface DaySchedule {
  times: PrayerTimes;
  /** Chronological list, crossing into the following day when needed. */
  events: PrayerEvent[];
  next: PrayerEvent | null;
  /** The prayer whose window is currently open, if any. */
  current: PrayerEvent | null;
}

export type AlarmState =
  | 'calculated'
  | 'scheduled'
  /** The OS will fire it, but with an inexact window (Android 12+ fallback). */
  | 'inexact-only'
  /** A timer is armed in this page only. It dies when the tab closes. */
  | 'foreground-timer'
  | 'permission-missing'
  | 'canceled'
  | 'fired'
  /** The event came due while nothing could deliver it; it was never played. */
  | 'missed'
  | 'audio-failed'
  | 'unknown';

export interface AlarmRecord {
  prayer: PrayerKey;
  /** Local date + name, the deduplication key. */
  eventKey: string;
  atIso: string;
  state: AlarmState;
  scheduledAtIso?: string;
  lastError?: string;
}

export interface PrayerPreference {
  enabled: boolean;
  audioEnabled: boolean;
  soundId: string;
  /** Minutes before the prayer for a gentle reminder; 0 disables it. */
  preReminderMinutes: number;
  vibration: boolean;
  notificationOnly: boolean;
}

export type PrayerPreferences = Record<PrayerKey, PrayerPreference>;
