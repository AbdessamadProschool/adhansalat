/**
 * Fetches reference prayer times from the AlAdhan API and stores them as test fixtures.
 * Run manually: node scripts/fetch-reference.mjs
 *
 * The produced file is committed so tests never need the network.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "core", "__fixtures__", "aladhan-reference.json");

/** @type {Array<{id:string, city:string, country:string, lat:number, lon:number, tz:string, method:string, school:0|1, dates:string[]}>} */
const CASES = [
  { id: "casablanca-summer", city: "Casablanca", country: "MA", lat: 33.5731, lon: -7.5898, tz: "Africa/Casablanca", method: "MOROCCO", school: 0, dates: ["15-03-2026", "21-06-2026", "15-09-2026", "21-12-2026"] },
  { id: "london-bst", city: "London", country: "GB", lat: 51.5074, lon: -0.1278, tz: "Europe/London", method: "MWL", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "newyork-dst-start", city: "New York", country: "US", lat: 40.7128, lon: -74.006, tz: "America/New_York", method: "ISNA", school: 0, dates: ["08-03-2026", "01-11-2026", "21-06-2026"] },
  { id: "paris-uiof", city: "Paris", country: "FR", lat: 48.8566, lon: 2.3522, tz: "Europe/Paris", method: "FRANCE", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "istanbul-diyanet", city: "Istanbul", country: "TR", lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul", method: "TURKEY", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "jakarta-kemenag", city: "Jakarta", country: "ID", lat: -6.2088, lon: 106.8456, tz: "Asia/Jakarta", method: "KEMENAG", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "makkah-umm-al-qura", city: "Makkah", country: "SA", lat: 21.4225, lon: 39.8262, tz: "Asia/Riyadh", method: "MAKKAH", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "karachi-hanafi", city: "Karachi", country: "PK", lat: 24.8607, lon: 67.0011, tz: "Asia/Karachi", method: "KARACHI", school: 1, dates: ["21-06-2026"] },
  { id: "algiers", city: "Algiers", country: "DZ", lat: 36.7538, lon: 3.0588, tz: "Africa/Algiers", method: "ALGERIA", school: 0, dates: ["21-06-2026"] },
  { id: "tunis", city: "Tunis", country: "TN", lat: 36.8065, lon: 10.1815, tz: "Africa/Tunis", method: "TUNISIA", school: 0, dates: ["21-06-2026"] },
  { id: "singapore-muis", city: "Singapore", country: "SG", lat: 1.3521, lon: 103.8198, tz: "Asia/Singapore", method: "SINGAPORE", school: 0, dates: ["21-06-2026"] },
  { id: "dubai", city: "Dubai", country: "AE", lat: 25.2048, lon: 55.2708, tz: "Asia/Dubai", method: "DUBAI", school: 0, dates: ["21-06-2026"] },
  { id: "sydney-dst-end", city: "Sydney", country: "AU", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney", method: "MWL", school: 0, dates: ["05-04-2026", "04-10-2026"] },
  { id: "tromso-extreme", city: "Tromso", country: "NO", lat: 69.6492, lon: 18.9553, tz: "Europe/Oslo", method: "MWL", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "auckland", city: "Auckland", country: "NZ", lat: -36.8485, lon: 174.7633, tz: "Pacific/Auckland", method: "MWL", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "santiago-chile", city: "Santiago", country: "CL", lat: -33.4489, lon: -70.6693, tz: "America/Santiago", method: "MWL", school: 0, dates: ["21-06-2026", "21-12-2026"] },
  { id: "honolulu", city: "Honolulu", country: "US", lat: 21.3069, lon: -157.8583, tz: "Pacific/Honolulu", method: "MWL", school: 0, dates: ["21-06-2026"] },
  { id: "reykjavik", city: "Reykjavik", country: "IS", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik", method: "MWL", school: 0, dates: ["21-06-2026", "21-12-2026"] },
];

const FIELDS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];

/**
 * The AlAdhan /timings endpoint only honours the NUMERIC id form of the `method`
 * parameter. Passing a name such as "MWL" is silently ignored and the API falls
 * back to its default (ISNA). Verified during development: an entire first run
 * returned ISNA for every city. We therefore send ids and assert the response
 * echoes the method we asked for.
 */
const METHOD_IDS = {
  JAFARI: 0, KARACHI: 1, ISNA: 2, MWL: 3, MAKKAH: 4, EGYPT: 5, TEHRAN: 7,
  GULF: 8, KUWAIT: 9, QATAR: 10, SINGAPORE: 11, FRANCE: 12, TURKEY: 13,
  RUSSIA: 14, MOONSIGHTING: 15, DUBAI: 16, JAKIM: 17, TUNISIA: 18,
  ALGERIA: 19, KEMENAG: 20, MOROCCO: 21, PORTUGAL: 22, JORDAN: 23,
};

async function getJSON(url, attempt = 1) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = await res.json();
  if (body.code !== 200) {
    if (attempt > 3) throw new Error(`API code ${body.code} for ${url}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return getJSON(url, attempt + 1);
  }
  return body;
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "https://api.aladhan.com/v1/timings/{date}?latitude&longitude&method&school",
  notes:
    "Reference times as returned by the AlAdhan API. Used only to measure the divergence of the local engine; " +
    "presence in this file is not a certification that any authority publishes these exact minutes.",
  cases: [],
};

for (const c of CASES) {
  const entry = { ...c, methodId: METHOD_IDS[c.method], timings: {} };
  if (entry.methodId === undefined) throw new Error("unknown method " + c.method);
  for (const date of c.dates) {
    const url =
      `https://api.aladhan.com/v1/timings/${date}` +
      `?latitude=${c.lat}&longitude=${c.lon}&method=${entry.methodId}&school=${c.school}`;
    const body = await getJSON(url);
    const t = body.data.timings;
    const meta = body.data.meta;
    if (meta.method.id !== entry.methodId) {
      throw new Error(
        `method mismatch for ${c.id} ${date}: asked id ${entry.methodId} (${c.method}), got id ${meta.method.id} (${meta.method.name})`,
      );
    }
    entry.timings[date] = Object.fromEntries(
      FIELDS.map((f) => [f.toLowerCase(), String(t[f]).slice(0, 5)]),
    );
    entry.timings[date].meta = {
      timezone: body.data.meta.timezone,
      methodName: body.data.meta.method.name,
      methodParams: body.data.meta.method.params,
      latitudeAdjustmentMethod: body.data.meta.latitudeAdjustmentMethod,
      midnightMode: body.data.meta.midnightMode,
      school: body.data.meta.school,
    };  }
  out.cases.push(entry);
  console.log("ok", c.id);
  await new Promise((r) => setTimeout(r, 350));
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("wrote", OUT, out.cases.length, "cases");
