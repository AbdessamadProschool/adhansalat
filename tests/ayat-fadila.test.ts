import { describe, expect, it } from 'vitest';
import {
  AYAT_FADILA_ITEMS,
  getAyatFadilaBySection,
  getAyatFadilaById,
  searchAyatFadila,
} from '../src/core/ayat-fadila';

describe('Ayat wa Suwar Al-Fadila Dataset & Core API', () => {
  it('contains all 40 requested Quranic virtue items', () => {
    expect(AYAT_FADILA_ITEMS.length).toBe(40);
  });

  it('correctly partitions items into the 3 tiers', () => {
    const verses = getAyatFadilaBySection('verses');
    const qisar = getAyatFadilaBySection('qisar');
    const surahs = getAyatFadilaBySection('surahs');

    expect(verses.length).toBe(14);
    expect(qisar.length).toBe(15);
    expect(surahs.length).toBe(11);
    expect(verses.length + qisar.length + surahs.length).toBe(40);
  });

  it('verifies that each item has unique IDs and complete metadata', () => {
    const ids = new Set<string>();
    for (const item of AYAT_FADILA_ITEMS) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);

      expect(item.surahNumber).toBeGreaterThan(0);
      expect(item.surahNameAr.trim().length).toBeGreaterThan(0);
      expect(item.titleAr.trim().length).toBeGreaterThan(0);
      expect(item.titleFr.trim().length).toBeGreaterThan(0);
      expect(item.titleEn.trim().length).toBeGreaterThan(0);
      expect(item.arabic.trim().length).toBeGreaterThan(0);
      expect(item.reference.trim().length).toBeGreaterThan(0);
      expect(item.virtueAr.trim().length).toBeGreaterThan(0);
      expect(item.virtueFr.trim().length).toBeGreaterThan(0);
      expect(item.virtueEn.trim().length).toBeGreaterThan(0);
      expect(item.count).toBeGreaterThanOrEqual(1);

      // Verify authentic ayah delimiter ۝ exists in the Quranic text
      expect(item.arabic).toContain('۝');
    }
  });

  it('finds items by id reliably', () => {
    const fatiha = getAyatFadilaById('verse-fatiha');
    expect(fatiha).toBeDefined();
    expect(fatiha?.surahNumber).toBe(1);
    expect(fatiha?.surahNameAr).toBe('الفاتحة');

    const mulk = getAyatFadilaById('surah-al-mulk');
    expect(mulk).toBeDefined();
    expect(mulk?.surahNumber).toBe(67);
    expect(mulk?.surahNameAr).toBe('الملك');

    const ikhlas = getAyatFadilaById('qisar-al-ikhlas');
    expect(ikhlas).toBeDefined();
    expect(ikhlas?.surahNumber).toBe(112);
  });

  it('searches flexibly with diacritic normalization and multilingual queries', () => {
    // Search with and without harakat
    const searchWithHarakat = searchAyatFadila('الْكُرْسِيِّ');
    const searchWithoutHarakat = searchAyatFadila('الكرسي');
    expect(searchWithoutHarakat.length).toBeGreaterThan(0);
    expect(searchWithoutHarakat.some((x) => x.id === 'verse-ayat-kursi')).toBe(true);
    expect(searchWithHarakat.length).toBe(searchWithoutHarakat.length);

    // Search French
    const searchFr = searchAyatFadila('Pauvreté');
    expect(searchFr.some((x) => x.id === 'surah-al-waqiah')).toBe(true);

    // Search English
    const searchEn = searchAyatFadila('Sovereignty');
    expect(searchEn.some((x) => x.id === 'surah-al-mulk')).toBe(true);

    // Search by section filter
    const qisarOnly = searchAyatFadila('', 'qisar');
    expect(qisarOnly.length).toBe(15);
  });
});
