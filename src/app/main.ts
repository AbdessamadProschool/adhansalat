/**
 * Application shell: store, alarm engine, hash router, navigation.
 *
 * Rendering is a full re-render of `#app` on every state change. At this size it
 * is cheaper than a diffing layer and it guarantees that no screen can display a
 * stale prayer time after a location or method change.
 */

import { createTranslator, dirFor, intlLocale, type Locale } from './i18n.js';
import { SettingsStore } from './store.js';
import { AlarmEngine } from './alarm-engine.js';
import { adhanPlayer } from './audio.js';
import { closeSheet, el, icon, openSheet } from './ui.js';
import { nativeBridge, registerServiceWorker } from './notifications.js';
import type { AppContext, Route } from './context.js';
import { homeScreen } from './screens/home.js';
import { calendarScreen } from './screens/calendar.js';
import { qiblaScreen } from './screens/qibla.js';
import { methodsScreen } from './screens/methods.js';
import { tasbihScreen } from './screens/tasbih.js';
import { soundsScreen } from './screens/sounds.js';
import { diagnosticsScreen } from './screens/diagnostics.js';
import { settingsScreen } from './screens/settings.js';
import { onboardingScreen } from './screens/onboarding.js';
import { alertBox } from './ui.js';

const store = new SettingsStore();
const engine = new AlarmEngine(store, adhanPlayer);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const cleanups: Array<() => void> = [];
let renderQueued = false;
let isInitialRender = true;

const SCREENS: Record<Exclude<Route, 'onboarding'>, (ctx: AppContext) => HTMLElement> = {
  home: homeScreen,
  calendar: calendarScreen,
  qibla: qiblaScreen,
  tasbih: tasbihScreen,
  adhan: soundsScreen,
  methods: methodsScreen,
  settings: settingsScreen,
  diagnostics: diagnosticsScreen,
};

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (raw === 'onboarding') return 'onboarding';
  if (raw === 'calendar' || raw === 'qibla' || raw === 'tasbih' || raw === 'adhan' || raw === 'methods' || raw === 'settings' || raw === 'diagnostics') {
    return raw;
  }
  return 'home';
}

function applyTheme(theme: string): void {
  const root = document.documentElement;
  const resolved = theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : theme;
  root.dataset.theme = resolved === 'dark' ? 'dark' : 'light';
  root.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0C1512' : '#F7F8F4');
}

function scheduleRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  // rAF keeps the render in sync with the frame, but an occluded or hidden window
  // can defer it indefinitely. The timer guarantees delivery so the UI never
  // stays stale after a settings change; whichever fires first wins.
  const run = () => {
    if (!renderQueued) return;
    renderQueued = false;
    render();
  };
  const frame = requestAnimationFrame(run);
  setTimeout(() => {
    cancelAnimationFrame(frame);
    run();
  }, 150);
}

function render(): void {
  for (const fn of cleanups.splice(0)) {
    try {
      fn();
    } catch {
      /* a cleanup must never break the next render */
    }
  }

  const settings = store.get();
  const locale = settings.locale;
  const t = createTranslator(locale);
  const intl = intlLocale(locale);

  document.documentElement.lang = locale;
  document.documentElement.dir = dirFor(locale);
  applyTheme(settings.theme);

  // The skip link lives outside `#app`, so it is not rebuilt on each render.
  const skipLink = document.querySelector<HTMLAnchorElement>('.skip-link');
  if (skipLink) skipLink.textContent = t('a11y.skip');

  const hashRoute = parseRoute();
  const route: Route = !settings.onboarded
    ? hashRoute === 'onboarding'
      ? 'onboarding'
      : 'onboarding'
    : hashRoute === 'onboarding'
      ? 'home'
      : hashRoute;

  document.documentElement.dataset.route = route;

  const ctx: AppContext = {
    store,
    engine,
    player: adhanPlayer,
    t,
    locale,
    intl,
    route,
    navigate(next) {
      const target = `#/${next}`;
      if (window.location.hash === target) scheduleRender();
      else window.location.hash = target;
    },
    refresh: scheduleRender,
    toast,
    sheet(title, build) {
      openSheet({ title, closeLabel: t('common.close') }, build);
    },
    setLocale(next: Locale) {
      try {
        localStorage.setItem('azan.locale', next);
      } catch {
        /* language still applies for this session */
      }
      store.update((draft) => {
        draft.locale = next;
      });
    },
    registerCleanup(fn) {
      cleanups.push(fn);
    },
  };

  const app = document.getElementById('app');
  if (!app) return;

  const performRender = () => {
    app.replaceChildren();

    const main = el('main', { class: 'app-main page-enter', attrs: { id: 'main' } });

    try {
      main.appendChild(route === 'onboarding' ? onboardingScreen(ctx) : SCREENS[route](ctx));
    } catch (err) {
      main.appendChild(
        alertBox('bad', t('error.engine'), err instanceof Error ? `${err.message}` : String(err)),
      );
    }

    if (route !== 'onboarding') {
      const banner = activeAdhanBanner(ctx);
      if (banner) {
        app.append(topbar(ctx), banner, main, bottomNav(ctx));
      } else {
        app.append(topbar(ctx), main, bottomNav(ctx));
      }
    } else {
      app.append(main);
    }
  };

  const hasViewTransition =
    !isInitialRender &&
    typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (hasViewTransition) {
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(performRender);
  } else {
    performRender();
  }
  isInitialRender = false;

  // Keep the document title in sync with the language without re-downloading it.
  const titleKey =
    route === 'onboarding'
      ? 'app.loading'
      : route === 'diagnostics'
        ? 'diag.title'
        : `nav.${route}`;
  document.title =
    route === 'onboarding'
      ? `${t('app.name')} — ${t('onboard.step1.title')}`
      : `${t('app.name')} — ${t(titleKey as 'nav.home')}`;
}

function activeAdhanBanner(ctx: AppContext): HTMLElement | null {
  const isNativePlaying = Boolean(nativeBridge()?.isAdhanPlaying?.());
  const isWebPlaying = Boolean(ctx.player.currentId);
  if (!isNativePlaying && !isWebPlaying) return null;

  const t = ctx.t;
  return el(
    'div',
    { class: 'active-adhan-bar', attrs: { role: 'alert', 'aria-live': 'assertive' } },
    el(
      'div',
      { class: 'active-adhan-info' },
      el('span', { class: 'active-adhan-pulse' }),
      el('span', { class: 'active-adhan-text', text: t('adhan.active') }),
    ),
    el(
      'button',
      {
        class: 'active-adhan-stop-btn',
        attrs: { type: 'button' },
        on: {
          click: () => {
            nativeBridge()?.stopAdhan?.();
            ctx.player.stop();
            ctx.toast(t('adhan.stopped'));
            scheduleRender();
          },
        },
      },
      icon('volume-x'),
      el('span', { text: t('adhan.stopNow') }),
    ),
  );
}

function topbar(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const currentTheme = ctx.store.get().theme;
  const isDark =
    currentTheme === 'dark' ||
    (currentTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const themeBtn = el(
    'button',
    {
      class: 'icon-btn',
      attrs: {
        type: 'button',
        'aria-label': isDark ? t('settings.theme.light') : t('settings.theme.dark'),
        'data-tip': isDark ? t('settings.theme.light') : t('settings.theme.dark'),
      },
      on: {
        click: () => {
          const next = isDark ? 'light' : 'dark';
          ctx.store.update((d) => {
            d.theme = next;
          });
          document.documentElement.dataset.theme = next;
          ctx.refresh();
        },
      },
    },
    icon(isDark ? 'sun' : 'moon', 20),
  );

  return el(
    'header',
    { class: 'topbar' },
    el('img', { attrs: { src: '/icons/icon-192.png', alt: '', width: 38, height: 38 } }),
    el(
      'span',
      { class: 'brand' },
      el('strong', { text: t('app.name') }),
      el('span', { text: t('app.tagline') }),
    ),
    el('span', { class: 'spacer' }),
    themeBtn,
  );
}

function bottomNav(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const items: Array<{ route: Route; glyph: string; label: string }> = [
    { route: 'home', glyph: 'home', label: t('nav.home') },
    { route: 'calendar', glyph: 'calendar', label: t('nav.calendar') },
    { route: 'qibla', glyph: 'kaaba', label: t('nav.qibla') },
    { route: 'tasbih', glyph: 'beads', label: t('nav.tasbih') },
    { route: 'adhan', glyph: 'speaker', label: t('nav.adhan') },
    { route: 'settings', glyph: 'gear', label: t('nav.settings') },
  ];

  const list = el('ul', {});
  for (const item of items) {
    const current = ctx.route === item.route;
    list.appendChild(
      el(
        'li',
        {},
        el(
          'a',
          {
            attrs: {
              href: `#/${item.route}`,
              ...(current ? { 'aria-current': 'page' } : {}),
            },
          },
          icon(item.glyph, 22),
          el('span', { text: item.label }),
          el('span', { class: 'nav-dot', attrs: { 'aria-hidden': 'true' } }),
        ),
      ),
    );
  }

  return el('nav', { class: 'bottom-nav', attrs: { 'aria-label': t('a11y.mainNav') } }, list);
}

function toast(message: string): void {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  window.clearTimeout((toast as unknown as { _t?: number })._t);
  (toast as unknown as { _t?: number })._t = window.setTimeout(() => {
    node.hidden = true;
  }, 3600);
}

// ------------------------------------------------------------------ boot

// A single decorative layer lives outside `#app` so no screen re-render can
// leave a stale copy behind. It is an empty element: the Moroccan zellige field
// is a CSS mask built from the original `public/patterns/zellige.svg`, so it
// follows the theme and costs no DOM.
if (!document.querySelector('.ambient')) {
  const ambient = document.createElement('div');
  ambient.className = 'ambient';
  ambient.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(ambient, document.getElementById('app'));
}

darkQuery.addEventListener('change', () => {
  applyTheme(store.get().theme);
  scheduleRender();
});

store.subscribe(() => {
  // Any settings change invalidates the plan: times, sound, permissions, zone.
  engine.replan('settings');
  scheduleRender();
});

window.addEventListener('hashchange', () => {
  closeSheet();
  scheduleRender();
});

// The Android wrapper posts this after the user returns from a system permission
// screen (notifications, exact alarms, battery). Without it the diagnostics screen
// would keep showing the state it read when the page was first drawn.
window.addEventListener('azan:permissions-changed', () => {
  engine.replan('permissions');
  scheduleRender();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Timers and rAF may have been frozen while occluded; re-check due alarms and
  // repaint so the user never returns to a stale clock.
  engine.replan('visibility');
  scheduleRender();
});

window.addEventListener('focus', () => {
  scheduleRender();
});

let lastPlayingState = false;
setInterval(() => {
  const currentPlaying = Boolean(nativeBridge()?.isAdhanPlaying?.() || adhanPlayer.currentId);
  if (currentPlaying !== lastPlayingState) {
    lastPlayingState = currentPlaying;
    scheduleRender();
  }
}, 1000);

engine.start();
render();

if (import.meta.env.PROD) {
  void registerServiceWorker();
}

// A notification click is handled by the service worker (it focuses an existing
// window when there is one). When that is *this* window, it posts back so the
// app can land on the schedule instead of staying wherever it was.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const payload = event.data as { type?: string } | null;
    if (payload?.type === 'azan:notification-click') {
      window.location.hash = '#/home';
      scheduleRender();
    }
  });
}

// Expose nothing on window except what the Android wrapper needs to detect a
// healthy web layer. No diagnostics object, no debug hooks in production.
document.documentElement.dataset.azanReady = 'true';
