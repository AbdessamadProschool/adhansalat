/**
 * Home screen: today's times, the next prayer, a live countdown, and the
 * per-prayer settings sheet.
 *
 * The countdown is a view concern only. It is driven by a 1 s interval that
 * re-reads the already-computed instants; it is NOT the mechanism that triggers
 * the Adhan (see alarm-engine.ts).
 */

import { buildSchedule, countdownTo, findNext } from '../../core/schedule.js';
import { hijriDate, type HijriDate } from '../../core/hijri.js';
import { computeFastingStatus, getDayFastingTimes, IFTAR_DUA } from '../../core/fasting.js';
import { dateKeyInTimeZone } from '../../core/timezone.js';
import { getMethod } from '../../core/methods.js';
import { countryName } from '../../core/profiles.js';
import { PRAYER_KEYS, type PrayerKey, type PrayerEvent, type GeoLocation, type DaySchedule } from '../../core/types.js';
import type { AppContext } from '../context.js';
import type { MessageKey } from '../i18n.js';
import { alarmStateLabel, alarmTone } from '../labels.js';
import { requestNotificationPermission } from '../notifications.js';
import { BUILTIN_SOUNDS } from '../store.js';
import { decorativeArt } from '../illustrations.js';
import {
  alertBox,
  el,
  fmtDateFull,
  fmtTime,
  icon,
  offsetLabelOf,
  pill,
  stepper,
  switchRow,
  toast,
} from '../ui.js';

const PRAYER_ICON: Record<PrayerKey, string> = {
  fajr: 'fajr',
  dhuhr: 'dhuhr',
  asr: 'asr',
  maghrib: 'maghrib',
  isha: 'isha',
};

// ------------------------------------------------------------------ countdown ring

function ringSvg(): { svg: SVGSVGElement; setProgress: (p: number) => void } {
  const NS = 'http://www.w3.org/2000/svg';
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('width', '88');
  svg.setAttribute('height', '88');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS(NS, 'circle');
  for (const [k, v] of Object.entries({
    cx: '48',
    cy: '48',
    r: String(radius),
    fill: 'none',
    stroke: 'rgba(255,255,255,0.16)',
    'stroke-width': '5',
  })) {
    track.setAttribute(k, v);
  }

  const arc = document.createElementNS(NS, 'circle');
  for (const [k, v] of Object.entries({
    cx: '48',
    cy: '48',
    r: String(radius),
    fill: 'none',
    stroke: '#e4cb93',
    'stroke-width': '5',
    'stroke-linecap': 'round',
    'stroke-dasharray': String(circumference),
    'stroke-dashoffset': String(circumference),
    transform: 'rotate(-90 48 48)',
  })) {
    arc.setAttribute(k, v);
  }

  svg.append(track, arc);
  return {
    svg,
    setProgress(p: number) {
      const clamped = Math.max(0, Math.min(1, p));
      arc.setAttribute('stroke-dashoffset', String(circumference * (1 - clamped)));
    },
  };
}

function countdownText(t: AppContext['t'], cd: ReturnType<typeof countdownTo>): string {
  if (cd.hours > 0) return `${cd.hours} ${t('time.h')} ${cd.minutes} ${t('time.m')}`;
  if (cd.minutes > 0) return `${cd.minutes} ${t('time.m')} ${String(cd.seconds).padStart(2, '0')} ${t('time.s')}`;
  return `${cd.seconds} ${t('time.s')}`;
}

// ------------------------------------------------------------------ prayer sheet

function soundChoices(ctx: AppContext): Array<{ id: string; name: string }> {
  const settings = ctx.store.get();
  return [
    ...BUILTIN_SOUNDS.map((s) => ({
      id: s.id,
      name: s.id === 'none' ? ctx.t('adhan.silent') : s.name,
    })),
    ...settings.sounds.map((s) => ({ id: s.id, name: s.name })),
  ];
}

export function openPrayerDetail(ctx: AppContext, prayer: PrayerKey): void {
  const t = ctx.t;

  ctx.sheet(t(`prayer.${prayer}` as MessageKey), (close) => {
    const wrap = el('div', { class: 'stack' });
    const settings = ctx.store.get();
    const loc = settings.location;

    const render = () => {
      const current = ctx.store.get();
      const pref = current.prayers[prayer];
      const at = loc ? todayInstant(ctx, prayer) : null;
      const eventKey = loc && at ? `${currentTzDate(ctx)}:${prayer}` : null;
      const snapshot = ctx.engine.snapshot();
      const planned = eventKey ? snapshot.alarms.find((a) => a.eventKey === eventKey) : undefined;

      const nodes: HTMLElement[] = [];

      nodes.push(
        el(
          'div',
          { class: 'row-between' },
          el(
            'div',
            {},
            el('div', { class: 'eyebrow', text: t('prayerDetail.at') }),
            el('div', { class: 'time', attrs: { style: 'font-size:var(--text-2xl)' }, text: at ? fmtTime(at, loc!.timeZone, ctx.intl) : '—' }),
          ),
          el(
            'div',
            { class: 'stack sm', attrs: { style: 'align-items:flex-end;text-align:end' } },
            el('span', { class: 'tiny muted', text: t('prayerDetail.state') }),
            planned
              ? pill(alarmStateLabel(t, planned.state), alarmTone(planned.state), planned.state === 'scheduled' ? 'check' : 'clock')
              : pill(t('alarm.unknown'), 'muted', 'info'),
          ),
        ),
      );

      nodes.push(
        switchRow(
          t('adhan.enabled'),
          null,
          pref.enabled,
          (next) => {
            ctx.store.update((d) => {
              d.prayers[prayer].enabled = next;
            });
            ctx.engine.replan('preference');
            ctx.refresh();
            render();
          },
          'bell',
        ),
      );

      nodes.push(
        switchRow(
          t('adhan.audio'),
          t('adhan.volume'),
          pref.audioEnabled,
          (next) => {
            ctx.store.update((d) => {
              d.prayers[prayer].audioEnabled = next;
            });
            ctx.engine.replan('preference');
            ctx.refresh();
            render();
          },
          'speaker',
        ),
      );

      const select = el('select', { attrs: { 'aria-label': t('prayerDetail.sound'), disabled: !pref.audioEnabled } });
      for (const sound of soundChoices(ctx)) {
        select.appendChild(
          el('option', {
            text: sound.name,
            attrs: { value: sound.id, selected: sound.id === pref.soundId },
          }),
        );
      }
      select.addEventListener('change', () => {
        ctx.store.update((d) => {
          d.prayers[prayer].soundId = select.value;
        });
        ctx.engine.replan('sound');
        ctx.refresh();
        render();
      });
      nodes.push(el('div', { class: 'field' }, el('label', { text: t('prayerDetail.sound') }), select));

      nodes.push(
        el(
          'div',
          { class: 'field' },
          el('label', { text: t('adhan.preReminder') }),
          stepper({
            value: pref.preReminderMinutes,
            min: 0,
            max: 60,
            step: 5,
            label: (v) => (v === 0 ? t('common.off') : `${v} ${t('common.min')}`),
            ariaLabel: t('adhan.preReminder'),
            onChange: (v) => {
              ctx.store.update((d) => {
                d.prayers[prayer].preReminderMinutes = v;
              });
              ctx.engine.replan('preference');
              ctx.refresh();
            },
          }),
        ),
      );

      nodes.push(
        switchRow(
          t('adhan.vibration'),
          null,
          pref.vibration,
          (next) => {
            ctx.store.update((d) => {
              d.prayers[prayer].vibration = next;
            });
            ctx.refresh();
            render();
          },
          'vibrate',
        ),
      );

      const testBtn = el(
        'button',
        {
          class: 'btn',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              const soundId = prayer === 'fajr' && current.fajrSoundOverride ? current.fajrSoundOverride : pref.soundId;
              if (soundId === 'none') {
                toast(t('adhan.silent'));
                return;
              }
              try {
                await ctx.player.play(soundId);
                toast(t('adhan.testOk'));
              } catch (err) {
                toast(`${t('adhan.testFail')} ${err instanceof Error ? err.message : ''}`);
              }
            },
          },
        },
        icon('speaker', 18),
        t('adhan.testNow'),
      );

      const previewBtn = el(
        'button',
        {
          class: 'btn ghost',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              const soundId = prayer === 'fajr' && current.fajrSoundOverride ? current.fajrSoundOverride : pref.soundId;
              try {
                if (ctx.player.currentId) {
                  ctx.player.stop();
                  toast(t('adhan.stopped'));
                } else {
                  await ctx.player.play(soundId);
                }
              } catch (err) {
                toast(`${t('adhan.testFail')} ${err instanceof Error ? err.message : ''}`);
              }
            },
          },
        },
        icon('speaker', 18),
        t('common.preview'),
      );

      nodes.push(el('div', { class: 'btn-row' }, testBtn, previewBtn));
      nodes.push(el('p', { class: 'tiny muted', text: t('adhan.volume') }));
      nodes.push(
        el('button', { class: 'btn primary block', attrs: { type: 'button' }, on: { click: close } }, t('common.close')),
      );

      wrap.replaceChildren(...nodes);
    };

    render();
    return wrap;
  });
}

function currentTzDate(ctx: AppContext): string {
  const loc = ctx.store.get().location;
  if (!loc) return '';
  return dateKeyInTimeZone(new Date(), loc.timeZone);
}

function todayInstant(ctx: AppContext, prayer: PrayerKey): Date | null {
  const settings = ctx.store.get();
  const loc = settings.location;
  if (!loc) return null;
  const schedule = buildSchedule(new Date(), loc, settings.calculation);
  return schedule.times[prayer] ?? null;
}

// ------------------------------------------------------------------ screen

export function homeScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const loc = settings.location;
  const root = el('div', { class: 'screen' });

  if (!loc) {
    root.append(
      el('h1', { text: t('app.name') }),
      alertBox('warn', t('onboard.step2.title'), t('onboard.step2.lede')),
      el(
        'button',
        { class: 'btn primary block', attrs: { type: 'button' }, on: { click: () => ctx.navigate('onboarding') } },
        t('loc.manual'),
      ),
    );
    return root;
  }

  const now = new Date();
  const schedule = buildSchedule(now, loc, settings.calculation);
  const times = schedule.times;
  const method = getMethod(settings.calculation.methodId);
  const hijri = settings.showHijri ? hijriDate(now, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0) : null;

  // The visual hierarchy starts with the hero, but every screen still needs one
  // document-level heading for screen readers and the outline.
  root.append(el('h1', { class: 'sr-only', text: t('nav.home') }));

  // ---------------------------------------------------------------- hero
  const next = schedule.next;
  const current = schedule.current;
  const ring = ringSvg();

  const hero = el('section', { class: 'hero', attrs: { 'aria-labelledby': 'home-next' } });
  hero.appendChild(decorativeArt('zellige', 'hero-art'));

  const placeName = loc.cityName
    ? `${loc.cityName} — ${countryName(loc.countryCode, ctx.intl)}`
    : countryName(loc.countryCode, ctx.intl) || t('loc.current');

  hero.append(
    el(
      'div',
      { class: 'hero-top' },
      el(
        'div',
        { class: 'stack sm' },
        el('div', { class: 'place' }, icon('pin', 15), placeName),
        el('div', { class: 'date', text: fmtDateFull(now, loc.timeZone, ctx.intl) }),
        hijri ? el('div', { class: 'date', text: `${t('home.hijri')} · ${hijri.formatted}` }) : null,
      ),
      el(
        'div',
        { class: 'hero-clock' },
        el('div', { class: 'date', text: offsetLabelOf(loc.timeZone, now) }),
        el('div', { class: 'num', text: fmtTime(now, loc.timeZone, ctx.intl) }),
      ),
    ),
  );

  if (next) {
    const nextName = t(`prayer.${next.prayer}` as MessageKey);
    const countdownNode = el('span', { class: 'num', text: '' });
    const isTomorrow = next.date !== times.date;

    hero.append(
      el(
        'div',
        { class: 'hero-main' },
        el(
          'div',
          { class: 'hero-prayer' },
          el(
            'div',
            { class: 'hero-prayer-head' },
            el('span', { class: 'hero-prayer-icon' }, icon(PRAYER_ICON[next.prayer], 28)),
            el('div', { class: 'next-label', text: t('home.next') }),
          ),
          el('div', { class: 'name', attrs: { id: 'home-next' }, text: nextName }),
          ctx.locale === 'ar' ? null : el('div', { class: 'ar', text: PRAYER_ARABIC[next.prayer] }),
          el(
            'div',
            { class: 'at num' },
            isTomorrow ? el('span', { class: 'chip accent', text: t('home.tomorrow') }) : null,
            ` ${labelForLocal(ctx, next)}`,
          ),
        ),
        ring.svg,
      ),
      el(
        'div',
        { class: 'countdown' },
        el('span', { text: t('home.remaining') }),
        el('b', {}, countdownNode),
      ),
    );

    const startMs = current ? current.at.getTime() : next.at.getTime() - 6 * 3_600_000;
    const total = Math.max(1, next.at.getTime() - startMs);

    let lastNextKey = `${next.date}:${next.prayer}`;
    const tick = () => {
      const nowMs = Date.now();
      const cd = countdownTo(next.at, new Date(nowMs));
      countdownNode.textContent = countdownText(t, cd);
      ring.setProgress((nowMs - startMs) / total);
      const refreshed = findNext(schedule.events, new Date(nowMs));
      const key = refreshed.next ? `${refreshed.next.date}:${refreshed.next.prayer}` : 'none';
      if (key !== lastNextKey) {
        lastNextKey = key;
        ctx.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    ctx.registerCleanup(() => clearInterval(timer));
  } else {
    hero.append(
      el(
        'div',
        { class: 'hero-prayer' },
        el('div', { class: 'next-label', text: t('home.next') }),
        el('div', { class: 'name', text: t('home.noPrayer') }),
      ),
    );
  }

  hero.append(
    el(
      'div',
      { class: 'hero-foot' },
      el(
        'button',
        {
          class: 'pill on-hero',
          attrs: { type: 'button', style: 'cursor:pointer;border:none;' },
          on: { click: () => ctx.navigate('methods') },
        },
        icon('sliders', 13),
        ` ${method.name[ctx.locale]}`,
      ),
      current
        ? el(
            'span',
            { class: 'pill on-hero' },
            icon('clock', 13),
            ` ${t('common.now')} · ${t(`prayer.${current.prayer}` as MessageKey)}`,
          )
        : null,
      now.getDay() === 5
        ? el(
            'span',
            { class: 'pill on-hero' },
            icon('lantern', 13),
            ctx.locale === 'ar' ? ' جمعة مباركة' : ' Vendredi béni',
          )
        : null,
      times.highLatitudeFallback === 'applied'
        ? el('span', { class: 'pill on-hero' }, icon('info', 13), ` ${t('home.highLatApplied')}`)
        : null,
    ),
  );

  root.append(hero);
  root.append(buildSpiritualCard(ctx, now, hijri));

  // ---------------------------------------------------------------- fasting & iftar
  root.append(
    buildFastingCard(
      ctx,
      now,
      schedule,
      hijri,
      loc,
      settings.imsakOffsetMinutes ?? 10,
    ),
  );

  if (times.highLatitudeFallback === 'unresolvable') {
    root.append(alertBox('warn', t('home.unresolvable'), t('methods.highLatDesc')));
  }

  // ---------------------------------------------------------------- reminders
  // The status comes from the alarm engine snapshot. "Scheduled" is only shown
  // when the platform actually confirmed it; otherwise the row says unknown.
  const snapshot = ctx.engine.snapshot();
  const nowMs = Date.now();
  const nextAlarm = snapshot.alarms.find((a) => Date.parse(a.atIso) >= nowMs - 60_000);
  const reminderCard = el('div', { class: 'card tight' });
  reminderCard.append(
    el(
      'div',
      { class: 'row-between' },
      el(
        'div',
        { class: 'stack sm', attrs: { style: 'min-width:0' } },
        el(
          'span',
          { class: 'eyebrow row align-center gap-xs' },
          icon('bell', 13),
          el('span', { text: t('home.reminders') }),
        ),
        nextAlarm
          ? el(
              'strong',
              { class: 'small' },
              `${t(`prayer.${nextAlarm.prayer}` as MessageKey)} · ${fmtTime(new Date(nextAlarm.atIso), loc.timeZone, ctx.intl)}`,
            )
          : el('strong', { class: 'small', text: t('home.noAlarm') }),
        el('span', { class: 'tiny muted', text: t('home.remindersHint') }),
      ),
      nextAlarm
        ? pill(
            alarmStateLabel(t, nextAlarm.state),
            alarmTone(nextAlarm.state),
            nextAlarm.state === 'scheduled' ? 'check' : 'clock',
          )
        : pill(t('common.unknown'), 'muted', 'info'),
    ),
  );
  root.append(reminderCard);

  // ---------------------------------------------------------------- permissions
  const notifState = snapshot.notifications;
  if (settings.notificationsWanted && notifState !== 'granted') {
    const denied = notifState === 'denied';
    const unsupported = notifState === 'unsupported';
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
            el('strong', { class: 'small', text: t('settings.notifications') }),
            el('div', {
              class: 'tiny muted',
              text: unsupported
                ? t('error.notif')
                : denied
                  ? t('settings.notifDenied')
                  : t('settings.notifDefault'),
            }),
          ),
          el(
            'div',
            { class: 'diag-actions' },
            pill(
              unsupported || denied ? t('diag.permissionNeeded') : t('diag.notifNotAsked'),
              unsupported || denied ? 'bad' : 'warn',
              'alert',
            ),
            unsupported || denied
              ? el(
                  'button',
                  { class: 'btn sm', attrs: { type: 'button' }, on: { click: () => ctx.navigate('diagnostics') } },
                  t('diag.check'),
                )
              : el(
                  'button',
                  {
                    class: 'btn sm primary',
                    attrs: { type: 'button' },
                    on: {
                      click: async () => {
                        const result = await requestNotificationPermission();
                        ctx.toast(result === 'granted' ? t('settings.notifGranted') : t('settings.notifDenied'));
                        ctx.engine.replan('permission');
                        ctx.refresh();
                      },
                    },
                  },
                  t('diag.grant'),
                ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- prayer list
  const list = el('ul', { class: 'prayer-list' });
  for (const prayer of PRAYER_KEYS) {
    const at = times[prayer];
    const pref = settings.prayers[prayer];
    const isNext = next?.prayer === prayer && next.date === times.date;
    const isCurrent = current?.prayer === prayer && current.date === times.date;
    const isPast = at !== null && at.getTime() <= now.getTime();
    const classes = ['prayer-row'];
    if (isNext) classes.push('is-next');
    if (isCurrent) classes.push('is-current');
    if (isPast) classes.push('is-past');

    const audioHint = pref.audioEnabled && !pref.notificationOnly
      ? el('span', { class: 'chev', attrs: { 'aria-hidden': 'true' } }, icon('speaker', 17))
      : el('span', { class: 'chev', attrs: { 'aria-hidden': 'true' } }, icon('bellOff', 17));

    const stateLabel = isCurrent ? `${t('common.now')} · ` : '';
    list.appendChild(
      el(
        'li',
        {},
        el(
          'button',
          {
            class: classes.join(' '),
            attrs: {
              type: 'button',
              'aria-label': `${t(`prayer.${prayer}` as MessageKey)} ${stateLabel}${at ? fmtTime(at, loc.timeZone, ctx.intl) : ''} · ${pref.audioEnabled ? t('adhan.audio') : t('adhan.notificationOnly')}`,
            },
            on: { click: () => openPrayerDetail(ctx, prayer) },
          },
          el('span', { class: 'prayer-icon' }, icon(PRAYER_ICON[prayer], 22)),
          el(
            'span',
            { class: 'prayer-name' },
            el('strong', { text: t(`prayer.${prayer}` as MessageKey) }),
            ctx.locale === 'ar' ? null : el('span', { text: PRAYER_ARABIC[prayer] }),
            isCurrent ? el('span', { class: 'row-note', text: t('common.now') }) : null,
          ),
          el('span', { class: 'time num', text: at ? fmtTime(at, loc.timeZone, ctx.intl) : '—' }),
          audioHint,
        ),
      ),
    );
  }

  // Sunrise: informational only, never a sixth prayer.
  if (times.sunrise) {
    list.appendChild(
      el(
        'li',
        {},
        el(
          'div',
          {
            class: 'prayer-row is-sunrise',
            attrs: { 'aria-label': t('prayer.sunriseNote') },
          },
          el('span', { class: 'prayer-icon' }, icon('sunrise', 22)),
          el(
            'span',
            { class: 'prayer-name' },
            el('strong', { text: t('prayer.sunrise') }),
            el('span', { class: 'row-note', text: t('prayer.sunriseNote') }),
          ),
          el('span', { class: 'time num', text: fmtTime(times.sunrise, loc.timeZone, ctx.intl) }),
          el('span', { class: 'chev' }),
        ),
      ),
    );
  }

  root.append(
    el(
      'section',
      { class: 'card', attrs: { 'aria-labelledby': 'home-today' } },
      el(
        'div',
        { class: 'card-head' },
        el('h2', { text: t('home.today'), attrs: { id: 'home-today' } }),
        el('span', { class: 'hint', text: method.name[ctx.locale] }),
      ),
      list,
    ),
  );

  // ---------------------------------------------------------------- quick access
  const hour = now.getHours();
  const adhkarLabel = hour < 12 ? t('adhkar.morning') : t('adhkar.evening');

  root.append(
    el(
      'div',
      { class: 'quick-grid' },
      quickAction('compass', t('nav.qibla'), () => ctx.navigate('qibla')),
      quickAction('book', adhkarLabel, () => ctx.navigate('tasbih')),
      quickAction('speaker', t('nav.adhan'), () => ctx.navigate('adhan')),
      quickAction('gear', t('nav.settings'), () => ctx.navigate('settings')),
    ),
  );

  // ---------------------------------------------------------------- spiritual footer
  root.append(
    el(
      'div',
      { class: 'home-spiritual-footer center', attrs: { style: 'padding: var(--space-4) var(--space-2); margin-top: var(--space-2);' } },
      el('p', { class: 'home-dua-text', attrs: { style: 'font-weight: 700; color: var(--gold, #b45309); font-size: var(--text-sm); margin: 0 0 4px 0;' }, text: '« صَدَقَةٌ جَارِيَةٌ • لَا تَنْسَوْنَا مِنْ صَالِحِ دُعَائِكُمْ »' }),
      el('span', { class: 'tiny muted', text: `${t('app.name')} · 100% ${ctx.locale === 'ar' ? 'مجاني لوجه الله تعالى' : 'gratuit & sans publicité'}` }),
    ),
  );

  return root;
}

function quickAction(glyph: string, label: string, onClick: () => void): HTMLElement {
  return el(
    'button',
    { class: 'quick-action', attrs: { type: 'button' }, on: { click: onClick } },
    el('span', { class: 'glyph' }, icon(glyph, 18)),
    el('span', { text: label }),
    icon('chevron', 16),
  );
}

const PRAYER_ARABIC: Record<PrayerKey, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

function labelForLocal(ctx: AppContext, event: PrayerEvent): string {
  const loc = ctx.store.get().location;
  return loc ? fmtTime(event.at, loc.timeZone, ctx.intl) : '—';
}

function buildSpiritualCard(
  ctx: AppContext,
  now: Date,
  hijri: HijriDate | null,
): HTMLElement {
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 5 = Friday
  const isFriday = dayOfWeek === 5;

  let title = '';
  let subtitle = '';
  let iconName = 'sun';

  if (isFriday && hour >= 6 && hour <= 18) {
    title = ctx.locale === 'ar' ? 'جمعة مباركة' : ctx.locale === 'fr' ? 'Vendredi béni' : 'Blessed Friday';
    subtitle = ctx.locale === 'ar' ? 'سورة الكهف والإكثار من الصلاة على النبي ﷺ' : 'Sourate Al-Kahf & Prières sur le Prophète ﷺ';
    iconName = 'lantern';
  } else if (hour >= 5 && hour < 12) {
    title = ctx.locale === 'ar' ? 'أذكار الصباح (حصن اليوم)' : ctx.locale === 'fr' ? 'Adhkar du matin' : 'Morning Adhkar';
    subtitle = ctx.locale === 'ar' ? '«أصبحنا وأصبح الملك لله، والحمد لله»' : 'Commencez votre journée sous la protection d’Allah';
    iconName = 'sun';
  } else if (hour >= 12 && hour < 17) {
    title = ctx.locale === 'ar' ? 'أذكار ما بعد الصلاة واليوم' : ctx.locale === 'fr' ? 'Adhkar du jour' : 'Daily Adhkar';
    subtitle = ctx.locale === 'ar' ? '«أستغفر الله وأتوب إليه»' : 'Invocations et rappels quotidiens';
    iconName = 'beads';
  } else if (hour >= 17 && hour < 21) {
    title = ctx.locale === 'ar' ? 'أذكار المساء' : ctx.locale === 'fr' ? 'Adhkar du soir' : 'Evening Adhkar';
    subtitle = ctx.locale === 'ar' ? '«أمسينا وأمسى الملك لله، والحمد لله»' : 'Protégez votre soirée par l’évocation d’Allah';
    iconName = 'moon';
  } else {
    title = ctx.locale === 'ar' ? 'أذكار النوم والراحة' : ctx.locale === 'fr' ? 'Invocations avant de dormir' : 'Sleep Invocations';
    subtitle = ctx.locale === 'ar' ? '«باسمك ربي وضعت جنبي وبك أرفعه»' : 'Remettez votre âme à Allah avant de dormir';
    iconName = 'moon';
  }

  const card = el(
    'div',
    {
      class: `card tight stack xs spiritual-living-card ${isFriday ? 'is-friday' : ''}`,
      attrs: {
        style:
          'background: linear-gradient(135deg, rgba(6, 67, 50, 0.08) 0%, rgba(228, 203, 147, 0.14) 100%); border: 1px solid rgba(197, 155, 39, 0.35); cursor: pointer; margin-block-start: var(--space-2);',
        role: 'button',
        tabindex: '0',
      },
      on: {
        click: () => {
          if (isFriday) {
            openFridayHub(ctx);
          } else {
            ctx.navigate('tasbih');
          }
        },
      },
    },
    el(
      'div',
      { class: 'row-between align-center' },
      el(
        'div',
        { class: 'row align-center gap-xs' },
        icon(iconName, 18),
        el('strong', { class: 'small', text: title }),
      ),
      el('span', { class: 'pill ok tiny', text: ctx.locale === 'ar' ? 'ابدأ الآن ➔' : 'Ouvrir ➔' }),
    ),
    el('p', { class: 'tiny muted', attrs: { style: 'margin-block-start: 2px;' }, text: subtitle }),
  );

  return card;
}

/**
 * Blessed Friday Hub bottom sheet:
 *  - Salawat on the Prophet counter with haptic feedback
 *  - Surah Al-Kahf recitation passage (Light between two Fridays)
 *  - Hour of Response reminder between Asr and Maghrib
 */
function openFridayHub(ctx: AppContext): void {
  const t = ctx.t;
  ctx.sheet(t('friday.title'), (close) => {
    const wrap = el('div', { class: 'stack md friday-hub-modal', attrs: { style: 'padding-block: var(--space-2);' } });

    // 1. Salawat on the Prophet interactive counter
    let salawatCount = 0;
    try {
      const stored = sessionStorage.getItem('azan.friday_salawat');
      if (stored) salawatCount = parseInt(stored, 10) || 0;
    } catch {
      // ignore
    }

    const countDisplay = el('span', {
      class: 'friday-salawat-num',
      attrs: { style: 'font-size: var(--text-2xl); font-weight: var(--weight-bold); color: var(--primary); font-variant-numeric: tabular-nums;' },
      text: String(salawatCount),
    });

    const tapSalawatBtn = el(
      'button',
      {
        class: 'btn primary full-width stack xs align-center',
        attrs: {
          type: 'button',
          style: 'min-height: 84px; padding: var(--space-3); border-radius: var(--radius-lg); text-align: center; cursor: pointer;',
        },
        on: {
          click: () => {
            salawatCount++;
            countDisplay.textContent = String(salawatCount);
            try {
              sessionStorage.setItem('azan.friday_salawat', String(salawatCount));
            } catch {
              // ignore
            }
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              if (salawatCount % 100 === 0) {
                navigator.vibrate([70, 50, 70, 50, 100]);
                toast(`ما شاء الله! أتممت ${salawatCount} صلاة على الحبيب المصطفى ﷺ`);
              } else {
                navigator.vibrate(25);
              }
            }
          },
        },
      },
      el('span', { attrs: { style: 'font-size: var(--text-base); font-family: var(--font-arabic, serif); font-weight: 600;' }, text: t('friday.salawatDua') }),
      el('span', { class: 'tiny muted', text: `👆 ${t('friday.salawatTap')}` }),
    );

    const salawatCard = el(
      'div',
      { class: 'card stack xs', attrs: { style: 'background: var(--surface-2);' } },
      el(
        'div',
        { class: 'row-between align-center' },
        el('strong', { class: 'small', text: `✨ ${t('friday.salawatTitle')}` }),
        countDisplay,
      ),
      tapSalawatBtn,
    );

    // 2. Surah Al-Kahf opening passage & merit
    const kahfCard = el(
      'div',
      { class: 'card stack xs', attrs: { style: 'background: var(--surface-2);' } },
      el('strong', { class: 'small', text: `📖 ${t('friday.kahfTitle')}` }),
      el(
        'p',
        {
          class: 'adhkar-arabic',
          attrs: { lang: 'ar', dir: 'rtl', style: 'font-size: var(--text-sm); line-height: 2; margin: 0;' },
          text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ · الْحَمْدُ لِلَّهِ الَّذِي أَنزَلَ عَلَىٰ عَبْدِهِ الْكِتَابَ وَلَمْ يَجْعَل لَّهُ عِوَجًا ۜ قَيِّمًا لِّيُنذِرَ بَأْسًا شَدِيدًا مِّن لَّدُنْهُ وَيُبَشِّرَ الْمُؤْمِنِينَ الَّذِينَ يَعْمَلُونَ الصَّالِحَاتِ أَنَّ لَهُمْ أَجْرًا حَسَنًا · مَّاكِثِينَ فِيهِ أَبَدًا · وَيُنذِرَ الَّذِينَ قَالُوا اتَّخَذَ اللَّهُ وَلَدًا · مَّا لَهُم بِهِ مِنْ عِلْمٍ وَلَا لِآبَائِهِمْ ۚ كَبُرَتْ كَلِمَةً تَخْرُجُ مِنْ أَفْوَاهِهِمْ ۚ إِن يَقُولُونَ إِلَّا كَذِبًا',
        },
      ),
      el('span', { class: 'tiny muted', text: '«مَن قرأ سورةَ الكهفِ في يومِ الجمعةِ أضاء له من النُّورِ ما بينَ الجُمعتَينِ» (صحيح الترغيب)' }),
    );

    // 3. Hour of response (Between Asr and Maghrib)
    const hourCard = el(
      'div',
      { class: 'card highlight stack xs', attrs: { style: 'border-inline-start: 3px solid var(--primary);' } },
      el('strong', { class: 'small', text: `🤲 ${t('friday.hourDuaTitle')}` }),
      el('p', { class: 'tiny muted', text: t('friday.hourDuaDesc') }),
    );

    wrap.append(
      salawatCard,
      kahfCard,
      hourCard,
      el('button', {
        class: 'btn secondary full-width',
        attrs: { type: 'button' },
        text: t('common.close'),
        on: { click: close },
      }),
    );

    return wrap;
  });
}


function buildFastingCard(
  ctx: AppContext,
  now: Date,
  schedule: DaySchedule,
  hijri: HijriDate | null,
  loc: GeoLocation,
  imsakOffsetMinutes: number,
): HTMLElement {
  const t = ctx.t;
  const times = schedule.times;
  const dayFasting = getDayFastingTimes(times, imsakOffsetMinutes);
  const fasting = computeFastingStatus(now, times, null, hijri, imsakOffsetMinutes);

  const card = el('div', { class: 'fasting-card' });

  // 1. Tag / Badge (Ramadan, White Days, Sunnah, etc.)
  const rec = fasting.recommendation;
  const tagClass =
    rec.type === 'ramadan'
      ? 'fasting-tag ramadan'
      : rec.isRecommended
        ? 'fasting-tag recommended'
        : 'fasting-tag';
  const tag = el('span', { class: tagClass }, icon('moon', 13), t(rec.reasonKey as MessageKey));

  const infoBtn = el(
    'button',
    {
      class: 'icon-btn',
      attrs: { type: 'button', 'aria-label': t('fasting.title') },
      on: {
        click: () => {
          ctx.sheet(t('fasting.title'), (close) => {
            const sheet = el('div', { class: 'fasting-dua-sheet stack md' });
            sheet.append(
              el(
                'div',
                { class: 'fasting-grid' },
                el(
                  'div',
                  { class: 'fasting-stat' },
                  el('span', { class: 'label', text: t('fasting.imsak') }),
                  el(
                    'span',
                    { class: 'value' },
                    fmtTime(dayFasting.imsak, loc.timeZone, ctx.intl),
                  ),
                ),
                el(
                  'div',
                  { class: 'fasting-stat' },
                  el('span', { class: 'label', text: t('fasting.iftar') }),
                  el(
                    'span',
                    { class: 'value' },
                    fmtTime(dayFasting.maghrib, loc.timeZone, ctx.intl),
                  ),
                ),
                el(
                  'div',
                  { class: 'fasting-stat' },
                  el('span', { class: 'label', text: t('fasting.duration') }),
                  el('span', {
                    class: 'value',
                    text: dayFasting.durationMinutes
                      ? `${Math.floor(dayFasting.durationMinutes / 60)}h ${dayFasting.durationMinutes % 60}m`
                      : '—',
                  }),
                ),
              ),
              el(
                'div',
                { class: 'fasting-dua-box' },
                el('h3', { class: 'small muted', text: t('fasting.duaTitle') }),
                el('p', { class: 'fasting-dua-arabic', text: IFTAR_DUA.arabic }),
                el('p', { class: 'fasting-dua-translit', text: IFTAR_DUA.translit }),
                el('p', {
                  class: 'fasting-dua-translation',
                  text: ctx.locale === 'en' ? IFTAR_DUA.translationEn : IFTAR_DUA.translationFr,
                }),
                el('span', { class: 'tiny muted', text: IFTAR_DUA.source }),
              ),
              el('p', {
                class: 'tiny muted center',
                text: `${t('fasting.offsetLabel')} : ${imsakOffsetMinutes} ${t('common.minutes')}`,
              }),
              el(
                'button',
                { class: 'btn primary block', attrs: { type: 'button' }, on: { click: close } },
                t('common.close'),
              ),
            );
            return sheet;
          });
        },
      },
    },
    icon('info', 18),
  );

  const head = el('div', { class: 'fasting-head' }, tag, infoBtn);

  // 2. Main title & Countdown
  let mainLabel = '';
  let timeDetail = '';

  if (fasting.phase === 'fasting') {
    const hours = Math.floor(fasting.remainingMs / (3600 * 1000));
    const mins = Math.floor((fasting.remainingMs % (3600 * 1000)) / 60000);
    const timeStr = `${hours}h ${String(mins).padStart(2, '0')}m`;
    mainLabel = t('fasting.countdownIftar', { time: timeStr });
    timeDetail = `${t('fasting.iftar')} · ${fmtTime(dayFasting.maghrib, loc.timeZone, ctx.intl)}`;
  } else if (fasting.phase === 'before-imsak') {
    const hours = Math.floor(fasting.remainingMs / (3600 * 1000));
    const mins = Math.floor((fasting.remainingMs % (3600 * 1000)) / 60000);
    const timeStr = `${hours}h ${String(mins).padStart(2, '0')}m`;
    mainLabel = t('fasting.countdownImsak', { time: timeStr });
    timeDetail = `${t('fasting.suhoor')} · ${t('fasting.imsak')} ${fmtTime(dayFasting.imsak, loc.timeZone, ctx.intl)}`;
  } else if (fasting.phase === 'imsak-buffer') {
    mainLabel = t('fasting.imsakBuffer');
    timeDetail = `${t('prayer.fajr')} · ${fmtTime(dayFasting.fajr, loc.timeZone, ctx.intl)}`;
  } else {
    mainLabel = t('fasting.completed');
    timeDetail = `${t('fasting.duration')} · ${dayFasting.durationMinutes ? `${Math.floor(dayFasting.durationMinutes / 60)}h ${dayFasting.durationMinutes % 60}m` : '—'}`;
  }

  const row = el(
    'div',
    { class: 'row-between' },
    el(
      'div',
      { class: 'stack xs' },
      el('strong', { class: 'text-base', text: mainLabel }),
      el('span', { class: 'tiny muted', text: timeDetail }),
    ),
    el(
      'button',
      {
        class: 'btn sm secondary',
        attrs: { type: 'button' },
        on: { click: () => infoBtn.click() },
      },
      t('fasting.duaTitle'),
    ),
  );

  // 3. Progress bar (visible during active fasting)
  if (fasting.phase === 'fasting') {
    const bar = el('div', { class: 'fasting-progress-bar' });
    const fill = el('span', { class: 'fasting-progress-fill' });
    fill.style.width = `${fasting.progressPercent}%`;
    bar.appendChild(fill);
    card.append(head, row, bar);
  } else {
    card.append(head, row);
  }

  return card;
}

