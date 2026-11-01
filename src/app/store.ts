/**
 * Local settings store.
 *
 * Everything the app needs to work offline lives here and in a single
 * localStorage key. There is no account, no sync and no network write path.
 * The store is deliberately small: derived data (prayer times, alarms) is always
 * recomputed from these inputs so the app can never show stale values after a
 * location or method change.
 */

import { detectLocale, type Locale } from './i18n.js';
import { BUNDLED_ADHAN_TRACKS, DEFAULT_SOUND_ID } from './audio-catalog.js';
import { DEFAULT_METHOD_ID } from '../core/methods.js';
import { getCountryProfile } from '../core/profiles.js';
import type {
  CalculationSettings,
  GeoLocation,
  PrayerKey,
  PrayerPreferences,
  PrayerPreference,
} from '../core/types.js';

const STORAGE_KEY = 'azan.settings.v1';
const MAX_LOG = 200;
const MAX_FIRED_KEYS = 200;

export type ThemeMode = 'auto' | 'light' | 'dark';
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;
  level: LogLevel;
  event: string;
  detail?: string;
}

export interface SoundMeta {
  id: string;
  name: string;
  kind: 'builtin' | 'imported';
  mime?: string;
  size?: number;
  createdAt?: number;
  /**
   * Where a built-in sound comes from. `synthetic` is a generated test chime;
   * `cc0` is the verified recording published under CC0 (redistributable);
   * `supplied` is a recording handed to the project, whose licence may still be
   * unverified. The screen must not blur the three.
   */
  source?: 'synthetic' | 'cc0' | 'supplied';
  durationSec?: number;
}

export interface Settings {
  version: 1;
  locale: Locale;
  theme: ThemeMode;
  onboarded: boolean;
  location: GeoLocation | null;
  calculation: CalculationSettings;
  prayers: PrayerPreferences;
  showHijri: boolean;
  hijriAdjustment: number;
  imsakOffsetMinutes: number;
  notificationsWanted: boolean;
  sounds: SoundMeta[];
  /** When set, Fajr uses this sound instead of its own per-prayer choice. */
  fajrSoundOverride: string | null;
  lastRecalculatedAt: number | null;
  log: LogEntry[];
  /** eventKey values already fired, to guarantee at-most-once triggering. */
  firedKeys: string[];
  /**
   * Subset of `firedKeys` that was never actually delivered (missed by more than
   * the grace window). Kept so diagnostics can say "missed" instead of showing a
   * reassuring green "fired" for a prayer that was silent.
   */
  missedKeys: string[];
  diagnosticsWindowDays: number;
}

/**
 * Built-in sounds: the verified CC0 Adhan first, then the generated test chimes,
 * then "none".
 *
 * No id is written by hand here. Every recording comes from a catalogue with a
 * real file behind it. The eight recordings supplied to the project are not in
 * this list: their licence is unknown, so they stay catalogued for transparency
 * (see the Adhan screen) but are never selectable and never shipped.
 */
export const BUILTIN_SOUNDS: SoundMeta[] = [
  ...BUNDLED_ADHAN_TRACKS.map(
    (track): SoundMeta => ({
      id: track.id,
      name: track.name,
      kind: 'builtin',
      mime: track.mime,
      size: track.bytes,
      source: 'cc0',
      durationSec: track.durationSec,
    }),
  ),
  { id: 'chime-calm', name: 'Chime — calm', kind: 'builtin', source: 'synthetic' },
  { id: 'chime-dawn', name: 'Chime — dawn', kind: 'builtin', source: 'synthetic' },
  { id: 'chime-alert', name: 'Chime — alert', kind: 'builtin', source: 'synthetic' },
  { id: 'none', name: '—', kind: 'builtin' },
];

export const SOUND_URL: Record<string, string> = {
  ...Object.fromEntries(BUNDLED_ADHAN_TRACKS.map((track) => [track.id, track.publicPath])),
  'chime-calm': '/audio/chime-calm.wav',
  'chime-dawn': '/audio/chime-dawn.wav',
  'chime-alert': '/audio/chime-alert.wav',
};

/** Built-in ids that can really be played; used to migrate stale preferences. */
const PLAYABLE_SOUND_IDS = new Set([...Object.keys(SOUND_URL), 'none']);

function defaultPreference(soundId: string): PrayerPreference {
  return {
    enabled: true,
    audioEnabled: true,
    soundId,
    preReminderMinutes: 0,
    vibration: true,
    notificationOnly: false,
  };
}

export function defaultPreferences(): PrayerPreferences {
  return {
    fajr: { ...defaultPreference(DEFAULT_SOUND_ID), preReminderMinutes: 0 },
    dhuhr: defaultPreference(DEFAULT_SOUND_ID),
    asr: defaultPreference(DEFAULT_SOUND_ID),
    maghrib: defaultPreference(DEFAULT_SOUND_ID),
    isha: defaultPreference(DEFAULT_SOUND_ID),
  };
}

export function defaultCalculation(countryCode = ''): CalculationSettings {
  const profile = getCountryProfile(countryCode);
  return {
    methodId: profile.defaultMethodId ?? DEFAULT_METHOD_ID,
    asrSchool: profile.defaultAsrSchool,
    highLatitudeRule: 'angleBased',
    adjustments: {},
  };
}

export function defaultSettings(): Settings {
  const locale = detectLocale();
  return {
    version: 1,
    locale,
    theme: 'auto',
    onboarded: false,
    location: null,
    calculation: defaultCalculation(),
    prayers: defaultPreferences(),
    showHijri: true,
    hijriAdjustment: 0,
    imsakOffsetMinutes: 10,
    notificationsWanted: true,
    sounds: [],
    fajrSoundOverride: null,
    lastRecalculatedAt: null,
    log: [],
    firedKeys: [],
    missedKeys: [],
    diagnosticsWindowDays: 7,
  };
}

/** Shallow-merge stored data over defaults so a new field never crashes old data. */
function hydrate(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Settings>;
  const calculation: CalculationSettings = {
    ...base.calculation,
    ...(r.calculation ?? {}),
    adjustments: { ...(r.calculation?.adjustments ?? {}) },
  };
  const prayers = { ...base.prayers } as PrayerPreferences;
  if (r.prayers) {
    for (const key of Object.keys(base.prayers) as PrayerKey[]) {
      prayers[key] = { ...base.prayers[key], ...(r.prayers[key] ?? {}) };
    }
  }
  // Migration: a preference saved when the supplied recordings were bundled
  // (or when an imported file has since been deleted) must never point at a
  // sound that cannot be played. Those ids would otherwise turn every alarm
  // into silence without an error.
  const importedIds = new Set(
    Array.isArray(r.sounds) ? r.sounds.map((sound) => sound.id).filter(Boolean) : [],
  );
  const usable = (id: string | null | undefined): boolean =>
    typeof id === 'string' && (PLAYABLE_SOUND_IDS.has(id) || importedIds.has(id));
  for (const key of Object.keys(prayers) as PrayerKey[]) {
    if (!usable(prayers[key].soundId)) {
      prayers[key].soundId = key === 'fajr' ? 'chime-dawn' : 'chime-calm';
    }
  }
  const fajrSoundOverride =
    r.fajrSoundOverride && usable(r.fajrSoundOverride) ? r.fajrSoundOverride : null;
  return {
    ...base,
    ...r,
    calculation,
    prayers,
    fajrSoundOverride,
    log: Array.isArray(r.log) ? r.log.slice(-MAX_LOG) : [],
    firedKeys: Array.isArray(r.firedKeys) ? r.firedKeys.slice(-MAX_FIRED_KEYS) : [],
    missedKeys: Array.isArray(r.missedKeys) ? r.missedKeys.slice(-MAX_FIRED_KEYS) : [],
    sounds: Array.isArray(r.sounds) ? r.sounds : [],
    version: 1,
  };
}

type Listener = (settings: Settings) => void;

export class SettingsStore {
  private state: Settings;
  private listeners = new Set<Listener>();
  private storageAvailable = true;

  constructor() {
    this.state = this.read();
  }

  private read(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? hydrate(JSON.parse(raw)) : defaultSettings();
    } catch {
      this.storageAvailable = false;
      return defaultSettings();
    }
  }

  get(): Settings {
    return this.state;
  }

  get hasStorage(): boolean {
    return this.storageAvailable;
  }

  update(mutator: (draft: Settings) => Settings | void): Settings {
    const draft = structuredClone(this.state);
    const result = mutator(draft) ?? draft;
    this.state = result;
    this.persist();
    for (const l of this.listeners) l(this.state);
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
    }
  }

  log(level: LogLevel, event: string, detail?: string): void {
    this.state = {
      ...this.state,
      log: [
        ...this.state.log,
        { at: new Date().toISOString(), level, event, detail },
      ].slice(-MAX_LOG),
    };
    this.persist();
  }

  clearLog(): void {
    this.state = { ...this.state, log: [] };
    this.persist();
    for (const l of this.listeners) l(this.state);
  }

  /** Records an event key so the same prayer can never fire twice. */
  markFired(eventKey: string): boolean {
    if (this.state.firedKeys.includes(eventKey)) return false;
    this.state = {
      ...this.state,
      firedKeys: [...this.state.firedKeys, eventKey].slice(-MAX_FIRED_KEYS),
    };
    this.persist();
    return true;
  }

  /**
   * Closes an event that came due outside the grace window.
   *
   * It is added to `firedKeys` (so it can never be played late) *and* to
   * `missedKeys` (so the UI does not report it as delivered).
   */
  markMissed(eventKey: string): boolean {
    if (this.state.firedKeys.includes(eventKey)) return false;
    this.state = {
      ...this.state,
      firedKeys: [...this.state.firedKeys, eventKey].slice(-MAX_FIRED_KEYS),
      missedKeys: [...this.state.missedKeys, eventKey].slice(-MAX_FIRED_KEYS),
    };
    this.persist();
    return true;
  }

  hasFired(eventKey: string): boolean {
    return this.state.firedKeys.includes(eventKey);
  }

  wasMissed(eventKey: string): boolean {
    return this.state.missedKeys.includes(eventKey);
  }

  reset(): void {
    this.state = { ...defaultSettings(), locale: this.state.locale };
    this.persist();
    for (const l of this.listeners) l(this.state);
  }

  /** Erases the persisted record entirely (privacy screen). */
  wipe(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.state = defaultSettings();
    for (const l of this.listeners) l(this.state);
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }
}
