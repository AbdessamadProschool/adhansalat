/** Shared label mappings so every screen describes an alarm state identically. */

import type { AlarmState } from '../core/types.js';
import type { MessageKey, Translator } from './i18n.js';
import { BUILTIN_SOUNDS, type Settings } from './store.js';

const STATE_KEYS: Record<AlarmState, MessageKey> = {
  calculated: 'alarm.calculated',
  scheduled: 'alarm.scheduled',
  'inexact-only': 'alarm.inexactOnly',
  'foreground-timer': 'alarm.foreground',
  'permission-missing': 'alarm.permissionMissing',
  canceled: 'alarm.canceled',
  fired: 'alarm.fired',
  missed: 'alarm.missed',
  'audio-failed': 'alarm.audioFailed',
  unknown: 'alarm.unknown',
};

export function alarmStateLabel(t: Translator, state: AlarmState): string {
  return t(STATE_KEYS[state]);
}

export function alarmTone(state: AlarmState): 'ok' | 'warn' | 'bad' | 'muted' {
  switch (state) {
    case 'scheduled':
    case 'fired':
      return 'ok';
    case 'permission-missing':
      return 'warn';
    case 'audio-failed':
      return 'bad';
    case 'missed':
      return 'warn';
    case 'canceled':
      return 'bad';
    case 'inexact-only':
      return 'warn';
    default:
      return 'muted';
  }
}

export function soundLabel(id: string | null, settings: Settings, t: Translator): string {
  if (!id || id === 'none') return t('adhan.silent');
  const builtin = BUILTIN_SOUNDS.find((s) => s.id === id);
  if (builtin) return builtin.name;
  const imported = settings.sounds.find((s) => s.id === id);
  return imported ? imported.name : `${id} (${t('common.unknown')})`;
}
