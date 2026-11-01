/**
 * Methods screen: which parameter set is in force, why, and what every advanced
 * knob actually does to the displayed minute.
 *
 * The UI never calls a method "official". It shows the catalogue entry, the
 * profile note, and an explicit warning that no authority has certified these
 * minutes for the selected country — because we have not verified that.
 */

import { getMethod, METHODS, type CalculationMethod } from '../../core/methods.js';
import { countryName, getCountryProfile } from '../../core/profiles.js';
import type { AsrSchool, HighLatitudeRule, PrayerKey } from '../../core/types.js';
import { PRAYER_KEYS } from '../../core/types.js';
import type { AppContext } from '../context.js';
import type { MessageKey } from '../i18n.js';
import { defaultCalculation } from '../store.js';
import { alertBox, el, pill, segmented, stepper } from '../ui.js';

const ADJUSTABLE: Array<PrayerKey> = [...PRAYER_KEYS];
const METHOD_ADJUST_KEYS: Array<PrayerKey | 'sunrise'> = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function methodsScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const calculation = settings.calculation;
  const method = getMethod(calculation.methodId);
  const country = settings.location?.countryCode ?? '';
  const profile = getCountryProfile(country);
  const root = el('div', { class: 'screen' });

  root.append(
    el(
      'div',
      {},
      el('h1', { text: t('methods.title') }),
      el('p', { class: 'small muted', text: t('methods.warning') }),
    ),
  );

  // ---------------------------------------------------------------- profile
  if (country) {
    const profileMethod = getMethod(profile.defaultMethodId);
    root.append(
      el(
        'div',
        { class: 'card tight' },
        el(
          'div',
          { class: 'row-between' },
          el(
            'div',
            { attrs: { style: 'min-width:0' } },
            el('div', { class: 'label', text: t('methods.countries') }),
            el('strong', { text: countryName(country, ctx.intl) }),
            el('div', {
              class: 'small muted',
              text: `${t('methods.profileNote')} ${profileMethod.name[ctx.locale]}`,
            }),
          ),
          pill(
            profile.verifiedAgainstLocalAuthority ? t('methods.certified') : t('methods.notCertified'),
            profile.verifiedAgainstLocalAuthority ? 'ok' : 'warn',
            profile.verifiedAgainstLocalAuthority ? 'check' : 'alert',
          ),
        ),
        profile.noteKey === 'experimental-api'
          ? alertBox('warn', t('methods.experimental'), method.notes[ctx.locale])
          : null,
        el(
          'p',
          { class: 'tiny muted', attrs: { style: 'margin-top:8px' } },
          el('a', {
            text: profile.sourceUrl,
            attrs: { href: profile.sourceUrl, target: '_blank', rel: 'noopener noreferrer' },
          }),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- method picker
  const select = el('select', { attrs: { 'aria-label': t('methods.selected') } });
  const groups = new Map<string, CalculationMethod[]>();
  for (const m of METHODS) {
    const region = m.region[ctx.locale];
    const list = groups.get(region) ?? [];
    list.push(m);
    groups.set(region, list);
  }
  for (const [region, list] of groups) {
    const optgroup = el('optgroup', { attrs: { label: region } });
    for (const m of list) {
      const unsupported = m.localEngine !== 'full';
      optgroup.appendChild(
        el('option', {
          text: `${m.name[ctx.locale]}${unsupported ? ` — ${t('methods.unsupported')}` : ''}${m.experimental ? ' ⚠' : ''}`,
          attrs: { value: String(m.id), selected: m.id === method.id, disabled: unsupported },
        }),
      );
    }
    select.appendChild(optgroup);
  }
  select.addEventListener('change', () => {
    const id = Number(select.value);
    ctx.store.update((d) => {
      d.calculation.methodId = id;
    });
    ctx.engine.replan('method');
    ctx.toast(t('methods.applyNotice'));
    ctx.refresh();
  });

  const params: string[] = [];
  if (method.fajrAngle !== undefined) params.push(`Fajr ${method.fajrAngle}°`);
  if (method.ishaAngle !== undefined) params.push(`Isha ${method.ishaAngle}°`);
  if (method.ishaIntervalMinutes !== undefined) params.push(`Isha +${method.ishaIntervalMinutes} min`);
  if (method.maghribAngle !== undefined) params.push(`Maghrib ${method.maghribAngle}°`);
  if (method.maghribIntervalMinutes !== undefined) params.push(`Maghrib +${method.maghribIntervalMinutes} min`);

  const methodCard = el('div', { class: 'card' });
  methodCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('methods.selected') }),
      el('span', { class: 'chip', text: method.key }),
    ),
    el('div', { class: 'field' }, el('label', { text: t('methods.selected') }), select),
    el(
      'div',
      { attrs: { style: 'margin-top:4px' } },
      el('div', { class: 'label', text: t('methods.params') }),
      el('p', { class: 'mono', text: params.join(' · ') || '—' }),
    ),
    el('p', { class: 'small muted', attrs: { style: 'margin-top:8px' }, text: method.notes[ctx.locale] }),
  );

  if (method.methodAdjustments && Object.keys(method.methodAdjustments).length > 0) {
    const chips = el('div', { class: 'btn-row' });
    for (const key of METHOD_ADJUST_KEYS) {
      const value = method.methodAdjustments[key];
      if (!value) continue;
      chips.appendChild(
        el('span', { class: 'chip', text: `${t(`prayer.${key}` as MessageKey)} ${value > 0 ? '+' : ''}${value} min` }),
      );
    }
    methodCard.append(
      el(
        'div',
        { attrs: { style: 'margin-top:12px' } },
        el('div', { class: 'label', text: t('methods.corrections') }),
        chips,
        el('p', {
          class: 'tiny muted',
          text:
            method.adjustmentsSource === 'observed'
              ? 'Valeurs mesurées en comparant la sortie du moteur à la référence, faute de publication dans la bibliothèque source.'
              : 'Corrections documentées dans la définition de la méthode (batoulapps/adhan), déjà incluses dans les horaires.',
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- asr
  const asrCard = el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('methods.asr') }),
    ),
    segmented<AsrSchool>(
      calculation.asrSchool,
      [
        { value: 'standard', label: t('methods.asr.standard') },
        { value: 'hanafi', label: t('methods.asr.hanafi') },
      ],
      (value) => {
        ctx.store.update((d) => {
          d.calculation.asrSchool = value;
        });
        ctx.engine.replan('asr');
        ctx.refresh();
      },
    ),
  );

  // ---------------------------------------------------------------- high latitude
  const highLatSelect = el('select', { attrs: { 'aria-label': t('methods.highLat') } });
  const highLatOptions: Array<{ value: HighLatitudeRule; label: string }> = [
    { value: 'none', label: t('methods.highLat.none') },
    { value: 'middleOfNight', label: t('methods.highLat.middle') },
    { value: 'seventhOfNight', label: t('methods.highLat.seventh') },
    { value: 'angleBased', label: t('methods.highLat.angle') },
    { value: 'nearestLatitude', label: t('methods.highLat.nearest') },
  ];
  for (const option of highLatOptions) {
    highLatSelect.appendChild(
      el('option', {
        text: option.label,
        attrs: { value: option.value, selected: option.value === calculation.highLatitudeRule },
      }),
    );
  }
  highLatSelect.addEventListener('change', () => {
    ctx.store.update((d) => {
      d.calculation.highLatitudeRule = highLatSelect.value as HighLatitudeRule;
    });
    ctx.engine.replan('high-latitude');
    ctx.refresh();
  });
  const highLatCard = el(
    'div',
    { class: 'card' },
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('methods.highLat') }),
    ),
    el('div', { class: 'field' }, el('label', { text: t('methods.highLat') }), highLatSelect),
    el('p', { class: 'tiny muted', text: t('methods.highLatDesc') }),
  );

  // ---------------------------------------------------------------- corrections
  const adjustCard = el('div', { class: 'card' });
  adjustCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('methods.adjust') }),
    ),
    el('p', { class: 'small muted', text: t('methods.adjustDesc') }),
  );
  for (const key of ADJUSTABLE) {
    const value = calculation.adjustments[key] ?? 0;
    adjustCard.append(
      el(
        'div',
        { class: 'diag-row' },
        el(
          'div',
          { class: 'what' },
          el('strong', { text: t(`prayer.${key}` as MessageKey) }),
          el('span', {
            text: `${method.methodAdjustments?.[key] ?? 0} min ${t('methods.corrections').toLowerCase()}`,
          }),
        ),
        stepper({
          value,
          min: -20,
          max: 20,
          step: 1,
          label: (v) => `${v > 0 ? '+' : ''}${v} ${t('common.min')}`,
          ariaLabel: t(`prayer.${key}` as MessageKey),
          minusLabel: `− ${t(`prayer.${key}` as MessageKey)}`,
          plusLabel: `+ ${t(`prayer.${key}` as MessageKey)}`,
          onChange: (v) => {
            ctx.store.update((d) => {
              if (v === 0) delete d.calculation.adjustments[key];
              else d.calculation.adjustments[key] = v;
            });
            ctx.engine.replan('corrections');
            ctx.refresh();
          },
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- reset
  const resetRow = el(
    'div',
    { class: 'btn-row' },
    el(
      'button',
      {
        class: 'btn sm',
        attrs: { type: 'button' },
        on: {
          click: () => {
            ctx.store.update((d) => {
              d.calculation.adjustments = {};
            });
            ctx.engine.replan('reset');
            ctx.refresh();
          },
        },
      },
      t('methods.reset'),
    ),
    el(
      'button',
      {
        class: 'btn sm ghost',
        attrs: { type: 'button' },
        on: {
          click: () => {
            ctx.store.update((d) => {
              d.calculation = defaultCalculation(country);
            });
            ctx.engine.replan('reset-all');
            ctx.toast(t('methods.resetDone'));
            ctx.refresh();
          },
        },
      },
      t('methods.resetAll'),
    ),
  );

  // ---------------------------------------------------------------- audit note
  if (!profile.verifiedAgainstLocalAuthority) {
    root.append(
      alertBox(
        'warn',
        t('methods.notCertified'),
        `${t('methods.warning')}${country ? ` (${countryName(country, ctx.intl)})` : ''}`,
      ),
    );
  }

  root.append(methodCard, asrCard, highLatCard, adjustCard, resetRow);
  return root;
}
