/**
 * Shared application context. Screens are pure functions of this object, so no
 * screen reaches for a global or a module-level singleton.
 */

import type { AlarmEngine } from './alarm-engine.js';
import type { AdhanPlayer } from './audio.js';
import type { Locale, Translator } from './i18n.js';
import type { SettingsStore } from './store.js';

export type Route =
  | 'home'
  | 'calendar'
  | 'qibla'
  | 'tasbih'
  | 'adhan'
  | 'methods'
  | 'settings'
  | 'diagnostics'
  | 'onboarding';

export const ROUTES: readonly Route[] = [
  'home',
  'calendar',
  'qibla',
  'tasbih',
  'adhan',
  'methods',
  'settings',
];

export interface AppContext {
  store: SettingsStore;
  engine: AlarmEngine;
  player: AdhanPlayer;
  t: Translator;
  locale: Locale;
  /** BCP-47 tag used for Intl formatting (dates, numbers, country names). */
  intl: string;
  route: Route;
  navigate(route: Route): void;
  /** Re-renders the current screen from the current store state. */
  refresh(): void;
  toast(message: string): void;
  sheet(title: string, build: (close: () => void) => HTMLElement): void;
  setLocale(locale: Locale): void;
  /** Registered callbacks run before the next render (timers, listeners). */
  registerCleanup(fn: () => void): void;
}
