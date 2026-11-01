/**
 * Calculation method catalogue.
 *
 * Values are transcribed from the live AlAdhan catalogue
 * (https://api.aladhan.com/v1/methods, fetched 2026-10-27) so that the local
 * engine and the API agree on parameters. Being listed here means only that the
 * parameters exist and are documented — it does NOT mean that any authority
 * certifies the resulting minutes for a given country.
 */

export interface LocalisedText {
  en: string;
  fr: string;
  ar: string;
}

export interface CalculationMethod {
  /** AlAdhan catalogue id. Stable and used as the persisted value. */
  id: number;
  key: string;
  name: LocalisedText;
  /** Fajr depression angle in degrees, undefined when the method uses an interval. */
  fajrAngle?: number;
  ishaAngle?: number;
  /** Isha as a fixed interval after sunset (e.g. Umm al-Qura 90 min). */
  ishaIntervalMinutes?: number;
  /** Maghrib as an angle below the horizon (Shia methods). */
  maghribAngle?: number;
  /** Maghrib as a fixed interval after sunset. */
  maghribIntervalMinutes?: number;
  /** Region the method is associated with, for the picker. */
  region: LocalisedText;
  notes: LocalisedText;
  /** "unsupported" methods need a model we do not implement locally. */
  localEngine: 'full' | 'unsupported';
  /** The API itself flags these. We surface that instead of hiding it. */
  experimental: boolean;
  /**
   * Minute corrections baked into the reference implementation's method
   * definition (batoulapps/adhan, which AlAdhan uses). They are part of the
   * method, not a user preference, and must be applied for the engine to agree
   * with published timetables. `observed: true` marks a value we measured
   * against the API because the source library does not publish it.
   */
  methodAdjustments?: Partial<Record<'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>>;
  adjustmentsSource?: 'documented' | 'observed';
}

const t = (en: string, fr: string, ar: string): LocalisedText => ({ en, fr, ar });

export const METHODS: readonly CalculationMethod[] = [
  {
    id: 3,
    key: 'MWL',
    name: t('Muslim World League', 'Ligue islamique mondiale', 'رابطة العالم الإسلامي'),
    fajrAngle: 18,
    ishaAngle: 17,
    region: t('Europe, Far East, parts of the Americas', 'Europe, Extrême-Orient, Amériques', 'أوروبا والشرق الأقصى وأمريكا'),
    notes: t(
      'The most widely used general-purpose method. 18° / 17°.',
      'La méthode générale la plus répandue. 18° / 17°.',
      'الطريقة العامة الأكثر استخداماً. 18° / 17°.',
    ),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { dhuhr: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 2,
    key: 'ISNA',
    name: t('Islamic Society of North America', 'Société islamique d’Amérique du Nord', 'الجمعية الإسلامية لأمريكا الشمالية'),
    fajrAngle: 15,
    ishaAngle: 15,
    region: t('North America', 'Amérique du Nord', 'أمريكا الشمالية'),
    notes: t(
      'Common in North America, but many mosques there use MWL or local timetables instead.',
      'Courante en Amérique du Nord, mais de nombreuses mosquées y utilisent la MWL ou des calendriers locaux.',
      'شائعة في أمريكا الشمالية، لكن مساجد كثيرة تستخدم رابطة العالم الإسلامي أو تقاويم محلية.',
    ),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { dhuhr: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 5,
    key: 'EGYPT',
    name: t('Egyptian General Authority of Survey', 'Autorité égyptienne de topographie', 'الهيئة المصرية العامة للمساحة'),
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    region: t('Egypt, Syria, Iraq, Lebanon, Malaysia', 'Égypte, Syrie, Irak, Liban, Malaisie', 'مصر وسوريا والعراق ولبنان وماليزيا'),
    notes: t('19.5° / 17.5°.', '19,5° / 17,5°.', '19.5° / 17.5°.'),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { dhuhr: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 4,
    key: 'MAKKAH',
    name: t('Umm al-Qura University, Makkah', 'Université Oum al-Qoura, La Mecque', 'جامعة أم القرى، مكة المكرمة'),
    fajrAngle: 18.5,
    ishaIntervalMinutes: 90,
    region: t('Saudi Arabia, Gulf states', 'Arabie saoudite, États du Golfe', 'السعودية ودول الخليج'),
    notes: t(
      'Isha is a fixed 90 minutes after Maghrib, not an angle. During Ramadan the Saudi calendar often uses 120 minutes.',
      'L’Isha est fixée à 90 minutes après le Maghrib, pas par un angle. Pendant le Ramadan, le calendrier saoudien utilise souvent 120 minutes.',
      'العشاء بعد المغرب بـ 90 دقيقة، وليس بزاوية. وفي رمضان يستخدم التقويم السعودي غالباً 120 دقيقة.',
    ),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 1,
    key: 'KARACHI',
    name: t('University of Islamic Sciences, Karachi', 'Université des sciences islamiques, Karachi', 'جامعة العلوم الإسلامية، كراتشي'),
    fajrAngle: 18,
    ishaAngle: 18,
    region: t('Pakistan, India, Bangladesh, Afghanistan', 'Pakistan, Inde, Bangladesh, Afghanistan', 'باكستان والهند وبنغلاديش وأفغانستان'),
    notes: t('18° / 18°.', '18° / 18°.', '18° / 18°.'),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { dhuhr: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 7,
    key: 'TEHRAN',
    name: t('Institute of Geophysics, University of Tehran', 'Institut de géophysique, université de Téhéran', 'معهد الجيوفيزياء، جامعة طهران'),
    fajrAngle: 17.7,
    ishaAngle: 14,
    maghribAngle: 4.5,
    region: t('Iran, some Shia communities', 'Iran, certaines communautés chiites', 'إيران وبعض المجتمعات الشيعية'),
    notes: t(
      'Maghrib is computed at 4.5° below the horizon instead of sunset. Midnight uses the Jaʿfarī convention.',
      'Le Maghrib est calculé à 4,5° sous l’horizon au lieu du coucher du soleil. Minuit suit la convention jaʿfarite.',
      'المغرب يُحسب بزاوية 4.5° تحت الأفق بدل الغروب. منتصف الليل على الاصطلاح الجعفري.',
    ),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 0,
    key: 'JAFARI',
    name: t('Shia Ithna-Ashari, Leva Institute, Qum', 'Chiisme duodécimain, institut Leva, Qom', 'الشيعة الاثنا عشرية، معهد ليفا، قم'),
    fajrAngle: 16,
    ishaAngle: 14,
    maghribAngle: 4,
    region: t('Shia communities', 'Communautés chiites', 'المجتمعات الشيعية'),
    notes: t('16° / 14°, Maghrib at 4°.', '16° / 14°, Maghrib à 4°.', '16° / 14°، المغرب عند 4°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 8,
    key: 'GULF',
    name: t('Gulf Region', 'Région du Golfe', 'منطقة الخليج'),
    fajrAngle: 19.5,
    ishaIntervalMinutes: 90,
    region: t('Gulf states', 'États du Golfe', 'دول الخليج'),
    notes: t('19.5° Fajr, Isha 90 minutes after Maghrib.', 'Fajr 19,5°, Isha 90 minutes après le Maghrib.', 'الفجر 19.5°، العشاء بعد المغرب بـ 90 دقيقة.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 9,
    key: 'KUWAIT',
    name: t('Kuwait', 'Koweït', 'الكويت'),
    fajrAngle: 18,
    ishaAngle: 17.5,
    region: t('Kuwait', 'Koweït', 'الكويت'),
    notes: t('18° / 17.5°.', '18° / 17,5°.', '18° / 17.5°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 10,
    key: 'QATAR',
    name: t('Qatar', 'Qatar', 'قطر'),
    fajrAngle: 18,
    ishaIntervalMinutes: 90,
    region: t('Qatar', 'Qatar', 'قطر'),
    notes: t('18° Fajr, Isha 90 minutes after Maghrib.', 'Fajr 18°, Isha 90 minutes après le Maghrib.', 'الفجر 18°، العشاء بعد المغرب بـ 90 دقيقة.'),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { dhuhr: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 11,
    key: 'SINGAPORE',
    name: t('Majlis Ugama Islam Singapura', 'Conseil islamique de Singapour', 'المجلس الإسلامي السنغافوري'),
    fajrAngle: 20,
    ishaAngle: 18,
    region: t('Singapore, South-East Asia', 'Singapour, Asie du Sud-Est', 'سنغافورة وجنوب شرق آسيا'),
    notes: t('20° / 18°.', '20° / 18°.', '20° / 18°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 12,
    key: 'FRANCE',
    name: t('Union des Organisations Islamiques de France', 'Union des organisations islamiques de France', 'اتحاد المنظمات الإسلامية بفرنسا'),
    fajrAngle: 12,
    ishaAngle: 12,
    region: t('France', 'France', 'فرنسا'),
    notes: t(
      '12° / 12°. Widely used in France for high-latitude months; some mosques apply local corrections.',
      '12° / 12°. Très utilisée en France pour les mois de haute latitude ; certaines mosquées appliquent des corrections locales.',
      '12° / 12°. شائعة في فرنسا لأشهر خطوط العرض العالية، وبعض المساجد تطبق تصحيحات محلية.',
    ),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 13,
    key: 'TURKEY',
    name: t('Diyanet İşleri Başkanlığı', 'Présidence des affaires religieuses (Diyanet)', 'رئاسة الشؤون الدينية التركية'),
    fajrAngle: 18,
    ishaAngle: 17,
    region: t('Türkiye', 'Turquie', 'تركيا'),
    notes: t(
      'The AlAdhan catalogue marks this entry as experimental and models it as 18° / 17°. Diyanet’s own published tables apply country-specific corrections that this angle pair does not reproduce.',
      'Le catalogue AlAdhan marque cette entrée comme expérimentale et la modélise en 18° / 17°. Les tables publiées par la Diyanet appliquent des corrections nationales que ce couple d’angles ne reproduit pas.',
      'يصف كتالوج AlAdhan هذه الطريقة بأنها تجريبية ويُمثّلها بـ 18° / 17°. جداول ديانت المنشورة تطبّق تصحيحات وطنية لا تعكسها هذه الزوايا.',
    ),
    localEngine: 'full',
    experimental: true,
    methodAdjustments: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 },
    adjustmentsSource: 'documented',
  },
  {
    id: 14,
    key: 'RUSSIA',
    name: t('Spiritual Administration of Muslims of Russia', 'Administration spirituelle des musulmans de Russie', 'الإدارة الروحية لمسلمي روسيا'),
    fajrAngle: 16,
    ishaAngle: 15,
    region: t('Russia', 'Russie', 'روسيا'),
    notes: t('16° / 15°.', '16° / 15°.', '16° / 15°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 15,
    key: 'MOONSIGHTING',
    name: t('Moonsighting Committee Worldwide', 'Comité Moonsighting', 'لجنة رؤية الهلال'),
    region: t('Global', 'Mondial', 'عالمي'),
    notes: t(
      'Requires a seasonal shafaq model that this engine does not implement. Selecting it would silently produce wrong Isha times, so it is disabled here.',
      'Nécessite un modèle saisonnier de shafaq que ce moteur n’implémente pas. La sélectionner produirait silencieusement des Isha erronées ; elle est donc désactivée.',
      'تتطلب نموذج شفق موسمياً لا يوفره هذا المحرك. اختيارها سينتج أوقات عشاء خاطئة بصمت، لذا عُطّلت.',
    ),
    localEngine: 'unsupported',
    experimental: false,
    methodAdjustments: { dhuhr: 5, maghrib: 3 },
    adjustmentsSource: 'documented',
  },
  {
    id: 16,
    key: 'DUBAI',
    name: t('Dubai', 'Dubaï', 'دبي'),
    fajrAngle: 18.2,
    ishaAngle: 18.2,
    region: t('United Arab Emirates', 'Émirats arabes unis', 'الإمارات العربية المتحدة'),
    notes: t('18.2° / 18.2°. Flagged experimental by the catalogue.', '18,2° / 18,2°. Marquée expérimentale par le catalogue.', '18.2° / 18.2°. يصنفها الكتالوج تجريبية.'),
    localEngine: 'full',
    experimental: true,
    methodAdjustments: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 },
    adjustmentsSource: 'documented',
  },
  {
    id: 17,
    key: 'JAKIM',
    name: t('Jabatan Kemajuan Islam Malaysia', 'Département du développement islamique de Malaisie', 'إدارة التنمية الإسلامية الماليزية'),
    fajrAngle: 20,
    ishaAngle: 18,
    region: t('Malaysia', 'Malaisie', 'ماليزيا'),
    notes: t('20° / 18°.', '20° / 18°.', '20° / 18°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 18,
    key: 'TUNISIA',
    name: t('Tunisia', 'Tunisie', 'تونس'),
    fajrAngle: 18,
    ishaAngle: 18,
    region: t('Tunisia', 'Tunisie', 'تونس'),
    notes: t('18° / 18°.', '18° / 18°.', '18° / 18°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 19,
    key: 'ALGERIA',
    name: t('Algeria', 'Algérie', 'الجزائر'),
    fajrAngle: 18,
    ishaAngle: 17,
    region: t('Algeria', 'Algérie', 'الجزائر'),
    notes: t('18° / 17°.', '18° / 17°.', '18° / 17°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 20,
    key: 'KEMENAG',
    name: t('Kementerian Agama Republik Indonesia', 'Ministère des affaires religieuses d’Indonésie', 'وزارة الشؤون الدينية الإندونيسية'),
    fajrAngle: 20,
    ishaAngle: 18,
    region: t('Indonesia', 'Indonésie', 'إندونيسيا'),
    notes: t('20° / 18°.', '20° / 18°.', '20° / 18°.'),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 21,
    key: 'MOROCCO',
    name: t('Morocco (Ministry of Habous)', 'Maroc (Ministère des Habous)', 'المملكة المغربية (وزارة الأوقاف)'),
    fajrAngle: 19,
    ishaAngle: 17,
    region: t('Morocco', 'Maroc', 'المغرب'),
    notes: t(
      'Official method aligned with the Moroccan Ministry of Habous and Islamic Affairs (19°/17°, Dhuhr +5, Maghrib +4, Fajr +1, Isha +1).',
      'Méthode officielle alignée sur le Ministère des Habous et des Affaires Islamiques du Maroc (19°/17°, Dhuhr +5, Maghrib +4, Fajr +1, Isha +1).',
      'طريقة رسمية مطابقة لحسابات وزارة الأوقاف والشؤون الإسلامية بالمملكة المغربية (19°/17°، الظهر +5، المغرب +4، الفجر +1، العشاء +1).',
    ),
    localEngine: 'full',
    experimental: false,
    methodAdjustments: { fajr: 1, sunrise: -1, dhuhr: 5, asr: 1, maghrib: 4, isha: 1 },
    adjustmentsSource: 'documented',
  },
  {
    id: 22,
    key: 'PORTUGAL',
    name: t('Comunidade Islâmica de Lisboa', 'Communauté islamique de Lisbonne', 'الجالية الإسلامية في لشبونة'),
    fajrAngle: 18,
    maghribIntervalMinutes: 3,
    ishaIntervalMinutes: 77,
    region: t('Portugal', 'Portugal', 'البرتغال'),
    notes: t(
      'Fajr 18°, Maghrib 3 minutes after sunset, Isha 77 minutes after sunset.',
      'Fajr 18°, Maghrib 3 minutes après le coucher, Isha 77 minutes après le coucher.',
      'الفجر 18°، المغرب بعد الغروب بـ 3 دقائق، العشاء بعد الغروب بـ 77 دقيقة.',
    ),
    localEngine: 'full',
    experimental: false,
  },
  {
    id: 23,
    key: 'JORDAN',
    name: t('Ministry of Awqaf, Jordan', 'Ministère des Awqaf, Jordanie', 'وزارة الأوقاف، الأردن'),
    fajrAngle: 18,
    ishaAngle: 18,
    maghribIntervalMinutes: 5,
    region: t('Jordan', 'Jordanie', 'الأردن'),
    notes: t('18° / 18°, Maghrib 5 minutes after sunset.', '18° / 18°, Maghrib 5 minutes après le coucher.', '18° / 18°، المغرب بعد الغروب بـ 5 دقائق.'),
    localEngine: 'full',
    experimental: false,
  },
];

const BY_ID = new Map(METHODS.map((m) => [m.id, m]));

export const DEFAULT_METHOD_ID = 3; // Muslim World League

export function getMethod(id: number): CalculationMethod {
  const m = BY_ID.get(id);
  if (!m) {
    // A stored id from a future catalogue entry must never crash the app.
    const fallback = BY_ID.get(DEFAULT_METHOD_ID);
    if (!fallback) throw new Error('Method catalogue is empty');
    return fallback;
  }
  return m;
}

export function isMethodSupported(id: number): boolean {
  return BY_ID.get(id)?.localEngine === 'full';
}

export function selectableMethods(): CalculationMethod[] {
  return METHODS.filter((m) => m.localEngine === 'full');
}
