/**
 * Alarm diagnostics.
 *
 * The point of this screen is to be unable to show a green tick that is not
 * earned. Every row states what is known, by what mechanism, and what remains
 * unverifiable. "The web page cannot prove a system alarm exists" is written on
 * the screen instead of being hidden.
 */

import { getMethod } from '../../core/methods.js';
import { TZDATA_END, TZDATA_SOURCE, TZDATA_START } from '../../core/tzdata.js';
import { dateKeyInTimeZone, offsetLabel, osOffsetMinutesAt } from '../../core/timezone.js';
import type { AppContext } from '../context.js';
import type { MessageKey } from '../i18n.js';
import type { SelfTestResult } from '../alarm-engine.js';
import { alarmStateLabel, alarmTone } from '../labels.js';
import { nativeBridge, requestNotificationPermission } from '../notifications.js';
import { alertBox, el, fmtTime, icon, pill, toast } from '../ui.js';

let lastSelfTest: SelfTestResult | null = null;

function toneGlyph(tone: 'ok' | 'warn' | 'bad' | 'muted'): string {
  return tone === 'ok' ? 'checkCircle' : tone === 'muted' ? 'info' : 'alert';
}

function checkRow(
  what: string,
  detail: string,
  action: HTMLElement | null,
  tone: 'ok' | 'warn' | 'bad' | 'muted',
  label: string,
): HTMLElement {
  return el(
    'div',
    { class: 'diag-row' },
    el('div', { class: 'what' }, el('strong', { text: what }), el('span', { text: detail })),
    el('div', { class: 'diag-actions' }, action, pill(label, tone, toneGlyph(tone))),
  );
}

export function diagnosticsScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const loc = settings.location;
  const snapshot = ctx.engine.snapshot();
  const bridge = nativeBridge();
  const method = getMethod(settings.calculation.methodId);
  const root = el('div', { class: 'screen' });

  root.append(
    el(
      'div',
      {},
      el('h1', { text: t('diag.title') }),
      el('p', { class: 'small muted', text: t('diag.subtitle') }),
    ),
  );

  // ---------------------------------------------------------------- overall
  const perm = snapshot.notifications;
  const concerns: string[] = [];
  if (!loc) concerns.push(t('diag.tz'));
  if (perm !== 'granted') concerns.push(t('diag.notifications'));
  if (snapshot.mode !== 'native') concerns.push(t('diag.background'));

  root.append(
    el(
      'div',
      { class: 'status-strip' },
      icon(concerns.length === 0 ? 'shield' : 'alert', 18),
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: t('diag.overall') }),
        el('span', {
          class: 'tiny muted',
          text: concerns.length === 0 ? t('diag.overallOk') : `${t('diag.overallWarn')} (${concerns.join(' · ')})`,
        }),
      ),
      pill(
        concerns.length === 0 ? t('diag.checkOk') : t('diag.permissionNeeded'),
        concerns.length === 0 ? 'ok' : 'warn',
        concerns.length === 0 ? 'check' : 'alert',
      ),
    ),
  );

  // ---------------------------------------------------------------- delivery mode
  root.append(
    snapshot.mode === 'native'
      ? alertBox('info', t('diag.nativeAvailable'), `AlarmManager · ${bridge?.platform?.() ?? 'android'}`)
      : alertBox('warn', t('diag.background'), t('diag.webLimit')),
  );

  // ---------------------------------------------------------------- permissions
  const notifCard = el('div', { class: 'card' });
  notifCard.append(el('div', { class: 'card-head' }, el('h2', { text: t('diag.notifications') })));

  notifCard.append(
    checkRow(
      t('diag.notifications'),
      perm === 'granted'
        ? t('settings.notifGranted')
        : perm === 'denied'
          ? t('settings.notifDenied')
          : perm === 'unsupported'
            ? t('error.notif')
            : t('diag.notifNotAsked'),
      perm === 'default'
        ? el(
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
          )
        : null,
      perm === 'granted' ? 'ok' : perm === 'denied' ? 'bad' : 'warn',
      perm === 'granted' ? t('diag.checkOk') : t('diag.permissionNeeded'),
    ),
  );

  // Exact alarms: only a native bridge can answer this.
  if (bridge?.canScheduleExactAlarms) {
    let canExact = false;
    try {
      canExact = bridge.canScheduleExactAlarms();
    } catch {
      canExact = false;
    }
    notifCard.append(
      checkRow(
        t('diag.exactAlarm'),
        t('diag.exactAlarmDesc'),
        !canExact && bridge.requestExactAlarmPermission
          ? el(
              'button',
              {
                class: 'btn sm',
                attrs: { type: 'button' },
                on: { click: () => bridge.requestExactAlarmPermission?.() },
              },
              t('diag.openSettings'),
            )
          : null,
        canExact ? 'ok' : 'warn',
        canExact ? t('diag.checkOk') : t('diag.permissionNeeded'),
      ),
    );
  } else {
    notifCard.append(
      checkRow(t('diag.exactAlarm'), t('diag.exactWeb'), null, 'muted', t('common.unknown')),
    );
  }

  notifCard.append(
    checkRow(
      t('diag.background'),
      snapshot.mode === 'native' ? 'AlarmManager / BroadcastReceiver' : t('diag.timerDetail'),
      null,
      snapshot.mode === 'native' ? 'ok' : 'muted',
      snapshot.mode === 'native' ? t('diag.checkOk') : t('alarm.foreground'),
    ),
  );

  // A real native screen exists in the Android build (permissions, armed alarms,
  // test alarm). Linking to it is more useful than describing it in the web UI.
  if (bridge?.openNativeDiagnostics) {
    notifCard.append(
      checkRow(
        t('diag.nativeScreen'),
        t('diag.nativeScreenDesc'),
        el(
          'button',
          {
            class: 'btn sm',
            attrs: { type: 'button' },
            on: { click: () => bridge.openNativeDiagnostics?.() },
          },
          t('diag.open'),
        ),
        'muted',
        t('diag.checkOk'),
      ),
    );
  }

  // ---------------------------------------------------------------- engine facts
  const tzRows: HTMLElement[] = [
    checkRow(
      t('diag.tz'),
      loc ? `${loc.timeZone} · ${offsetLabel(loc.timeZone)}` : '—',
      null,
      loc ? 'ok' : 'warn',
      loc ? t('diag.checkOk') : t('diag.permissionNeeded'),
    ),
  ];

  if (loc) {
    // The host can carry stale rules (Windows still applies the pre-2018 Morocco
    // rule). We use the bundled table; this row is where the disagreement is
    // made visible instead of silently producing a minute that is an hour off.
    const now = new Date();
    const later = new Date(now.getTime() + 182 * 86_400_000);
    const bundledNow = offsetLabel(loc.timeZone, now);
    const bundledLater = offsetLabel(loc.timeZone, later);
    const osNow = osOffsetMinutesAt(now, loc.timeZone);
    const osLater = osOffsetMinutesAt(later, loc.timeZone);
    const osLabel = (minutes: number | null) => {
      if (minutes === null) return '—';
      const sign = minutes < 0 ? '-' : '+';
      const abs = Math.abs(minutes);
      return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    };
    const disagree = osNow !== null && (osLabel(osNow) !== bundledNow || osLabel(osLater) !== bundledLater);
    const coverage = `${new Date(TZDATA_START).toISOString().slice(0, 10)} → ${new Date(TZDATA_END).toISOString().slice(0, 10)}`;
    tzRows.push(
      checkRow(
        t('diag.tzdata'),
        disagree ? `OS ${osLabel(osNow)} → table ${bundledNow}` : `${TZDATA_SOURCE} · ${bundledNow}`,
        null,
        disagree ? 'warn' : 'ok',
        disagree ? t('diag.tzdataMismatch') : t('diag.tzdataOk'),
      ),
      checkRow(t('diag.tzdataRange'), coverage, null, 'muted', t('diag.checkOk')),
    );
  }

  notifCard.append(
    checkRow(t('diag.engine'), 'local · TypeScript', null, 'ok', t('diag.checkOk')),
    checkRow(
      t('diag.method'),
      `${method.name[ctx.locale]} (${method.key}, id ${method.id})`,
      null,
      'muted',
      method.experimental ? t('methods.experimental') : t('diag.checkOk'),
    ),
    ...tzRows,
    checkRow(t('diag.highLat'), settings.calculation.highLatitudeRule, null, 'muted', t('diag.checkOk')),
  );

  // ---------------------------------------------------------------- next alarms
  const alarmsCard = el('div', { class: 'card' });
  alarmsCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('diag.nextAlarms') }),
      el('span', {
        class: 'hint',
        text: `${t('diag.window')} ${snapshot.windowDays} ${t('diag.days')}`,
      }),
    ),
  );

  // Only what is still ahead belongs under "next alarms". Past rows would either
  // be "missed" (already closed) or "calculated" (which reads like a promise),
  // and a diagnostics card must not blur the two.
  const nowMs = Date.now();
  const upcoming = snapshot.alarms.filter((a) => Date.parse(a.atIso) >= nowMs - 120_000).slice(0, 10);

  if (!loc || upcoming.length === 0) {
    alarmsCard.append(el('p', { class: 'small muted', text: t('diag.noneScheduled') }));
  } else {
    for (const alarm of upcoming) {
      const at = new Date(alarm.atIso);
      const dayKey = dateKeyInTimeZone(at, loc.timeZone);
      alarmsCard.append(
        el(
          'div',
          { class: 'diag-row' },
          el(
            'div',
            { class: 'what' },
            el('strong', {
              text: `${t(`prayer.${alarm.prayer}` as MessageKey)}${alarm.kind === 'pre-reminder' ? ` · ${t('adhan.preReminder')}` : ''}`,
            }),
            el('span', { text: `${dayKey} · ${fmtTime(at, loc.timeZone, ctx.intl)}` }),
          ),
          pill(alarmStateLabel(t, alarm.state), alarmTone(alarm.state), alarmTone(alarm.state) === 'ok' ? 'check' : 'clock'),
        ),
      );
    }
  }
  alarmsCard.append(el('p', { class: 'tiny muted', attrs: { style: 'margin-top:8px' }, text: t('diag.alarmNote') }));

  // ---------------------------------------------------------------- last events
  const lastCard = el('div', { class: 'card' });
  lastCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('diag.lastSchedule') })),
    el(
      'div',
      { class: 'row' },
      el('span', { class: 'grow' }, el('strong', { text: t('diag.lastSchedule') }), el('span', { text: snapshot.plannedAtIso ?? '—' })),
    ),
    el(
      'div',
      { class: 'row' },
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: t('diag.lastFire') }),
        el('span', {
          text: snapshot.lastFire
            ? `${snapshot.lastFire.eventKey} · ${snapshot.lastFire.outcome}${snapshot.lastFire.detail ? ` · ${snapshot.lastFire.detail}` : ''}`
            : t('common.none'),
        }),
      ),
    ),
    el(
      'div',
      { class: 'row' },
      el(
        'span',
        { class: 'grow' },
        el('strong', { text: t('diag.lastRecalc') }),
        el('span', { text: snapshot.plannedAtIso ? new Date(snapshot.plannedAtIso).toLocaleString(ctx.intl) : '—' }),
      ),
    ),
  );

  // What the OS actually did with the last plan. Only the native side knows;
  // outside the Android wrapper this row explains itself that way.
  const nativeSync = bridge?.lastSyncResult?.();
  if (nativeSync !== undefined && nativeSync !== null) {
    let syncRow: { text: string; tone: 'ok' | 'warn' | 'bad' } | null = null;
    try {
      const o = JSON.parse(nativeSync) as {
        armed?: number;
        skipped?: number;
        deferred?: boolean;
        reason?: string;
      };
      syncRow = o.deferred
        ? { text: t('diag.nativeDeferred', { reason: o.reason ?? '—' }), tone: 'warn' }
        : { text: `armed ${o.armed ?? 0} · skipped ${o.skipped ?? 0}`, tone: 'ok' };
    } catch {
      syncRow = { text: String(nativeSync).slice(0, 120), tone: 'warn' };
    }
    lastCard.append(
      el(
        'div',
        { class: 'row' },
        el('span', { class: 'grow' }, el('strong', { text: t('diag.nativeSync') }), el('span', { text: syncRow.text })),
        pill(
          syncRow.tone === 'ok' ? t('diag.checkOk') : syncRow.tone === 'warn' ? t('diag.permissionNeeded') : t('diag.checkFail'),
          syncRow.tone,
          toneGlyph(syncRow.tone),
        ),
      ),
    );
  } else if (bridge) {
    lastCard.append(checkRow(t('diag.nativeSync'), 'bridge downgrade: no lastSyncResult()', null, 'muted', t('common.unknown')));
  }

  // ---------------------------------------------------------------- self test
  const testCard = el('div', { class: 'card' });
  testCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('diag.selfTest') }),
      el(
        'button',
        {
          class: 'btn sm primary',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              lastSelfTest = await ctx.engine.selfTest();
              toast(lastSelfTest.ok ? t('diag.selfTestOk') : t('diag.selfTestFail'));
              ctx.refresh();
            },
          },
        },
        icon('shield', 16),
        t('common.test'),
      ),
    ),
  );

  if (lastSelfTest) {
    testCard.append(
      alertBox(lastSelfTest.ok ? 'info' : 'bad', lastSelfTest.ok ? t('diag.selfTestOk') : t('diag.selfTestFail'), ''),
    );
    for (const check of lastSelfTest.checks) {
      testCard.append(
        el(
          'div',
          { class: 'diag-row' },
          el('div', { class: 'what' }, el('strong', { text: check.id }), el('span', { text: check.detail })),
          pill(check.ok ? t('diag.checkOk') : t('diag.checkFail'), check.ok ? 'ok' : 'bad', check.ok ? 'check' : 'alert'),
        ),
      );
    }
  } else {
    testCard.append(el('p', { class: 'tiny muted', text: t('diag.checks') }));
  }

  // ---------------------------------------------------------------- log
  const logCard = el('div', { class: 'card' });
  const entries = [...settings.log].reverse().slice(0, 40);
  const logText =
    entries.length === 0
      ? ''
      : entries
          .map((entry) => `${entry.at.slice(11, 19)} [${entry.level}] ${entry.event}${entry.detail ? ` — ${entry.detail}` : ''}`)
          .join('\n');
  const logBox = el('div', { class: 'log', attrs: { role: 'log', 'aria-live': 'off' } });
  logBox.textContent = logText || t('diag.logEmpty');
  logCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('diag.log') }),
      el(
        'button',
        {
          class: 'btn sm ghost',
          attrs: { type: 'button' },
          on: {
            click: () => {
              ctx.store.clearLog();
              ctx.refresh();
            },
          },
        },
        t('diag.clearLog'),
      ),
    ),
    logBox,
  );

  if (logText) {
    logCard.append(
      el(
        'div',
        { class: 'log-toolbar' },
        el(
          'button',
          {
            class: 'btn sm',
            attrs: { type: 'button' },
            on: {
              click: async () => {
                try {
                  await navigator.clipboard.writeText(logText);
                  toast(t('common.copied'));
                } catch {
                  toast(t('diag.logEmpty'));
                }
              },
            },
          },
          icon('copy', 16),
          t('diag.copyLog'),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- actions
  const actions = el(
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
      icon('check', 16),
      t('diag.check'),
    ),
    bridge?.openNotificationSettings
      ? el(
          'button',
          {
            class: 'btn sm ghost',
            attrs: { type: 'button' },
            on: { click: () => bridge.openNotificationSettings?.() },
          },
          t('diag.openSettings'),
        )
      : null,
    el(
      'button',
      {
        class: 'btn sm ghost',
        attrs: { type: 'button' },
        on: { click: () => ctx.navigate('settings') },
      },
      icon('gear', 16),
      t('nav.settings'),
    ),
  );

  root.append(notifCard, alarmsCard, lastCard, testCard, logCard, actions);
  return root;
}
