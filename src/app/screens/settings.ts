/**
 * Settings and privacy.
 *
 * Everything is local. The "delete my data" action removes the settings record
 * and every imported audio blob, not just a flag.
 */

import { countryName } from '../../core/profiles.js';
import { getMethod } from '../../core/methods.js';
import { LOCALES, LOCALE_LABELS, type Locale, type MessageKey } from '../i18n.js';
import type { AppContext } from '../context.js';
import type { ThemeMode } from '../store.js';
import { deleteAudioFile, listAudioFiles } from '../audio.js';
import { requestNotificationPermission, nativeBridge } from '../notifications.js';
import { openLocationSheet } from '../location.js';
import { alertBox, closeSheet, confirmDialog, el, icon, pill, segmented, switchRow, toast } from '../ui.js';

export const APP_VERSION = '1.2.0';

export function settingsScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const loc = settings.location;
  const root = el('div', { class: 'screen' });

  root.append(
    el(
      'div',
      {},
      el('h1', { text: t('settings.title') }),
      el('p', { class: 'small muted', text: `${t('app.name')} · ${t('settings.version')} ${APP_VERSION}` }),
    ),
  );

  if (!ctx.store.hasStorage) {
    root.append(alertBox('bad', t('error.storage'), t('settings.deleteConfirm')));
  }

  // ---------------------------------------------------------------- appearance
  const appearance = el('div', { class: 'card' });
  appearance.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('settings.appearance') })),
    el('div', { class: 'label', text: t('settings.language') }),
    segmented<Locale>(
      settings.locale,
      LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] })),
      (locale) => {
        ctx.setLocale(locale);
      },
    ),
    el('div', { class: 'label', attrs: { style: 'margin-top:16px' }, text: t('settings.theme') }),
    segmented<ThemeMode>(
      settings.theme,
      [
        { value: 'auto', label: t('settings.theme.auto'), glyph: 'sliders' },
        { value: 'light', label: t('settings.theme.light'), glyph: 'sun' },
        { value: 'dark', label: t('settings.theme.dark'), glyph: 'moon' },
      ],
      (theme) => {
        ctx.store.update((d) => {
          d.theme = theme;
        });
        ctx.refresh();
      },
    ),
    el(
      'div',
      { attrs: { style: 'margin-top:8px' } },
      switchRow(
        t('settings.hijri'),
        t('home.hijriNote'),
        settings.showHijri,
        (next) => {
          ctx.store.update((d) => {
            d.showHijri = next;
          });
          ctx.refresh();
        },
        'moon',
      ),
    ),
  );

  // ---------------------------------------------------------------- hijri & fasting config
  const fastingCard = el('div', { class: 'card' });
  fastingCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: `${t('settings.hijri')} & ${t('nav.calendar')}` })),
    // Hijri Adjustment stepper (-2 to +2)
    el(
      'div',
      { class: 'row-between align-center' },
      el(
        'div',
        { class: 'grow' },
        el('strong', { class: 'small', text: t('settings.hijriAdjustment') }),
        el('div', { class: 'tiny muted', text: t('settings.hijriAdjustmentDesc') }),
      ),
      segmented<string>(
        String(settings.hijriAdjustment ?? 0),
        [
          { value: '-2', label: '-2' },
          { value: '-1', label: '-1' },
          { value: '0', label: '0' },
          { value: '1', label: '+1' },
          { value: '2', label: '+2' },
        ],
        (val) => {
          ctx.store.update((d) => {
            d.hijriAdjustment = parseInt(val, 10);
          });
          ctx.refresh();
        },
      ),
    ),
    // Imsak Buffer segmented (5, 10, 15, 20 min)
    el(
      'div',
      { class: 'row-between align-center', attrs: { style: 'margin-top: 16px;' } },
      el(
        'div',
        { class: 'grow' },
        el('strong', { class: 'small', text: t('settings.imsakBuffer') }),
        el('div', { class: 'tiny muted', text: t('settings.imsakBufferDesc') }),
      ),
      segmented<string>(
        String(settings.imsakOffsetMinutes ?? 10),
        [
          { value: '5', label: `5 ${t('common.min')}` },
          { value: '10', label: `10 ${t('common.min')}` },
          { value: '15', label: `15 ${t('common.min')}` },
          { value: '20', label: `20 ${t('common.min')}` },
        ],
        (val) => {
          ctx.store.update((d) => {
            d.imsakOffsetMinutes = parseInt(val, 10);
          });
          ctx.refresh();
        },
      ),
    ),
  );

  // ---------------------------------------------------------------- location
  const locationCard = el('div', { class: 'card' });
  const placeText = loc
    ? loc.cityName
      ? `${loc.cityName} — ${countryName(loc.countryCode, ctx.intl)}`
      : countryName(loc.countryCode, ctx.intl) || t('loc.current')
    : t('common.none');
  const locationSubtitle = loc
    ? `${loc.timeZone} · ${t(`loc.source.${loc.source}` as MessageKey)}`
    : t('loc.autoTz');
  locationCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('settings.locationSection') })),
    el(
      'div',
      { class: 'row' },
      el('span', { class: 'prayer-icon' }, icon('pin', 18)),
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: placeText }),
        el('span', { text: locationSubtitle }),
      ),
      el(
        'button',
        {
          class: 'btn sm',
          attrs: { type: 'button' },
          on: { click: () => ctx.sheet(t('loc.change'), (close) => openLocationSheet(ctx, close)) },
        },
        t('loc.change'),
      ),
    ),
    el('p', { class: 'tiny muted', attrs: { style: 'margin-top:8px' }, text: t('loc.autoTz') }),
  );

  // ---------------------------------------------------------------- calculation method
  const methodCard = el('div', { class: 'card' });
  const method = getMethod(settings.calculation.methodId);
  methodCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('methods.title') })),
    el(
      'div',
      { class: 'row' },
      el('span', { class: 'prayer-icon' }, icon('sliders', 18)),
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: method.name[ctx.locale] }),
        el('span', {
          class: 'tiny muted',
          text: `${t('methods.asr')}: ${settings.calculation.asrSchool === 'hanafi' ? t('methods.asr.hanafiShort') : t('methods.asr.standardShort')}`,
        }),
      ),
      el(
        'button',
        {
          class: 'btn sm',
          attrs: { type: 'button' },
          on: { click: () => ctx.navigate('methods') },
        },
        t('loc.change'),
      ),
    ),
  );

  // ---------------------------------------------------------------- notifications
  const notifCard = el('div', { class: 'card' });
  const perm = ctx.engine.snapshot().notifications;
  const permLabel =
    perm === 'granted'
      ? t('settings.notifGranted')
      : perm === 'denied'
        ? t('settings.notifDenied')
        : perm === 'unsupported'
          ? t('error.notif')
          : t('settings.notifDefault');
  notifCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('settings.notifications') }),
      pill(
        perm === 'granted' ? t('diag.confirmed') : perm === 'unsupported' ? t('common.notAvailable') : t('diag.notConfirmed'),
        perm === 'granted' ? 'ok' : perm === 'unsupported' ? 'bad' : 'warn',
        perm === 'granted' ? 'check' : 'alert',
      ),
    ),
    el(
      'div',
      { class: 'row' },
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: t('settings.notifDesc') }),
        el('span', { text: permLabel }),
      ),
      perm === 'default'
        ? el(
            'button',
            {
              class: 'btn sm primary',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  const result = await requestNotificationPermission();
                  toast(result === 'granted' ? t('settings.notifGranted') : t('settings.notifDenied'));
                  ctx.engine.replan('permission');
                  ctx.refresh();
                },
              },
            },
            t('diag.grant'),
          )
        : null,
    ),
    switchRow(
      t('settings.notifications'),
      null,
      settings.notificationsWanted,
      (next) => {
        ctx.store.update((d) => {
          d.notificationsWanted = next;
        });
        ctx.refresh();
      },
      'bell',
    ),
    el(
      'div',
      { class: 'row-between align-center', attrs: { style: 'padding-top:10px;border-top:1px solid var(--border);' } },
      el(
        'div',
        { class: 'grow stack xs', attrs: { style: 'min-width:0;padding-inline-end:var(--space-2);' } },
        el(
          'strong',
          { class: 'small row align-center gap-xs' },
          icon('mosque', 17),
          el('span', { text: t('settings.mosqueMode') }),
        ),
        el('div', { class: 'tiny muted', text: t('settings.mosqueModeDesc') }),
      ),
      segmented<string>(
        String(settings.mosqueModeMinutes ?? 0),
        [
          { value: '0', label: t('settings.mosqueModeOff') },
          { value: '15', label: `15 ${t('common.min')}` },
          { value: '20', label: `20 ${t('common.min')}` },
          { value: '30', label: `30 ${t('common.min')}` },
        ],
        (val) => {
          const mins = parseInt(val, 10);
          ctx.store.update((d) => {
            d.mosqueModeMinutes = mins;
          });
          nativeBridge()?.setMosqueMode?.(mins);
          toast(mins > 0 ? t('settings.mosqueModeEnabled') : t('settings.mosqueModeDisabled'));
          ctx.refresh();
        },
      ),
    ),
  );

  // ---------------------------------------------------------------- data
  const dataCard = el('div', { class: 'card' });
  dataCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('settings.dataSection') })),
    el(
      'div',
      { class: 'btn-row' },
      el(
        'button',
        {
          class: 'btn sm',
          attrs: { type: 'button' },
          on: {
            click: () => {
              ctx.engine.replan('manual');
              toast(t('settings.recalcDone'));
              ctx.refresh();
            },
          },
        },
        t('settings.recalc'),
      ),
      el(
        'button',
        {
          class: 'btn sm ghost',
          attrs: { type: 'button' },
          on: { click: () => download(settings, ctx) },
        },
        icon('download', 16),
        t('settings.export'),
      ),
    ),
    el('p', { class: 'tiny muted', attrs: { style: 'margin-top:8px' }, text: t('settings.privacyText') }),
  );

  // ---------------------------------------------------------------- danger zone
  const dangerCard = el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('settings.dangerZone') }),
      pill(
        ctx.store.hasStorage ? t('settings.storageOk') : t('error.storage'),
        ctx.store.hasStorage ? 'ok' : 'bad',
        ctx.store.hasStorage ? 'check' : 'alert',
      ),
    ),
    el('p', { class: 'small muted', text: t('settings.deleteConfirm') }),
    el(
      'div',
      { class: 'btn-row', attrs: { style: 'margin-top:12px' } },
      el(
        'button',
        {
          class: 'btn sm danger',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              const confirmed = await confirmDialog({
                title: t('settings.deleteTitle'),
                body: t('settings.deleteConfirm'),
                confirmLabel: t('settings.deleteData'),
                cancelLabel: t('common.cancel'),
                danger: true,
              });
              if (!confirmed) return;
              const files = await listAudioFiles().catch(() => []);
              for (const file of files) {
                await deleteAudioFile(file.id).catch(() => undefined);
                try {
                  nativeBridge()?.deleteImportedSound?.(file.id);
                } catch {
                  /* the web copy is gone; a stale native file is harmless */
                }
              }
              ctx.store.wipe();
              ctx.engine.replan('wipe');
              closeSheet();
              toast(t('settings.deleted'));
              ctx.navigate('onboarding');
            },
          },
        },
        icon('trash', 16),
        t('settings.deleteData'),
      ),
    ),
  );

  // ---------------------------------------------------------------- privacy & about
  const privacy = el(
    'div',
    { class: 'card' },
    el('div', { class: 'card-head' }, el('h2', { text: t('settings.privacy') })),
    el('p', { class: 'small', text: t('settings.privacyText') }),
    el('hr'),
    el('div', { class: 'card-head' }, el('h2', { text: t('settings.about') })),
    el('p', { class: 'small', text: t('settings.aboutText') }),
    el(
      'div',
      { class: 'btn-row', attrs: { style: 'margin-top:12px' } },
      el(
        'button',
        { class: 'btn sm ghost', attrs: { type: 'button' }, on: { click: () => ctx.navigate('diagnostics') } },
        icon('shield', 16),
        t('settings.diagnostics'),
      ),
    ),
    el('p', { class: 'tiny muted', attrs: { style: 'margin-top:12px' }, text: `${t('settings.version')} ${APP_VERSION}` }),
  );

  root.append(appearance, fastingCard, locationCard, methodCard, notifCard, dataCard, dangerCard, privacy);
  return root;
}

function download(settings: unknown, ctx: AppContext): void {
  try {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'azan-global-settings.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    ctx.toast(ctx.t('error.storage'));
  }
}
