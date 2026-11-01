/**
 * Calendar screen.
 *
 * The month grid and the selected-day table are both computed on the device from
 * the same engine as the home screen; nothing is fetched. A day whose angle is
 * unreachable shows "—" rather than a fabricated minute.
 */

import { hijriDate } from '../../core/hijri.js';
import { calculateImsak, getFastingRecommendation } from '../../core/fasting.js';
import { computeWindow } from '../../core/schedule.js';
import { getMethod } from '../../core/methods.js';
import { countryName } from '../../core/profiles.js';
import { addDaysToKey, dateKeyInTimeZone, parseDateKey, zonedTimeToInstant } from '../../core/timezone.js';
import { PRAYER_KEYS, type PrayerKey } from '../../core/types.js';
import type { AppContext } from '../context.js';
import type { MessageKey } from '../i18n.js';
import { alertBox, el, emptyState, fmtDateFull, fmtMonth, fmtTime, icon } from '../ui.js';
import { openLocationSheet } from '../location.js';

// View state survives re-renders triggered by a settings change.
let anchorMonth: string | null = null;
let selectedDay: string | null = null;

const CAL_FIELDS: Array<PrayerKey | 'sunrise'> = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function calendarScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const loc = settings.location;
  const root = el('div', { class: 'screen' });

  if (!loc) {
    root.append(
      el('h1', { text: t('calendar.title') }),
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
  const todayKey = dateKeyInTimeZone(now, loc.timeZone);
  if (!anchorMonth) anchorMonth = todayKey.slice(0, 7);
  if (!selectedDay) selectedDay = todayKey;

  const anchor = anchorMonth;
  const { year, month } = parseDateKey(`${anchor}-01`);
  const firstKey = `${anchor}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthTimes = computeWindow(firstKey, daysInMonth, loc, settings.calculation);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const method = getMethod(settings.calculation.methodId);

  // Keep the selection inside the displayed month.
  if (!selectedDay.startsWith(anchor)) selectedDay = firstKey;

  const header = el(
    'div',
    {},
    el('h1', { text: t('calendar.title') }),
    el('p', { class: 'small muted', text: t('calendar.subtitle') }),
  );

  // ---------------------------------------------------------------- month card
  const monthCard = el('div', { class: 'card' });
  const title = fmtMonth(zonedTimeToInstant(year, month, 1, 12, 0, loc.timeZone), loc.timeZone, ctx.intl);
  const backIcon = icon('chevronLeft', 18);
  backIcon.classList.add('icon-directional');
  const forwardIcon = icon('chevron', 18);
  forwardIcon.classList.add('icon-directional');

  monthCard.append(
    el(
      'div',
      { class: 'cal-head' },
      el(
        'button',
        {
          class: 'icon-btn',
          attrs: { type: 'button', 'aria-label': t('common.back') },
          on: {
            click: () => {
              const prev = new Date(Date.UTC(year, month - 2, 1));
              anchorMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
              selectedDay = `${anchorMonth}-01`;
              ctx.refresh();
            },
          },
        },
        backIcon,
      ),
      el('div', { class: 'cal-title center', text: title }),
      el(
        'button',
        {
          class: 'icon-btn',
          attrs: { type: 'button', 'aria-label': t('common.next') },
          on: {
            click: () => {
              const next = new Date(Date.UTC(year, month, 1));
              anchorMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
              selectedDay = `${anchorMonth}-01`;
              ctx.refresh();
            },
          },
        },
        forwardIcon,
      ),
      el(
        'button',
        {
          class: 'btn sm ghost',
          attrs: { type: 'button' },
          on: {
            click: () => {
              anchorMonth = todayKey.slice(0, 7);
              selectedDay = todayKey;
              ctx.refresh();
            },
          },
        },
        t('common.today'),
      ),
    ),
  );

  const grid = el('div', {
    class: 'cal-grid',
    attrs: { role: 'group', 'aria-label': `${title} — ${t('calendar.selectDay')}` },
  });
  for (const label of t('calendar.weekdays').split(',')) {
    grid.appendChild(el('span', { class: 'cal-dow', text: label }));
  }
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(el('span', { class: 'cal-cell empty', attrs: { 'aria-hidden': 'true' } }));
  }
  monthTimes.forEach((day, index) => {
    const key = addDaysToKey(firstKey, index);
    const dayNumber = index + 1;
    const isToday = key === todayKey;
    const isSelected = key === selectedDay;
    const parsed = parseDateKey(key);
    const noon = zonedTimeToInstant(parsed.year, parsed.month, parsed.day, 12, 0, loc.timeZone);
    const fullLabel = fmtDateFull(noon, loc.timeZone, ctx.intl);
    const cell = el(
      'button',
      {
        class: `cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`,
        attrs: {
          type: 'button',
          'aria-pressed': String(isSelected),
          ...(isToday ? { 'aria-current': 'date' } : {}),
          'aria-label': `${fullLabel}${day.fajr ? ` · ${t('prayer.fajr')} ${fmtTime(day.fajr, loc.timeZone, ctx.intl)}` : ''}`,
        },
        on: {
          click: () => {
            selectedDay = key;
            ctx.refresh();
          },
        },
      },
      el('span', { text: String(dayNumber) }),
      el('span', { class: 'fajr-mini', text: day.fajr ? fmtTime(day.fajr, loc.timeZone, ctx.intl) : '—' }),
    );
    grid.appendChild(cell);
  });
  monthCard.append(grid);

  // ---------------------------------------------------------------- selected day
  const detail = el('div', { class: 'card' });
  const dayTimes = monthTimes.find((d) => d.date === selectedDay);
  const sel = selectedDay ? parseDateKey(selectedDay) : null;
  const selInstant = sel ? zonedTimeToInstant(sel.year, sel.month, sel.day, 12, 0, loc.timeZone) : now;
  const hijri = settings.showHijri ? hijriDate(selInstant, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0) : null;

  detail.append(
    el(
      'div',
      { class: 'card-head' },
      el(
        'div',
        {},
        el('h2', { text: fmtDateFull(selInstant, loc.timeZone, ctx.intl) }),
        hijri ? el('div', { class: 'tiny muted', text: `${t('home.hijri')} · ${hijri.formatted}` }) : null,
      ),
      el('span', { class: 'chip', text: method.key }),
    ),
  );

  if (dayTimes) {
    const table = el('table', { class: 'times' });
    const thead = el('thead');
    thead.appendChild(
      el(
        'tr',
        {},
        el('th', { text: t('calendar.prayer') }),
        el('th', { text: t('calendar.time') }),
      ),
    );
    const tbody = el('tbody');
    for (const field of CAL_FIELDS) {
      const at = dayTimes[field];
      const isSunrise = field === 'sunrise';
      tbody.appendChild(
        el(
          'tr',
          { class: isSunrise ? 'is-sunrise' : undefined },
          el(
            'td',
            {},
            t(`prayer.${field}` as MessageKey),
            isSunrise ? el('span', { class: 'tiny muted', text: ` · ${t('prayer.sunriseNote')}` }) : null,
          ),
          el('td', { class: 'num', text: at ? fmtTime(at, loc.timeZone, ctx.intl) : '—' }),
        ),
      );
    }
    table.append(thead, tbody);
    detail.append(el('div', { class: 'table-wrap' }, table));

    const imsakTime = calculateImsak(dayTimes.fajr, settings.imsakOffsetMinutes ?? 10);
    const rec = getFastingRecommendation(hijri, selInstant);
    const fastingStrip = el(
      'div',
      { class: 'status-strip', attrs: { style: 'margin-block-start: var(--space-3);' } },
      icon('moon', 16),
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: `${t('fasting.imsak')} : ` }),
        imsakTime ? fmtTime(imsakTime, loc.timeZone, ctx.intl) : '—',
        el('strong', { text: ` · ${t('fasting.iftar')} : ` }),
        dayTimes.maghrib ? fmtTime(dayTimes.maghrib, loc.timeZone, ctx.intl) : '—',
      ),
      rec.isRecommended
        ? el('span', { class: 'chip' }, t(rec.reasonKey as MessageKey))
        : null,
    );
    detail.append(fastingStrip);

    if (dayTimes.highLatitudeFallback === 'applied') {
      detail.append(el('p', { class: 'tiny muted', text: t('home.highLatApplied') }));
    } else if (dayTimes.highLatitudeFallback === 'unresolvable') {
      detail.append(alertBox('warn', t('home.unresolvable'), t('methods.highLatDesc')));
    }
  } else {
    detail.append(
      emptyState({
        art: 'calendar',
        title: t('calendar.noTimes'),
        body: t('calendar.offline'),
      }),
    );
  }

  // ---------------------------------------------------------------- context
  const placeLabel = loc.cityName
    ? `${loc.cityName} — ${countryName(loc.countryCode, ctx.intl)}`
    : countryName(loc.countryCode, ctx.intl) || t('loc.current');

  const contextCard = el(
    'div',
    { class: 'status-strip' },
    icon('pin', 18),
    el(
      'span',
      { class: 'grow' },
      el('strong', { text: placeLabel }),
      el('span', { class: 'tiny muted', text: ` ${loc.timeZone} · ${method.name[ctx.locale]}` }),
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
  );

  // ---------------------------------------------------------------- export sheet
  const openExportSheet = (): void => {
    ctx.sheet(t('calendar.exportTitle'), (close) => {
      const container = el('div', { class: 'stack' });

      // Description
      container.append(
        el('p', { class: 'small muted', text: `${title} — ${placeLabel}` }),
        el('p', { class: 'tiny muted', text: method.name[ctx.locale] }),
      );

      // Buttons
      const printBtn = el(
        'button',
        {
          class: 'btn primary block',
          attrs: { type: 'button' },
          on: {
            click: () => {
              window.print();
            },
          },
        },
        icon('printer', 18),
        t('calendar.print'),
      );

      const csvBtn = el(
        'button',
        {
          class: 'btn ghost block',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const headers = [
                t('calendar.day'),
                t('calendar.hijri'),
                t('calendar.imsak'),
                t('prayer.fajr'),
                t('prayer.sunrise'),
                t('prayer.dhuhr'),
                t('prayer.asr'),
                t('prayer.maghrib'),
                t('prayer.isha'),
              ];
              const rows: string[] = [headers.join(',')];

              for (let d = 1; d <= daysInMonth; d++) {
                const dayKey = `${anchor}-${String(d).padStart(2, '0')}`;
                const dt = monthTimes[d - 1];
                const dInstant = zonedTimeToInstant(year, month, d, 12, 0, loc.timeZone);
                const hijri = hijriDate(dInstant, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0);
                const imsak = dt?.fajr ? calculateImsak(dt.fajr, settings.imsakOffsetMinutes ?? 10) : null;

                const hijriLabel = hijri ? `"${hijri.formatted}"` : '—';

                const row = [
                  dayKey,
                  hijriLabel,
                  imsak ? fmtTime(imsak, loc.timeZone, ctx.intl) : '—',
                  dt?.fajr ? fmtTime(dt.fajr, loc.timeZone, ctx.intl) : '—',
                  dt?.sunrise ? fmtTime(dt.sunrise, loc.timeZone, ctx.intl) : '—',
                  dt?.dhuhr ? fmtTime(dt.dhuhr, loc.timeZone, ctx.intl) : '—',
                  dt?.asr ? fmtTime(dt.asr, loc.timeZone, ctx.intl) : '—',
                  dt?.maghrib ? fmtTime(dt.maghrib, loc.timeZone, ctx.intl) : '—',
                  dt?.isha ? fmtTime(dt.isha, loc.timeZone, ctx.intl) : '—',
                ];
                rows.push(row.join(','));
              }

              const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `horaires_${anchor}_${loc.cityName || 'azan'}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              ctx.toast(t('common.done'));
            },
          },
        },
        icon('download', 18),
        t('calendar.csv'),
      );

      const copyBtn = el(
        'button',
        {
          class: 'btn ghost block',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              let text = `${title} — ${placeLabel}\n${method.name[ctx.locale]}\n\n`;
              text += `Date\tImsak\tFajr\tChourouk\tDhuhr\tAsr\tMaghrib\tIsha\n`;
              for (let d = 1; d <= daysInMonth; d++) {
                const dayKey = `${anchor}-${String(d).padStart(2, '0')}`;
                const dt = monthTimes[d - 1];
                const imsak = dt?.fajr ? calculateImsak(dt.fajr, settings.imsakOffsetMinutes ?? 10) : null;
                text += `${dayKey}\t${imsak ? fmtTime(imsak, loc.timeZone, ctx.intl) : '—'}\t${dt?.fajr ? fmtTime(dt.fajr, loc.timeZone, ctx.intl) : '—'}\t${dt?.sunrise ? fmtTime(dt.sunrise, loc.timeZone, ctx.intl) : '—'}\t${dt?.dhuhr ? fmtTime(dt.dhuhr, loc.timeZone, ctx.intl) : '—'}\t${dt?.asr ? fmtTime(dt.asr, loc.timeZone, ctx.intl) : '—'}\t${dt?.maghrib ? fmtTime(dt.maghrib, loc.timeZone, ctx.intl) : '—'}\t${dt?.isha ? fmtTime(dt.isha, loc.timeZone, ctx.intl) : '—'}\n`;
              }
              if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                ctx.toast(t('common.copied'));
              }
            },
          },
        },
        icon('copy', 18),
        t('calendar.copyTable'),
      );

      container.append(
        el('div', { class: 'stack xs' }, printBtn, csvBtn, copyBtn),
        el(
          'button',
          { class: 'btn ghost block', attrs: { type: 'button' }, on: { click: close } },
          t('common.close'),
        ),
      );

      return container;
    });
  };

  const exportBtn = el(
    'button',
    {
      class: 'btn ghost sm block',
      attrs: { type: 'button' },
      on: { click: openExportSheet },
    },
    icon('share', 16),
    t('calendar.exportTitle'),
  );

  root.append(
    header,
    monthCard,
    detail,
    exportBtn,
    contextCard,
    el('p', { class: 'tiny muted center', text: t('calendar.offline') }),
  );
  return root;
}
