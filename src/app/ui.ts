/**
 * Minimal DOM helpers.
 *
 * No framework: the screens are plain functions returning elements. This keeps
 * the bundle small, avoids a virtual-DOM dependency in an app whose hard part is
 * astronomy and alarms, and makes every interaction explicit.
 *
 * All user-supplied text goes through `textContent`, never `innerHTML`.
 */

import { formatInZone, offsetLabel } from '../core/timezone.js';
import { illustration, type IllustrationName } from './illustrations.js';

type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  /** Only ever used with constant markup defined in this project. */
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<Record<keyof HTMLElementEventMap, (ev: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      node.setAttribute(key, String(value));
    }
  }
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (handler) node.addEventListener(event, handler);
    }
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// ------------------------------------------------------------------ icons

const PATHS: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  speaker:
    '<path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  compass:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  chevron: '<path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  bell: '<path d="M18 15v-4a6 6 0 1 0-12 0v4l-2 3h16z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 21h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  bellOff: '<path d="M18 15v-4a6 6 0 0 0-9.3-5.1M6 6.4A6 6 0 0 0 6 11v4l-2 3h12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 21h4M3 3l18 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  checkCircle:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8 12.2 2.6 2.6L16.2 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  alert: '<path d="M12 3 2 21h20z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9v5M12 17.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5M12 7.6v.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  trash:
    '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="m12 3 2.6 5.8 6.4.6-4.8 4.2 1.4 6.4L12 16.8 6.4 20l1.4-6.4L3 9.4l6.4-.6z" fill="currentColor"/>',
  clock:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5.2l3.4 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  shield:
    '<path d="M12 3l7 2.6v5.1c0 4.4-3 7.5-7 9.3-4-1.8-7-4.9-7-9.3V5.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  wifi: '<path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
  wifiOff:
    '<path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
  download:
    '<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  search:
    '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  minus: '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  kaaba:
    '<path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 3v18M3.5 7.5 12 12l8.5-4.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3.5 10 12 14.5 20.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sliders:
    '<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  beads:
    '<circle cx="12" cy="3.4" r="1.5" fill="currentColor"/><circle cx="17.2" cy="5" r="1.5" fill="currentColor"/><circle cx="20.4" cy="9.1" r="1.5" fill="currentColor"/><circle cx="20.4" cy="14.2" r="1.5" fill="currentColor"/><circle cx="17.4" cy="18.2" r="1.5" fill="currentColor"/><circle cx="12.6" cy="20.2" r="1.5" fill="currentColor"/><circle cx="7.4" cy="19.2" r="1.5" fill="currentColor"/><circle cx="3.8" cy="15.6" r="1.5" fill="currentColor"/><circle cx="3.4" cy="10.5" r="1.5" fill="currentColor"/><circle cx="6" cy="6.1" r="1.5" fill="currentColor"/><path d="M12 21v1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  book:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 7h8M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  printer:
    '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14h12v8H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  share:
    '<circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  reset:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name: keyof typeof PATHS | string, size = 22): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = PATHS[name] ?? PATHS.star!;
  return svg;
}

// ------------------------------------------------------------------ formatting

export function fmtTime(date: Date | null, timeZone: string, locale: string): string {
  if (!date) return '—';
  try {
    return formatInZone(date, timeZone, locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return '—';
  }
}

export function fmtDateFull(date: Date, timeZone: string, locale: string): string {
  try {
    return formatInZone(date, timeZone, locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function fmtDateMedium(date: Date, timeZone: string, locale: string): string {
  try {
    return formatInZone(date, timeZone, locale, { day: 'numeric', month: 'short' });
  } catch {
    return date.toISOString().slice(5, 10);
  }
}

export function fmtMonth(instants: Date, timeZone: string, locale: string): string {
  try {
    return formatInZone(instants, timeZone, locale, { month: 'long', year: 'numeric' });
  } catch {
    return instants.toISOString().slice(0, 7);
  }
}

export function offsetLabelOf(timeZone: string, instant: Date = new Date()): string {
  return offsetLabel(timeZone, instant);
}

// ------------------------------------------------------------------ toast

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string): void {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3600);
}

// ------------------------------------------------------------------ sheet

export interface SheetOptions {
  title: string;
  closeLabel: string;
}

let activeSheet: {
  backdrop: HTMLElement;
  restoreFocus: Element | null;
  onKey: (ev: KeyboardEvent) => void;
} | null = null;

export function closeSheet(): void {
  if (!activeSheet) return;
  const { backdrop, restoreFocus, onKey } = activeSheet;
  activeSheet = null;
  document.removeEventListener('keydown', onKey);
  document.body.style.removeProperty('overflow');
  backdrop.remove();
  if (restoreFocus instanceof HTMLElement) restoreFocus.focus();
}

export function openSheet(
  options: SheetOptions,
  build: (close: () => void) => HTMLElement,
): void {
  closeSheet();
  const restoreFocus = document.activeElement;
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', {
    class: 'sheet',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
  });

  const close = () => closeSheet();
  const header = el(
    'div',
    { class: 'row-between', attrs: { style: 'margin-bottom:16px' } },
    el('h2', { text: options.title, attrs: { id: titleId } }),
    el(
      'button',
      {
        class: 'icon-btn',
        attrs: { type: 'button', 'aria-label': options.closeLabel },
        on: { click: close },
      },
      icon('close', 20),
    ),
  );

  sheet.appendChild(header);
  sheet.appendChild(build(close));
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close();
  });

  const focusable = () =>
    Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const nodes = focusable();
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(backdrop);
  activeSheet = { backdrop, restoreFocus, onKey };
  const first = focusable()[0] ?? sheet;
  first.focus();
}

/**
 * Confirmation dialog. Native `window.confirm()` is a blocking browser chrome
 * dialog: it ignores the active theme and cannot be styled or read consistently
 * by RTL screen readers. This one is a real modal with the same focus contract.
 */
export function confirmDialog(options: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    openSheet({ title: options.title, closeLabel: options.cancelLabel }, (close) => {
      const wrap = el('div', { class: 'confirm-body' });
      let answered = false;
      const finish = (value: boolean) => {
        if (answered) return;
        answered = true;
        close();
        resolve(value);
      };
      wrap.append(
        el('p', { text: options.body }),
        el(
          'div',
          { class: 'btn-row', attrs: { style: 'justify-content:flex-end' } },
          el(
            'button',
            {
              class: 'btn ghost',
              attrs: { type: 'button' },
              on: { click: () => finish(false) },
            },
            options.cancelLabel,
          ),
          el(
            'button',
            {
              class: options.danger ? 'btn danger' : 'btn primary',
              attrs: { type: 'button' },
              on: { click: () => finish(true) },
            },
            options.confirmLabel,
          ),
        ),
      );
      return wrap;
    });
  });
}

// ------------------------------------------------------------------ widgets

export function switchRow(
  label: string,
  description: string | null,
  checked: boolean,
  onChange: (next: boolean) => void,
): HTMLElement {
  const input = el('input', {
    attrs: { type: 'checkbox', role: 'switch' },
    on: {
      change: () => onChange(input.checked),
    },
  });
  input.checked = checked;
  return el(
    'label',
    { class: 'switch' },
    el(
      'span',
      { class: 'switch-text' },
      el('strong', { text: label }),
      description ? el('span', { text: description }) : null,
    ),
    input,
  );
}

export function stepper(options: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: (v: number) => string;
  onChange: (v: number) => void;
  ariaLabel: string;
  minusLabel?: string;
  plusLabel?: string;
}): HTMLElement {
  const step = options.step ?? 1;
  let current = options.value;
  const out = el('output', { text: options.label(current) });
  const set = (v: number) => {
    current = Math.min(options.max, Math.max(options.min, v));
    out.textContent = options.label(current);
    options.onChange(current);
  };
  return el(
    'div',
    { class: 'row-between', attrs: { role: 'group', 'aria-label': options.ariaLabel } },
    el(
      'span',
      { class: 'stepper' },
      el('button', {
        text: '−',
        attrs: { type: 'button', 'aria-label': options.minusLabel ?? '−' },
        on: { click: () => set(current - step) },
      }),
      out,
      el('button', {
        text: '+',
        attrs: { type: 'button', 'aria-label': options.plusLabel ?? '+' },
        on: { click: () => set(current + step) },
      }),
    ),
  );
}

export function segmented<T extends string>(
  value: T,
  choices: Array<{ value: T; label: string }>,
  onChange: (v: T) => void,
): HTMLElement {
  const wrap = el('div', { class: 'segmented', attrs: { role: 'group' } });
  for (const choice of choices) {
    wrap.appendChild(
      el('button', {
        text: choice.label,
        attrs: { type: 'button', 'aria-pressed': String(choice.value === value) },
        on: {
          click: () => {
            Array.from(wrap.children).forEach((child, index) =>
              child.setAttribute('aria-pressed', String(choices[index]?.value === choice.value)),
            );
            onChange(choice.value);
          },
        },
      }),
    );
  }
  return wrap;
}

export function pill(
  text: string,
  tone: 'ok' | 'warn' | 'bad' | 'muted' | 'on-hero' | 'accent' = 'muted',
  glyph?: string,
): HTMLElement {
  return el(
    'span',
    { class: `pill ${tone}` },
    glyph ? icon(glyph, 13) : el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
    text,
  );
}

export function alertBox(
  tone: 'info' | 'warn' | 'bad',
  title: string,
  body: string,
): HTMLElement {
  return el(
    'div',
    { class: `alert ${tone}`, attrs: { role: tone === 'bad' ? 'alert' : 'status' } },
    el(
      'span',
      { class: 'alert-icon', attrs: { 'aria-hidden': 'true' } },
      icon(tone === 'info' ? 'info' : 'alert', 19),
    ),
    el('div', {}, el('strong', { text: title }), body ? el('span', { text: body }) : null),
  );
}

export function emptyState(options: {
  art: IllustrationName;
  title: string;
  body?: string;
  action?: HTMLElement;
}): HTMLElement {
  return el(
    'div',
    { class: 'empty-state' },
    el('div', { class: 'empty-art', attrs: { 'aria-hidden': 'true' } }, illustration(options.art)),
    el('p', { class: 'empty-title', text: options.title }),
    options.body ? el('p', { class: 'empty-body', text: options.body }) : null,
    options.action ?? null,
  );
}
