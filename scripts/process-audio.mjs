/**
 * Cleans the eight supplied Adhan recordings and publishes them.
 *
 * INPUTS are the files the project owner supplied on the Desktop:
 *   azan1.mp3, azan2.mp3, azan5.mp3, azan6.mp3, azan7.mp3, azan9.mp3,
 *   azan13.mp3, azan14.mp3.
 * Nothing else is read, and no file is invented: if a file is absent the script
 * stops and says which one.
 *
 * OUTPUTS
 *   audio-originals/azanN.mp3                     untouched copies (not shipped)
 *   audio-cleaned/azan-N.mp3                      cleaned copies (NOT shipped)
 *   src/core/data/audio-catalog.json              metadata consumed by the app
 *   docs/AUDIO.md                                 measured before/after report
 *
 * The cleaned copies deliberately live outside `public/` and outside
 * `android/.../res/raw/`: the licence is unknown and no written authorisation
 * exists, so they must not reach a production build. `scripts/check-release-assets.mjs`
 * fails the build if an MP3 reappears in a shipped folder.
 *
 * PROCESSING (deliberately conservative: this is worship audio, not a podcast)
 *   1. high-pass at 70 Hz        — removes rumble/handling noise only;
 *   2. afftdn nr=6               — mild broadband noise reduction;
 *   3. leading/trailing silence  — 0.25 s below -45 dB at each end, never inside;
 *   4. loudnorm I=-18 TP=-2      — speech-level loudness, -2 dBTP ceiling;
 *   5. mono 22.05 kHz, 32 kbps   — the sources are 24–40 kbps stereo; this keeps
 *                                  the same speech quality at half the size.
 *
 * The script measures the source and the result (mean/max level, integrated
 * loudness, true peak, silence) and refuses to claim a clean result it did not
 * measure.
 *
 * LICENCE: the MP3 tags say `artist: www.islamcan.com`. No licence or written
 * authorisation accompanies the files. The catalogue therefore records
 * `license: "unknown"` and `redistributionAuthorized: false`. Do not publish the
 * APK/PWA with these files until the rights holder has agreed in writing.
 *
 * Usage:
 *   node scripts/process-audio.mjs [--src <directory>] [--force]
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const ffprobe = require('ffprobe-static').path;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Cleaned files are kept outside the shipped tree on purpose (see header). */
const OUT_CLEANED = join(ROOT, 'audio-cleaned');
const OUT_ORIGINALS = join(ROOT, 'audio-originals');
const OUT_CATALOG = join(ROOT, 'src', 'core', 'data', 'audio-catalog.json');
const OUT_REPORT = join(ROOT, 'docs', 'AUDIO.md');

/** Source number → file name. The numbers are the owner's, not a ranking. */
const SOURCES = [1, 2, 5, 6, 7, 9, 13, 14];

/**
 * Downmix to mono *before* measuring loudness. Measuring the stereo source and
 * then folding it to mono silently loses about 3 dB (the Adhan channels are not
 * correlated), which is why the first build measured −21 LUFS instead of −18.
 */
const LOUDNESS_CHAIN = [
  'aformat=channel_layouts=mono',
  'highpass=f=70',
  'afftdn=nr=6:nf=-30',
  'loudnorm=I=-18:TP=-2:LRA=9',
].join(',');

const TRIM_CHAIN = [
  'silenceremove=start_periods=1:start_duration=0.25:start_threshold=-45dB',
  'areverse',
  'silenceremove=start_periods=1:start_duration=0.25:start_threshold=-45dB',
  'areverse',
].join(',');

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] ?? fallback;
}

const SRC_DIR = argValue('--src', join(homedir(), 'Desktop'));
const FORCE = args.includes('--force');
const ONLY = argValue('--only', '');
const SELECTED = ONLY ? SOURCES.filter((number) => String(number) === ONLY) : SOURCES;
if (ONLY && SELECTED.length === 0) {
  throw new Error(`--only must be one of: ${SOURCES.join(', ')}`);
}

function run(bin, argv) {
  const result = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const stdout = result.stdout ? String(result.stdout) : '';
  const stderr = result.stderr ? String(result.stderr) : '';
  if (result.error) throw new Error(`${basename(bin)} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${basename(bin)} failed (${result.status}): ${stderr || stdout}`);
  }
  return `${stdout}\n${stderr}`;
}

/** For commands whose stdout is machine-readable (ffprobe JSON). */
function runStdout(bin, argv) {
  const result = spawnSync(bin, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const stdout = result.stdout ? String(result.stdout) : '';
  const stderr = result.stderr ? String(result.stderr) : '';
  if (result.error) throw new Error(`${basename(bin)} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${basename(bin)} failed (${result.status}): ${stderr || stdout}`);
  }
  return stdout;
}

function probe(file) {
  const json = JSON.parse(
    runStdout(ffprobe, [
      '-v',
      'error',
      '-show_entries',
      'format=duration,bit_rate,size:format_tags:stream=codec_name,sample_rate,channels,bit_rate',
      '-of',
      'json',
      file,
    ]),
  );
  const stream = json.streams?.[0] ?? {};
  const format = json.format ?? {};
  return {
    durationSec: Number(format.duration) || 0,
    bitrateKbps: Math.round((Number(format.bit_rate) || 0) / 1000),
    bytes: Number(format.size) || 0,
    codec: stream.codec_name ?? 'unknown',
    sampleRate: Number(stream.sample_rate) || 0,
    channels: Number(stream.channels) || 0,
    tags: format.tags ?? {},
  };
}

function measure(file, durationSec) {
  const volume = run(ffmpeg, [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const meanMatch = /mean_volume:\s*(-?[\d.]+) dB/.exec(volume);
  const maxMatch = /max_volume:\s*(-?[\d.]+) dB/.exec(volume);

  const silence = run(ffmpeg, [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'silencedetect=noise=-40dB:d=0.5',
    '-f',
    'null',
    '-',
  ]);
  let silenceSec = 0;
  let openStart = null;
  for (const line of silence.split('\n')) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) openStart = Number(start[1]);
    const end = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (end && openStart !== null) {
      silenceSec += Math.max(0, Number(end[1]) - openStart);
      openStart = null;
    }
  }
  if (openStart !== null && durationSec > openStart) silenceSec += durationSec - openStart;

  const loudness = run(ffmpeg, [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]);
  const jsonStart = loudness.indexOf('{');
  const jsonEnd = loudness.lastIndexOf('}');
  const loud = jsonStart >= 0 && jsonEnd > jsonStart ? JSON.parse(loudness.slice(jsonStart, jsonEnd + 1)) : {};

  return {
    meanDb: meanMatch ? Number(meanMatch[1]) : null,
    maxDb: maxMatch ? Number(maxMatch[1]) : null,
    loudnessLufs: loud.input_i ? Number(loud.input_i) : null,
    truePeakDb: loud.input_tp ? Number(loud.input_tp) : null,
    silenceSec: Math.round(silenceSec * 10) / 10,
    silencePercent: durationSec > 0 ? Math.round((silenceSec / durationSec) * 1000) / 10 : 0,
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function fmt(value, digits, unit = '') {
  return value === null || value === undefined ? '—' : `${value.toFixed(digits)}${unit}`;
}

async function main() {
  const missing = SELECTED.filter((n) => !existsSync(join(SRC_DIR, `azan${n}.mp3`)));
  if (missing.length > 0) {
    throw new Error(
      `missing source file(s) in ${SRC_DIR}: ${missing.map((n) => `azan${n}.mp3`).join(', ')}`,
    );
  }

  await mkdir(OUT_CLEANED, { recursive: true });
  await mkdir(OUT_ORIGINALS, { recursive: true });

  const newTracks = [];

  for (const number of SELECTED) {
    const sourceName = `azan${number}.mp3`;
    const sourcePath = join(SRC_DIR, sourceName);
    const originalPath = join(OUT_ORIGINALS, sourceName);
    const id = `adhan-${number}`;
    const cleanedName = `azan-${number}.mp3`;
    const cleanedPath = join(OUT_CLEANED, cleanedName);

    const sourceBuffer = await readFile(sourcePath);
    const sourceProbe = probe(sourcePath);
    const sourceMetrics = measure(sourcePath, sourceProbe.durationSec);

    if (!existsSync(originalPath)) await copyFile(sourcePath, originalPath);

    if (FORCE || !existsSync(cleanedPath)) {
      const intermediate = join(tmpdir(), `azan-clean-${number}.wav`);
      try {
        // Pass 1 — denoise + loudness, keep PCM so nothing is encoded twice.
        run(ffmpeg, [
          '-hide_banner',
          '-y',
          '-i',
          sourcePath,
          '-af',
          LOUDNESS_CHAIN,
          '-ac',
          '1',
          '-ar',
          '22050',
          '-codec:a',
          'pcm_s16le',
          intermediate,
        ]);
        // Pass 2 — trim dead air at both ends, then encode once.
        run(ffmpeg, [
          '-hide_banner',
          '-y',
          '-i',
          intermediate,
          '-af',
          TRIM_CHAIN,
          '-codec:a',
          'libmp3lame',
          '-b:a',
          '32k',
          '-map_metadata',
          '-1',
          '-id3v2_version',
          '3',
          cleanedPath,
        ]);
      } finally {
        await rm(intermediate, { force: true });
      }
    }

    const outputBuffer = await readFile(cleanedPath);
    const outputProbe = probe(cleanedPath);
    const outputMetrics = measure(cleanedPath, outputProbe.durationSec);

    newTracks.push({
      number,
      id,
      name: `Adhan ${number}`,
      // Path the PWA would serve *if* redistribution were authorised.
      publicPath: `/audio/adhan/${cleanedName}`,
      androidRaw: `adhan_${number}`,
      sourceName,
      /** Not shipped until a written authorisation is recorded. */
      bundled: false,
      localCopy: `audio-cleaned/${cleanedName}`,
      source: {
        bytes: sourceBuffer.length,
        sha256: sha256(sourceBuffer),
        ...sourceProbe,
        ...sourceMetrics,
      },
      processed: {
        bytes: outputBuffer.length,
        sha256: sha256(outputBuffer),
        ...outputProbe,
        ...outputMetrics,
      },
    });

    console.log(
      `${sourceName} → ${cleanedName}: ${fmt(sourceMetrics.meanDb, 1, ' dB')} mean, ` +
        `${fmt(sourceMetrics.loudnessLufs, 1, ' LUFS')} → ${fmt(outputMetrics.meanDb, 1, ' dB')} mean, ` +
        `${fmt(outputMetrics.loudnessLufs, 1, ' LUFS')}, ` +
        `${(sourceBuffer.length / 1024).toFixed(0)} → ${(outputBuffer.length / 1024).toFixed(0)} KiB`,
    );
  }

  // `--only` is a repair/debug path: keep the tracks that were already
  // processed instead of overwriting the catalogue with a single entry.
  let tracks = newTracks;
  if (ONLY && existsSync(OUT_CATALOG)) {
    const previous = JSON.parse(await readFile(OUT_CATALOG, 'utf8'));
    const byNumber = new Map((previous.tracks ?? []).map((track) => [track.number, track]));
    for (const track of newTracks) byNumber.set(track.number, track);
    tracks = [...byNumber.values()].sort((a, b) => a.number - b.number);
  }
  if (tracks.length === 0) throw new Error('no track was processed');

  const totalBytes = tracks.reduce((sum, track) => sum + track.processed.bytes, 0);
  const catalog = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/process-audio.mjs',
    filterChain: {
      loudness: LOUDNESS_CHAIN,
      trim: TRIM_CHAIN,
      note: 'Two passes: loudness/PCM intermediate, then trim+MP3, because areverse and loudnorm exhaust memory in one graph.',
    },
    encoding: { codec: 'libmp3lame', sampleRate: 22050, channels: 1, bitrateKbps: 32 },
    source: 'Eight MP3 files supplied by the project owner (azan1/2/5/6/7/9/13/14.mp3).',
    tagArtist: 'www.islamcan.com',
    license: 'unknown',
    redistributionAuthorized: false,
    bundleInApp: false,
    localCopyDir: 'audio-cleaned/',
    licenseNote:
      'The source files carry no licence and no written authorisation. They are kept locally for evaluation only. The PWA and the APK do not contain them: production builds fail if an MP3 is placed under public/ or res/raw/. Do not distribute these recordings until the rights holder agrees in writing.',
    originals: 'audio-originals/ (untouched sources, not shipped)',
    cleanedCopies: 'audio-cleaned/ (not shipped; local evaluation only)',
    totalProcessedBytes: totalBytes,
    tracks,
  };

  await writeFile(OUT_CATALOG, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(OUT_REPORT, renderReport(catalog), 'utf8');
  await writeFile(
    join(OUT_ORIGINALS, 'README.md'),
    [
      '# Originals — do not redistribute',
      '',
      'These are the untouched files supplied by the project owner:',
      '',
      ...SOURCES.map((n) => `- azan${n}.mp3`),
      '',
      'The MP3 tags name `www.islamcan.com` as artist. No licence or written',
      'authorisation accompanies them, so redistribution is **not** established.',
      'The cleaned copies in `audio-cleaned/` stay outside `public/` and outside',
      '`android/app/src/main/res/raw/`, and must not be published until the',
      'rights holder agrees in writing. See `docs/AUDIO.md`.',
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\nwrote ${OUT_CATALOG}`);
  console.log(`wrote ${OUT_REPORT}`);
  console.log(`total cleaned audio: ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
}

function renderReport(catalog) {
  const rows = catalog.tracks
    .map(
      (track) =>
        `| ${track.number} | ${track.sourceName} | ${fmt(track.source.durationSec, 1, ' s')} | ` +
        `${track.source.sampleRate} Hz / ${track.source.channels} ch / ${track.source.bitrateKbps} kbps | ` +
        `${fmt(track.source.meanDb, 1, ' dB')} | ${fmt(track.source.maxDb, 1, ' dB')} | ` +
        `${fmt(track.source.loudnessLufs, 1, ' LUFS')} | ${fmt(track.source.truePeakDb, 1, ' dBTP')} | ` +
        `${fmt(track.source.silenceSec, 1, ' s')} (${fmt(track.source.silencePercent, 1, ' %')}) |`,
    )
    .join('\n');

  const outRows = catalog.tracks
    .map(
      (track) =>
        `| ${track.number} | ${track.publicPath.split('/').pop()} | ${fmt(track.processed.durationSec, 1, ' s')} | ` +
        `${track.processed.sampleRate} Hz / ${track.processed.channels} ch / ${track.processed.bitrateKbps} kbps | ` +
        `${fmt(track.processed.meanDb, 1, ' dB')} | ${fmt(track.processed.maxDb, 1, ' dB')} | ` +
        `${fmt(track.processed.loudnessLufs, 1, ' LUFS')} | ${fmt(track.processed.truePeakDb, 1, ' dBTP')} | ` +
        `${(track.processed.bytes / 1024).toFixed(0)} KiB |`,
    )
    .join('\n');

  return `# Audio — measured processing report

Generated by \`scripts/process-audio.mjs\` on ${catalog.generatedAt}.

## What was processed

Only the eight files supplied by the project owner:

${catalog.tracks.map((track) => `- \`${track.sourceName}\``).join('\n')}

No other recording was analysed, downloaded, renamed or “restored”. Nothing in
this report describes a file that was not present.

## Source → cleaned

| # | Source | Duration | Format | Mean | Max | Loudness | True peak | Silence (≥0.5 s, −40 dB) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Cleaned output

| # | File | Duration | Format | Mean | Max | Loudness | True peak | Size |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${outRows}

## Processing chain

Pass 1 — denoise and loudness, written as PCM:

\`${catalog.filterChain.loudness}\`

Pass 2 — trim dead air at both ends and encode once:

\`${catalog.filterChain.trim}\`

Two passes are used because \`areverse\` buffers the whole stream before emitting
anything; feeding that buffer into \`loudnorm\` in the same graph exhausted memory
with the bundled FFmpeg build. Splitting the work keeps each pass bounded.

| Step | Why | Risk control |
| --- | --- | --- |
| \`aformat=channel_layouts=mono\` | Downmix before measuring loudness | Measuring stereo then folding to mono loses ~3 dB and misses the −18 LUFS target |
| \`highpass=f=70\` | Removes rumble and handling noise below the male voice fundamental | 70 Hz keeps the voice untouched |
| \`afftdn=nr=6:nf=-30\` | Mild broadband noise reduction | 6 dB, well below the default 12 dB, to avoid “swishing” artefacts |
| leading/trailing \`silenceremove\` at −45 dB / 0.25 s | Removes dead air at the start and end | Applied in both directions with \`areverse\`, never inside the recitation; pauses between phrases are preserved |
| \`loudnorm=I=-18:TP=-2:LRA=9\` | Consistent speech loudness across the eight files | −2 dBTP ceiling prevents clipping on phone speakers; −18 LUFS is speech level, not music level |
| mono 22.05 kHz / 32 kbps | Halves the size of the stereo sources | Sources are 24–40 kbps stereo; the per-channel budget is not reduced |

Outputs are MP3 (LAME), mono, 22 050 Hz, 32 kbps. They are written to
\`audio-cleaned/\`, **outside** \`public/\` and outside \`android/app/src/main/res/raw/\`.
No MP3 is precached by the service worker and none is packed into the APK:
\`scripts/check-release-assets.mjs\` fails \`npm run build\` if one reappears in a
shipped folder.

## What was *not* done

- No voice separation, no reverb removal, no pitch correction, no upscaling of
  the 8 kHz sources. Those operations cannot add information that is not there.
- No claim that the result is “studio quality”. The sources are low-bitrate
  recordings; the goal was to remove hiss, rumble, dead air and level jumps
  without altering the recitation.
- No automatic verification that the recitation itself is complete or correct.

## Licence and redistribution — unresolved

The tags name \`${catalog.tagArtist}\` as artist. **No licence, no attribution
file and no written authorisation accompany the files.** The catalogue therefore
records:

- \`license: "${catalog.license}"\`
- \`redistributionAuthorized: ${catalog.redistributionAuthorized}\`

Consequences:

1. The originals are kept in \`audio-originals/\`, outside \`public/\` and outside
   the APK, so a build does not redistribute them by accident.
2. The cleaned files are kept in \`audio-cleaned/\`; they are **not shipped**. The
   PWA precache list, the bundle and \`res/raw/\` contain no MP3, and the Adhan
   screen lists the eight tracks as “not included” with no preview.
3. **The app can be built and deployed without them**; this is the current state.
   The three synthetic chimes remain the only bundled audio.
4. If a written permission is obtained later: set \`redistributionAuthorized\` and
   per-track \`bundled\` to \`true\` in \`src/core/data/audio-catalog.json\`, copy the
   cleaned files to \`public/audio/adhan/\` and \`res/raw/adhan_N.mp3\`, add them
   back to \`STATIC_ASSETS\`, and rebuild.

## Honest limits

- No Android device was available in this environment: native playback from
  \`R.raw\` was **not** heard, and the eight Adhan tracks are not in the APK at
  all. The three chimes are mapped in \`Sounds.kt\`, but “it plays on the phone”
  remains unverified until an APK is built and tested.
- Browser playback was verified only through the web player path, with the three
  chimes served by the local preview server. The supplied Adhan files were never
  served by the app.
- Loudness is measured by FFmpeg's EBU R128 implementation. Small differences
  between phone speakers are expected and are not a defect.
`;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
