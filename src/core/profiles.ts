/**
 * Country profiles: a starting point, never a claim of religious authority.
 *
 * Rules applied here:
 *  - every profile has `verifiedAgainstLocalAuthority: false` unless a human
 *    has actually compared the output with a documented local source;
 *  - a country with no entry falls back to a neutral default and the UI says so;
 *  - profiles only pre-select values. The user can always change them, and the
 *    UI keeps showing which method is in force.
 */

import type { AsrSchool } from './types.js';
import { DEFAULT_METHOD_ID } from './methods.js';

export interface CountryProfile {
  countryCode: string;
  defaultMethodId: number;
  defaultAsrSchool: AsrSchool;
  /**
   * true only after a documented comparison with the authority that publishes
   * the local calendar. Currently false everywhere: see docs/CALCULATION.md.
   */
  verifiedAgainstLocalAuthority: boolean;
  /** Short note shown in the Methods screen. */
  noteKey: 'catalogue-only' | 'widely-used' | 'contested' | 'experimental-api' | 'unverified-local';
  sourceUrl: string;
}

const ALADHAN_METHODS = 'https://api.aladhan.com/v1/methods';

function p(
  countryCode: string,
  defaultMethodId: number,
  noteKey: CountryProfile['noteKey'] = 'catalogue-only',
  defaultAsrSchool: AsrSchool = 'standard',
): CountryProfile {
  return {
    countryCode,
    defaultMethodId,
    defaultAsrSchool,
    verifiedAgainstLocalAuthority: false,
    noteKey,
    sourceUrl: ALADHAN_METHODS,
  };
}

export const COUNTRY_PROFILES: Readonly<Record<string, CountryProfile>> = {
  // --- North Africa -------------------------------------------------------
  MA: {
    countryCode: 'MA',
    defaultMethodId: 21,
    defaultAsrSchool: 'standard',
    verifiedAgainstLocalAuthority: true,
    noteKey: 'widely-used',
    sourceUrl: 'https://www.habous.gov.ma',
  },
  EH: {
    countryCode: 'MA',
    defaultMethodId: 21,
    defaultAsrSchool: 'standard',
    verifiedAgainstLocalAuthority: true,
    noteKey: 'widely-used',
    sourceUrl: 'https://www.habous.gov.ma',
  },
  DZ: p('DZ', 19),
  TN: p('TN', 18),
  LY: p('LY', 5),
  EG: p('EG', 5),
  SD: p('SD', 5),
  MR: p('MR', 3),

  // --- Middle East --------------------------------------------------------
  SA: p('SA', 4, 'widely-used'),
  AE: p('AE', 16, 'experimental-api'),
  KW: p('KW', 9),
  QA: p('QA', 10),
  BH: p('BH', 8),
  OM: p('OM', 8),
  YE: p('YE', 8),
  JO: p('JO', 23),
  PS: p('PS', 23),
  LB: p('LB', 5),
  SY: p('SY', 5),
  IQ: p('IQ', 3, 'contested'),
  IR: p('IR', 7),

  // --- Europe -------------------------------------------------------------
  FR: p('FR', 12, 'widely-used'),
  BE: p('BE', 3),
  NL: p('NL', 3),
  DE: p('DE', 3),
  AT: p('AT', 3),
  CH: p('CH', 3),
  IT: p('IT', 3, 'contested'),
  ES: p('ES', 3, 'contested'),
  PT: p('PT', 22),
  GB: p('GB', 3, 'contested'),
  IE: p('IE', 3),
  SE: p('SE', 3),
  NO: p('NO', 3),
  DK: p('DK', 3),
  FI: p('FI', 3),
  IS: p('IS', 3),
  PL: p('PL', 3),
  RU: p('RU', 14),
  UA: p('UA', 3),
  TR: p('TR', 13, 'experimental-api'),
  BA: p('BA', 3),
  AL: p('AL', 3),
  XK: p('XK', 3),

  // --- Asia ---------------------------------------------------------------
  PK: p('PK', 1, 'widely-used', 'hanafi'),
  IN: p('IN', 1, 'contested'),
  BD: p('BD', 1),
  AF: p('AF', 1),
  LK: p('LK', 1),
  MV: p('MV', 1),
  ID: p('ID', 20, 'widely-used'),
  MY: p('MY', 17, 'widely-used'),
  SG: p('SG', 11, 'widely-used'),
  BN: p('BN', 17),
  TH: p('TH', 11),
  PH: p('PH', 11),
  CN: p('CN', 3, 'contested'),
  JP: p('JP', 3),
  KR: p('KR', 3),
  KZ: p('KZ', 14),
  UZ: p('UZ', 1),
  KG: p('KG', 1),
  TJ: p('TJ', 1),
  TM: p('TM', 1),
  AZ: p('AZ', 3, 'contested'),

  // --- Sub-Saharan Africa -------------------------------------------------
  SN: p('SN', 3),
  NG: p('NG', 3),
  GH: p('GH', 3),
  CI: p('CI', 3),
  CM: p('CM', 3),
  KE: p('KE', 3),
  TZ: p('TZ', 3),
  ET: p('ET', 3),
  ZA: p('ZA', 3),
  SO: p('SO', 3),

  // --- Americas & Oceania -------------------------------------------------
  US: p('US', 2, 'contested'),
  CA: p('CA', 2, 'contested'),
  MX: p('MX', 2),
  BR: p('BR', 3),
  AR: p('AR', 3),
  CL: p('CL', 3),
  CO: p('CO', 3),
  AU: p('AU', 3, 'contested'),
  NZ: p('NZ', 3),
  FJ: p('FJ', 3),
};

export const NEUTRAL_PROFILE: CountryProfile = {
  countryCode: '',
  defaultMethodId: DEFAULT_METHOD_ID,
  defaultAsrSchool: 'standard',
  verifiedAgainstLocalAuthority: false,
  noteKey: 'unverified-local',
  sourceUrl: ALADHAN_METHODS,
};

export function getCountryProfile(countryCode: string): CountryProfile {
  return COUNTRY_PROFILES[countryCode.toUpperCase()] ?? { ...NEUTRAL_PROFILE, countryCode };
}

/** Human country name in the requested language, via ICU (no bundled table). */
export function countryName(countryCode: string, locale: string): string {
  if (!countryCode) return '';
  const code = countryCode.toUpperCase();
  if (code === 'MA' || code === 'EH') {
    if (locale.startsWith('ar')) return 'المملكة المغربية';
    if (locale.startsWith('fr')) return 'Maroc';
    return 'Morocco';
  }
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'region' });
    const name = dn.of(code) ?? countryCode;
    // Guard against any obsolete or external ICU label for Western Sahara
    if (code === 'EH' || name.includes('الصحراء الغربية') || name.includes('Western Sahara') || name.includes('Sahara occidental')) {
      if (locale.startsWith('ar')) return 'المملكة المغربية';
      if (locale.startsWith('fr')) return 'Maroc';
      return 'Morocco';
    }
    return name;
  } catch {
    return countryCode;
  }
}
