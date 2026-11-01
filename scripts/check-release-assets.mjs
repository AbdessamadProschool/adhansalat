/**
 * Release asset guard.
 *
 * Runs before `vite build` (see `package.json`) and refuses to produce a bundle
 * that contains audio the project is not allowed to redistribute.
 *
 * Checks:
 *  1. shipped folders (`public/`, Android `res/raw/`) contain no audio file
 *     except the exact, hash-pinned CC0 recording;
 *  2. a shipped MP3 must be byte-identical to the verified one (SHA-256);
 *  3. the CC0 metadata says CC0, `bundled: true` and
 *     `redistributionAuthorized: true`, with provenance and attribution;
 *  4. every supplied track is marked `bundled: false` while its
 *     `redistributionAuthorized` is `false`, and its cleaned copy still exists
 *     outside the shipped tree;
 *  5. `Sounds.kt` maps the verified id (`adhan-cc0`) and no supplied
 *     `adhan_<number>` resource;
 *  6. the service-worker template precaches exactly `/audio/adhan/adhan-cc0.mp3`
 *     and no other `/audio/adhan/` file.
 *
 * It is intentionally conservative: a false positive costs one deletion, a
 * false negative ships copyrighted worship audio.
 *
 * Usage: node scripts/check-release-assets.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const notes = [];

function rel(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The only audio files allowed in a shipped tree, relative to the repo root. */
const METADATA_REL = 'src/core/data/adhan-cc0.json';
const METADATA_PATH = join(ROOT, ...METADATA_REL.split('/'));

let verified = null;
if (!existsSync(METADATA_PATH)) {
  failures.push(`${METADATA_REL} is missing: cannot authorise any shipped recording.`);
} else {
  verified = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));

  if (verified.license !== 'CC0-1.0') {
    failures.push(`CC0 metadata license must be "CC0-1.0", got "${verified.license}".`);
  }
  if (verified.bundled !== true || verified.redistributionAuthorized !== true) {
    failures.push('CC0 metadata must set bundled and redistributionAuthorized to true.');
  }
  for (const field of ['title', 'author', 'sourcePage', 'licenseUrl', 'attribution']) {
    if (!verified[field] || String(verified[field]).trim() === '') {
      failures.push(`CC0 metadata is missing ${field}.`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(verified.sha256 ?? '')) {
    failures.push('CC0 metadata has no lowercase SHA-256.');
  }
  if (!(verified.durationSec > 60)) {
    failures.push('CC0 metadata duration is implausibly short.');
  }
  if (!(verified.bytes > 100_000)) {
    failures.push('CC0 metadata size is implausibly small.');
  }
  notes.push(
    `verified CC0 track ${verified.id} (${verified.title}, ${verified.author}), ` +
      `${(verified.bytes / 1024 / 1024).toFixed(2)} MiB, sha256=${String(verified.sha256).slice(0, 12)}…`,
  );
}

const allowedAudio = new Map([
  [`public${verified?.publicPath ?? '/audio/adhan/adhan-cc0.mp3'}`, 'PWA'],
  [
    `android/app/src/main/res/raw/${verified?.androidRaw ?? 'adhan_cc0'}.mp3`,
    'Android raw resources',
  ],
]);
const seenAudio = new Set();

/** 1 + 2 — only the hash-pinned CC0 recording may appear in a shipped tree. */
const shippedRoots = [
  { label: 'PWA', dir: join(ROOT, 'public') },
  { label: 'Android raw resources', dir: join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw') },
];

for (const root of shippedRoots) {
  walk(root.dir, (file) => {
    if (!/\.(mp3|m4a|aac|opus|flac)$/i.test(file)) return;
    const path = rel(file);
    if (!allowedAudio.has(path)) {
      failures.push(
        `${root.label}: unauthorised audio file in a shipped folder — ${path}. ` +
          'Only the verified CC0 recording may be shipped; keep everything else in audio-cleaned/.',
      );
      return;
    }
    seenAudio.add(path);
    if (verified) {
      const bytes = statSync(file).size;
      if (bytes !== verified.bytes) {
        failures.push(`${path}: size ${bytes} does not match metadata ${verified.bytes}.`);
      }
      const digest = sha256(file);
      if (digest !== verified.sha256) {
        failures.push(`${path}: SHA-256 does not match the verified recording.`);
      }
    }
  });
}

for (const path of allowedAudio.keys()) {
  if (!seenAudio.has(path)) failures.push(`verified recording missing from shipped assets: ${path}`);
}

/** 3 + 4 — supplied catalogue must stay honest and keep its local copies. */
const catalogPath = join(ROOT, 'src', 'core', 'data', 'audio-catalog.json');
if (!existsSync(catalogPath)) {
  failures.push('src/core/data/audio-catalog.json is missing (run node scripts/process-audio.mjs).');
} else {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const authorized = catalog.redistributionAuthorized === true;
  const tracks = Array.isArray(catalog.tracks) ? catalog.tracks : [];
  if (tracks.length === 0) failures.push('audio-catalog.json contains no track.');

  for (const track of tracks) {
    if (!authorized && track.bundled === true) {
      failures.push(
        `track ${track.id} is marked bundled while redistributionAuthorized is false.`,
      );
    }
    const local = track.localCopy ?? `audio-cleaned/azan-${track.number}.mp3`;
    const localPath = join(ROOT, ...local.split('/'));
    if (!existsSync(localPath)) {
      failures.push(`cleaned copy missing for ${track.id}: ${local}`);
    } else if (statSync(localPath).size === 0) {
      failures.push(`cleaned copy is empty for ${track.id}: ${local}`);
    }
  }

  const localBytes = tracks.reduce((sum, track) => {
    const local = track.localCopy ?? `audio-cleaned/azan-${track.number}.mp3`;
    const localPath = join(ROOT, ...local.split('/'));
    return sum + (existsSync(localPath) ? statSync(localPath).size : 0);
  }, 0);

  notes.push(
    `${tracks.length} supplied track(s) catalogued, ` +
      `${(localBytes / 1024 / 1024).toFixed(2)} MiB kept in audio-cleaned/, ` +
      `redistributionAuthorized=${authorized}`,
  );
}

/** 5 — the Android mapping: verified id yes, supplied ids no. */
const soundsKt = join(ROOT, 'android', 'app', 'src', 'main', 'java', 'app', 'azan', 'global', 'Sounds.kt');
if (existsSync(soundsKt)) {
  const source = readFileSync(soundsKt, 'utf8');
  if (!/"adhan-cc0"\s*->\s*R\.raw\.adhan_cc0/.test(source)) {
    failures.push('Sounds.kt does not map "adhan-cc0" to R.raw.adhan_cc0.');
  }
  if (/R\.raw\.adhan_\d|"adhan-\d+"/.test(source)) {
    failures.push('Sounds.kt maps a supplied adhan_<number> resource (not shipped).');
  }
} else {
  failures.push('android/.../Sounds.kt is missing.');
}

/** 6 — precache exactly the verified recording, nothing else from /audio/adhan/. */
const swTemplate = join(ROOT, 'src', 'pwa', 'sw-template.ts');
if (existsSync(swTemplate)) {
  const source = readFileSync(swTemplate, 'utf8');
  const adhanPaths = [...source.matchAll(/['"](\/audio\/adhan\/[^'"]+)['"]/g)].map((m) => m[1]);
  const expected = '/audio/adhan/adhan-cc0.mp3';
  if (!adhanPaths.includes(expected)) {
    failures.push(`sw-template.ts does not precache ${expected}.`);
  }
  for (const path of adhanPaths) {
    if (path !== expected) failures.push(`sw-template.ts precaches unauthorised ${path}.`);
  }
} else {
  failures.push('src/pwa/sw-template.ts is missing.');
}

if (failures.length > 0) {
  console.error('release-assets: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('release-assets: OK');
for (const note of notes) console.log(`  · ${note}`);
