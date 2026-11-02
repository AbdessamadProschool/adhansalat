/**
 * Builds the geographic catalogue from the real GeoNames dumps.
 *
 * Inputs:
 *  - `MA.txt`: the GeoNames country dump for Morocco (all feature classes);
 *  - `cities15000.txt`: the world "top cities" file (one row per city);
 *  - `admin1CodesASCII.txt`, `admin2Codes.txt`: region/province names.
 *
 * Outputs (the app bundle only sees the first one):
 *  - `src/core/data/cities-core.json` — bundled. Metadata + every non-Moroccan
 *    city (1 696 today) + the 300 largest Moroccan localities, so the picker
 *    answers instantly and works offline before any fetch.
 *  - `public/data/cities/index.json` — lazy. A compact search index for every
 *    Moroccan locality (id, name, region, coordinates). Fetched on first search
 *    and cached by the service worker.
 *  - `public/data/cities/ma-XX.json` — on demand. Full records per Moroccan
 *    region (alternate names, province, population).
 *  - `src/core/data/cities.json` — the full filtered dataset. Not imported by
 *    the app; it is the test/report source of truth.
 *
 * Verification is part of the build, not a comment. The script checks feature
 * classes, duplicate ids, duplicate name+coordinate pairs, coordinate
 * plausibility, IANA zones, name variants, and writes `docs/GEONAMES.md` plus a
 * machine-readable report. It fails the build if a populated-place filter would
 * drop the whole country or if a generated file is internally inconsistent.
 *
 * Licence: GeoNames data is CC BY 4.0 — https://www.geonames.org/
 *
 * Usage:
 *   node scripts/build-cities.mjs \
 *     --ma data-source/MA.txt \
 *     --cities data-source/cities15000.txt \
 *     --admin1 data-source/admin1CodesASCII.txt \
 *     --admin2 data-source/admin2Codes.txt
 */
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_OUT = join(ROOT, 'src', 'core', 'data', 'cities-core.json');
const FULL_OUT = join(ROOT, 'src', 'core', 'data', 'cities.json');
const PUBLIC_DIR = join(ROOT, 'public', 'data', 'cities');
const INDEX_OUT = join(PUBLIC_DIR, 'index.json');
const REPORT_OUT = join(ROOT, 'docs', 'GEONAMES.md');

const MOROCCO = 'MA';
/** Largest Moroccan localities kept in the initial bundle for instant results. */
const CORE_MA_LIMIT = 300;

/** Quotas for major Moroccan diaspora and Islamic countries */
const COUNTRY_QUOTAS = {
  FR: 80, // France (Paris, Marseille, Lyon, Toulouse, Nice, Strasbourg, Lille, etc.)
  ES: 65, // Spain (Madrid, Barcelona, Valencia, Sevilla, Malaga, Murcia, Bilbao, etc.)
  BE: 40, // Belgium (Brussels, Antwerp, Ghent, Charleroi, Liège, etc.)
  IT: 50, // Italy (Rome, Milan, Naples, Turin, Florence, Bologna, etc.)
  DE: 60, // Germany (Berlin, Hamburg, Munich, Cologne, Frankfurt, Düsseldorf, etc.)
  NL: 40, // Netherlands (Amsterdam, Rotterdam, The Hague, Utrecht, etc.)
  GB: 50, // UK (London, Birmingham, Manchester, Leeds, Glasgow, etc.)
  DZ: 50, // Algeria (Algiers, Oran, Constantine, Annaba, Blida, Setif, etc.)
  TN: 35, // Tunisia (Tunis, Sfax, Sousse, Kairouan, Bizerte, etc.)
  EG: 50, // Egypt (Cairo, Alexandria, Giza, Port Said, Suez, Mansoura, etc.)
  SA: 45, // Saudi Arabia (Riyadh, Jeddah, Mecca, Medina, Dammam, Ta'if, etc.)
  AE: 20, // UAE (Dubai, Abu Dhabi, Sharjah, Ajman, Al Ain, etc.)
  CA: 40, // Canada (Toronto, Montreal, Vancouver, Calgary, Ottawa, etc.)
  US: 70, // USA (New York, LA, Chicago, Houston, Phoenix, etc.)
  TR: 45, // Turkey (Istanbul, Ankara, Izmir, Bursa, etc.)
  QA: 15, // Qatar
  KW: 15, // Kuwait
  OM: 15, // Oman
  BH: 10, // Bahrain
  JO: 25, // Jordan
  LB: 20, // Lebanon
  IQ: 30, // Iraq
  SY: 25, // Syria
  PS: 25, // Palestine
  LY: 25, // Libya
  MR: 20, // Mauritania
  SD: 25, // Sudan
  CH: 25, // Switzerland
  SE: 20, // Sweden
  NO: 15, // Norway
  DK: 15, // Denmark
  AT: 20, // Austria
  PT: 25, // Portugal
};
const DEFAULT_PER_COUNTRY = 12;
const DEFAULT_MIN_POP_CAP = 35000;

/**
 * Feature classes accepted for Morocco. `P` is "populated place"; the codes are
 * the inhabited subset of that class. `PPLX` (a section of a populated place),
 * `PPLQ` (abandoned), and `PPLR` (religious place) are deliberately excluded:
 * they are not searchable localities a prayer time can be attached to.
 */
const MOROCCO_FEATURES = new Map([
  ['PPL', 'populated place (village, town, douar)'],
  ['PPLA', 'seat of a first-order administrative division'],
  ['PPLA2', 'seat of a second-order administrative division'],
  ['PPLA3', 'seat of a third-order administrative division'],
  ['PPLC', 'capital of a political entity'],
  ['PPLF', 'farm village'],
  ['PPLL', 'populated locality'],
  ['PPLS', 'populated places'],
]);

/**
 * Plausibility envelope: Morocco plus Western Sahara. Morocco's northernmost
 * point is just under 36°N; the southern border of Western Sahara is 20.77°N at
 * the Atlantic and ~23.4°N inland, so the rectangle is deliberately a little
 * wider than the territory and the time zone check does the fine filtering.
 */
const ENVELOPE = { minLat: 20.7, maxLat: 36.0, minLon: -17.2, maxLon: -0.8 };
/** The only civil zones a Moroccan locality can legitimately carry here. */
const MOROCCO_ZONES = new Set(['Africa/Casablanca', 'Africa/El_Aaiun']);

const ARABIC_NAME_OVERRIDES = {
  Casablanca: 'الدار البيضاء',
  Rabat: 'الرباط',
  Fes: 'فاس',
  Marrakesh: 'مراكش',
  Tangier: 'طنجة',
  Tanger: 'طنجة',
  Agadir: 'أكادير',
  Meknes: 'مكناس',
  Oujda: 'وجدة',
  Kenitra: 'القنيطرة',
  Tetouan: 'تطوان',
  Safi: 'آسفي',
  'El Jadida': 'الجديدة',
  'Beni Mellal': 'بني ملال',
  Nador: 'الناظور',
  Khouribga: 'خريبكة',
  Mohammedia: 'المحمدية',
  Essaouira: 'الصويرة',
  Laayoune: 'العيون',
  Dakhla: 'الداخلة',
  Taroudant: 'تارودانت',
  Taza: 'تازة',
  Settat: 'سطات',
  Berrechid: 'برشيد',
  Khemisset: 'الخميسات',
  Guelmim: 'كلميم',
  Errachidia: 'الرشيدية',
  Ouarzazate: 'ورزازات',
  'Al Hoceima': 'الحسيمة',
  Larache: 'العرائش',
  'Ksar El Kebir': 'القصر الكبير',
  Tiznit: 'تيزنيت',
  Tata: 'طاطا',
  'Fquih Ben Salah': 'الفقيه بن صالح',
  'Sidi Slimane': 'سيدي سليمان',
  Youssoufia: 'اليوسفية',
  Jerada: 'جرادة',
  Boujdour: 'بوجدور',
  Smara: 'السمارة',
};

const REGION_AR = {
  '01': 'طنجة تطوان الحسيمة',
  '02': 'الشرق',
  '03': 'فاس مكناس',
  '04': 'الرباط سلا القنيطرة',
  '05': 'بني ملال خنيفرة',
  '06': 'الدار البيضاء سطات',
  '07': 'مراكش آسفي',
  '08': 'درعة تافيلالت',
  '09': 'سوس ماسة',
  '10': 'كلميم واد نون',
  '11': 'العيون الساقية الحمراء',
  '12': 'الداخلة وادي الذهب',
};

/** Bucket for the few places whose GeoNames admin code is not in the admin1 table. */
const UNKNOWN_REGION = '00';
const UNKNOWN_REGION_NAME = 'Rattachement régional incertain';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.ma) {
  console.error(
    'usage: node scripts/build-cities.mjs --ma MA.txt [--cities cities15000.txt] ' +
      '[--admin1 admin1CodesASCII.txt] [--admin2 admin2Codes.txt]',
  );
  process.exit(1);
}

function round(value, decimals = 5) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isArabic(value) {
  return /[\u0600-\u06FF]/.test(value);
}

/** Normalises a name the same way `src/app/cities.ts` does, for duplicate checks. */
function normaliseName(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[’'`´ʻʾʿ]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Keeps only scripts the search normalises: Latin, Arabic and Tifinagh.
 * Cyrillic, CJK or Greek variants can never match a supported query and only
 * inflate the payload.
 */
function usefulVariant(value) {
  if (value.length < 2 || value.length > 48) return false;
  if (!/\p{L}/u.test(value)) return false;
  return /^[\p{Script=Latin}\p{Script=Arabic}\p{Script=Tifinagh}\p{M}\s'’`´.\-()/]+$/u.test(value);
}

function stripAdminPrefix(value) {
  return value.replace(/^(إقليم|عمالة|جماعة|دائرة|منطقة)\s+/u, '').trim();
}

/** Picks the most plausible Arabic display name from GeoNames alternates. */
function pickArabic(alts) {
  const candidates = alts
    .filter(isArabic)
    .map(stripAdminPrefix)
    .filter((value) => value.length >= 2 && !/(إقليم|عمالة|جماعة|دائرة)/u.test(value));
  if (candidates.length === 0) return undefined;
  const score = (value) => {
    let s = 0;
    if (value.includes(' ')) s += 4;
    if (!value.includes('-')) s += 2;
    if (!/[0-9A-Za-z]/.test(value)) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a) || b.length - a.length)[0];
}

function readTable(path) {
  if (!path || !existsSync(path)) return new Map();
  const text = readFileSync(path, 'utf8');
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (!fields[0]) continue;
    map.set(fields[0], { name: fields[1], ar: fields[2] || undefined });
  }
  return map;
}

const WORLD_ARABIC_OVERRIDES = {
  // Arab capitals and major cities
  Algiers: 'الجزائر',
  Oran: 'وهران',
  Constantine: 'قسنطينة',
  Annaba: 'عنابة',
  Blida: 'البليدة',
  Setif: 'سطيف',
  Sétif: 'سطيف',
  Batna: 'باتنة',
  Tlemcen: 'تلمسان',
  Tunis: 'تونس',
  Sfax: 'صفاقس',
  Sousse: 'سوسة',
  Kairouan: 'القيروان',
  Bizerte: 'بنزرت',
  Tripoli: 'طرابلس',
  Benghazi: 'بنغازي',
  Misrata: 'مصراتة',
  Cairo: 'القاهرة',
  Alexandria: 'الإسكندرية',
  Giza: 'الجيزة',
  'Port Said': 'بور سعيد',
  Suez: 'السويس',
  Mansoura: 'المنصورة',
  Tanta: 'طنطا',
  Aswan: 'أسوان',
  Luxor: 'الأقصر',
  Riyadh: 'الرياض',
  Jeddah: 'جدة',
  Mecca: 'مكة المكرمة',
  Medina: 'المدينة المنورة',
  Dammam: 'الدمام',
  "Ta'if": 'الطائف',
  Tabuk: 'تبوك',
  Buraidah: 'بريدة',
  'Khamis Mushait': 'خميس مشيط',
  'Al Khobar': 'الخبر',
  Dubai: 'دبي',
  'Abu Dhabi': 'أبو ظبي',
  Sharjah: 'الشارقة',
  Ajman: 'عجمان',
  'Ras Al Khaimah': 'رأس الخيمة',
  Doha: 'الدوحة',
  'Al Rayyan': 'الريان',
  'Al Wakrah': 'الوكرة',
  'Kuwait City': 'الكويت',
  Muscat: 'مسقط',
  Manama: 'المنامة',
  Amman: 'عمان',
  Zarqa: 'الزرقاء',
  Irbid: 'إربد',
  Beirut: 'بيروت',
  Damascus: 'دمشق',
  Aleppo: 'حلب',
  Homs: 'حمص',
  Hama: 'حماة',
  Latakia: 'اللاذقية',
  Baghdad: 'بغداد',
  Basra: 'البصرة',
  Mosul: 'الموصل',
  Erbil: 'أربيل',
  Najaf: 'النجف',
  Karbala: 'كربلاء',
  Jerusalem: 'القدس',
  Gaza: 'غزة',
  Hebron: 'الخليل',
  Nablus: 'نابلس',
  Jenin: 'جنين',
  Ramallah: 'رام الله',
  Bethlehem: 'بيت لحم',
  Nouakchott: 'نواكشوط',
  Nouadhibou: 'نواذيبو',
  Khartoum: 'الخرطوم',
  Omdurman: 'أم درمان',
  // Europe & Americas major diaspora hubs
  Paris: 'باريس',
  Marseille: 'مارسيليا',
  Lyon: 'ليون',
  Toulouse: 'تولوز',
  Nice: 'نيس',
  Nantes: 'نانت',
  Strasbourg: 'ستراسبورغ',
  Montpellier: 'مونبلييه',
  Bordeaux: 'بوردو',
  Lille: 'ليل',
  Rennes: 'رين',
  Reims: 'ريمس',
  Toulon: 'تولون',
  Grenoble: 'غرونوبل',
  Dijon: 'ديجون',
  Angers: 'أنجيه',
  Nîmes: 'نيم',
  Brest: 'بريست',
  Tours: 'تور',
  Amiens: 'أميان',
  Limoges: 'ليموج',
  Metz: 'ميتز',
  Besançon: 'بيزانسون',
  Orléans: 'أورليان',
  Rouen: 'روان',
  Mulhouse: 'مولوز',
  Caen: 'كان',
  Nancy: 'نانسي',
  Avignon: 'أفينيون',
  Poitiers: 'بواتييه',
  Versailles: 'فرساي',
  Pau: 'بو',
  Cannes: 'كان',
  Calais: 'كاليه',
  Madrid: 'مدريد',
  Barcelona: 'برشلونة',
  Valencia: 'بلنسية',
  Sevilla: 'إشبيلية',
  Zaragoza: 'سرقسطة',
  Malaga: 'مالقة',
  Murcia: 'مرسية',
  Palma: 'بالما',
  Bilbao: 'بلباو',
  Alicante: 'أليكانتي',
  Cordoba: 'قرطبة',
  Granada: 'غرناطة',
  Almeria: 'المرية',
  Toledo: 'طليطلة',
  Brussels: 'بروكسل',
  Antwerp: 'أنتويرب',
  Ghent: 'غنت',
  Charleroi: 'شارلوروا',
  Liège: 'لييج',
  Bruges: 'بروج',
  Namur: 'نامور',
  Leuven: 'لوفان',
  Mons: 'مونس',
  Rome: 'روما',
  Milan: 'ميلانو',
  Naples: 'نابولي',
  Turin: 'تورينو',
  Palermo: 'باليرمو',
  Genoa: 'جنوة',
  Bologna: 'بولونيا',
  Florence: 'فلورنسا',
  Bari: 'باري',
  Catania: 'كاتانيا',
  Venice: 'البندقية',
  Verona: 'فيرونا',
  Berlin: 'برلين',
  Hamburg: 'هامبورغ',
  Munich: 'ميونخ',
  Cologne: 'كولونيا',
  Frankfurt: 'فرانكفورت',
  Stuttgart: 'شتوتغارت',
  Düsseldorf: 'دوسلدورف',
  Dortmund: 'دورتموند',
  Essen: 'إسن',
  Bremen: 'بريمن',
  Dresden: 'درسدن',
  Hanover: 'هانوفر',
  Nuremberg: 'نورمبرغ',
  Duisburg: 'دويسبورغ',
  Bonn: 'بون',
  Amsterdam: 'أمستردام',
  Rotterdam: 'روتردام',
  'The Hague': 'لاهاي',
  Utrecht: 'أوتريخت',
  Eindhoven: 'آيندهوفن',
  London: 'لندن',
  Birmingham: 'برمنغهام',
  Glasgow: 'غلاسكو',
  Liverpool: 'ليفربول',
  Manchester: 'مانشستر',
  Leeds: 'ليدز',
  Edinburgh: 'إدنبرة',
  Montreal: 'مونتريال',
  Toronto: 'تورونتو',
  Vancouver: 'فانكوفر',
  Ottawa: 'أوتاوا',
  Quebec: 'كيبك',
  Calgary: 'كالغاري',
  Edmonton: 'إدمونتون',
  'New York': 'نيويورك',
  'Los Angeles': 'لوس أنجلوس',
  Chicago: 'شيكاغو',
  Houston: 'هيوستن',
  Washington: 'واشنطن',
  Boston: 'بوسطن',
  Miami: 'ميامي',
  Istanbul: 'إسطنبول',
  Ankara: 'أنقرة',
  Izmir: 'إزمير',
  Bursa: 'بورصة',
  Antalya: 'أنطاليا',
  Konya: 'قونية',
};

function parseCities15000(text) {
  const byCountry = new Map();
  const counts = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    const [
      geonameId, name, asciiName, altsRaw, latRaw, lonRaw, , , countryCode, , admin1, ,
      , , popRaw, , , timezone, ,
    ] = f;
    const population = Number(popRaw) || 0;
    if (!timezone || !countryCode) continue;

    const rawAlts = altsRaw ? altsRaw.split(',') : [];
    let ar = WORLD_ARABIC_OVERRIDES[name] || WORLD_ARABIC_OVERRIDES[asciiName];
    if (!ar) {
      const picked = pickArabic(rawAlts);
      if (picked) {
        const cleaned = picked.replace(/\s*\([^)]*\)/g, '').split('،')[0].split(',')[0].trim();
        if (cleaned.length >= 2 && !/[0-9A-Za-z]/.test(cleaned)) {
          ar = cleaned;
        }
      }
    }

    const entry = {
      id: Number(geonameId),
      name,
      ascii: asciiName || name,
      cc: countryCode,
      lat: round(Number(latRaw), 4),
      lon: round(Number(lonRaw), 4),
      tz: timezone,
      pop: population,
      admin: admin1 || undefined,
      ar: ar || undefined,
    };
    if (!entry.admin) delete entry.admin;
    if (!entry.ar) delete entry.ar;

    const list = byCountry.get(countryCode) ?? [];
    list.push(entry);
    byCountry.set(countryCode, list);
    counts.set(countryCode, (counts.get(countryCode) ?? 0) + 1);
  }

  const cities = [];
  for (const [cc, list] of byCountry) {
    list.sort((a, b) => b.pop - a.pop);
    const maxForCountry = COUNTRY_QUOTAS[cc] ?? DEFAULT_PER_COUNTRY;
    const isPrioritized = cc in COUNTRY_QUOTAS;
    let kept = 0;
    for (const city of list) {
      if (kept >= maxForCountry) break;
      if (!isPrioritized && kept >= 1 && city.pop < DEFAULT_MIN_POP_CAP) break;
      cities.push(city);
      kept += 1;
    }
  }
  return { cities, counts };
}

function buildRecord(f, admin1, admin2) {
  const id = Number(f[0]);
  const lat = Number(f[4]);
  const lon = Number(f[5]);
  const name = f[1];
  const ascii = f[2] || name;
  const seenVariants = new Set([name.toLowerCase(), ascii.toLowerCase()]);
  const alts = [];
  for (const raw of (f[3] || '').split(',')) {
    const value = raw.trim();
    if (!value || !usefulVariant(value)) continue;
    const key = value.normalize('NFKC').toLowerCase();
    if (seenVariants.has(key)) continue;
    seenVariants.add(key);
    alts.push(value);
  }

  const adminCode = f[10] || '';
  const provinceCode = f[11] || '';
  const admin1Entry = adminCode ? admin1.get(`MA.${adminCode}`) : undefined;
  const admin2Entry = adminCode && provinceCode ? admin2.get(`MA.${adminCode}.${provinceCode}`) : undefined;
  const entry = {
    id,
    name,
    ascii,
    cc: MOROCCO,
    lat: round(lat),
    lon: round(lon),
    tz: f[17],
    pop: Number(f[14]) || 0,
    admin: admin1Entry ? adminCode : undefined,
    region: admin1Entry?.name,
    province: admin2Entry?.name,
    ar: ARABIC_NAME_OVERRIDES[name] ?? pickArabic(alts),
    alts: alts.length ? alts.slice(0, 12) : undefined,
  };
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key];
  }
  return { entry, altTokenCount: alts.length, adminCode };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// --------------------------------------------------------------------- input

const maText = await readFile(args.ma, 'utf8');
const admin1 = readTable(args.admin1);
const admin2 = readTable(args.admin2);
const maLines = maText.split('\n').filter((line) => line.trim());

const report = {
  generatedAt: new Date().toISOString(),
  inputs: {
    morocco: relative(ROOT, args.ma),
    moroccoLines: maLines.length,
    world: args.cities ? relative(ROOT, args.cities) : null,
    admin1: args.admin1 ? relative(ROOT, args.admin1) : null,
    admin2: args.admin2 ? relative(ROOT, args.admin2) : null,
  },
  acceptedFeatureCodes: [...MOROCCO_FEATURES.keys()],
  rejected: { featureClass: 0, featureCode: 0, coordinateEnvelope: 0, timeZone: 0, invalidId: 0, invalidCoordinate: 0, duplicateId: 0 },
  seenFeatureCodes: {},
  accepted: [],
  checks: {},
  regions: {},
};

const morocco = [];
const acceptedIds = new Set();
const seenAllIds = new Map();
const altTokensPerEntry = [];
const provisional = [];

for (const line of maLines) {
  const f = line.split('\t');
  const code = f[7];
  report.seenFeatureCodes[code] = (report.seenFeatureCodes[code] ?? 0) + 1;
  if (f[6] !== 'P') {
    report.rejected.featureClass += 1;
    continue;
  }
  if (!MOROCCO_FEATURES.has(code)) {
    report.rejected.featureCode += 1;
    continue;
  }

  const id = Number(f[0]);
  if (!Number.isFinite(id)) {
    report.rejected.invalidId += 1;
    continue;
  }
  const lat = Number(f[4]);
  const lon = Number(f[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    report.rejected.invalidCoordinate += 1;
    continue;
  }
  const tz = f[17];
  const insideEnvelope =
    lat >= ENVELOPE.minLat && lat <= ENVELOPE.maxLat && lon >= ENVELOPE.minLon && lon <= ENVELOPE.maxLon;
  if (!insideEnvelope) {
    report.rejected.coordinateEnvelope += 1;
    provisional.push({
      id,
      name: f[1],
      code,
      lat,
      lon,
      tz,
      reason: 'coordonnées hors de l’enveloppe Maroc + Sahara occidental',
    });
    continue;
  }
  if (!MOROCCO_ZONES.has(tz)) {
    report.rejected.timeZone += 1;
    provisional.push({ id, name: f[1], code, lat, lon, tz, reason: 'fuseau horaire incompatible' });
    continue;
  }
  if (acceptedIds.has(id)) {
    report.rejected.duplicateId += 1;
    continue;
  }
  acceptedIds.add(id);
  seenAllIds.set(id, (seenAllIds.get(id) ?? 0) + 1);
  const { entry, altTokenCount } = buildRecord(f, admin1, admin2);
  altTokensPerEntry.push(altTokenCount);
  morocco.push(entry);
}

morocco.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name, 'fr'));

// ------------------------------------------------------------------- checks

const ids = new Set();
const idDuplicates = [];
const placeDuplicates = [];
const badCoords = [];
const zeroCoords = [];
const badZones = [];
const outsideEnvelope = [];
const nameAt = new Map();
const nearPairs = [];

for (const city of morocco) {
  if (ids.has(city.id)) idDuplicates.push(city.id);
  ids.add(city.id);

  if (!Number.isFinite(city.lat) || !Number.isFinite(city.lon)) badCoords.push(city.id);
  if (city.lat === 0 && city.lon === 0) zeroCoords.push(city.id);
  if (!MOROCCO_ZONES.has(city.tz)) badZones.push({ id: city.id, tz: city.tz });
  if (
    city.lat < ENVELOPE.minLat ||
    city.lat > ENVELOPE.maxLat ||
    city.lon < ENVELOPE.minLon ||
    city.lon > ENVELOPE.maxLon
  ) {
    outsideEnvelope.push({ id: city.id, name: city.name, lat: city.lat, lon: city.lon });
  }

  const normalised = normaliseName(city.name);
  const bucket = nameAt.get(normalised);
  if (bucket) bucket.push(city);
  else nameAt.set(normalised, [city]);
}

for (const [, bucket] of nameAt) {
  if (bucket.length < 2) continue;
  for (let i = 0; i < bucket.length; i += 1) {
    for (let j = i + 1; j < bucket.length; j += 1) {
      const distanceKm = haversineKm(bucket[i], bucket[j]);
      if (distanceKm < 1) {
        nearPairs.push({
          name: bucket[i].name,
          distanceKm: Math.round(distanceKm * 100) / 100,
          ids: [bucket[i].id, bucket[j].id],
        });
      }
    }
  }
}

// Exact duplicate name+coordinate pairs (the same file rounded to 5 decimals).
const exactKeys = new Map();
for (const city of morocco) {
  const key = `${normaliseName(city.name)}|${city.lat.toFixed(4)}|${city.lon.toFixed(4)}`;
  if (exactKeys.has(key)) placeDuplicates.push([exactKeys.get(key), city.id]);
  else exactKeys.set(key, city.id);
}

report.accepted = {
  total: morocco.length,
  withArabic: morocco.filter((city) => city.ar).length,
  withVariants: morocco.filter((city) => city.alts?.length).length,
  variantTokens: altTokensPerEntry.reduce((sum, n) => sum + n, 0),
  maxVariantsStored: Math.max(...morocco.map((city) => city.alts?.length ?? 0)),
  populationAboveZero: morocco.filter((city) => city.pop > 0).length,
  populationZero: morocco.filter((city) => city.pop === 0).length,
  biggest: morocco[0] ? { name: morocco[0].name, pop: morocco[0].pop } : null,
};

// Feature-code counts of the accepted set, recomputed from the raw rows.
report.accepted.byFeatureCode = {};
for (const line of maLines) {
  const f = line.split('\t');
  if (f[6] !== 'P' || !MOROCCO_FEATURES.has(f[7])) continue;
  const id = Number(f[0]);
  if (!acceptedIds.has(id)) continue;
  report.accepted.byFeatureCode[f[7]] = (report.accepted.byFeatureCode[f[7]] ?? 0) + 1;
}

report.checks = {
  duplicateIds: idDuplicates.length,
  duplicateNameCoordinates: placeDuplicates.length,
  sameNameWithin1km: nearPairs.length,
  sameNameWithin1kmSample: nearPairs.slice(0, 20),
  infiniteCoordinates: badCoords.length,
  zeroZeroCoordinates: zeroCoords.length,
  incompatibleZones: badZones.length,
  outsideEnvelope: outsideEnvelope.length,
  unknownAdminCodes: morocco.filter((city) => !city.admin).length,
  rejectedEntries: provisional,
};
report.checks.duplicateNameCoordinatesSample = placeDuplicates.slice(0, 20);

if (morocco.length < 40_000) {
  throw new Error(`only ${morocco.length} Moroccan localities survived the filter: refusing to write a truncated catalogue`);
}
if (idDuplicates.length || placeDuplicates.length || badCoords.length || badZones.length || outsideEnvelope.length) {
  throw new Error(
    `catalogue consistency failed: ids=${idDuplicates.length} places=${placeDuplicates.length} ` +
      `coords=${badCoords.length} zones=${badZones.length} envelope=${outsideEnvelope.length}`,
  );
}

// ------------------------------------------------------------- world cities

let world = { cities: [], counts: new Map() };
if (args.cities) {
  world = parseCities15000(await readFile(args.cities, 'utf8'));
}
const worldCities = world.cities.filter((city) => city.cc !== MOROCCO);

// ------------------------------------------------------------------- split

const byRegion = new Map();
for (const city of morocco) {
  const key = city.admin ?? UNKNOWN_REGION;
  const list = byRegion.get(key) ?? [];
  list.push(city);
  byRegion.set(key, list);
}

const regionsMeta = {};
const regionFiles = new Map();
for (const [key, list] of [...byRegion].sort(([a], [b]) => a.localeCompare(b))) {
  list.sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name, 'fr'));
  const info = admin1.get(`MA.${key}`);
  const name = key === UNKNOWN_REGION ? UNKNOWN_REGION_NAME : (info?.name ?? `Région ${key}`);
  const ar = key === UNKNOWN_REGION ? undefined : (REGION_AR[key] ?? info?.ar);
  const fileName = `ma-${key}.json`;
  const payload = {
    version: 1,
    generatedAt: report.generatedAt,
    license: 'CC BY 4.0',
    attribution: '© GeoNames contributors — https://www.geonames.org/',
    region: key === UNKNOWN_REGION ? null : key,
    name,
    ar,
    count: list.length,
    cities: list,
  };
  regionFiles.set(fileName, payload);
  regionsMeta[key] = { name, ar, file: fileName, count: list.length };
  report.regions[key] = { name, count: list.length, file: fileName };
}

if (byRegion.has(MOROCCO)) throw new Error('admin code MA cannot be a region');

// The 12 official regions must all be present, otherwise a rebuild lost data.
const official = Object.keys(REGION_AR);
const missing = official.filter((key) => !byRegion.has(key));
if (missing.length) throw new Error(`missing Moroccan regions: ${missing.join(', ')}`);

// -------------------------------------------------------------------- core

const coreMa = [...morocco].slice(0, CORE_MA_LIMIT);
const coreCities = [...worldCities, ...coreMa].sort((a, b) =>
  a.cc === b.cc ? b.pop - a.pop || a.name.localeCompare(b.name, 'fr') : a.cc.localeCompare(b.cc),
);

const countryCounts = {};
for (const city of worldCities) countryCounts[city.cc] = (countryCounts[city.cc] ?? 0) + 1;
countryCounts[MOROCCO] = morocco.length;

const countryCodes = Object.keys(countryCounts).sort();

const regions = Object.fromEntries(
  official
    .filter((key) => admin1.has(`MA.${key}`))
    .map((key) => [key, { name: admin1.get(`MA.${key}`).name, ar: REGION_AR[key] ?? admin1.get(`MA.${key}`).ar }]),
);

const corePayload = {
  generatedAt: report.generatedAt,
  source:
    'GeoNames country dump MA (every inhabited populated place) + cities15000 (top cities per country)',
  sourceUrls: [
    'https://download.geonames.org/export/dump/MA.zip',
    'https://download.geonames.org/export/dump/cities15000.zip',
    'https://download.geonames.org/export/dump/admin1CodesASCII.txt',
    'https://download.geonames.org/export/dump/admin2Codes.txt',
  ],
  license: 'CC BY 4.0',
  attribution: '© GeoNames contributors — https://www.geonames.org/',
  note:
    'Initial bundle: all world top cities plus the 300 largest Moroccan localities. ' +
    'Every other Moroccan locality is in /data/cities/index.json and /data/cities/ma-XX.json.',
  counts: {
    total: worldCities.length + morocco.length,
    morocco: morocco.length,
    otherCountries: worldCities.length,
    countries: countryCodes.length,
    moroccoWithArabic: morocco.filter((city) => city.ar).length,
    moroccoWithVariants: morocco.filter((city) => city.alts?.length).length,
    bundled: coreCities.length,
    bundledMorocco: coreMa.length,
  },
  countryCodes,
  countryCounts,
  regions,
  regionBuckets: regionsMeta,
  cities: coreCities,
};

const indexPayload = {
  version: 1,
  generatedAt: report.generatedAt,
  license: 'CC BY 4.0',
  attribution: '© GeoNames contributors — https://www.geonames.org/',
  note:
    'Light search index for every Moroccan locality. Fields: [id, name, regionKey, lat, lon]. ' +
    'Population and Arabic spellings are sparse maps. Full records live in ma-<region>.json.',
  total: morocco.length,
  regions: regionsMeta,
  cities: morocco.map((city) => [city.id, city.name, city.admin ?? UNKNOWN_REGION, city.lat, city.lon]),
  population: Object.fromEntries(morocco.filter((city) => city.pop > 0).map((city) => [city.id, city.pop])),
  arabic: Object.fromEntries(morocco.filter((city) => city.ar).map((city) => [city.id, city.ar])),
  zones: Object.fromEntries(
    morocco.filter((city) => city.tz !== 'Africa/Casablanca').map((city) => [city.id, city.tz]),
  ),
};

// ------------------------------------------------------------------- output

await rm(PUBLIC_DIR, { recursive: true, force: true });
await mkdir(PUBLIC_DIR, { recursive: true });
await mkdir(dirname(CORE_OUT), { recursive: true });

await writeFile(CORE_OUT, JSON.stringify(corePayload), 'utf8');
await writeFile(INDEX_OUT, JSON.stringify(indexPayload), 'utf8');
for (const [fileName, payload] of regionFiles) {
  await writeFile(join(PUBLIC_DIR, fileName), JSON.stringify(payload), 'utf8');
}

const fullPayload = {
  generatedAt: report.generatedAt,
  source: corePayload.source,
  sourceUrls: corePayload.sourceUrls,
  license: corePayload.license,
  attribution: corePayload.attribution,
  note:
    'Full filtered dataset, used by tests and reports. The application imports cities-core.json, ' +
    'not this file.',
  counts: corePayload.counts,
  countryCodes,
  countryCounts,
  regions,
  cities: [...morocco, ...worldCities].sort((a, b) =>
    a.cc === b.cc ? b.pop - a.pop || a.name.localeCompare(b.name, 'fr') : a.cc.localeCompare(b.cc),
  ),
};
await writeFile(FULL_OUT, JSON.stringify(fullPayload), 'utf8');

const size = (path) => stat(path);
const coreBytes = (await size(CORE_OUT)).size;
const indexBytes = (await size(INDEX_OUT)).size;
const regionBytes = (
  await Promise.all([...regionFiles.keys()].map(async (name) => (await size(join(PUBLIC_DIR, name))).size))
).reduce((sum, n) => sum + n, 0);

report.outputs = {
  core: { file: relative(ROOT, CORE_OUT).replaceAll('\\', '/'), bytes: coreBytes, cities: coreCities.length },
  index: { file: relative(ROOT, INDEX_OUT).replaceAll('\\', '/'), bytes: indexBytes, entries: morocco.length },
  regions: { files: regionFiles.size, bytes: regionBytes },
  full: { file: relative(ROOT, FULL_OUT).replaceAll('\\', '/') },
  totalMoroccoBytes: indexBytes + regionBytes,
};
report.counts = {
  morocco: morocco.length,
  world: worldCities.length,
  total: morocco.length + worldCities.length,
  countries: countryCodes.length,
  bundled: coreCities.length,
  notBundled: morocco.length - coreMa.length,
};

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;

const featureRows = Object.entries(report.accepted.byFeatureCode)
  .sort((a, b) => b[1] - a[1])
  .map(([code, count]) => `| \`${code}\` | ${MOROCCO_FEATURES.get(code)} | ${count.toLocaleString('fr-FR')} |`)
  .join('\n');

const rejectedRows = Object.entries(report.seenFeatureCodes)
  .filter(([code]) => !MOROCCO_FEATURES.has(code))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([code, count]) => `| \`${code}\` | ${count.toLocaleString('fr-FR')} |`)
  .join('\n');

const regionRows = Object.entries(report.regions)
  .map(
    ([key, info]) =>
      `| \`${key}\` | ${info.name} | ${info.count.toLocaleString('fr-FR')} | \`${info.file}\` |`,
  )
  .join('\n');

const markdown = `# GeoNames — vérification du catalogue

Rapport généré par \`scripts/build-cities.mjs\` le ${report.generatedAt}.
Les chiffres ci-dessous proviennent du fichier réel \`${report.inputs.morocco}\`
(${report.inputs.moroccoLines.toLocaleString('fr-FR')} lignes), et non d'une estimation.

## Filtre appliqué

Seule la classe \`P\` (lieu habité) est retenue, et uniquement les codes de localité
habitée. Les sections urbaines (\`PPLX\`), lieux abandonnés (\`PPLQ\`) et lieux
religieux (\`PPLR\`) sont exclus, comme tous les reliefs, cours d'eau, bâtiments et
divisions administratives.

| Code | Signification | Entrées retenues |
| --- | --- | ---: |
${featureRows}

Entrées rejetées (principaux codes non habités) :

| Code | Entrées |
| --- | ---: |
${rejectedRows}

Autres rejets : ${report.rejected.coordinateEnvelope} coordonnées hors enveloppe
(Maroc + Sahara occidental : ${ENVELOPE.minLat}–${ENVELOPE.maxLat} °N,
${ENVELOPE.minLon}–${ENVELOPE.maxLon} °E), ${report.rejected.timeZone} fuseau(x)
incompatible(s), ${report.rejected.invalidCoordinate} coordonnée(s) invalide(s),
${report.rejected.duplicateId} identifiant(s) dupliqué(s).

## Contrôles

| Contrôle | Résultat |
| --- | ---: |
| Identifiants dupliqués | ${report.checks.duplicateIds} |
| Doublons exacts nom + coordonnées | ${report.checks.duplicateNameCoordinates} |
| Même nom normalisé à moins de 1 km | ${report.checks.sameNameWithin1km} |
| Coordonnées non finies | ${report.checks.infiniteCoordinates} |
| Coordonnées 0,0 | ${report.checks.zeroZeroCoordinates} |
| Fuseaux hors Maroc | ${report.checks.incompatibleZones} |
| Entrées hors enveloppe | ${report.checks.outsideEnvelope} |
| Codes admin absents de la table | ${report.checks.unknownAdminCodes} |

Les ${report.checks.sameNameWithin1km} paires « même nom à moins de 1 km » sont des
homonymes très proches de GeoNames (hameaux voisins), pas des doublons exacts :
elles sont conservées, car ce sont des localités distinctes.

Entrées écartées pour incohérence de coordonnées ou de fuseau :

${report.checks.rejectedEntries.map((entry) => `- \`${entry.id}\` ${entry.name} (${entry.code}) — ${entry.lat}, ${entry.lon}, ${entry.tz} : ${entry.reason}`).join('\n') || '- Aucune'}

## Variantes de noms

- Localités avec nom arabe : ${report.accepted.withArabic.toLocaleString('fr-FR')}
- Localités avec variantes de recherche : ${report.accepted.withVariants.toLocaleString('fr-FR')}
- Jetons de variantes retenus : ${report.accepted.variantTokens.toLocaleString('fr-FR')}
- Maximum de variantes stockées par entrée : ${report.accepted.maxVariantsStored}
- Localités sans population GeoNames : ${report.accepted.populationZero.toLocaleString('fr-FR')}
  (${report.accepted.populationAboveZero.toLocaleString('fr-FR')} avec population)

## Répartition et découpage

| Clé | Région | Localités | Fichier |
| --- | --- | ---: | --- |
${regionRows}

## Sorties

- \`${report.outputs.core.file}\` — ${coreCities.length.toLocaleString('fr-FR')} entrées, ${kib(coreBytes)} : **embarqué**.
- \`${report.outputs.index.file}\` — ${morocco.length.toLocaleString('fr-FR')} entrées, ${kib(indexBytes)} : chargé à la demande.
- \`public/data/cities/ma-XX.json\` — ${regionFiles.size} fichiers, ${mib(regionBytes)} au total : chargés par région.
- \`${report.outputs.full.file}\` — dataset complet filtré, réservé aux tests et rapports.

## Limites connues

- GeoNames est déclaratif : une localité peut être un douar de quelques foyers,
  et ${report.accepted.populationZero.toLocaleString('fr-FR')} entrées n'ont aucune population renseignée.
- ${report.checks.unknownAdminCodes} entrées ont un code administratif absent de la table GeoNames ;
  elles sont conservées dans \`ma-00.json\` avec la mention « rattachement incertain ».
- Les noms arabes ne proviennent que des variantes GeoNames et d'une liste vérifiée
  de 40 grandes villes : aucune traduction automatique n'est inventée.

Licence des données : CC BY 4.0 — © GeoNames contributors — https://www.geonames.org/
`;

await writeFile(REPORT_OUT, markdown, 'utf8');
await writeFile(join(ROOT, 'data-source', 'cities-report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log(
  `Morocco: ${morocco.length} localities (${report.accepted.withArabic} with Arabic names, ` +
    `${report.accepted.variantTokens} variant tokens). Rejected: ${report.rejected.featureCode} non-inhabited codes, ` +
    `${report.rejected.coordinateEnvelope} out of envelope, ${report.rejected.timeZone} bad zones.`,
);
console.log(
  `core ${kib(coreBytes)} (${coreCities.length} cities) · index ${kib(indexBytes)} · ` +
    `regions ${mib(regionBytes)} in ${regionFiles.size} files · full dataset ${mib((await size(FULL_OUT)).size)}`,
);
