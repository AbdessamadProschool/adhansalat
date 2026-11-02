/**
 * Sounds and Adhan screen.
 *
 * Three synthesised test chimes, one verified CC0 Adhan and the user's own
 * imports are playable. The CC0 recording is shipped (`public/audio/adhan/`) and
 * is the default sound for a new installation; its provenance and licence are
 * shown in a dedicated credits card.
 *
 * The eight recordings supplied to the project are listed separately, with their
 * measured duration and size, and are explicitly marked as **not included**:
 * their redistribution licence is not established. They are never offered as a
 * preview and never assigned to a prayer, so the UI cannot promise a sound that
 * the build refuses to ship.
 *
 * Users may import their own recording; it is stored as a Blob in IndexedDB
 * (plus a native copy) and never leaves the device.
 */

import { PRAYER_KEYS, type PrayerKey } from '../../core/types.js';
import type { AppContext } from '../context.js';
import type { MessageKey } from '../i18n.js';
import { deleteAudioFile, putAudioFile } from '../audio.js';
import { CC0_ADHAN_TRACK } from '../audio-catalog.js';
import { BUILTIN_SOUNDS, type SoundMeta } from '../store.js';
import { nativeBridge } from '../notifications.js';
import { alertBox, el, emptyState, icon, pill, segmented, stepper, switchRow, toast } from '../ui.js';

const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.flac'];
const MAX_BYTES = 30 * 1024 * 1024;

/** `m:ss` for a supplied recording; empty when the duration is unknown. */
function durationLabel(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function soundRow(ctx: AppContext, sound: SoundMeta): HTMLElement {
  const playing = ctx.player.currentId === sound.id;
  const usedBy = PRAYER_KEYS.filter((key) => {
    const settings = ctx.store.get();
    const pref = settings.prayers[key];
    if (key === 'fajr' && settings.fajrSoundOverride === sound.id) return true;
    return pref.soundId === sound.id;
  });

  const equalizer = playing
    ? el(
        'span',
        { class: 'sound-waveform-bars', attrs: { 'aria-hidden': 'true' } },
        el('span'),
        el('span'),
        el('span'),
      )
    : null;

  return el(
    'div',
    { class: `row ${playing ? 'is-playing' : ''}` },
    el('span', { class: 'prayer-icon' }, icon(playing ? 'soundWave' : 'speaker', 18)),
    el(
      'span',
      { class: 'grow' },
      el('span', { class: 'row align-center' }, el('strong', { text: sound.name }), equalizer),
      el('span', {
        text:
          sound.kind === 'imported'
            ? `${(((sound.size ?? 0) / 1024) | 0)} Ko · ${sound.mime ?? ''}`
            : sound.source === 'cc0'
              ? `${durationLabel(sound.durationSec)} · ${ctx.t('adhan.cc0')}`
              : sound.source === 'supplied'
                ? `${durationLabel(sound.durationSec)} · ${ctx.t('adhan.supplied')}`
                : ctx.t('adhan.demo'),
      }),
      usedBy.length > 0
        ? el('span', {
            class: 'chip',
            attrs: { style: 'margin-top:4px' },
            text: usedBy.map((k) => ctx.t(`prayer.${k}` as MessageKey)).join(' · '),
          })
        : null,
    ),
    el(
      'button',
      {
        class: playing ? 'btn sm primary' : 'btn sm',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            if (playing) {
              ctx.player.stop();
              toast(ctx.t('adhan.stopped'));
              ctx.refresh();
              return;
            }
            try {
              await ctx.player.play(sound.id);
              toast(ctx.t('adhan.testOk'));
            } catch (err) {
              toast(`${ctx.t('adhan.testFail')} ${err instanceof Error ? err.message : ''}`);
            }
            ctx.refresh();
          },
        },
      },
      icon(playing ? 'pause' : 'play', 16),
      playing ? ctx.t('common.stop') : ctx.t('common.preview'),
    ),
    sound.kind === 'imported'
      ? el(
          'button',
          {
            class: 'icon-btn danger',
            attrs: { type: 'button', 'aria-label': ctx.t('adhan.deleteSound') },
            on: {
              click: async () => {
                await deleteAudioFile(sound.id).catch(() => undefined);
                try {
                  nativeBridge()?.deleteImportedSound?.(sound.id);
                } catch {
                  /* native cleanup is best-effort; the web copy is already gone */
                }
                ctx.store.update((d) => {
                  d.sounds = d.sounds.filter((s) => s.id !== sound.id);
                  if (d.fajrSoundOverride === sound.id) d.fajrSoundOverride = null;
                  for (const key of PRAYER_KEYS) {
                    if (d.prayers[key].soundId === sound.id) d.prayers[key].soundId = 'chime-calm';
                  }
                });
                ctx.engine.replan('sound-deleted');
                ctx.refresh();
              },
            },
          },
          icon('trash', 17),
        )
      : null,
  );
}

const PRAYER_ICON: Record<PrayerKey, string> = {
  fajr: 'moon',
  dhuhr: 'sun',
  asr: 'sun',
  maghrib: 'sun',
  isha: 'moon',
};

export function soundsScreen(ctx: AppContext): HTMLElement {
  const t = ctx.t;
  const settings = ctx.store.get();
  const root = el('div', { class: 'screen' });

  root.append(
    el('div', {}, el('h1', { text: t('adhan.title') }), el('p', { class: 'small muted', text: t('adhan.subtitle') })),
  );

  // ---------------------------------------------------------------- library
  const library = el('div', { class: 'card' });
  library.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('adhan.sounds') }),
      el('span', {
        class: 'chip',
        text: String(BUILTIN_SOUNDS.filter((s) => s.id !== 'none').length + settings.sounds.length),
      }),
    ),
  );
  const list = el('div', { class: 'stack sm' });
  for (const sound of BUILTIN_SOUNDS) {
    if (sound.id === 'none') continue;
    list.appendChild(soundRow(ctx, sound));
  }
  for (const sound of settings.sounds) list.appendChild(soundRow(ctx, sound));
  library.appendChild(list);

  if (settings.sounds.length === 0) {
    library.append(
      emptyState({
        art: 'sound',
        title: t('adhan.noImported'),
        body: t('adhan.noImportedDesc'),
      }),
    );
  }

  // ---------------------------------------------------------------- import
  const fileInput = el('input', {
    attrs: { type: 'file', accept: 'audio/*', style: 'display:none', 'aria-hidden': 'true' },
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const looksAudio = file.type.startsWith('audio/') || ACCEPTED_EXTENSIONS.includes(ext);
    if (!looksAudio) {
      toast(t('adhan.unsupportedFormat'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast(`${t('error.audio')} ${Math.round(file.size / 1024 / 1024)} Mo > 30 Mo`);
      return;
    }
    const id = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      await putAudioFile(id, file);
      // Inside the Android wrapper the native alarm player cannot read IndexedDB.
      // Ask the bridge to copy the file the user just picked into the app's
      // private storage under the same id, so web playback and native alarms use
      // one identity. If the copy fails, the import is kept for the web app but
      // reported honestly instead of promising a native sound.
      let nativeCopy = true;
      const bridge = nativeBridge();
      if (bridge?.importSound) {
        try {
          const raw = bridge.importSound(id, file.name);
          const res = raw ? (JSON.parse(raw) as { ok?: boolean; reason?: string }) : null;
          nativeCopy = res?.ok === true;
          if (!nativeCopy) {
            ctx.store.log('warn', 'audio.native.import', res?.reason ?? 'native copy unavailable');
          }
        } catch (err) {
          nativeCopy = false;
          ctx.store.log('warn', 'audio.native.import', String(err));
        }
      }
      ctx.store.update((d) => {
        d.sounds = [
          ...d.sounds,
          {
            id,
            name: file.name,
            kind: 'imported',
            mime: file.type || 'audio/*',
            size: file.size,
            createdAt: Date.now(),
          },
        ];
      });
      toast(nativeCopy ? t('adhan.imported') : t('adhan.nativeCopyFailed'));
      ctx.engine.replan('audio-import');
      ctx.refresh();
    } catch (err) {
      toast(`${t('error.audio')} ${err instanceof Error ? err.message : ''}`);
    }
  });

  library.append(
    el(
      'div',
      { class: 'btn-row', attrs: { style: 'margin-top:12px' } },
      el(
        'button',
        { class: 'btn sm', attrs: { type: 'button' }, on: { click: () => fileInput.click() } },
        icon('download', 17),
        t('adhan.import'),
      ),
      fileInput,
    ),
    el('p', { class: 'tiny muted', attrs: { style: 'margin-top:6px' }, text: t('adhan.importHint') }),
    alertBox('info', t('adhan.legalDisclaimer'), ''),
    el('p', { class: 'tiny muted', text: t('adhan.volume') }),
  );

  // ------------------------------------------------------------- CC0 credits
  // The bundled recording is redistributable under CC0. Attribution is not
  // required by the licence, but the provenance must stay visible: title,
  // author, project, licence and the exact shipped file.
  const creditCard = el('div', { class: 'card' });
  creditCard.append(
    el(
      'div',
      { class: 'card-head' },
      el('h2', { text: t('adhan.creditTitle') }),
      pill('CC0 1.0', 'ok', 'check'),
    ),
    el('p', {
      class: 'small',
      text: t('adhan.creditAuthor', {
        title: CC0_ADHAN_TRACK.title,
        author: CC0_ADHAN_TRACK.author,
        project: CC0_ADHAN_TRACK.sourceProject,
      }),
    }),
    el('p', {
      class: 'tiny muted',
      text: t('adhan.creditLicense', { license: CC0_ADHAN_TRACK.license }),
    }),
    el(
      'p',
      { class: 'tiny muted' },
      el('span', { text: t('adhan.creditSourceLabel') }),
      ' ',
      el('a', {
        attrs: {
          href: CC0_ADHAN_TRACK.sourcePage,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        text: CC0_ADHAN_TRACK.sourcePage,
      }),
      ' · ',
      el('a', {
        attrs: {
          href: CC0_ADHAN_TRACK.licenseUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        text: CC0_ADHAN_TRACK.licenseUrl,
      }),
    ),
    el('p', {
      class: 'tiny muted',
      text: t('adhan.creditFile', {
        format: CC0_ADHAN_TRACK.format,
        duration: durationLabel(CC0_ADHAN_TRACK.durationSec),
        size: String(Math.round(CC0_ADHAN_TRACK.bytes / 1024)),
      }),
    }),
  );
  root.append(creditCard);

  // ---------------------------------------------------------------- fajr override
  const fajrCard = el('div', { class: 'card' });
  const fajrSelect = el('select', { attrs: { 'aria-label': t('adhan.fajrSound') } });
  fajrSelect.appendChild(el('option', { text: t('adhan.sameAsOthers'), attrs: { value: '' } }));
  for (const sound of [...BUILTIN_SOUNDS, ...settings.sounds]) {
    if (sound.id === 'none') continue;
    fajrSelect.appendChild(
      el('option', {
        text: sound.name,
        attrs: { value: sound.id, selected: settings.fajrSoundOverride === sound.id },
      }),
    );
  }
  fajrSelect.addEventListener('change', () => {
    ctx.store.update((d) => {
      d.fajrSoundOverride = fajrSelect.value || null;
    });
    ctx.engine.replan('fajr-sound');
    ctx.refresh();
  });
  fajrCard.append(
    el('div', { class: 'card-head' }, el('h2', { text: t('adhan.fajrSound') })),
    el('div', { class: 'field' }, el('label', { text: t('adhan.fajrSound') }), fajrSelect),
    el('p', { class: 'tiny muted', text: t('adhan.perPrayer') }),
  );

  // ---------------------------------------------------------------- per prayer
  const perPrayer = el('div', { class: 'stack sm' });
  perPrayer.append(
    el(
      'div',
      { class: 'section-head' },
      el('h2', { class: 'section-title', text: t('adhan.perPrayer') }),
    ),
  );

  let activeSoundPrayer: PrayerKey = 'fajr';
  const perPrayerCard = el('div', { class: 'card' });

  function renderPerPrayerCard(): void {
    const currentSettings = ctx.store.get();
    const pref = currentSettings.prayers[activeSoundPrayer];

    const prayerTabs = segmented<PrayerKey>(
      activeSoundPrayer,
      PRAYER_KEYS.map((k) => ({
        value: k,
        label: t(`prayer.${k}` as MessageKey),
        glyph: PRAYER_ICON[k],
      })),
      (next: PrayerKey) => {
        activeSoundPrayer = next;
        renderPerPrayerCard();
      },
    );

    const head = el(
      'div',
      { class: 'row-between align-center', attrs: { style: 'margin-block: var(--space-2);' } },
      el(
        'div',
        { class: 'row align-center gap-xs' },
        el('span', { class: 'prayer-icon' }, icon(PRAYER_ICON[activeSoundPrayer], 17)),
        el('h2', { class: 'h3', text: t(`prayer.${activeSoundPrayer}` as MessageKey) }),
      ),
      pill(
        pref.enabled ? t('common.on') : t('common.off'),
        pref.enabled ? 'ok' : 'muted',
        pref.enabled ? 'check' : 'bellOff',
      ),
    );

    const select = el('select', { attrs: { 'aria-label': t('adhan.audio'), disabled: !pref.audioEnabled } });
    for (const sound of [...BUILTIN_SOUNDS, ...currentSettings.sounds]) {
      select.appendChild(
        el('option', {
          text: sound.id === 'none' ? t('adhan.silent') : sound.name,
          attrs: { value: sound.id, selected: sound.id === pref.soundId },
        }),
      );
    }
    select.addEventListener('change', () => {
      ctx.store.update((d) => {
        d.prayers[activeSoundPrayer].soundId = select.value;
      });
      ctx.engine.replan('sound');
      ctx.refresh();
      renderPerPrayerCard();
    });

    const body = el(
      'div',
      { class: 'stack sm' },
      switchRow(
        t('adhan.enabled'),
        null,
        pref.enabled,
        (next) => {
          ctx.store.update((d) => {
            d.prayers[activeSoundPrayer].enabled = next;
          });
          ctx.engine.replan('preference');
          ctx.refresh();
          renderPerPrayerCard();
        },
        'bell',
      ),
      switchRow(
        t('adhan.audio'),
        t('adhan.notificationOnly'),
        pref.audioEnabled,
        (next) => {
          ctx.store.update((d) => {
            d.prayers[activeSoundPrayer].audioEnabled = next;
          });
          ctx.engine.replan('preference');
          ctx.refresh();
          renderPerPrayerCard();
        },
        'speaker',
      ),
      el(
        'div',
        { class: 'field' },
        el('label', { text: t('adhan.audio') }),
        select,
      ),
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
              d.prayers[activeSoundPrayer].preReminderMinutes = v;
            });
            ctx.engine.replan('preference');
            ctx.refresh();
            renderPerPrayerCard();
          },
        }),
      ),
      switchRow(
        t('adhan.vibration'),
        null,
        pref.vibration,
        (next) => {
          ctx.store.update((d) => {
            d.prayers[activeSoundPrayer].vibration = next;
          });
          ctx.refresh();
          renderPerPrayerCard();
        },
        'vibrate',
      ),
    );

    const detailContainer = el('div', { class: 'stack tab-glider' }, head, body);
    perPrayerCard.replaceChildren(prayerTabs, detailContainer);
  }

  renderPerPrayerCard();
  perPrayer.appendChild(perPrayerCard);

  root.append(library, fajrCard, perPrayer);
  return root;
}
