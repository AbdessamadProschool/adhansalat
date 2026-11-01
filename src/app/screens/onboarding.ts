/**
 * First-run setup: language, position, method.
 *
 * No permission is requested up front. Geolocation is one of three options and
 * only runs when the user presses the button. Notifications are requested later,
 * from the home screen, once they have a reason to exist.
 */

import { selectableMethods, getMethod } from '../../core/methods.js';
import { countryName, getCountryProfile } from '../../core/profiles.js';
import { isValidTimeZone } from '../../core/timezone.js';
import type { AsrSchool } from '../../core/types.js';
import type { AppContext } from '../context.js';
import { LOCALES, LOCALE_LABELS, type Locale } from '../i18n.js';
import { openLocationSheet } from '../location.js';
import { decorativeArt } from '../illustrations.js';
import { alertBox, el, icon, pill, segmented } from '../ui.js';

let step = 0;

export function onboardingScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const loc = settings.location;
  const root = el('div', { class: 'onboard' });
  root.appendChild(decorativeArt('arch', 'onboard-art'));

  // The screen owns the step, so it also owns the document title.
  document.title = `${t('app.name')} — ${t(`onboard.step${step + 1}.title` as 'onboard.step1.title')}`;

  const steps = el('div', {
    class: 'steps',
    attrs: {
      role: 'progressbar',
      'aria-valuemin': 1,
      'aria-valuemax': 3,
      'aria-valuenow': step + 1,
      'aria-label': t(`onboard.step${step + 1}.title` as 'onboard.step1.title'),
    },
  });
  for (let i = 0; i < 3; i++) steps.appendChild(el('span', { class: i <= step ? 'done' : '' }));

  root.append(
    el(
      'div',
      { class: 'onboard-logo' },
      el('img', { attrs: { src: '/icons/icon-192.png', alt: '', width: 52, height: 52 } }),
      el(
        'span',
        { class: 'names' },
        el('strong', { text: t('app.name') }),
        el('span', { text: 'أذان عالمي' }),
      ),
    ),
    steps,
  );

  const body = el('div', { class: 'stack' });

  if (step === 0) {
    body.append(
      el('h1', { text: t('onboard.step1.title') }),
      el('p', { class: 'lede', text: t('onboard.step1.lede') }),
      el('div', { class: 'label', text: t('onboard.lang.title') }),
      segmented<Locale>(
        settings.locale,
        LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] })),
        (locale) => ctx.setLocale(locale),
      ),
      el('p', { class: 'tiny muted', text: t('onboard.lang.note') }),
      el('p', { class: 'tiny muted', text: t('onboard.permissionsNote') }),
    );
  } else if (step === 1) {
    body.append(
      el('h1', { text: t('onboard.step2.title') }),
      el('p', { class: 'lede', text: t('onboard.step2.lede') }),
    );

    if (loc) {
      body.append(
        el(
          'div',
          { class: 'status-strip' },
          icon('pin', 18),
          el(
            'span',
            { class: 'grow' },
            el('strong', {
              text: loc.cityName
                ? `${loc.cityName} — ${countryName(loc.countryCode, ctx.intl)}`
                : countryName(loc.countryCode, ctx.intl) || t('loc.current'),
            }),
            el('span', { class: 'tiny muted', text: ` ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)} · ${loc.timeZone}` }),
          ),
          isValidTimeZone(loc.timeZone)
            ? pill(t('loc.timezoneOk'), 'ok', 'check')
            : pill(t('loc.timezone'), 'bad', 'alert'),
        ),
      );
    }

    const choice = (
      glyph: string,
      title: string,
      description: string,
      onClick: () => void,
    ) =>
      el(
        'button',
        { class: 'choice', attrs: { type: 'button' }, on: { click: onClick } },
        el('span', { class: 'glyph' }, icon(glyph, 18)),
        el('span', {}, el('strong', { text: title }), el('span', { text: description })),
      );

    body.append(
      choice('pin', t('loc.gps'), t('loc.gpsDesc'), () =>
        ctx.sheet(t('loc.gps'), (close) => locationSheetForGps(ctx, close)),
      ),
      choice('compass', t('loc.manual'), t('loc.manualDesc'), () =>
        ctx.sheet(t('loc.manual'), (close) => openLocationSheet(ctx, close)),
      ),
      choice('gear', t('loc.coords'), t('loc.coordsDesc'), () =>
        ctx.sheet(t('loc.coords'), (close) => openLocationSheet(ctx, close)),
      ),
    );
  } else {
    const method = getMethod(settings.calculation.methodId);
    const profile = getCountryProfile(loc?.countryCode ?? '');
    const select = el('select', { attrs: { 'aria-label': t('methods.selected') } });
    for (const m of selectableMethods()) {
      select.appendChild(
        el('option', {
          text: `${m.name[ctx.locale]}${m.experimental ? ' ⚠' : ''}`,
          attrs: { value: String(m.id), selected: m.id === method.id },
        }),
      );
    }
    select.addEventListener('change', () => {
      ctx.store.update((d) => {
        d.calculation.methodId = Number(select.value);
      });
    });

    const verifiedNote = profile.verifiedAgainstLocalAuthority
      ? alertBox('info', t('methods.certified'), t('methods.profileNote'))
      : null;

    body.append(
      el('h1', { text: t('onboard.step3.title') }),
      el('p', { class: 'lede', text: t('onboard.step3.lede') }),
      el('div', { class: 'field' }, el('label', { text: t('methods.selected') }), select),
      el('p', { class: 'small muted', text: method.notes[ctx.locale] }),
      el('div', { class: 'label', text: t('methods.asr') }),
      segmented<AsrSchool>(
        settings.calculation.asrSchool,
        [
          { value: 'standard', label: t('methods.asr.standard') },
          { value: 'hanafi', label: t('methods.asr.hanafi') },
        ],
        (value) => {
          ctx.store.update((d) => {
            d.calculation.asrSchool = value;
          });
        },
      ),
      alertBox('warn', t('methods.notCertified'), t('onboard.notCertified')),
    );
    if (verifiedNote) body.appendChild(verifiedNote);
  }

  const footer = el('div', { class: 'btn-row' });
  if (step > 0) {
    footer.appendChild(
      el(
        'button',
        {
          class: 'btn ghost',
          attrs: { type: 'button' },
          on: {
            click: () => {
              step -= 1;
              ctx.refresh();
            },
          },
        },
        t('common.back'),
      ),
    );
  }
  footer.appendChild(el('span', { class: 'spacer' }));

  if (step < 2) {
    const canContinue = step === 0 || Boolean(loc);
    footer.appendChild(
      el(
        'button',
        {
          class: 'btn primary',
          attrs: { type: 'button', disabled: !canContinue },
          on: {
            click: () => {
              if (!canContinue) return;
              step += 1;
              ctx.refresh();
            },
          },
        },
        t('common.next'),
      ),
    );
    if (step === 1 && !loc) {
      footer.appendChild(el('p', { class: 'tiny muted', text: t('onboard.step2.required') }));
    }
  } else {
    footer.appendChild(
      el(
        'button',
        {
          class: 'btn primary',
          attrs: { type: 'button' },
          on: {
            click: () => {
              ctx.store.update((d) => {
                d.onboarded = true;
              });
              step = 0;
              ctx.navigate('home');
            },
          },
        },
        t('common.done'),
      ),
    );
  }

  root.append(body, footer);
  return root;
}

/** GPS-only entry point used by the onboarding "detect my position" card. */
function locationSheetForGps(ctx: AppContext, close: () => void): HTMLElement {
  const wrap = el('div', { class: 'stack' });
  const status = el('div', { class: 'small muted', attrs: { role: 'status', 'aria-live': 'polite' } });
  const button = el(
    'button',
    {
      class: 'btn primary block',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (!('geolocation' in navigator)) {
            status.textContent = ctx.t('loc.gpsUnavailable');
            return;
          }
          status.textContent = ctx.t('loc.detecting');
          button.setAttribute('disabled', 'true');
          navigator.geolocation.getCurrentPosition(
            (position) => {
              button.removeAttribute('disabled');
              let tz = 'UTC';
              try {
                tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
              } catch {
                /* keep UTC */
              }
              if (!isValidTimeZone(tz)) tz = 'UTC';
              ctx.store.update((d) => {
                d.location = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  timeZone: tz,
                  countryCode: '',
                  source: 'gps',
                  determinedAt: Date.now(),
                };
              });
              close();
            },
            (error) => {
              button.removeAttribute('disabled');
              status.textContent =
                error.code === error.PERMISSION_DENIED ? ctx.t('loc.gpsDenied') : ctx.t('loc.gpsUnavailable');
            },
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
          );
        },
      },
    },
    ctx.t('loc.gps'),
  );
  wrap.append(button, status, el('p', { class: 'tiny muted', text: ctx.t('loc.gpsDesc') }));
  return wrap;
}
