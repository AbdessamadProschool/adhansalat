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
  // Dedicated Flat Icons for each prayer time (senior visual accessibility)
  fajr: '<path d="M3 18h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 18a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5v4M7 8l2 2M17 8l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sunrise: '<path d="M3 18h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="11" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M4.9 6.9l1.4 1.4M19.1 6.9l-1.4 1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  dhuhr: '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  asr: '<circle cx="8" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 2.5v2M2.5 8H4.5M4 4l1.5 1.5M12 8h1M8 12v1M3 20h18M9 20l7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  maghrib: '<path d="M3 17h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 17a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v5M9.5 11.5 12 14l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  isha: '<path d="M19 13.5A7.5 7.5 0 0 1 10.5 5a7.5 7.5 0 1 0 8.5 8.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="18.5" cy="5.5" r="1" fill="currentColor"/><circle cx="14" cy="3" r="0.8" fill="currentColor"/>',
  speakerMute: '<path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M22 9l-6 6M16 9l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
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
  quran:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="11" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 8.5v5M9.5 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  book:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 7h8M8 11h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  printer:
    '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 14h12v8H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="18" cy="12" r="1" fill="currentColor"/>',
  share:
    '<circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  reset:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/>',
  soundWave:
    '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 11v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  lantern:
    '<path d="M12 2v2M8 4h8l-1 4H9zm-2 4h12l-2 10H8zm2 10h8l-1 3H9zm3 3v1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.5" fill="currentColor"/>',
  duaHands:
    '<path d="M7 19c0-4 2.5-7 5-11 2.5 4 5 7 5 11-2 1.5-4 1.5-5 1.5s-3 0-5-1.5z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v12" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>',
  mosque:
    '<path d="M12 3c-2.5 2-4 4.5-4 7v11h8V10c0-2.5-1.5-5-4-7zM4 12v9h4v-9zm12 0v9h4v-9zM12 2v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  bubbleLevel:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
  sparkle:
    '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor"/>',
  satellite:
    '<circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 17l-3.5 3.5M17 7l3.5-3.5M14.5 9.5l3.5-3.5a2 2 0 1 1 2.8 2.8L17.3 12.3M9.5 14.5l-3.5 3.5a2 2 0 1 1-2.8-2.8L6.7 11.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  calibrate:
    '<path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  arrowRight:
    '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  arrowLeft:
    '<path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  crescentBadge:
    '<path d="M17 12a5 5 0 1 1-5-5 4 4 0 0 0 5 5z" fill="currentColor"/>',
  folderAudio:
    '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 13v3.5a1.5 1.5 0 1 0 1.5-1.5H10v-3l4-1v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  calculator:
    '<rect x="4" y="2" width="16" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  calendarToday:
    '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15" r="2" fill="currentColor"/>',
  fastingBowl:
    '<path d="M4 11h16a8 8 0 0 1-16 0zM12 19v3M8 22h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7c0-2 1-3 1-3s1 1 1 3M14 7c0-2 1-3 1-3s1 1 1 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  undo:
    '<path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  vibrate:
    '<rect x="7" y="4" width="10" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M11 17h2M3 8v8M21 8v8M1 10v4M23 10v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  plusCircle:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
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
  glyph?: keyof typeof PATHS | string,
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
      el(
        'strong',
        { class: 'row align-center', attrs: { style: 'gap: 6px;' } },
        glyph ? icon(glyph, 18) : null,
        el('span', { text: label }),
      ),
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

export interface SegmentedChoice<T extends string> {
  value: T;
  label: string;
  glyph?: string;
}

export function segmented<T extends string>(
  value: T,
  choices: Array<SegmentedChoice<T>>,
  onChange: (v: T) => void,
): HTMLElement {
  const wrap = el('div', { class: 'segmented', attrs: { role: 'group' } });
  for (const choice of choices) {
    const btn = el('button', {
      attrs: { type: 'button', 'aria-pressed': String(choice.value === value) },
      on: {
        click: () => {
          Array.from(wrap.children).forEach((child, index) =>
            child.setAttribute('aria-pressed', String(choices[index]?.value === choice.value)),
          );
          onChange(choice.value);
        },
      },
    });
    if (choice.glyph) {
      btn.appendChild(icon(choice.glyph, 15));
    }
    btn.appendChild(el('span', { text: choice.label }));
    wrap.appendChild(btn);
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
