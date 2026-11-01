/**
 * Audio catalogue tests.
 *
 * Two sets with very different licence states:
 *
 *  - the eight recordings supplied to the project, whose licence is unknown, must
 *    never reach a shipped folder;
 *  - the verified CC0 recording « Beautiful adhan » (Wikimedia Commons) must be
 *    present, hash-pinned, playable and selected by default.
 *
 * These tests read the real filesystem, the real metadata, the service-worker
 * template and the Android mapping. They do not claim that a human heard the
 * recording: this environment has no audio output. The technical checks
 * (duration, decode, levels) are recorded in `audio-cc0/PROVENANCE.md`.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADHAN_TRACKS,
  AUDIO_CATALOG_GENERATED_AT,
  AUDIO_LICENSE,
  AUDIO_LOCAL_COPY_DIR,
  AUDIO_REDISTRIBUTION_OK,
  BUNDLED_ADHAN_TRACKS,
  CC0_ADHAN_TRACK,
  DEFAULT_SOUND_ID,
} from '../src/app/audio-catalog.js';
import {
  BUILTIN_SOUNDS,
  SOUND_URL,
  SettingsStore,
  defaultPreferences,
} from '../src/app/store.js';
import { STATIC_ASSETS } from '../src/pwa/sw-template.js';

const ROOT = process.cwd();
const EXPECTED_NUMBERS = [1, 2, 5, 6, 7, 9, 13, 14];
const CHIMES = ['chime-calm', 'chime-dawn', 'chime-alert'];
const CC0_PUBLIC = 'public/audio/adhan/adhan-cc0.mp3';
const CC0_ANDROID = 'android/app/src/main/res/raw/adhan_cc0.mp3';

function publicFile(publicPath: string): string {
  return join(ROOT, 'public', ...publicPath.split('/').filter(Boolean));
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function audioFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...audioFilesUnder(full));
    else if (/\.(mp3|m4a|aac|opus|flac)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

describe('supplied Adhan catalogue (licence unknown)', () => {
  it('contains exactly the eight supplied recordings', () => {
    expect(ADHAN_TRACKS.map((track) => track.number).sort((a, b) => a - b)).toEqual(EXPECTED_NUMBERS);
    expect(ADHAN_TRACKS).toHaveLength(8);
    expect(AUDIO_CATALOG_GENERATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('has unique, stable ids', () => {
    const ids = ADHAN_TRACKS.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const track of ADHAN_TRACKS) {
      expect(track.id).toBe(`adhan-${track.number}`);
      expect(track.androidRaw).toBe(`adhan_${track.number}`);
      expect(track.sourceName).toBe(`azan${track.number}.mp3`);
    }
  });

  it('marks every supplied track as not bundled while redistribution is unauthorised', () => {
    expect(AUDIO_REDISTRIBUTION_OK).toBe(false);
    for (const track of ADHAN_TRACKS) {
      expect(track.bundled, `${track.id} must not be bundled`).toBe(false);
    }
  });

  it('keeps a real cleaned copy outside the shipped tree', () => {
    expect(AUDIO_LOCAL_COPY_DIR).toBe('audio-cleaned/');
    for (const track of ADHAN_TRACKS) {
      expect(track.localCopy.startsWith('audio-cleaned/')).toBe(true);
      const path = join(ROOT, ...track.localCopy.split('/'));
      expect(existsSync(path), `missing ${track.localCopy}`).toBe(true);
      const bytes = readFileSync(path).byteLength;
      expect(bytes).toBe(track.bytes);
      expect(bytes).toBeGreaterThan(100_000);
      expect(track.durationSec).toBeGreaterThan(60);
      expect(track.sampleRate).toBeGreaterThan(0);
    }
  });
});

describe('verified CC0 recording', () => {
  it('is the only bundled track and declares its licence', () => {
    expect(BUNDLED_ADHAN_TRACKS).toHaveLength(1);
    expect(CC0_ADHAN_TRACK.id).toBe('adhan-cc0');
    expect(CC0_ADHAN_TRACK.bundled).toBe(true);
    expect(CC0_ADHAN_TRACK.redistributionAuthorized).toBe(true);
    expect(CC0_ADHAN_TRACK.license).toBe('CC0-1.0');
    expect(CC0_ADHAN_TRACK.licenseUrl).toContain('creativecommons.org/publicdomain/zero/1.0');
    expect(CC0_ADHAN_TRACK.title).toBe('Beautiful adhan');
    expect(CC0_ADHAN_TRACK.author).toBe('Adam-synagda');
    expect(CC0_ADHAN_TRACK.sourcePage).toContain('commons.wikimedia.org');
    expect(CC0_ADHAN_TRACK.attribution.length).toBeGreaterThan(20);
  });

  it('ships a complete MP3 whose hash, size and duration match the metadata', () => {
    const path = join(ROOT, ...CC0_PUBLIC.split('/'));
    expect(existsSync(path), `missing ${CC0_PUBLIC}`).toBe(true);
    const bytes = readFileSync(path).byteLength;
    expect(bytes).toBe(CC0_ADHAN_TRACK.bytes);
    expect(bytes).toBeGreaterThan(1_000_000);
    expect(sha256(path)).toBe(CC0_ADHAN_TRACK.sha256);
    expect(CC0_ADHAN_TRACK.durationSec).toBeGreaterThan(150);
    expect(CC0_ADHAN_TRACK.durationSec).toBeLessThan(160);
    expect(CC0_ADHAN_TRACK.format).toContain('MP3');
    expect(CC0_ADHAN_TRACK.sampleRate).toBe(44100);
  });

  it('has a byte-identical Android copy', () => {
    const path = join(ROOT, ...CC0_ANDROID.split('/'));
    expect(existsSync(path), `missing ${CC0_ANDROID}`).toBe(true);
    expect(readFileSync(path).byteLength).toBe(CC0_ADHAN_TRACK.bytes);
    expect(sha256(path)).toBe(CC0_ADHAN_TRACK.sha256);
  });

  it('keeps the source OGG outside the shipped tree', () => {
    const source = join(ROOT, 'audio-cc0', 'Beautiful_adhan.ogg');
    expect(existsSync(source)).toBe(true);
    expect(existsSync(join(ROOT, 'audio-cc0', 'PROVENANCE.md'))).toBe(true);
  });
});

describe('nothing unauthorised is shipped', () => {
  it('allows only the CC0 MP3 under public/', () => {
    const files = audioFilesUnder(join(ROOT, 'public')).map((file) =>
      file.slice(ROOT.length + 1).replaceAll('\\', '/'),
    );
    expect(files).toEqual([CC0_PUBLIC]);
  });

  it('allows only the CC0 MP3 under android res/raw', () => {
    const files = audioFilesUnder(
      join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw'),
    ).map((file) => file.slice(ROOT.length + 1).replaceAll('\\', '/'));
    expect(files).toEqual([CC0_ANDROID]);
  });

  it('precaches the CC0 recording and no supplied recording', () => {
    const adhanAssets = STATIC_ASSETS.filter((asset) => asset.startsWith('/audio/adhan/'));
    expect(adhanAssets).toEqual(['/audio/adhan/adhan-cc0.mp3']);
    expect(STATIC_ASSETS).toContain('/patterns/zellige.svg');
  });

  it('passes the release-asset guard', () => {
    const output = execFileSync(process.execPath, ['scripts/check-release-assets.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('release-assets: OK');
  });
});

describe('sound id table', () => {
  it('resolves the CC0 recording and the chimes, never a supplied recording', () => {
    expect(Object.keys(SOUND_URL).sort()).toEqual(['adhan-cc0', ...CHIMES].sort());
    for (const track of ADHAN_TRACKS) {
      expect(SOUND_URL[track.id]).toBeUndefined();
    }
  });

  it('offers the CC0 recording first, then the chimes, then "none"', () => {
    expect(BUILTIN_SOUNDS.map((entry) => entry.id)).toEqual([
      'adhan-cc0',
      ...CHIMES,
      'none',
    ]);
    expect(BUILTIN_SOUNDS[0]?.source).toBe('cc0');
    expect(BUILTIN_SOUNDS[0]?.durationSec).toBeGreaterThan(150);
    const chimes = BUILTIN_SOUNDS.filter((entry) => entry.id.startsWith('chime-'));
    expect(chimes.every((entry) => entry.source === 'synthetic')).toBe(true);
    expect(BUILTIN_SOUNDS.some((entry) => entry.source === 'supplied')).toBe(false);
  });

  it('selects the CC0 recording by default for every prayer', () => {
    expect(DEFAULT_SOUND_ID).toBe('adhan-cc0');
    const prefs = defaultPreferences();
    for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
      expect(prefs[key].soundId).toBe('adhan-cc0');
      expect(prefs[key].audioEnabled).toBe(true);
    }
  });

  it('has no phantom sound: every built-in id but "none" maps to an existing file', () => {
    for (const sound of BUILTIN_SOUNDS) {
      if (sound.id === 'none') continue;
      const url = SOUND_URL[sound.id];
      expect(url, `no URL for ${sound.id}`).toBeTruthy();
      expect(existsSync(publicFile(url!)), `missing ${url}`).toBe(true);
    }
  });
});

describe('native integration', () => {
  it('maps the CC0 recording and the three chimes in Sounds.kt', () => {
    const kotlin = readFileSync(
      join(ROOT, 'android', 'app', 'src', 'main', 'java', 'app', 'azan', 'global', 'Sounds.kt'),
      'utf8',
    );
    expect(kotlin).toContain('"adhan-cc0" -> R.raw.adhan_cc0');
    for (const id of CHIMES) {
      expect(kotlin).toContain(`"${id}" -> R.raw.${id.replace('chime-', 'chime_')}`);
    }
    expect(kotlin).not.toMatch(/R\.raw\.adhan_\d|"adhan-\d+"/);
  });

  it('copies the CC0 MP3 into the APK raw resources at build time', () => {
    const gradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle.kts'), 'utf8');
    // The CC0 file lives in `public/audio/adhan/` on the web side but Android
    // resources cannot be nested: it must be copied from its own root so that
    // `R.raw.adhan_cc0` resolves.
    expect(gradle).toMatch(/from\(audioSource\.dir\("adhan"\)\)\s*\{\s*include\("adhan-cc0\.mp3"\)\s*\}/);
    expect(gradle).not.toContain('include("*.wav", "adhan/adhan-cc0.mp3")');
    expect(gradle).toContain('noCompress += listOf("wav", "mp3")');
  });

  it('keeps the supplied originals archived outside the shipped folders', () => {
    for (const track of ADHAN_TRACKS) {
      const original = join(ROOT, 'audio-originals', track.sourceName);
      expect(existsSync(original), `original ${track.sourceName} not archived`).toBe(true);
    }
    expect(existsSync(join(ROOT, 'audio-originals', 'README.md'))).toBe(true);
  });
});

describe('licence state is stated, not assumed', () => {
  it('records the supplied licence as unknown', () => {
    expect(AUDIO_LICENSE.license).toBe('unknown');
    expect(AUDIO_REDISTRIBUTION_OK).toBe(false);
    expect(AUDIO_LICENSE.redistributionAuthorized).toBe(false);
    expect(AUDIO_LICENSE.tagArtist).toBe('www.islamcan.com');
    expect(AUDIO_LICENSE.note.length).toBeGreaterThan(40);
  });

  it('records CC0 as a published licence, not a legal guarantee', () => {
    expect(CC0_ADHAN_TRACK.license).toBe('CC0-1.0');
    expect(CC0_ADHAN_TRACK.licenseName).toContain('Public Domain Dedication');
    expect(CC0_ADHAN_TRACK.attributionRequired).toBe(false);
  });
});

describe('stored preferences migrate away from unplayable sounds', () => {
  const STORAGE_KEY = 'azan.settings.v1';

  function readWith(stored: unknown) {
    const map = new Map<string, string>([[STORAGE_KEY, JSON.stringify(stored)]]);
    const stub = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    };
    const previous = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = stub;
    try {
      return new SettingsStore().get();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = previous;
    }
  }

  it('replaces a supplied Adhan id saved by an older build', () => {
    const settings = readWith({
      prayers: {
        fajr: { soundId: 'adhan-1' },
        dhuhr: { soundId: 'adhan-13' },
        asr: { soundId: 'chime-alert' },
        maghrib: { soundId: 'none' },
      },
      fajrSoundOverride: 'adhan-14',
    });
    expect(settings.prayers.fajr.soundId).toBe('chime-dawn');
    expect(settings.prayers.dhuhr.soundId).toBe('chime-calm');
    expect(settings.prayers.asr.soundId).toBe('chime-alert');
    expect(settings.prayers.maghrib.soundId).toBe('none');
    expect(settings.fajrSoundOverride).toBeNull();
  });

  it('keeps the CC0 recording when it was already selected', () => {
    const settings = readWith({
      prayers: {
        fajr: { soundId: 'adhan-cc0' },
        dhuhr: { soundId: 'adhan-cc0' },
      },
      fajrSoundOverride: 'adhan-cc0',
    });
    expect(settings.prayers.fajr.soundId).toBe('adhan-cc0');
    expect(settings.prayers.dhuhr.soundId).toBe('adhan-cc0');
    expect(settings.fajrSoundOverride).toBe('adhan-cc0');
  });

  it('keeps an imported sound that is still registered', () => {
    const settings = readWith({
      prayers: { isha: { soundId: 'imported-42' } },
      sounds: [
        { id: 'imported-42', name: 'my-adhan.mp3', kind: 'imported', mime: 'audio/mpeg', size: 1024 },
      ],
      fajrSoundOverride: 'imported-42',
    });
    expect(settings.prayers.isha.soundId).toBe('imported-42');
    expect(settings.fajrSoundOverride).toBe('imported-42');
  });

  it('replaces a sound whose import was deleted', () => {
    const settings = readWith({
      prayers: { isha: { soundId: 'imported-gone' } },
      sounds: [],
    });
    expect(settings.prayers.isha.soundId).toBe('chime-calm');
  });
});
