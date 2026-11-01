/**
 * Original, dependency-free illustrations for Azan Global.
 *
 * Every drawing is an inline SVG built from constant markup defined in this
 * module. Nothing is fetched, nothing is a bitmap, and nothing user-supplied is
 * ever interpolated into the markup. Colours come from the design tokens through
 * `currentColor` and the `.illus-*` classes, so the same asset works in both
 * themes without a second file.
 *
 * Usage rules (see docs/DESIGN-SYSTEM.md):
 *  - decorative layers are `aria-hidden` and never sit behind prayer times;
 *  - illustrations are small, low-contrast and secondary to the content;
 *  - a decorative layer is an independent absolutely-positioned element, never
 *    a background on the text container itself.
 */

const NS = 'http://www.w3.org/2000/svg';

export type IllustrationName =
  | 'arch'
  | 'zellige'
  | 'night'
  | 'mosque'
  | 'compass'
  | 'calendar'
  | 'sound'
  | 'shield';

function makeSvg(viewBox: string, markup: string, className = 'illus'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.innerHTML = markup;
  return svg;
}

/** An eight-point star built from two rotated squares, used as a unit tile. */
function star(cx: number, cy: number, r: number, rotate = 0): string {
  const points = (offset: number) =>
    Array.from({ length: 4 }, (_, i) => {
      const angle = ((i * 90 + offset + rotate) * Math.PI) / 180;
      return `${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`;
    }).join(' ');
  return `<path d="M ${points(0)} Z"/><path d="M ${points(45)} Z"/>`;
}

/**
 * A discreet zellige-inspired field: eight-point stars on a square grid.
 * Rendered at low opacity by `.illus-zellige` in the stylesheet.
 */
function zelligeMarkup(size = 240, step = 60): string {
  let out = '';
  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      const offset = (Math.floor(y / step) % 2) * (step / 2);
      out += star(x + offset, y, step * 0.32, 22.5);
    }
  }
  return `<g class="illus-line" stroke="currentColor" stroke-width="1" fill="none" stroke-linejoin="round">${out}</g>`;
}

const ARCH = `
  <path class="illus-line" d="M34 178V92c0-34 32-62 74-82 42 20 74 48 74 82v86" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path class="illus-line soft" d="M52 178V96c0-27 24-50 56-66 32 16 56 39 56 66v82" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path class="illus-gold" d="M78 178v-52c0-16 13-28 30-38 17 10 30 22 30 38v52" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path class="illus-line" d="M108 40v18" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path class="illus-gold" d="M108 58c-10-8-20-2-20 8 0 8 7 14 16 14M108 58c10-8 20-2 20 8 0 8-7 14-16 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <circle class="illus-gold" cx="108" cy="118" r="4" fill="currentColor" opacity=".85"/>
  <path class="illus-line soft" d="M108 122v34" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  <path class="illus-line" d="M64 94h88M64 110h88M64 126h88" stroke="currentColor" stroke-width=".7" opacity=".45"/>
  <path class="illus-gold" d="M30 178h156" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
`;

const NIGHT = `
  <path class="illus-gold" d="M116 34a42 42 0 1 0 44 58 34 34 0 0 1-44-58z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <g class="illus-gold" fill="currentColor">
    <path d="m168 44 2.3 5.4 5.7.5-4.3 3.8 1.3 5.7-5-3-5 3 1.3-5.7-4.3-3.8 5.7-.5z" opacity=".9"/>
    <circle cx="52" cy="46" r="1.8"/><circle cx="82" cy="24" r="1.3"/>
    <circle cx="188" cy="88" r="1.2"/><circle cx="42" cy="86" r="1.1"/>
  </g>
  <path class="illus-line" d="M30 132h180M60 132v-12M92 132v-20M124 132v-14M156 132v-22M188 132v-10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
`;

const MOSQUE = `
  <path class="illus-line" d="M20 158h200" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path class="illus-line" d="M58 158v-58c0-18 18-32 42-42 24 10 42 24 42 42v58" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path class="illus-gold" d="M86 158v-32c0-10 7-18 14-22 7 4 14 12 14 22v32" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path class="illus-line" d="M42 158v-40M198 158v-48" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path class="illus-gold" d="M198 110c-7-6-7-14 0-20 7 6 7 14 0 20z" stroke="currentColor" stroke-width="1.4"/>
  <path class="illus-gold" d="M34 118c-6-5-6-12 0-17 6 5 6 12 0 17z" stroke="currentColor" stroke-width="1.3"/>
  <circle class="illus-gold" cx="100" cy="68" r="3" fill="currentColor" opacity=".9"/>
  <path class="illus-line soft" d="M30 170h180" stroke="currentColor" stroke-width="1" stroke-dasharray="3 6" stroke-linecap="round" opacity=".7"/>
`;

const COMPASS = `
  <circle class="illus-line" cx="100" cy="100" r="72" stroke="currentColor" stroke-width="2"/>
  <circle class="illus-line soft" cx="100" cy="100" r="58" stroke="currentColor" stroke-width="1" stroke-dasharray="2 6"/>
  <path class="illus-gold" d="m100 42 14 44-14 14-14-14z" fill="currentColor" opacity=".9"/>
  <path class="illus-line" d="m100 158 12-38-12-12-12 12z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
  <circle class="illus-gold" cx="100" cy="100" r="5" fill="currentColor"/>
  <path class="illus-line" d="M100 22v10M100 168v10M22 100h10M168 100h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="illus-gold" d="M100 76v48" stroke="currentColor" stroke-width="1" opacity=".5"/>
`;

const CALENDAR = `
  <rect class="illus-line" x="34" y="40" width="132" height="122" rx="14" stroke="currentColor" stroke-width="2"/>
  <path class="illus-line" d="M34 74h132M64 28v22M136 28v22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <g class="illus-gold" fill="currentColor">
    <circle cx="62" cy="98" r="3"/><circle cx="88" cy="98" r="3"/><circle cx="114" cy="98" r="3"/><circle cx="140" cy="98" r="3"/>
    <circle cx="62" cy="122" r="3"/><circle cx="88" cy="122" r="3"/>
  </g>
  <circle class="illus-line" cx="114" cy="122" r="9" stroke="currentColor" stroke-width="1.5"/>
  <path class="illus-line" d="m110 122 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="illus-line soft" d="M62 146h76" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
`;

const SOUND = `
  <path class="illus-line" d="M28 84h26l28-24v80l-28-24H28z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path class="illus-gold" d="M100 72a38 38 0 0 1 0 56M116 56a60 60 0 0 1 0 88" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path class="illus-line soft" d="M146 100h34M146 82h22M146 118h22" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
  <circle class="illus-gold" cx="196" cy="44" r="3" fill="currentColor" opacity=".8"/>
  <circle class="illus-line" cx="184" cy="148" r="3" stroke="currentColor" stroke-width="1.2"/>
`;

const SHIELD = `
  <path class="illus-line" d="M100 26l60 22v46c0 38-26 64-60 80-34-16-60-42-60-80V48z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path class="illus-gold" d="m76 102 17 17 34-38" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="illus-line soft" d="M100 40v18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
`;

const MARKUP: Record<IllustrationName, { viewBox: string; markup: string }> = {
  arch: { viewBox: '0 0 216 184', markup: ARCH },
  zellige: { viewBox: '0 0 240 240', markup: zelligeMarkup() },
  night: { viewBox: '0 0 240 160', markup: NIGHT },
  mosque: { viewBox: '0 0 240 184', markup: MOSQUE },
  compass: { viewBox: '0 0 200 200', markup: COMPASS },
  calendar: { viewBox: '0 0 200 200', markup: CALENDAR },
  sound: { viewBox: '0 0 220 200', markup: SOUND },
  shield: { viewBox: '0 0 200 200', markup: SHIELD },
};

export function illustration(name: IllustrationName, className = 'illus'): SVGSVGElement {
  const entry = MARKUP[name];
  return makeSvg(entry.viewBox, entry.markup, `${className} illus-${name}`);
}

/** Decorative layer: always hidden from assistive tech and from pointer events. */
export function decorativeArt(name: IllustrationName, className: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.appendChild(illustration(name, 'illus'));
  return wrap;
}
