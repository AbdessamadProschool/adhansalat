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

  const method = getMethod(settings.calculation.methodId);

  let currentAnchor = anchorMonth;
  let currentTitle = '';
  let currentMonthTimes: ReturnType<typeof computeWindow> = [];
  let currentDaysInMonth = 0;
  let currentYear = 0;
  let currentMonthNum = 0;

  const header = el(
    'div',
    {},
    el('h1', { text: t('calendar.title') }),
    el('p', { class: 'small muted', text: t('calendar.subtitle') }),
  );

  const monthCard = el('div', { class: 'card' });
  const detail = el('div', { class: 'card tab-glider' });

  function paintDetail(targetDay: string, currentTimes: ReturnType<typeof computeWindow>): void {
    const dayTimes = currentTimes.find((d) => d.date === targetDay);
    const sel = parseDateKey(targetDay);
    const selInstant = zonedTimeToInstant(sel.year, sel.month, sel.day, 12, 0, loc!.timeZone);
    const hijri = settings.showHijri ? hijriDate(selInstant, loc!.timeZone, ctx.intl, settings.hijriAdjustment ?? 0) : null;

    const nodes: HTMLElement[] = [];
    nodes.push(
      el(
        'div',
        { class: 'card-head' },
        el(
          'div',
          {},
          el('h2', { text: fmtDateFull(selInstant, loc!.timeZone, ctx.intl) }),
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
              icon(field === 'sunrise' ? 'sunrise' : field, 14),
              ` ${t(`prayer.${field}` as MessageKey)}`,
              isSunrise ? el('span', { class: 'tiny muted', text: ` · ${t('prayer.sunriseNote')}` }) : null,
            ),
            el('td', { class: 'num', text: at ? fmtTime(at, loc!.timeZone, ctx.intl) : '—' }),
          ),
        );
      }
      table.append(thead, tbody);
      nodes.push(el('div', { class: 'table-wrap' }, table));

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
          imsakTime ? fmtTime(imsakTime, loc!.timeZone, ctx.intl) : '—',
          el('strong', { text: ` · ${t('fasting.iftar')} : ` }),
          dayTimes.maghrib ? fmtTime(dayTimes.maghrib, loc!.timeZone, ctx.intl) : '—',
        ),
        rec.isRecommended
          ? el('span', { class: 'chip row align-center gap-xs' }, icon('sparkle', 11), el('span', { text: t(rec.reasonKey as MessageKey) }))
          : null,
      );
      nodes.push(fastingStrip);

      if (dayTimes.highLatitudeFallback === 'applied') {
        nodes.push(el('p', { class: 'tiny muted', text: t('home.highLatApplied') }));
      } else if (dayTimes.highLatitudeFallback === 'unresolvable') {
        nodes.push(alertBox('warn', t('home.unresolvable'), t('methods.highLatDesc')));
      }
    } else {
      nodes.push(
        emptyState({
          art: 'calendar',
          title: t('calendar.noTimes'),
          body: t('calendar.offline'),
        }),
      );
    }

    detail.classList.remove('tab-glider');
    void detail.offsetWidth;
    detail.replaceChildren(...nodes);
    detail.classList.add('tab-glider');
  }

  function paintMonth(anchor: string): void {
    currentAnchor = anchor;
    const { year, month } = parseDateKey(`${anchor}-01`);
    currentYear = year;
    currentMonthNum = month;
    currentDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstKey = `${anchor}-01`;
    currentMonthTimes = computeWindow(firstKey, currentDaysInMonth, loc!, settings.calculation);
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    currentTitle = fmtMonth(zonedTimeToInstant(year, month, 1, 12, 0, loc!.timeZone), loc!.timeZone, ctx.intl);

    if (!selectedDay || !selectedDay.startsWith(anchor)) {
      selectedDay = firstKey;
    }

    const backIcon = icon('chevronLeft', 18);
    backIcon.classList.add('icon-directional');
    const forwardIcon = icon('chevron', 18);
    forwardIcon.classList.add('icon-directional');

    const calHead = el(
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
              paintMonth(anchorMonth);
            },
          },
        },
        backIcon,
      ),
      el('div', { class: 'cal-title center', text: currentTitle }),
      el(
        'button',
        {
          class: 'icon-btn',
          attrs: { type: 'button', 'aria-label': t('common.next') },
          on: {
            click: () => {
              const next = new Date(Date.UTC(year, month, 1));
              anchorMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
              paintMonth(anchorMonth);
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
              paintMonth(anchorMonth);
            },
          },
        },
        icon('calendarToday', 13),
        ` ${t('common.today')}`,
      ),
    );

    const grid = el('div', {
      class: 'cal-grid',
      attrs: { role: 'group', 'aria-label': `${currentTitle} — ${t('calendar.selectDay')}` },
    });
    for (const label of t('calendar.weekdays').split(',')) {
      grid.appendChild(el('span', { class: 'cal-dow', text: label }));
    }
    for (let i = 0; i < firstWeekday; i++) {
      grid.appendChild(el('span', { class: 'cal-cell empty', attrs: { 'aria-hidden': 'true' } }));
    }

    const cellElements: Map<string, HTMLButtonElement> = new Map();

    currentMonthTimes.forEach((day, index) => {
      const key = addDaysToKey(firstKey, index);
      const dayNumber = index + 1;
      const isToday = key === todayKey;
      const isSelected = key === selectedDay;
      const parsed = parseDateKey(key);
      const noon = zonedTimeToInstant(parsed.year, parsed.month, parsed.day, 12, 0, loc!.timeZone);
      const fullLabel = fmtDateFull(noon, loc!.timeZone, ctx.intl);
      const cell = el(
        'button',
        {
          class: `cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`,
          attrs: {
            type: 'button',
            'aria-pressed': String(isSelected),
            ...(isToday ? { 'aria-current': 'date' } : {}),
            'aria-label': `${fullLabel}${day.fajr ? ` · ${t('prayer.fajr')} ${fmtTime(day.fajr, loc!.timeZone, ctx.intl)}` : ''}`,
          },
          on: {
            click: () => {
              if (selectedDay === key) return;
              const prevEl = cellElements.get(selectedDay || '');
              if (prevEl) {
                prevEl.classList.remove('selected');
                prevEl.setAttribute('aria-pressed', 'false');
              }
              cell.classList.add('selected');
              cell.setAttribute('aria-pressed', 'true');
              selectedDay = key;
              paintDetail(selectedDay, currentMonthTimes);
            },
          },
        },
        el('span', { text: String(dayNumber) }),
        el('span', { class: 'fajr-mini', text: day.fajr ? fmtTime(day.fajr, loc!.timeZone, ctx.intl) : '—' }),
      ) as HTMLButtonElement;

      cellElements.set(key, cell);
      grid.appendChild(cell);
    });

    monthCard.replaceChildren(calHead, grid);
    paintDetail(selectedDay!, currentMonthTimes);
  }

  paintMonth(anchorMonth);

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
        el('p', { class: 'small muted', text: `${currentTitle} — ${placeLabel}` }),
        el('p', { class: 'tiny muted', text: method.name[ctx.locale] }),
      );

      // Print / PDF Button
      const printBtn = el(
        'button',
        {
          class: 'btn primary block',
          attrs: { type: 'button' },
          on: {
            click: () => {
              close();
              // Remove any old print document
              document.querySelectorAll('.print-document').forEach((e) => e.remove());
              const printDoc = buildPrintDocument(
                ctx,
                currentMonthTimes,
                loc,
                settings,
                currentAnchor,
                currentTitle,
                placeLabel,
                method,
                currentDaysInMonth,
                currentYear,
                currentMonthNum,
              );
              document.body.appendChild(printDoc);

              // Allow DOM render before launching print dialog
              requestAnimationFrame(() => {
                setTimeout(() => {
                  window.print();
                  window.addEventListener(
                    'afterprint',
                    () => {
                      printDoc.remove();
                    },
                    { once: true },
                  );
                  // Safety cleanup
                  setTimeout(() => {
                    if (document.body.contains(printDoc)) {
                      printDoc.remove();
                    }
                  }, 30000);
                }, 150);
              });
            },
          },
        },
        icon('printer', 18),
        t('calendar.print'),
      );

      // Excel / CSV Button
      const excelBtn = el(
        'button',
        {
          class: 'btn ghost block',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const bom = '\uFEFF';
              const sep = 'sep=;\r\n';
              const isRtl = ctx.locale === 'ar';

              const metaTitle = `"${isRtl ? 'أذان صلاة · AdanSalat — إمساكية ومواقيت الصلاة الشهرية' : 'AdanSalat — Calendrier mensuel des prières'}"`;
              const metaPlace = `"${isRtl ? 'المدينة' : 'Lieu'}: ${placeLabel.replace(/"/g, '""')}"`;
              const metaMonth = `"${isRtl ? 'الشهر' : 'Mois'}: ${currentTitle.replace(/"/g, '""')}"`;
              const metaMethod = `"${isRtl ? 'طريقة الحساب' : 'Méthode'}: ${method.name[ctx.locale].replace(/"/g, '""')}"`;
              const metaDua = `"${isRtl ? '« صَدَقَةٌ جَارِيَةٌ • نَسْأَلُكُمُ الدُّعَاءَ »' : '« Aumône continue · Priez pour nous »'}"`;

              const headers = [
                t('calendar.day'),
                t('calendar.gregorian'),
                t('calendar.hijri'),
                t('calendar.imsak'),
                t('prayer.fajr'),
                t('prayer.sunrise'),
                t('prayer.dhuhr'),
                t('prayer.asr'),
                t('prayer.maghrib'),
                t('prayer.isha'),
              ].map((h) => `"${h.replace(/"/g, '""')}"`);

              const lines: string[] = [
                sep.trim(),
                `${metaTitle};;;;;;;;;`,
                `${metaPlace};${metaMonth};${metaMethod};;;;;;;`,
                `${metaDua};;;;;;;;;`,
                '',
                headers.join(';'),
              ];

              const weekdays = t('calendar.weekdays').split(',');

              for (let d = 1; d <= currentDaysInMonth; d++) {
                const dayKey = `${currentAnchor}-${String(d).padStart(2, '0')}`;
                const dt = currentMonthTimes[d - 1];
                const dInstant = zonedTimeToInstant(currentYear, currentMonthNum, d, 12, 0, loc.timeZone);
                const hijri = hijriDate(dInstant, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0);
                const imsak = dt?.fajr ? calculateImsak(dt.fajr, settings.imsakOffsetMinutes ?? 10) : null;
                const weekdayIdx = new Date(Date.UTC(currentYear, currentMonthNum - 1, d)).getUTCDay();
                const weekdayName = weekdays[weekdayIdx] ?? '';
                const hijriLabel = hijri ? `${hijri.day} ${hijri.monthName} ${hijri.year}` : '—';

                const row = [
                  `"${weekdayName}"`,
                  `"${dayKey}"`,
                  `"${hijriLabel.replace(/"/g, '""')}"`,
                  `"${imsak ? fmtTime(imsak, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.fajr ? fmtTime(dt.fajr, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.sunrise ? fmtTime(dt.sunrise, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.dhuhr ? fmtTime(dt.dhuhr, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.asr ? fmtTime(dt.asr, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.maghrib ? fmtTime(dt.maghrib, loc.timeZone, ctx.intl) : '—'}"`,
                  `"${dt?.isha ? fmtTime(dt.isha, loc.timeZone, ctx.intl) : '—'}"`,
                ];
                lines.push(row.join(';'));
              }

              const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `horaires_${currentAnchor}_${(loc.cityName || 'azan').replace(/\s+/g, '_')}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              ctx.toast(t('common.done'));
            },
          },
        },
        icon('download', 18),
        t('calendar.excel'),
      );

      const copyBtn = el(
        'button',
        {
          class: 'btn ghost block',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              let text = `${currentTitle} — ${placeLabel}\n${method.name[ctx.locale]}\n\n`;
              text += `Date\tImsak\tFajr\tChourouk\tDhuhr\tAsr\tMaghrib\tIsha\n`;
              for (let d = 1; d <= currentDaysInMonth; d++) {
                const dayKey = `${currentAnchor}-${String(d).padStart(2, '0')}`;
                const dt = currentMonthTimes[d - 1];
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
        el('div', { class: 'stack xs' }, printBtn, excelBtn, copyBtn),
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

function buildPrintDocument(
  ctx: AppContext,
  monthTimes: ReturnType<typeof computeWindow>,
  loc: NonNullable<ReturnType<typeof ctx.store.get>['location']>,
  settings: ReturnType<typeof ctx.store.get>,
  anchor: string,
  title: string,
  placeLabel: string,
  method: ReturnType<typeof getMethod>,
  daysInMonth: number,
  year: number,
  month: number,
): HTMLElement {
  const t = ctx.t;
  const isRtl = ctx.locale === 'ar';
  const doc = el('div', { class: 'print-document', attrs: { dir: isRtl ? 'rtl' : 'ltr' } });

  // Spiritual watermark in the background
  const watermark = el('div', { class: 'print-watermark', attrs: { 'aria-hidden': 'true' } });
  watermark.appendChild(el('span', { text: t('calendar.watermark') }));
  doc.appendChild(watermark);

  // Header with app emblem
  const header = el('header', { class: 'print-header' });
  const brand = el('div', { class: 'print-brand' });

  const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  logo.setAttribute('class', 'print-logo');
  logo.setAttribute('viewBox', '0 0 240 160');
  logo.setAttribute('fill', 'none');
  logo.setAttribute('aria-hidden', 'true');
  logo.innerHTML =
    '<path d="M116 34a42 42 0 1 0 44 58 34 34 0 0 1-44-58z" stroke="#047857" stroke-width="7" stroke-linejoin="round"/>' +
    '<path d="m174 42 2.4 5.6 5.9.5-4.4 4 1.3 5.9-5.2-3.1-5.2 3.1 1.3-5.9-4.4-4 5.9-.5z" fill="#b45309"/>' +
    '<path d="M30 132h180M62 132v-16M96 132v-8M130 132v-22M164 132v-12M198 132v-20" stroke="#047857" stroke-width="4.5" stroke-linecap="round" opacity=".6"/>';

  const brandText = el(
    'div',
    {},
    el('h1', { class: 'print-title', text: 'أَذَان صَلَاة · AdanSalat' }),
    el('p', { class: 'print-subtitle', text: t('calendar.printSubtitle') }),
    el('div', {
      class: 'print-dedication',
      text: '« صَدَقَةٌ جَارِيَةٌ لِوَجْهِ اللَّهِ تَعَالَى • لَا تَنْسَوْنَا مِنْ صَالِحِ دُعَائِكُمْ »',
    }),
  );
  brand.append(logo, brandText);

  // Mid-month Hijri representation
  const midInstant = zonedTimeToInstant(year, month, 15, 12, 0, loc.timeZone);
  const midHijri = settings.showHijri
    ? hijriDate(midInstant, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0)
    : null;
  const hijriMonthLabel = midHijri ? `${midHijri.monthName} ${midHijri.year} هـ` : '';

  const metaGrid = el('div', { class: 'print-meta-grid' });
  const cityItem = el('div', { class: 'print-meta-item' });
  cityItem.append(el('strong', { text: `${isRtl ? 'الموقع' : 'Lieu'}: ` }), el('span', { text: placeLabel }));

  const monthItem = el('div', { class: 'print-meta-item' });
  monthItem.append(
    el('strong', { text: `${isRtl ? 'الشهر' : 'Mois'}: ` }),
    el('span', { text: hijriMonthLabel ? `${title} · ${hijriMonthLabel}` : title }),
  );

  const methodItem = el('div', { class: 'print-meta-item print-meta-wide' });
  methodItem.append(
    el('strong', { text: `${isRtl ? 'طريقة الحساب' : 'Méthode'}: ` }),
    el('span', { text: `${method.name[ctx.locale]} (${loc.timeZone})` }),
  );

  metaGrid.append(cityItem, monthItem, methodItem);
  header.append(brand, metaGrid);
  doc.appendChild(header);

  // Table
  const table = el('table', { class: 'print-table' });
  const thead = el('thead');
  const trHead = el('tr');
  const cols = [
    t('calendar.day'),
    t('calendar.gregorian'),
    t('calendar.hijri'),
    t('calendar.imsak'),
    t('prayer.fajr'),
    t('prayer.sunrise'),
    t('prayer.dhuhr'),
    t('prayer.asr'),
    t('prayer.maghrib'),
    t('prayer.isha'),
  ];
  for (const col of cols) {
    trHead.appendChild(el('th', { text: col }));
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = el('tbody');
  const weekdays = t('calendar.weekdays').split(',');

  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${anchor}-${String(d).padStart(2, '0')}`;
    const dt = monthTimes[d - 1];
    const dInstant = zonedTimeToInstant(year, month, d, 12, 0, loc.timeZone);
    const h = settings.showHijri
      ? hijriDate(dInstant, loc.timeZone, ctx.intl, settings.hijriAdjustment ?? 0)
      : null;
    const imsak = dt?.fajr ? calculateImsak(dt.fajr, settings.imsakOffsetMinutes ?? 10) : null;
    const weekdayIdx = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const weekdayName = weekdays[weekdayIdx] ?? '';
    const isFriday = weekdayIdx === 5;

    const tr = el('tr', { class: isFriday ? 'print-row-friday' : undefined });
    tr.append(
      el('td', { class: 'print-cell-day', text: `${weekdayName} ${d}` }),
      el('td', { text: dayKey }),
      el('td', { text: h ? `${h.day} ${h.monthName}` : '—' }),
      el('td', { class: 'print-cell-imsak', text: imsak ? fmtTime(imsak, loc.timeZone, ctx.intl) : '—' }),
      el('td', { class: 'print-cell-prayer', text: dt?.fajr ? fmtTime(dt.fajr, loc.timeZone, ctx.intl) : '—' }),
      el('td', { text: dt?.sunrise ? fmtTime(dt.sunrise, loc.timeZone, ctx.intl) : '—' }),
      el('td', { class: 'print-cell-prayer', text: dt?.dhuhr ? fmtTime(dt.dhuhr, loc.timeZone, ctx.intl) : '—' }),
      el('td', { class: 'print-cell-prayer', text: dt?.asr ? fmtTime(dt.asr, loc.timeZone, ctx.intl) : '—' }),
      el('td', { class: 'print-cell-maghrib', text: dt?.maghrib ? fmtTime(dt.maghrib, loc.timeZone, ctx.intl) : '—' }),
      el('td', { class: 'print-cell-prayer', text: dt?.isha ? fmtTime(dt.isha, loc.timeZone, ctx.intl) : '—' }),
    );
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  doc.appendChild(table);

  // Footer
  const footer = el('footer', { class: 'print-footer' });
  const fLeft = el('div', { class: 'print-footer-left' });
  fLeft.append(
    el('span', { text: 'تطبيق أذان صلاة · AdanSalat (100% مجاني بدون إعلانات)' }),
    el('span', { class: 'print-footer-dot', text: '•' }),
    el('span', { text: 'صدقة جارية · نسألكم الدعاء' }),
  );
  const fRight = el('div', { class: 'print-footer-right' });
  fRight.append(el('span', { text: 'adhansalat.vercel.app' }));
  footer.append(fLeft, fRight);
  doc.appendChild(footer);

  return doc;
}
