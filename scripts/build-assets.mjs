/**
 * Generates the installable assets that Git cannot store as source:
 *   - PNG app icons (192, 512, maskable 512) drawn from the design tokens;
 *   - short CHIME files used to test the audio path.
 *
 * The chimes are synthesised here, not sampled from any recording. No Adhan
 * recitation is bundled with this project because we do not hold a licence for
 * one; users import their own file in the Sounds screen.
 *
 * Usage: node scripts/build-assets.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = join(ROOT, 'public', 'icons');
const AUDIO = join(ROOT, 'public', 'audio');

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- icon drawing

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const DEEP = [10, 63, 50];
const EMERALD = [16, 122, 92];
const IVORY = [248, 245, 235];
const GOLD = [212, 175, 102];

/** Scene description in normalised coordinates, supersampled for anti-aliasing. */
function drawIcon(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling factor
  const padding = maskable ? 0 : size * 0.06;
  const radius = maskable ? 0 : size * 0.235;

  // Crescent: big disc minus offset disc.
  const cx = size * 0.5;
  const cy = size * 0.5;
  const rOuter = size * (maskable ? 0.30 : 0.255);
  const rInner = rOuter * 0.84;
  const innerDx = rOuter * 0.42;
  const innerDy = -rOuter * 0.20;

  // Star: small four-point sparkle to the right of the crescent.
  const sx = cx + rOuter * 0.86;
  const sy = cy - rOuter * 0.52;
  const sLen = size * (maskable ? 0.085 : 0.072);
  const sWid = sLen * 0.34;

  const inRoundedRect = (x, y) => {
    if (maskable) return true;
    const minX = padding;
    const maxX = size - padding;
    const minY = padding;
    const maxY = size - padding;
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    const rx = Math.min(radius, (maxX - minX) / 2);
    const qx = Math.max(minX + rx - x, 0, x - (maxX - rx));
    const qy = Math.max(minY + rx - y, 0, y - (maxY - rx));
    return qx * qx + qy * qy <= rx * rx;
  };

  const inCrescent = (x, y) => {
    const d1 = Math.hypot(x - cx, y - cy);
    const d2 = Math.hypot(x - (cx + innerDx), y - (cy + innerDy));
    return d1 <= rOuter && d2 >= rInner;
  };

  const inStar = (x, y) => {
    const dx = Math.abs(x - sx);
    const dy = Math.abs(y - sy);
    // Four-point star as |x|^p + |y|^p <= 1 with p < 1 (astroid-like).
    const p = 0.55;
    const nx = dx / sLen;
    const ny = dy / (sWid * 1.6);
    return Math.pow(nx, p) + Math.pow(ny, p) <= 1;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy2 = 0; sy2 < SS; sy2++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const px = x + (sx2 + 0.5) / SS;
          const py = y + (sy2 + 0.5) / SS;
          if (!inRoundedRect(px, py)) continue;
          // Background: diagonal gradient from deep green to emerald.
          const t = Math.min(1, Math.max(0, (px / size) * 0.65 + (py / size) * 0.35));
          let colour = mix(DEEP, EMERALD, t);
          if (inCrescent(px, py) || inStar(px, py)) {
            // Subtle vertical gold-to-ivory sheen on the mark.
            const sheen = Math.min(1, Math.max(0, py / size));
            colour = mix(GOLD, IVORY, 0.35 + sheen * 0.55);
          }
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }
      const samples = SS * SS;
      const i = (y * size + x) * 4;
      if (a === 0) {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 0;
      } else {
        const covered = a / 255;
        buf[i] = Math.round(r / covered);
        buf[i + 1] = Math.round(g / covered);
        buf[i + 2] = Math.round(b / covered);
        buf[i + 3] = Math.round((a / samples) * 1);
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------- chimes

const SAMPLE_RATE = 44100;

function writeWav(samples, sampleRate = SAMPLE_RATE) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

/**
 * A soft struck-bell note: a few inharmonic partials with exponential decay.
 * Deliberately gentle so it can be used as a *test* tone, never presented as an
 * Adhan.
 */
function bell(freq, duration, amplitude = 0.22) {
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  const partials = [
    [1, 1.0],
    [2.01, 0.42],
    [2.99, 0.2],
    [4.2, 0.09],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.012);
    const decay = Math.exp(-t * 1.9);
    let s = 0;
    for (const [ratio, gain] of partials) {
      s += gain * Math.sin(2 * Math.PI * freq * ratio * t) * Math.exp(-t * (0.7 + ratio * 0.5));
    }
    out[i] = s * attack * decay * amplitude;
  }
  return out;
}

function mixInto(target, source, offsetSeconds) {
  const offset = Math.floor(offsetSeconds * SAMPLE_RATE);
  for (let i = 0; i < source.length && offset + i < target.length; i++) {
    target[offset + i] += source[i];
  }
}

function chime(notes, gap, tail = 2.4) {
  const total = gap * (notes.length - 1) + tail;
  const out = new Float32Array(Math.floor(total * SAMPLE_RATE));
  notes.forEach((freq, i) => mixInto(out, bell(freq, tail, 0.2), i * gap));
  // Normalise with headroom.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.55;
  // Short fade-out so the file never ends on a click.
  const fade = Math.floor(0.05 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

// ---------------------------------------------------------------- main

await mkdir(ICONS, { recursive: true });
await mkdir(AUDIO, { recursive: true });

const sizes = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];
for (const { name, size, maskable } of sizes) {
  await writeFile(join(ICONS, name), encodePng(size, drawIcon(size, { maskable })));
  console.log('icon', name);
}

const tones = [
  {
    name: 'chime-calm.wav',
    samples: chime([523.25, 659.25, 783.99], 0.62),
  },
  {
    name: 'chime-dawn.wav',
    samples: chime([392.0, 523.25, 587.33, 783.99], 0.78),
  },
  {
    name: 'chime-alert.wav',
    samples: chime([880.0, 880.0, 1174.66], 0.34, 1.4),
  },
];
for (const tone of tones) {
  await writeFile(join(AUDIO, tone.name), writeWav(tone.samples));
  console.log('audio', tone.name, (tone.samples.length / SAMPLE_RATE).toFixed(1) + 's');
}
