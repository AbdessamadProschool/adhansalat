/**
 * Tasbih screen.
 *
 * Two deliberate choices:
 *  - the counter is a single real <button>, so Space/Enter work natively and a
 *    large touch target is the default rather than a special case;
 *  - incrementing updates only the nodes that changed. A full app re-render on
 *    every tap would drop keyboard focus and make the counter unusable with a
 *    screen reader.
 *
 * Vibration is requested from the platform. If the API is missing or refuses,
 * the screen says so; it never fakes a haptic feedback with a CSS animation.
 */

import type { AppContext } from '../context.js';
import type { ActiveSession, Dhikr, SessionTemplate } from '../tasbih.js';
import { tasbihStore } from '../tasbih.js';
import { confirmDialog, el, icon, segmented, switchRow, toast } from '../ui.js';
import { ADHKAR_LIST, type AdhkarCategory, type AdhkarItem } from '../../core/adhkar.js';
import { hijriDate } from '../../core/hijri.js';
import {
  loadKhatmahState,
  saveKhatmahState,
  analyzeKhatmahProgress,
  getMoroccanDailyHizb,
  type KhatmahState,
} from '../../core/khatmah.js';

interface VibratorNavigator {
  vibrate?: (pattern: number | number[]) => boolean;
}

function vibrationApi(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & VibratorNavigator;
  return typeof nav.vibrate === 'function' ? nav.vibrate.bind(nav) : null;
}

function rawDhikrLabel(dhikr: Dhikr | undefined, fallback = '—'): string {
  if (!dhikr) return fallback;
  return dhikr.translit || dhikr.arabic || fallback;
}

function dateLabel(intl: string, at: number): string {
  try {
    return new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  } catch {
    return new Date(at).toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function tasbihScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const store = tasbihStore;
  const root = el('div', { class: 'screen tasbih' });

  /**
   * Name of a dhikr in the current UI language. In Arabic the Arabic script is
   * the name; showing a Latin transliteration there would be a half-translated
   * interface. Everywhere else the transliteration stays, because it is what
   * people type and recognise.
   */
  const dhikrLabel = (dhikr: Dhikr | undefined, fallback = '—'): string =>
    ctx.locale === 'ar' && dhikr?.arabic ? dhikr.arabic : rawDhikrLabel(dhikr, fallback);

  const vibrate = (): void => {
    if (!store.get().vibration) return;
    const api = vibrationApi();
    if (!api) {
      toast(t('tasbih.vibrationUnsupported'));
      return;
    }
    let accepted = false;
    try {
      accepted = api(12);
    } catch {
      accepted = false;
    }
    if (!accepted) toast(t('tasbih.vibrationUnsupported'));
  };

  // ---------------------------------------------------------------- header
  root.append(
    el(
      'header',
      { class: 'stack xs' },
      el('h1', { text: t('tasbih.title') }),
      el('p', { class: 'small muted', text: t('tasbih.subtitle') }),
      el('p', { class: 'tiny muted', text: t('tasbih.noPressure') }),
    ),
  );

  // ---------------------------------------------------------------- panels
  const counterPanel = el('div', { class: 'stack', attrs: { role: 'region', 'aria-label': t('tasbih.counter') } });
  const adhkarPanel = el('div', { class: 'stack', attrs: { role: 'region', 'aria-label': t('adhkar.title') } });
  const khatmahPanel = el('div', { class: 'stack', attrs: { role: 'region', 'aria-label': t('khatmah.title') } });
  const sessionsPanel = el('div', { class: 'stack', attrs: { role: 'region', 'aria-label': t('tasbih.sessions') } });
  const historyPanel = el('div', { class: 'stack', attrs: { role: 'region', 'aria-label': t('tasbih.history') } });
  adhkarPanel.hidden = true;
  khatmahPanel.hidden = true;
  sessionsPanel.hidden = true;
  historyPanel.hidden = true;

  const tabs = segmented<'counter' | 'adhkar' | 'khatmah' | 'sessions' | 'history'>(
    'counter',
    [
      { value: 'counter', label: t('tasbih.counter') },
      { value: 'adhkar', label: t('adhkar.title') },
      { value: 'khatmah', label: t('khatmah.title') },
      { value: 'sessions', label: t('tasbih.sessions') },
      { value: 'history', label: t('tasbih.history') },
    ],
    (value) => {
      counterPanel.hidden = value !== 'counter';
      adhkarPanel.hidden = value !== 'adhkar';
      khatmahPanel.hidden = value !== 'khatmah';
      sessionsPanel.hidden = value !== 'sessions';
      historyPanel.hidden = value !== 'history';
      if (value === 'adhkar') paintAdhkar();
      if (value === 'khatmah') paintKhatmah();
      if (value === 'sessions') paintSessions();
      if (value === 'history') paintHistory();
    },
  );
  root.append(tabs, counterPanel, adhkarPanel, khatmahPanel, sessionsPanel, historyPanel);

  // ---------------------------------------------------------------- counter
  const chips = el('div', { class: 'tasbih-chips', attrs: { role: 'group', 'aria-label': t('tasbih.choose') } });
  const arabicEl = el('p', { class: 'tasbih-arabic', attrs: { lang: 'ar', dir: 'rtl' } });
  const translitEl = el('p', { class: 'tasbih-translit' });
  const translationEl = el('p', { class: 'tasbih-translation' });
  const referenceEl = el('p', { class: 'tiny muted' });
  const favoriteBtn = el('button', {
    class: 'icon-btn',
    attrs: { type: 'button' },
    on: {
      click: () => {
        store.toggleFavorite(store.get().dhikrId);
        paintChips();
        paintCounter();
      },
    },
  });

  const countValue = el('span', { class: 'tasbih-count', attrs: { 'aria-hidden': 'true' } });
  const targetValue = el('span', { class: 'tasbih-target', attrs: { 'aria-hidden': 'true' } });
  const progressFill = el('span', { class: 'tasbih-progress-fill', attrs: { 'aria-hidden': 'true' } });
  const progress = el(
    'span',
    { class: 'tasbih-progress', attrs: { 'aria-hidden': 'true' } },
    progressFill,
  );
  const live = el('p', { class: 'sr-only', attrs: { role: 'status', 'aria-live': 'polite' } });

  const tapButton = el(
    'button',
    {
      class: 'tasbih-tap',
      attrs: { type: 'button' },
      on: {
        click: () => {
          const result = store.increment();
          vibrate();
          if (result.reached) toast(t('tasbih.reached', { count: result.count }));
          paintCounter();
        },
      },
    },
    el('span', { class: 'tasbih-value' }, countValue, targetValue),
    progress,
  );

  const undoBtn = el('button', {
    class: 'btn ghost sm',
    attrs: { type: 'button' },
    on: {
      click: () => {
        if (store.undoLast()) {
          paintCounter();
          paintSessions();
        }
      },
    },
  });
  const resetBtn = el('button', {
    class: 'btn ghost sm',
    attrs: { type: 'button' },
    on: {
      click: async () => {
        const dhikr = store.findDhikr(store.get().dhikrId);
        const ok = await confirmDialog({
          title: t('tasbih.resetTitle'),
          body: t('tasbih.resetBody', { dhikr: dhikrLabel(dhikr) }),
          confirmLabel: t('tasbih.reset'),
          cancelLabel: t('common.cancel'),
          danger: true,
        });
        if (!ok) return;
        store.reset();
        paintCounter();
      },
    },
  });
  const deleteBtn = el('button', {
    class: 'icon-btn danger',
    attrs: { type: 'button', 'aria-label': t('tasbih.customDelete') },
    on: {
      click: async () => {
        const id = store.get().dhikrId;
        const ok = await confirmDialog({
          title: t('tasbih.customDeleteTitle'),
          body: t('tasbih.customDeleteBody'),
          confirmLabel: t('tasbih.delete'),
          cancelLabel: t('common.cancel'),
          danger: true,
        });
        if (!ok) return;
        store.removeCustom(id);
        paintChips();
        paintCounter();
        paintSessions();
        toast(t('tasbih.customDeleted'));
      },
    },
  });

  const goalSlot = el('div', { class: 'tasbih-goal' });
  const vibrationSlot = el('div');

  function paintVibration(): void {
    const api = vibrationApi();
    vibrationSlot.replaceChildren(
      switchRow(
        t('tasbih.vibration'),
        api ? t('tasbih.vibrationOn') : t('tasbih.vibrationUnsupported'),
        api ? store.get().vibration : false,
        (next) => {
          if (!api) {
            toast(t('tasbih.vibrationUnsupported'));
            paintVibration();
            return;
          }
          store.setVibration(next);
          toast(next ? t('tasbih.vibrationOn') : t('tasbih.vibrationOff'));
          if (next) vibrate();
        },
      ),
    );
  }

  counterPanel.append(
    el('div', { class: 'card' }, chips),
    el(
      'div',
      { class: 'card tasbih-stage' },
      el(
        'div',
        { class: 'tasbih-head' },
        el(
          'div',
          { class: 'grow' },
          arabicEl,
          translitEl,
          translationEl,
          referenceEl,
        ),
        el('div', { class: 'tasbih-head-actions' }, favoriteBtn, deleteBtn),
      ),
      tapButton,
      live,
      el('p', { class: 'tiny muted center', text: t('tasbih.tapHint') }),
      el('div', { class: 'btn-row center' }, undoBtn, resetBtn),
    ),
    el(
      'div',
      { class: 'card stack sm' },
      el('h2', { class: 'h3', text: t('tasbih.goal') }),
      goalSlot,
      el(
        'button',
        {
          class: 'btn ghost sm',
          attrs: { type: 'button' },
          on: { click: () => openCustomDhikrSheet() },
        },
        icon('plus', 16),
        t('tasbih.customAdd'),
      ),
    ),
    el('div', { class: 'card stack sm' }, el('h2', { class: 'h3', text: t('tasbih.vibration') }), vibrationSlot),
  );

  let paintedGoalFor = '';
  function paintGoals(): void {
    const id = store.get().dhikrId;
    const goal = store.goalOf(id);
    const value = goal === null ? 'free' : goal === 33 ? '33' : goal === 100 ? '100' : 'custom';
    const choices: Array<{ value: '33' | '100' | 'free'; label: string }> = [
      { value: '33', label: '33' },
      { value: '100', label: '100' },
      { value: 'free', label: t('tasbih.goalFree') },
    ];
    const current: '33' | '100' | 'free' =
      value === 'free' ? 'free' : value === '33' ? '33' : '100';
    goalSlot.replaceChildren(
      segmented(current, choices, (next) => {
        store.setGoal(id, next === 'free' ? null : Number(next));
        paintCounter();
      }),
    );
    if (goal !== null && value === 'custom') {
      goalSlot.appendChild(
        el('p', {
          class: 'tiny muted',
          text: t('tasbih.count', { count: store.countOf(id), target: goal }),
        }),
      );
    }
    paintedGoalFor = id;
  }

  function paintChips(): void {
    const current = store.get().dhikrId;
    const list = store.dhikrList();
    chips.replaceChildren();
    for (const dhikr of list) {
      const isFavorite = store.isFavorite(dhikr.id);
      const button = el(
        'button',
        {
          class: 'chip tasbih-chip',
          attrs: {
            type: 'button',
            'data-dhikr': dhikr.id,
            'aria-pressed': String(dhikr.id === current),
          },
          on: {
            click: () => {
              store.selectDhikr(dhikr.id);
              paintCounter();
            },
          },
        },
        isFavorite ? icon('star', 12) : null,
        dhikrLabel(dhikr),
      );
      chips.appendChild(button);
    }
  }

  function paintCounter(): void {
    const id = store.get().dhikrId;
    const dhikr = store.findDhikr(id);
    const count = store.countOf(id);
    const goal = store.goalOf(id);
    const favorite = store.isFavorite(id);

    arabicEl.textContent = dhikr?.arabic ?? '—';
    translitEl.textContent = dhikr?.translit ?? '';
    translitEl.hidden = !dhikr?.translit;
    const translation = dhikr?.translation
      ? dhikr.translation
      : dhikr?.translationKey
        ? t(dhikr.translationKey)
        : '';
    // In Arabic the built-in "translation" is the dhikr itself: showing it again
    // under the Arabic line would be pure duplication.
    translationEl.textContent =
      ctx.locale === 'ar' && dhikr?.translationKey ? '' : translation;
    translationEl.hidden = translationEl.textContent === '';
    referenceEl.textContent = `${t('tasbih.reference')} : ${dhikr?.reference ?? t('tasbih.noReference')}`;
    referenceEl.hidden = !dhikr;

    countValue.textContent = String(count);
    targetValue.textContent =
      goal === null ? t('tasbih.goalFree') : t('tasbih.ofTarget', { target: goal });
    const ratio = goal && goal > 0 ? Math.min(1, count / goal) : 0;
    progressFill.style.width = `${Math.round(ratio * 100)}%`;
    progress.hidden = goal === null;
    const label = t('tasbih.countLabel', { dhikr: dhikrLabel(dhikr) });
    const progressText = t('tasbih.count', {
      count,
      target: goal === null ? t('tasbih.goalFree') : goal,
    });
    tapButton.setAttribute('aria-label', `${label} — ${progressText}`);
    live.textContent = `${progressText}${goal !== null && count === goal ? ` — ${t('tasbih.reached', { count })}` : ''}`;

    favoriteBtn.setAttribute(
      'aria-label',
      favorite ? t('tasbih.unfavorite') : t('tasbih.favorite'),
    );
    favoriteBtn.setAttribute('aria-pressed', String(favorite));
    favoriteBtn.replaceChildren(icon('star', 18));
    if (!favorite) favoriteBtn.classList.add('muted');
    else favoriteBtn.classList.remove('muted');

    deleteBtn.hidden = Boolean(dhikr?.builtin);
    undoBtn.disabled = !store.canUndo();
    resetBtn.disabled = count === 0;
    undoBtn.textContent = t('tasbih.undo');
    resetBtn.textContent = t('tasbih.reset');

    if (paintedGoalFor !== id) paintGoals();

    for (const chip of Array.from(chips.children)) {
      chip.setAttribute(
        'aria-pressed',
        String(chip.getAttribute('data-dhikr') === id),
      );
    }

    paintVibration();
  }

  function openCustomDhikrSheet(): void {
    ctx.sheet(t('tasbih.customAdd'), (close) => {
      const arabicInput = el('textarea', {
        attrs: { rows: 3, required: true, placeholder: t('tasbih.customArabic') },
      });
      const translitInput = el('input', {
        attrs: { type: 'text', placeholder: t('tasbih.customTranslit') },
      });
      const translationInput = el('input', {
        attrs: { type: 'text', placeholder: t('tasbih.customTranslation') },
      });
      const referenceInput = el('input', {
        attrs: { type: 'text', placeholder: t('tasbih.customReference') },
      });
      const error = el('p', { class: 'small', attrs: { role: 'alert' } });
      error.hidden = true;

      const save = () => {
        const result = store.addCustom({
          arabic: arabicInput.value,
          translit: translitInput.value,
          translation: translationInput.value,
          reference: referenceInput.value,
        });
        if (!result.ok) {
          error.textContent =
            result.reason === 'limit' ? t('tasbih.limit') : t('tasbih.customEmpty');
          error.hidden = false;
          arabicInput.focus();
          return;
        }
        close();
        paintChips();
        paintCounter();
        toast(t('tasbih.customSaved'));
      };

      return el(
        'div',
        { class: 'stack' },
        el('p', { class: 'small muted', text: t('tasbih.customHint') }),
        el('div', { class: 'field' }, el('label', { text: t('tasbih.customArabic') }), arabicInput),
        el('div', { class: 'field' }, el('label', { text: t('tasbih.customTranslit') }), translitInput),
        el(
          'div',
          { class: 'field' },
          el('label', { text: t('tasbih.customTranslation') }),
          translationInput,
        ),
        el(
          'div',
          { class: 'field' },
          el('label', { text: t('tasbih.customReference') }),
          referenceInput,
        ),
        error,
        el(
          'div',
          { class: 'btn-row' },
          el(
            'button',
            { class: 'btn ghost', attrs: { type: 'button' }, on: { click: () => close() } },
            t('common.cancel'),
          ),
          el(
            'button',
            { class: 'btn primary', attrs: { type: 'button' }, on: { click: save } },
            t('common.save'),
          ),
        ),
      );
    });
  }

  // ---------------------------------------------------------------- sessions
  function sessionStepSummary(session: ActiveSession): string {
    const step = session.steps[session.index];
    if (!step) return '';
    const dhikr = store.findDhikr(step.dhikrId);
    return `${dhikrLabel(dhikr)} · ${session.counts[session.index] ?? 0} / ${step.target}`;
  }

  function paintSessions(): void {
    const active = store.get().activeSession;
    const focusedInside = sessionsPanel.contains(document.activeElement);
    sessionsPanel.replaceChildren();

    if (active) {
      const step = active.steps[active.index];
      const dhikr = step ? store.findDhikr(step.dhikrId) : undefined;
      const current = step ? active.counts[active.index] ?? 0 : 0;
      const label = store.sessionLabel(active, t);
      const tap = el(
        'button',
        {
          class: 'tasbih-tap compact',
          attrs: {
            type: 'button',
            'aria-label': `${t('tasbih.sessionStep', {
              current: active.index + 1,
              total: active.steps.length,
            })} — ${dhikrLabel(dhikr)} — ${t('tasbih.count', {
              count: current,
              target: step?.target ?? 0,
            })}`,
          },
          on: {
            click: () => {
              const result = store.sessionIncrement();
              vibrate();
              if (result.sessionDone) {
                toast(t('tasbih.sessionComplete', { count: result.total }));
                paintSessions();
                paintHistory();
                return;
              }
              if (result.stepDone) {
                toast(
                  t('tasbih.stepDone', {
                    dhikr: dhikrLabel(dhikr),
                    target: result.target,
                  }),
                );
              }
              paintSessions();
            },
          },
        },
        el('span', { class: 'tasbih-session-name', text: label }),
        el('span', {
          class: 'tasbih-session-step',
          text: t('tasbih.sessionStep', {
            current: active.index + 1,
            total: active.steps.length,
          }),
        }),
        el('span', {
          class: 'tasbih-arabic small',
          attrs: { lang: 'ar', dir: 'rtl' },
          text: dhikr?.arabic ?? '—',
        }),
        el('span', { class: 'tasbih-session-count', text: `${current} / ${step?.target ?? 0}` }),
        el(
          'span',
          { class: 'tasbih-progress', attrs: { 'aria-hidden': 'true' } },
          el('span', {
            class: 'tasbih-progress-fill',
            attrs: {
              style: `width:${step && step.target > 0 ? Math.round((current / step.target) * 100) : 0}%`,
            },
          }),
        ),
      );

      const undo = el('button', {
        class: 'btn ghost sm',
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (store.undoLast()) paintSessions();
          },
        },
      });
      undo.textContent = t('tasbih.undo');
      undo.disabled = !store.canUndo();

      const skip = el('button', {
        class: 'btn ghost sm',
        attrs: { type: 'button' },
        on: {
          click: () => {
            store.skipSessionStep();
            paintSessions();
            paintHistory();
          },
        },
      });
      skip.textContent = t('tasbih.sessionSkip');

      const abandon = el('button', {
        class: 'btn ghost sm danger-text',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: t('tasbih.sessionAbandonTitle'),
              body: t('tasbih.sessionAbandonBody'),
              confirmLabel: t('tasbih.sessionAbandon'),
              cancelLabel: t('common.cancel'),
              danger: true,
            });
            if (!ok) return;
            store.abandonSession();
            paintSessions();
            paintCounter();
          },
        },
      });
      abandon.textContent = t('tasbih.sessionAbandon');

      sessionsPanel.append(
        el(
          'div',
          { class: 'card tasbih-session-active' },
          el('div', { class: 'row-between' }, el('h2', { class: 'h3' }, t('tasbih.sessionActive')), pillLive()),
          tap,
          el('div', { class: 'btn-row' }, undo, skip, abandon),
          el('p', { class: 'tiny muted', text: sessionStepSummary(active) }),
        ),
      );
    }

    const templates = store.sessionTemplates();
    const builtin = templates.filter((entry) => entry.builtin);
    const custom = templates.filter((entry) => !entry.builtin);

    sessionsPanel.append(
      el('h2', { class: 'h3', text: t('tasbih.sessionPreset') }),
      el(
        'div',
        { class: 'stack sm' },
        ...builtin.map((template) => sessionRow(template)),
      ),
    );

    if (custom.length > 0) {
      sessionsPanel.append(
        el('h2', { class: 'h3', text: t('tasbih.sessionCustom') }),
        el(
          'div',
          { class: 'stack sm' },
          ...custom.map((template) => sessionRow(template)),
        ),
      );
    }

    sessionsPanel.append(
      el(
        'button',
        {
          class: 'btn ghost sm',
          attrs: { type: 'button' },
          on: { click: () => openSessionSheet() },
        },
        icon('plus', 16),
        t('tasbih.sessionCreate'),
      ),
    );

    if (focusedInside && active) {
      const next = sessionsPanel.querySelector<HTMLButtonElement>('.tasbih-tap');
      next?.focus();
    }
  }

  function pillLive(): HTMLElement {
    return el(
      'span',
      { class: 'pill accent' },
      el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
      t('tasbih.sessionActive'),
    );
  }

  function sessionRow(template: SessionTemplate): HTMLElement {
    const label = template.name ?? (template.nameKey ? t(template.nameKey) : t('tasbih.session.customName'));
    const summary = template.steps
      .map((step) => `${dhikrLabel(store.findDhikr(step.dhikrId))} × ${step.target}`)
      .join(' · ');
    const start = el('button', {
      class: 'btn primary sm',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          // Starting a template while another session runs would silently throw
          // the progress away. Ask first, and say exactly that.
          if (store.get().activeSession) {
            const ok = await confirmDialog({
              title: t('tasbih.sessionAbandonTitle'),
              body: t('tasbih.sessionAbandonBody'),
              confirmLabel: t('tasbih.sessionStart'),
              cancelLabel: t('common.cancel'),
              danger: true,
            });
            if (!ok) return;
          }
          if (store.startSession(template, label)) {
            paintSessions();
            toast(t('tasbih.sessionActive'));
          }
        },
      },
    });
    start.textContent = t('tasbih.sessionStart');

    const remove = template.builtin
      ? null
      : el(
          'button',
          {
            class: 'icon-btn danger',
            attrs: { type: 'button', 'aria-label': t('tasbih.delete') },
            on: {
              click: async () => {
                const ok = await confirmDialog({
                  title: t('tasbih.delete'),
                  body: label,
                  confirmLabel: t('tasbih.delete'),
                  cancelLabel: t('common.cancel'),
                  danger: true,
                });
                if (!ok) return;
                store.removeSession(template.id);
                paintSessions();
              },
            },
          },
          icon('trash', 17),
        );

    return el(
      'div',
      { class: 'card tight tasbih-template' },
      el(
        'div',
        { class: 'grow' },
        el('strong', { text: label }),
        el('span', { class: 'tiny muted' , text: summary }),
      ),
      start,
      remove,
    );
  }

  function openSessionSheet(): void {
    ctx.sheet(t('tasbih.sessionCreate'), (close) => {
      const nameInput = el('input', {
        attrs: { type: 'text', placeholder: t('tasbih.sessionName'), maxlength: 60 },
      });
      const rows = el('div', { class: 'stack sm' });
      const error = el('p', { class: 'small', attrs: { role: 'alert' } });
      error.hidden = true;

      const addRow = (): void => {
        const select = el('select', { attrs: { 'aria-label': t('tasbih.choose') } });
        for (const dhikr of store.dhikrList()) {
          select.appendChild(
            el('option', { text: dhikrLabel(dhikr), attrs: { value: dhikr.id } }),
          );
        }
        select.value = store.get().dhikrId;
        const target = el('input', {
          attrs: {
            type: 'number',
            min: 1,
            max: 100000,
            value: 33,
            inputmode: 'numeric',
            'aria-label': t('tasbih.goal'),
          },
        });
        const row = el(
          'div',
          { class: 'tasbih-step-row' },
          select,
          target,
          el(
            'button',
            {
              class: 'icon-btn',
              attrs: { type: 'button', 'aria-label': t('tasbih.sessionRemoveStep') },
              on: { click: () => row.remove() },
            },
            icon('close', 16),
          ),
        );
        rows.appendChild(row);
      };
      addRow();

      const save = () => {
        const steps: Array<{ dhikrId: string; target: number }> = [];
        for (const row of Array.from(rows.children)) {
          const select = row.querySelector('select');
          const input = row.querySelector('input');
          if (!select || !input) continue;
          steps.push({ dhikrId: select.value, target: Number(input.value) });
        }
        const result = store.addSession({ name: nameInput.value, steps });
        if (!result.ok) {
          error.textContent = result.reason === 'limit' ? t('tasbih.limit') : t('tasbih.sessionEmpty');
          error.hidden = false;
          return;
        }
        close();
        paintSessions();
        toast(t('tasbih.sessionSaved'));
      };

      return el(
        'div',
        { class: 'stack' },
        el('div', { class: 'field' }, el('label', { text: t('tasbih.sessionName') }), nameInput),
        el('h3', { class: 'h3', text: t('tasbih.sessionAddStep') }),
        rows,
        el(
          'button',
          {
            class: 'btn ghost sm',
            attrs: { type: 'button' },
            on: { click: addRow },
          },
          icon('plus', 16),
          t('tasbih.sessionAddStep'),
        ),
        error,
        el(
          'div',
          { class: 'btn-row' },
          el(
            'button',
            { class: 'btn ghost', attrs: { type: 'button' }, on: { click: () => close() } },
            t('common.cancel'),
          ),
          el(
            'button',
            { class: 'btn primary', attrs: { type: 'button' }, on: { click: save } },
            t('common.save'),
          ),
        ),
      );
    });
  }

  // ---------------------------------------------------------------- adhkar state & panel
  let adhkarCategory: AdhkarCategory = 'morning';
  const adhkarCounts: Record<string, number> = {};

  // Initialize saved counts from sessionStorage if available
  try {
    const saved = sessionStorage.getItem('azan.adhkar_counts');
    if (saved) {
      Object.assign(adhkarCounts, JSON.parse(saved));
    }
  } catch {
    // sessionStorage disabled or unavailable
  }

  function saveAdhkarCounts(): void {
    try {
      sessionStorage.setItem('azan.adhkar_counts', JSON.stringify(adhkarCounts));
    } catch {
      // ignore
    }
  }

  function paintAdhkar(): void {
    adhkarPanel.replaceChildren();

    const categoryTabs = segmented<AdhkarCategory>(
      adhkarCategory,
      [
        { value: 'morning', label: t('adhkar.morning') },
        { value: 'evening', label: t('adhkar.evening') },
        { value: 'after-prayer', label: t('adhkar.afterPrayer') },
        { value: 'ramadan', label: t('adhkar.ramadan') },
        { value: 'essential', label: t('adhkar.essential') },
      ],
      (cat) => {
        adhkarCategory = cat;
        paintAdhkar();
      },
    );

    const items = ADHKAR_LIST.filter((item) => item.category === adhkarCategory);
    const listContainer = el('div', { class: 'stack sm' });

    let completedCount = 0;

    for (const item of items) {
      const current = adhkarCounts[item.id] || 0;
      const isDone = current >= item.count;
      if (isDone) completedCount++;

      const title =
        ctx.locale === 'ar' ? item.titleAr : ctx.locale === 'en' ? item.titleEn : item.titleFr;
      const translation = ctx.locale === 'ar' ? '' : ctx.locale === 'en' ? item.translationEn : item.translationFr;
      const virtue =
        ctx.locale === 'ar' ? '' : ctx.locale === 'en' ? item.virtueEn : item.virtueFr;

      const countBadge = el('span', {
        class: `pill ${isDone ? 'ok' : 'muted'}`,
        text: `${current} / ${item.count}`,
      });

      const tapBtn = el(
        'button',
        {
          class: `btn ${isDone ? 'ghost' : 'primary'} sm`,
          attrs: {
            type: 'button',
            'aria-label': `${title} — ${current}/${item.count}`,
          },
          on: {
            click: () => {
              vibrate();
              if (current < item.count) {
                adhkarCounts[item.id] = current + 1;
              } else {
                adhkarCounts[item.id] = 0; // tap again to restart count if wanted
              }
              saveAdhkarCounts();
              paintAdhkar();
            },
          },
        },
        isDone ? icon('check', 16) : null,
        isDone ? t('adhkar.completed') : `${current} / ${item.count}`,
      );

      const card = el(
        'article',
        { class: `card tight stack xs adhkar-card ${isDone ? 'is-completed' : ''}` },
        el(
          'div',
          { class: 'row-between align-center' },
          el('strong', { class: 'small', text: title }),
          countBadge,
        ),
        el('p', { class: 'adhkar-arabic', attrs: { lang: 'ar', dir: 'rtl' }, text: item.arabic }),
        item.translit && ctx.locale !== 'ar'
          ? el('p', { class: 'adhkar-translit tiny muted', text: item.translit })
          : null,
        translation ? el('p', { class: 'adhkar-translation small', text: translation }) : null,
        virtue
          ? el('p', { class: 'tiny muted virtue-note', text: `💡 ${virtue}` })
          : null,
        el(
          'div',
          { class: 'row-between align-center', attrs: { style: 'margin-top: var(--space-2)' } },
          el('span', { class: 'tiny muted', text: item.reference }),
          tapBtn,
        ),
      );

      listContainer.appendChild(card);
    }

    // Header controls with reset button
    const headerRow = el(
      'div',
      { class: 'row-between align-center' },
      el('span', {
        class: 'small muted',
        text: `${completedCount} / ${items.length} ${t('adhkar.completed').toLowerCase()}`,
      }),
      el(
        'button',
        {
          class: 'btn ghost xs',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              const ok = await confirmDialog({
                title: t('adhkar.resetCategory'),
                body: t('adhkar.resetConfirm'),
                confirmLabel: t('adhkar.resetCategory'),
                cancelLabel: t('common.cancel'),
                danger: false,
              });
              if (!ok) return;
              for (const it of items) {
                adhkarCounts[it.id] = 0;
              }
              saveAdhkarCounts();
              paintAdhkar();
            },
          },
        },
        icon('reset', 14),
        t('adhkar.resetCategory'),
      ),
    );

    adhkarPanel.append(categoryTabs, headerRow, listContainer);
  }

  // ---------------------------------------------------------------- khatmah
  function paintKhatmah(): void {
    khatmahPanel.replaceChildren();

    const state = loadKhatmahState();
    const today = new Date();
    const loc = ctx.store.get().location;
    const timeZone = loc?.timeZone || 'Africa/Casablanca';
    const hijri = hijriDate(today, timeZone, ctx.intl, ctx.store.get().hijriAdjustment || 0);
    const hijriDay = hijri ? hijri.day : 1;
    const dailyHizb = getMoroccanDailyHizb(hijriDay);
    const analysis = analyzeKhatmahProgress(state, hijriDay);

    // Goal selector: 1, 2, or 3 Khatmahs
    const goalTabs = segmented<'1' | '2' | '3'>(
      String(state.targetKhatmahs) as '1' | '2' | '3',
      [
        { value: '1', label: `1 ${ctx.locale === 'ar' ? 'ختمة' : 'Khatma'}` },
        { value: '2', label: `2 ${ctx.locale === 'ar' ? 'ختمتان' : 'Khatmas'}` },
        { value: '3', label: `3 ${ctx.locale === 'ar' ? 'ختمات' : 'Khatmas'}` },
      ],
      (val) => {
        state.targetKhatmahs = Number(val);
        saveKhatmahState(state);
        paintKhatmah();
      },
    );

    // Moroccan Mosque daily Hizb banner
    const mosqueCard = el(
      'div',
      { class: 'card highlight stack xs', attrs: { style: 'background: var(--surface-2);' } },
      el('strong', { class: 'small', text: `🕌 ${t('khatmah.hizbRatib')}` }),
      el(
        'div',
        { class: 'row-between align-center wrap', attrs: { style: 'margin-block-start: var(--space-1);' } },
        el('span', { class: 'pill ok', text: t('khatmah.hizbMorning', { n: dailyHizb.morningHizb }) }),
        el('span', { class: 'pill ok', text: t('khatmah.hizbEvening', { n: dailyHizb.eveningHizb }) }),
      ),
    );

    // Smart Progress Card
    const progressText = t('khatmah.progress', {
      completed: analysis.completedAhzab,
      total: analysis.totalTargetAhzab,
      percent: analysis.progressPercent,
    });

    const isAheadOrOnTrack = analysis.status !== 'behind';
    const paceMessage = isAheadOrOnTrack
      ? t('khatmah.pacePraise', { day: analysis.projectedFinishDay || 27 })
      : t('khatmah.paceCatchup', { pages: analysis.pagesPerPrayerRecommended });

    const statusPill = el('span', {
      class: `pill ${isAheadOrOnTrack ? 'ok' : 'warn'}`,
      text: isAheadOrOnTrack
        ? (ctx.locale === 'ar' ? 'وتيرة ممتازة' : 'Bonne cadence')
        : (ctx.locale === 'ar' ? 'خطة تدارك' : 'Rattrapage'),
    });

    const progressBar = el(
      'div',
      {
        attrs: {
          style: 'width: 100%; height: 10px; background: var(--border); border-radius: 999px; overflow: hidden; margin-block: var(--space-2);',
        },
      },
      el('div', {
        attrs: {
          style: `width: ${analysis.progressPercent}%; height: 100%; background: var(--color-primary, #1e7e54); transition: width 0.3s;`,
        },
      }),
    );

    // Quick action buttons
    const addBtn = el(
      'button',
      {
        class: 'btn primary sm grow',
        attrs: { type: 'button' },
        on: {
          click: () => {
            vibrate();
            for (let h = 1; h <= 60; h++) {
              if (!state.readAhzab.includes(h)) {
                state.readAhzab.push(h);
                break;
              }
            }
            saveKhatmahState(state);
            paintKhatmah();
          },
        },
      },
      icon('plus', 16),
      t('khatmah.quickAdd'),
    );

    const subBtn = el(
      'button',
      {
        class: 'btn ghost sm grow',
        attrs: { type: 'button' },
        on: {
          click: () => {
            vibrate();
            if (state.readAhzab.length > 0) {
              state.readAhzab.pop();
              saveKhatmahState(state);
              paintKhatmah();
            }
          },
        },
      },
      icon('minus', 16),
      t('khatmah.quickSub'),
    );

    const resetBtn = el(
      'button',
      {
        class: 'btn ghost sm danger',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            const ok = await confirmDialog({
              title: t('khatmah.reset'),
              body: t('khatmah.resetConfirm'),
              confirmLabel: t('khatmah.reset'),
              cancelLabel: t('common.cancel'),
              danger: true,
            });
            if (!ok) return;
            state.readAhzab = [];
            saveKhatmahState(state);
            paintKhatmah();
          },
        },
      },
      icon('reset', 14),
      t('khatmah.reset'),
    );

    const progressCard = el(
      'div',
      { class: 'card stack sm' },
      el('div', { class: 'row-between align-center' }, el('strong', { text: progressText }), statusPill),
      progressBar,
      el('p', { class: 'small muted', attrs: { style: 'font-weight: 500;' }, text: `💡 ${paceMessage}` }),
      el('div', { class: 'row gap-sm wrap', attrs: { style: 'margin-block-start: var(--space-2);' } }, addBtn, subBtn),
    );

    // 60-Hizb Interactive Grid
    const grid = el('div', {
      attrs: {
        style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; margin-block-start: var(--space-2);',
      },
    });

    for (let h = 1; h <= 60; h++) {
      const isRead = state.readAhzab.includes(h);
      const isTodayMosque = h === dailyHizb.morningHizb || h === dailyHizb.eveningHizb;

      const tile = el(
        'button',
        {
          class: `btn ${isRead ? 'primary' : 'ghost'} sm`,
          attrs: {
            type: 'button',
            'aria-label': `${ctx.locale === 'ar' ? 'الحزب' : 'Hizb'} ${h} ${isRead ? '✓' : ''}`,
            style: `padding: 6px 2px; font-size: 13px; font-weight: ${isTodayMosque ? 'bold' : 'normal'}; border: ${isTodayMosque && !isRead ? '2px dashed var(--color-primary)' : '1px solid var(--border)'};`,
          },
          on: {
            click: () => {
              vibrate();
              if (state.readAhzab.includes(h)) {
                state.readAhzab = state.readAhzab.filter((x) => x !== h);
              } else {
                state.readAhzab.push(h);
              }
              saveKhatmahState(state);
              paintKhatmah();
            },
          },
        },
        String(h),
      );
      grid.appendChild(tile);
    }

    const gridCard = el(
      'div',
      { class: 'card stack sm' },
      el('div', { class: 'row-between align-center' },
        el('h2', { class: 'h3', text: ctx.locale === 'ar' ? 'شبكة الستين حزباً' : 'Les 60 Ahzab' }),
        resetBtn,
      ),
      el('p', { class: 'tiny muted', text: ctx.locale === 'ar' ? 'اضغط على أي حزب لتحديده كمقروء (المحدد بالمتقطع هو حزب مساجد المغرب اليوم)' : 'Appuyez pour marquer un Hizb lu (en pointillés: Hizb du jour au Maroc)' }),
      grid,
    );

    khatmahPanel.append(goalTabs, mosqueCard, progressCard, gridCard);
  }

  // ---------------------------------------------------------------- history
  function paintHistory(): void {
    const history = store.get().history;
    historyPanel.replaceChildren();
    historyPanel.append(
      el('p', { class: 'tiny muted', text: t('tasbih.historyOffline') }),
    );

    if (history.length === 0) {
      historyPanel.append(
        el('div', { class: 'card tight center stack xs' }, el('p', { text: t('tasbih.historyEmpty') })),
      );
      return;
    }

    const list = el('div', { class: 'stack sm' });
    for (const entry of history) {
      const steps = entry.steps
        .map((step) => `${dhikrLabel(store.findDhikr(step.dhikrId))} × ${step.count}`)
        .join(' · ');
      list.appendChild(
        el(
          'div',
          { class: 'card tight stack xs' },
          el(
            'div',
            { class: 'row-between' },
            el('strong', { text: entry.name }),
            el('span', { class: 'pill ok', text: String(entry.total) }),
          ),
          el('span', { class: 'tiny muted', text: dateLabel(ctx.intl, entry.finishedAt) }),
          el('span', { class: 'small muted', text: steps }),
        ),
      );
    }
    historyPanel.append(list);

    const clear = el('button', {
      class: 'btn ghost sm',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          const ok = await confirmDialog({
            title: t('tasbih.historyClearTitle'),
            body: t('tasbih.historyClearBody'),
            confirmLabel: t('tasbih.historyClear'),
            cancelLabel: t('common.cancel'),
            danger: true,
          });
          if (!ok) return;
          store.clearHistory();
          paintHistory();
        },
      },
    });
    clear.textContent = t('tasbih.historyClear');
    historyPanel.append(clear);
  }

  // ---------------------------------------------------------------- first paint
  paintChips();
  paintCounter();
  paintSessions();
  paintHistory();

  return root;
}
