import { describe, expect, it } from 'vitest';
import {
  ADHKAR_LIST,
  getAdhkarByCategory,
  getCurrentAdhkarCategory,
} from '../src/core/adhkar.js';

describe('Adhkar Supplications module', () => {
  it('contains verified authentic collections for morning, evening, after-prayer, ramadan, and essential', () => {
    const morning = getAdhkarByCategory('morning');
    const evening = getAdhkarByCategory('evening');
    const afterPrayer = getAdhkarByCategory('after-prayer');
    const ramadan = getAdhkarByCategory('ramadan');
    const essential = getAdhkarByCategory('essential');

    expect(morning.length).toBeGreaterThan(0);
    expect(evening.length).toBeGreaterThan(0);
    expect(afterPrayer.length).toBeGreaterThan(0);
    expect(ramadan.length).toBeGreaterThan(0);
    expect(essential.length).toBeGreaterThan(0);
  });

  it('verifies that every supplication has required fields and verified citations', () => {
    for (const item of ADHKAR_LIST) {
      expect(item.id).toBeTruthy();
      expect(item.arabic).toBeTruthy();
      expect(item.translit).toBeTruthy();
      expect(item.translationFr).toBeTruthy();
      expect(item.reference).toBeTruthy();
      expect(item.count).toBeGreaterThan(0);
    }
  });

  it('includes Sayyid al-Istighfar with Sahih al-Bukhari citation', () => {
    const sayyid = ADHKAR_LIST.find((a) => a.id === 'morning-sayyid-istighfar');
    expect(sayyid).toBeDefined();
    expect(sayyid!.arabic).toContain('اللَّهُمَّ أَنْتَ رَبِّي');
    expect(sayyid!.reference).toContain('Bukhari');
  });

  it('includes Ayat al-Kursi in after-prayer adhkar', () => {
    const kursi = ADHKAR_LIST.find((a) => a.id === 'post-prayer-ayat-kursi');
    expect(kursi).toBeDefined();
    expect(kursi!.arabic).toContain('اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ');
  });

  it('includes authentic Ramadan iftar and Laylat al-Qadr invocations', () => {
    const iftar = ADHKAR_LIST.find((a) => a.id === 'ramadan-iftar');
    expect(iftar).toBeDefined();
    expect(iftar!.arabic).toContain('ذَهَبَ الظَّمَأُ');
    expect(iftar!.reference).toContain('Abi Dawood');

    const layla = ADHKAR_LIST.find((a) => a.id === 'ramadan-laylat-al-qadr');
    expect(layla).toBeDefined();
    expect(layla!.arabic).toContain('اللَّهُمَّ إِنَّكَ عَفُوٌّ');
    expect(layla!.reference).toContain('at-Tirmidhi');
  });

  it('includes verified essential supplications like Du‘a al-Karb and Dhu an-Nun', () => {
    const karb = ADHKAR_LIST.find((a) => a.id === 'essential-karb-distress');
    expect(karb).toBeDefined();
    expect(karb!.arabic).toContain('لاَ إِلَهَ إِلاَّ اللَّهُ الْعَظِيمُ الْحَلِيمُ');
    expect(karb!.reference).toContain('Bukhari');

    const dhunNoon = ADHKAR_LIST.find((a) => a.id === 'essential-dhun-noon');
    expect(dhunNoon).toBeDefined();
    expect(dhunNoon!.arabic).toContain('لاَ إِلَهَ إِلاَّ أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ');
  });

  it('suggests the appropriate category based on the time of day', () => {
    // 06:00 is morning
    expect(getCurrentAdhkarCategory(6)).toBe('morning');
    // 10:30 is morning
    expect(getCurrentAdhkarCategory(10)).toBe('morning');
    // 15:00 is evening
    expect(getCurrentAdhkarCategory(15)).toBe('evening');
    // 20:00 is evening
    expect(getCurrentAdhkarCategory(20)).toBe('evening');
    // 02:00 is evening / night
    expect(getCurrentAdhkarCategory(2)).toBe('evening');
  });
});
