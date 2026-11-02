/**
 * Shajarat Al-Hasanat (شجرة الزيتونة المباركة)
 * Hyper-Realistic 2D Botanical Moroccan Olive Tree Widget (*Olea europaea* / الزيتونة المغربية الأصيلة).
 *
 * Inspired by the ancient olive groves of Morocco (Meknes, Sefrou, Zerhoun, Walili) and the holy Quran:
 * {يُوقَدُ مِن شَجَرَةٍ مُّبَارَكَةٍ زَيْتُونَةٍ لَّا شَرْقِيَّةٍ وَلَا غَرْبِيَّةٍ يَكَادُ زَيْتُهَا يُضِيءُ وَلَوْ لَمْ تَمْسَسْهُ نَارٌ ۚ نُّورٌ عَلَىٰ نُورٍ}
 *
 * Visual & Botanical Features:
 * 1. 100% Organic Sinuous Woodwork: Gnarled ancient Moroccan trunk modeled with fluid Bézier curves,
 *    authentic hollow knot cavities (خوخة الجذع), spreading limbs, and fibrous wood grain ridges.
 * 2. True botanical two-tone lanceolate leaves (deep Mediterranean olive green face + silvery-sage reverse + pale midrib).
 * 3. Pure Dynamic Progression (0 to 600+):
 *    - At 0: 0 leaves (bare ancient branches, waiting for the water of Dhikr: "سُقيا الذكر").
 *    - At 1 to 33: Tender leaves sprout one-by-one with every tasbih tap.
 *    - At 34 to 100: Mid-canopy fills out to 80 leaves + first ripe golden olives appear.
 *    - At 101 to 300: Majestic canopy of 132 leaves + 10 golden Beldi olives.
 *    - At 301 to 600+: Super-lush royal Moroccan canopy of 166 leaves, 14 radiant olives, glowing celestial sky aura.
 * 4. Interactive Live Touch Reaction: Floating sacred Dhikr words and elastic spring pop on every tap.
 * 5. 100% Offline, pure SVG + CSS, zero battery drain.
 */

import type { SettingsStore } from './store.js';
import { loadKhatmahState } from '../core/khatmah.js';

export interface SpiritualProgress {
  prayersCompleted: number; // 0 to 5
  dhikrCount: number;        // total dhikr today (0 to 600+)
  morningAdhkarDone: boolean;
  eveningAdhkarDone: boolean;
  quranRead: boolean;
}

export interface BotanicalLeafSpec {
  x: number;
  y: number;
  rot: number;
  scale: number;
  tier: number; // 1, 2, 3, 4
  shade: 'deep' | 'mid' | 'silvery';
  swayDelay: number;
}

const NS = 'http://www.w3.org/2000/svg';

// 166 Curated Botanical Olive Leaf Coordinates distributed organically across the Mediterranean canopy dome
export const REALISTIC_LEAF_MATRIX: BotanicalLeafSpec[] = [
  // --- TIER 1: First 33 leaves (unfurls 1-by-1 during 1 to 33 Tasbih) ---
  { x: 195, y: 32, rot: 0, scale: 1.15, tier: 1, shade: 'silvery', swayDelay: 0.1 },
  { x: 187, y: 53, rot: -42, scale: 0.96, tier: 1, shade: 'mid', swayDelay: 0.5 },
  { x: 183, y: 39, rot: 6, scale: 1.02, tier: 1, shade: 'silvery', swayDelay: 1.7 },
  { x: 207, y: 53, rot: -6, scale: 0.96, tier: 1, shade: 'silvery', swayDelay: 1.4 },
  { x: 203, y: 39, rot: 42, scale: 1.02, tier: 1, shade: 'mid', swayDelay: 2.6 },
  { x: 159, y: 68, rot: -56, scale: 0.94, tier: 1, shade: 'deep', swayDelay: 0.8 },
  { x: 151, y: 56, rot: -8, scale: 1.0, tier: 1, shade: 'silvery', swayDelay: 2.0 },
  { x: 144, y: 80, rot: -66, scale: 0.91, tier: 1, shade: 'mid', swayDelay: 1.7 },
  { x: 136, y: 70, rot: -18, scale: 0.97, tier: 1, shade: 'deep', swayDelay: 2.9 },
  { x: 231, y: 68, rot: 8, scale: 0.94, tier: 1, shade: 'silvery', swayDelay: 0.9 },
  { x: 239, y: 56, rot: 56, scale: 1.0, tier: 1, shade: 'deep', swayDelay: 2.1 },
  { x: 246, y: 80, rot: 18, scale: 0.91, tier: 1, shade: 'deep', swayDelay: 1.9 },
  { x: 254, y: 70, rot: 66, scale: 0.97, tier: 1, shade: 'mid', swayDelay: 0.1 },
  { x: 100, y: 101, rot: -72, scale: 0.98, tier: 1, shade: 'mid', swayDelay: 0.3 },
  { x: 90, y: 91, rot: -24, scale: 1.04, tier: 1, shade: 'silvery', swayDelay: 1.5 },
  { x: 81, y: 116, rot: -82, scale: 0.92, tier: 1, shade: 'deep', swayDelay: 1.2 },
  { x: 71, y: 104, rot: -34, scale: 0.98, tier: 1, shade: 'mid', swayDelay: 2.4 },
  { x: 300, y: 101, rot: 24, scale: 0.98, tier: 1, shade: 'silvery', swayDelay: 0.4 },
  { x: 290, y: 91, rot: 72, scale: 1.04, tier: 1, shade: 'mid', swayDelay: 1.6 },
  { x: 319, y: 116, rot: 34, scale: 0.92, tier: 1, shade: 'mid', swayDelay: 1.5 },
  { x: 309, y: 104, rot: 82, scale: 0.98, tier: 1, shade: 'deep', swayDelay: 2.7 },
  { x: 76, y: 144, rot: -92, scale: 0.88, tier: 1, shade: 'deep', swayDelay: 0.6 },
  { x: 64, y: 140, rot: -44, scale: 0.94, tier: 1, shade: 'silvery', swayDelay: 1.8 },
  { x: 97, y: 161, rot: -79, scale: 0.9, tier: 1, shade: 'silvery', swayDelay: 1.8 },
  { x: 87, y: 151, rot: -31, scale: 0.96, tier: 1, shade: 'mid', swayDelay: 0.0 },
  { x: 314, y: 144, rot: 44, scale: 0.88, tier: 1, shade: 'silvery', swayDelay: 0.7 },
  { x: 326, y: 140, rot: 92, scale: 0.94, tier: 1, shade: 'deep', swayDelay: 1.9 },
  { x: 293, y: 161, rot: 31, scale: 0.9, tier: 1, shade: 'mid', swayDelay: 2.1 },
  { x: 303, y: 151, rot: 79, scale: 0.96, tier: 1, shade: 'silvery', swayDelay: 0.3 },
  { x: 177, y: 98, rot: -39, scale: 0.91, tier: 1, shade: 'deep', swayDelay: 1.0 },
  { x: 173, y: 86, rot: 9, scale: 0.97, tier: 1, shade: 'mid', swayDelay: 2.2 },
  { x: 213, y: 98, rot: -9, scale: 0.91, tier: 1, shade: 'mid', swayDelay: 2.3 },
  { x: 217, y: 86, rot: 39, scale: 0.97, tier: 1, shade: 'deep', swayDelay: 0.5 },

  // --- TIER 2: 47 leaves (indices 33..79, unfolds up to 100 Tasbih) ---
  { x: 170, y: 45, rot: -36, scale: 1.01, tier: 2, shade: 'silvery', swayDelay: 0.2 },
  { x: 166, y: 31, rot: 12, scale: 1.07, tier: 2, shade: 'mid', swayDelay: 1.4 },
  { x: 224, y: 45, rot: -12, scale: 1.01, tier: 2, shade: 'mid', swayDelay: 1.1 },
  { x: 220, y: 31, rot: 36, scale: 1.07, tier: 2, shade: 'silvery', swayDelay: 2.3 },
  { x: 129, y: 61, rot: -60, scale: 0.96, tier: 2, shade: 'deep', swayDelay: 0.7 },
  { x: 121, y: 49, rot: -12, scale: 1.02, tier: 2, shade: 'silvery', swayDelay: 1.9 },
  { x: 261, y: 61, rot: 12, scale: 0.96, tier: 2, shade: 'silvery', swayDelay: 1.6 },
  { x: 269, y: 49, rot: 60, scale: 1.02, tier: 2, shade: 'deep', swayDelay: 2.8 },
  { x: 115, y: 83, rot: -68, scale: 0.94, tier: 2, shade: 'mid', swayDelay: 0.4 },
  { x: 105, y: 73, rot: -20, scale: 1.0, tier: 2, shade: 'deep', swayDelay: 1.6 },
  { x: 275, y: 83, rot: 20, scale: 0.94, tier: 2, shade: 'deep', swayDelay: 2.0 },
  { x: 285, y: 73, rot: 68, scale: 1.0, tier: 2, shade: 'mid', swayDelay: 0.2 },
  { x: 67, y: 128, rot: -86, scale: 0.88, tier: 2, shade: 'silvery', swayDelay: 0.9 },
  { x: 57, y: 116, rot: -38, scale: 0.94, tier: 2, shade: 'silvery', swayDelay: 2.1 },
  { x: 333, y: 128, rot: 38, scale: 0.88, tier: 2, shade: 'silvery', swayDelay: 1.8 },
  { x: 323, y: 116, rot: 86, scale: 0.94, tier: 2, shade: 'silvery', swayDelay: 0.0 },
  { x: 58, y: 140, rot: -99, scale: 0.84, tier: 2, shade: 'deep', swayDelay: 1.3 },
  { x: 46, y: 136, rot: -51, scale: 0.9, tier: 2, shade: 'mid', swayDelay: 2.5 },
  { x: 332, y: 140, rot: 51, scale: 0.84, tier: 2, shade: 'mid', swayDelay: 2.2 },
  { x: 344, y: 136, rot: 99, scale: 0.9, tier: 2, shade: 'deep', swayDelay: 0.4 },
  { x: 87, y: 173, rot: -84, scale: 0.86, tier: 2, shade: 'mid', swayDelay: 0.5 },
  { x: 77, y: 163, rot: -36, scale: 0.92, tier: 2, shade: 'silvery', swayDelay: 1.7 },
  { x: 303, y: 173, rot: 36, scale: 0.86, tier: 2, shade: 'silvery', swayDelay: 1.4 },
  { x: 313, y: 163, rot: 84, scale: 0.92, tier: 2, shade: 'mid', swayDelay: 2.6 },
  { x: 153, y: 121, rot: -52, scale: 0.92, tier: 2, shade: 'deep', swayDelay: 0.8 },
  { x: 147, y: 109, rot: -4, scale: 0.98, tier: 2, shade: 'deep', swayDelay: 2.0 },
  { x: 237, y: 121, rot: 4, scale: 0.92, tier: 2, shade: 'deep', swayDelay: 1.7 },
  { x: 243, y: 109, rot: 52, scale: 0.98, tier: 2, shade: 'deep', swayDelay: 2.9 },
  { x: 186, y: 79, rot: -32, scale: 0.98, tier: 2, shade: 'mid', swayDelay: 0.3 },
  { x: 184, y: 65, rot: 16, scale: 1.04, tier: 2, shade: 'silvery', swayDelay: 1.5 },
  { x: 204, y: 79, rot: -16, scale: 0.98, tier: 2, shade: 'silvery', swayDelay: 1.5 },
  { x: 206, y: 65, rot: 32, scale: 1.04, tier: 2, shade: 'mid', swayDelay: 2.7 },
  { x: 139, y: 102, rot: -58, scale: 0.9, tier: 2, shade: 'silvery', swayDelay: 1.1 },
  { x: 131, y: 90, rot: -10, scale: 0.96, tier: 2, shade: 'mid', swayDelay: 2.3 },
  { x: 251, y: 102, rot: 10, scale: 0.9, tier: 2, shade: 'mid', swayDelay: 2.4 },
  { x: 259, y: 90, rot: 58, scale: 0.96, tier: 2, shade: 'silvery', swayDelay: 0.6 },
  { x: 170, y: 138, rot: -42, scale: 0.88, tier: 2, shade: 'deep', swayDelay: 0.6 },
  { x: 166, y: 126, rot: 6, scale: 0.94, tier: 2, shade: 'mid', swayDelay: 1.8 },
  { x: 220, y: 138, rot: -6, scale: 0.88, tier: 2, shade: 'mid', swayDelay: 1.9 },
  { x: 224, y: 126, rot: 42, scale: 0.94, tier: 2, shade: 'deep', swayDelay: 0.1 },
  { x: 119, y: 143, rot: -69, scale: 0.86, tier: 2, shade: 'mid', swayDelay: 0.9 },
  { x: 111, y: 133, rot: -21, scale: 0.92, tier: 2, shade: 'silvery', swayDelay: 2.1 },
  { x: 271, y: 143, rot: 21, scale: 0.86, tier: 2, shade: 'silvery', swayDelay: 2.1 },
  { x: 279, y: 133, rot: 69, scale: 0.92, tier: 2, shade: 'mid', swayDelay: 0.3 },
  { x: 195, y: 117, rot: -24, scale: 0.91, tier: 2, shade: 'silvery', swayDelay: 1.3 },
  { x: 195, y: 103, rot: 24, scale: 0.97, tier: 2, shade: 'mid', swayDelay: 2.5 },
  { x: 195, y: 58, rot: 0, scale: 1.05, tier: 2, shade: 'deep', swayDelay: 2.6 },

  // --- TIER 3: 52 leaves (indices 80..131, unfolds up to 300 Tasbih) ---
  { x: 181, y: 31, rot: -30, scale: 0.96, tier: 3, shade: 'silvery', swayDelay: 0.4 },
  { x: 179, y: 17, rot: 18, scale: 1.02, tier: 3, shade: 'mid', swayDelay: 1.6 },
  { x: 209, y: 31, rot: -18, scale: 0.96, tier: 3, shade: 'mid', swayDelay: 1.3 },
  { x: 211, y: 17, rot: 30, scale: 1.02, tier: 3, shade: 'silvery', swayDelay: 2.5 },
  { x: 151, y: 50, rot: -50, scale: 0.92, tier: 3, shade: 'deep', swayDelay: 0.8 },
  { x: 145, y: 38, rot: -2, scale: 0.98, tier: 3, shade: 'silvery', swayDelay: 2.0 },
  { x: 239, y: 50, rot: 2, scale: 0.92, tier: 3, shade: 'silvery', swayDelay: 1.7 },
  { x: 245, y: 38, rot: 50, scale: 0.98, tier: 3, shade: 'deep', swayDelay: 2.9 },
  { x: 107, y: 70, rot: -66, scale: 0.9, tier: 3, shade: 'mid', swayDelay: 0.5 },
  { x: 97, y: 60, rot: -18, scale: 0.96, tier: 3, shade: 'deep', swayDelay: 1.7 },
  { x: 283, y: 70, rot: 18, scale: 0.9, tier: 3, shade: 'deep', swayDelay: 2.0 },
  { x: 293, y: 60, rot: 66, scale: 0.96, tier: 3, shade: 'mid', swayDelay: 0.2 },
  { x: 87, y: 93, rot: -76, scale: 0.88, tier: 3, shade: 'silvery', swayDelay: 0.9 },
  { x: 77, y: 83, rot: -28, scale: 0.94, tier: 3, shade: 'silvery', swayDelay: 2.1 },
  { x: 303, y: 93, rot: 28, scale: 0.88, tier: 3, shade: 'silvery', swayDelay: 1.8 },
  { x: 313, y: 83, rot: 76, scale: 0.94, tier: 3, shade: 'silvery', swayDelay: 0.0 },
  { x: 51, y: 116, rot: -102, scale: 0.83, tier: 3, shade: 'deep', swayDelay: 1.1 },
  { x: 39, y: 114, rot: -54, scale: 0.88, tier: 3, shade: 'mid', swayDelay: 2.3 },
  { x: 339, y: 116, rot: 54, scale: 0.83, tier: 3, shade: 'mid', swayDelay: 2.3 },
  { x: 351, y: 114, rot: 102, scale: 0.88, tier: 3, shade: 'deep', swayDelay: 0.5 },
  { x: 46, y: 133, rot: -106, scale: 0.81, tier: 3, shade: 'mid', swayDelay: 0.6 },
  { x: 34, y: 131, rot: -58, scale: 0.86, tier: 3, shade: 'silvery', swayDelay: 1.8 },
  { x: 344, y: 133, rot: 58, scale: 0.81, tier: 3, shade: 'silvery', swayDelay: 1.9 },
  { x: 356, y: 131, rot: 106, scale: 0.86, tier: 3, shade: 'mid', swayDelay: 0.1 },
  { x: 66, y: 157, rot: -94, scale: 0.84, tier: 3, shade: 'deep', swayDelay: 0.7 },
  { x: 54, y: 153, rot: -46, scale: 0.9, tier: 3, shade: 'deep', swayDelay: 1.9 },
  { x: 324, y: 157, rot: 46, scale: 0.84, tier: 3, shade: 'deep', swayDelay: 2.2 },
  { x: 336, y: 153, rot: 94, scale: 0.9, tier: 3, shade: 'deep', swayDelay: 0.4 },
  { x: 134, y: 140, rot: -60, scale: 0.88, tier: 3, shade: 'silvery', swayDelay: 1.0 },
  { x: 126, y: 130, rot: -12, scale: 0.94, tier: 3, shade: 'mid', swayDelay: 2.2 },
  { x: 256, y: 140, rot: 12, scale: 0.88, tier: 3, shade: 'mid', swayDelay: 2.5 },
  { x: 264, y: 130, rot: 60, scale: 0.94, tier: 3, shade: 'silvery', swayDelay: 0.7 },
  { x: 161, y: 98, rot: -46, scale: 0.92, tier: 3, shade: 'deep', swayDelay: 0.3 },
  { x: 155, y: 86, rot: 2, scale: 0.98, tier: 3, shade: 'silvery', swayDelay: 1.5 },
  { x: 229, y: 98, rot: -2, scale: 0.92, tier: 3, shade: 'silvery', swayDelay: 1.6 },
  { x: 235, y: 86, rot: 46, scale: 0.98, tier: 3, shade: 'deep', swayDelay: 2.8 },
  { x: 176, y: 59, rot: -34, scale: 0.96, tier: 3, shade: 'mid', swayDelay: 0.7 },
  { x: 174, y: 45, rot: 14, scale: 1.02, tier: 3, shade: 'mid', swayDelay: 1.9 },
  { x: 214, y: 59, rot: -14, scale: 0.96, tier: 3, shade: 'mid', swayDelay: 1.8 },
  { x: 216, y: 45, rot: 34, scale: 1.02, tier: 3, shade: 'mid', swayDelay: 0.0 },
  { x: 188, y: 95, rot: -28, scale: 0.9, tier: 3, shade: 'silvery', swayDelay: 1.2 },
  { x: 188, y: 81, rot: 20, scale: 0.96, tier: 3, shade: 'deep', swayDelay: 2.4 },
  { x: 202, y: 95, rot: -20, scale: 0.9, tier: 3, shade: 'deep', swayDelay: 2.4 },
  { x: 202, y: 81, rot: 28, scale: 0.96, tier: 3, shade: 'silvery', swayDelay: 0.6 },
  { x: 145, y: 157, rot: -54, scale: 0.84, tier: 3, shade: 'deep', swayDelay: 0.8 },
  { x: 139, y: 147, rot: -6, scale: 0.9, tier: 3, shade: 'mid', swayDelay: 2.0 },
  { x: 245, y: 157, rot: 6, scale: 0.84, tier: 3, shade: 'mid', swayDelay: 2.0 },
  { x: 251, y: 147, rot: 54, scale: 0.9, tier: 3, shade: 'deep', swayDelay: 0.2 },
  { x: 105, y: 152, rot: -74, scale: 0.86, tier: 3, shade: 'silvery', swayDelay: 1.4 },
  { x: 95, y: 144, rot: -26, scale: 0.92, tier: 3, shade: 'silvery', swayDelay: 2.6 },
  { x: 285, y: 152, rot: 26, scale: 0.86, tier: 3, shade: 'silvery', swayDelay: 0.2 },
  { x: 295, y: 144, rot: 74, scale: 0.92, tier: 3, shade: 'silvery', swayDelay: 1.4 },

  // --- TIER 4: 34 leaves (indices 132..165, unfolds up to 600+ Tasbih) ---
  { x: 195, y: 25, rot: -24, scale: 1.01, tier: 4, shade: 'silvery', swayDelay: 0.1 },
  { x: 195, y: 11, rot: 24, scale: 1.07, tier: 4, shade: 'silvery', swayDelay: 1.3 },
  { x: 167, y: 33, rot: -38, scale: 0.94, tier: 4, shade: 'mid', swayDelay: 0.9 },
  { x: 163, y: 19, rot: 10, scale: 1.0, tier: 4, shade: 'silvery', swayDelay: 2.1 },
  { x: 227, y: 33, rot: -10, scale: 0.94, tier: 4, shade: 'silvery', swayDelay: 1.7 },
  { x: 223, y: 19, rot: 38, scale: 1.0, tier: 4, shade: 'mid', swayDelay: 2.9 },
  { x: 139, y: 41, rot: -52, scale: 0.9, tier: 4, shade: 'deep', swayDelay: 0.4 },
  { x: 133, y: 29, rot: -4, scale: 0.96, tier: 4, shade: 'silvery', swayDelay: 1.6 },
  { x: 251, y: 41, rot: 4, scale: 0.9, tier: 4, shade: 'silvery', swayDelay: 2.1 },
  { x: 257, y: 29, rot: 52, scale: 0.96, tier: 4, shade: 'deep', swayDelay: 0.3 },
  { x: 97, y: 57, rot: -69, scale: 0.86, tier: 4, shade: 'mid', swayDelay: 1.1 },
  { x: 87, y: 47, rot: -21, scale: 0.92, tier: 4, shade: 'deep', swayDelay: 2.3 },
  { x: 293, y: 57, rot: 21, scale: 0.86, tier: 4, shade: 'deep', swayDelay: 0.6 },
  { x: 303, y: 47, rot: 69, scale: 0.92, tier: 4, shade: 'mid', swayDelay: 1.8 },
  { x: 74, y: 79, rot: -82, scale: 0.84, tier: 4, shade: 'silvery', swayDelay: 1.5 },
  { x: 62, y: 71, rot: -34, scale: 0.9, tier: 4, shade: 'silvery', swayDelay: 2.7 },
  { x: 316, y: 79, rot: 34, scale: 0.84, tier: 4, shade: 'silvery', swayDelay: 2.3 },
  { x: 328, y: 71, rot: 82, scale: 0.9, tier: 4, shade: 'silvery', swayDelay: 0.5 },
  { x: 41, y: 103, rot: -109, scale: 0.79, tier: 4, shade: 'deep', swayDelay: 0.8 },
  { x: 29, y: 101, rot: -61, scale: 0.84, tier: 4, shade: 'mid', swayDelay: 2.0 },
  { x: 349, y: 103, rot: 61, scale: 0.79, tier: 4, shade: 'mid', swayDelay: 1.9 },
  { x: 361, y: 101, rot: 109, scale: 0.84, tier: 4, shade: 'deep', swayDelay: 0.1 },
  { x: 38, y: 122, rot: -112, scale: 0.77, tier: 4, shade: 'silvery', swayDelay: 1.3 },
  { x: 26, y: 122, rot: -64, scale: 0.82, tier: 4, shade: 'silvery', swayDelay: 2.5 },
  { x: 352, y: 122, rot: 64, scale: 0.77, tier: 4, shade: 'silvery', swayDelay: 2.7 },
  { x: 364, y: 122, rot: 112, scale: 0.82, tier: 4, shade: 'silvery', swayDelay: 0.9 },
  { x: 83, y: 184, rot: -86, scale: 0.83, tier: 4, shade: 'deep', swayDelay: 0.5 },
  { x: 73, y: 172, rot: -38, scale: 0.88, tier: 4, shade: 'mid', swayDelay: 1.7 },
  { x: 307, y: 184, rot: 38, scale: 0.83, tier: 4, shade: 'mid', swayDelay: 1.8 },
  { x: 317, y: 172, rot: 86, scale: 0.88, tier: 4, shade: 'deep', swayDelay: 0.0 },
  { x: 171, y: 156, rot: -36, scale: 0.86, tier: 4, shade: 'silvery', swayDelay: 1.2 },
  { x: 169, y: 144, rot: 12, scale: 0.92, tier: 4, shade: 'mid', swayDelay: 2.4 },
  { x: 219, y: 156, rot: -12, scale: 0.86, tier: 4, shade: 'mid', swayDelay: 2.4 },
  { x: 221, y: 144, rot: 36, scale: 0.92, tier: 4, shade: 'silvery', swayDelay: 0.6 },
];

export const REALISTIC_FRUITS_COORDS = [
  { x: 125, y: 120, stemAngle: 18, size: 1.0 },
  { x: 265, y: 120, stemAngle: -18, size: 1.0 },
  { x: 195, y: 85, stemAngle: 6, size: 1.05 },
  { x: 92, y: 145, stemAngle: 28, size: 0.95 },
  { x: 298, y: 145, stemAngle: -28, size: 0.95 },
  { x: 165, y: 68, stemAngle: 12, size: 1.0 },
  { x: 225, y: 68, stemAngle: -12, size: 1.0 },
  { x: 142, y: 148, stemAngle: 20, size: 0.95 },
  { x: 248, y: 148, stemAngle: -20, size: 0.95 },
  { x: 75, y: 125, stemAngle: 25, size: 0.9 },
  { x: 315, y: 125, stemAngle: -25, size: 0.9 },
  { x: 180, y: 110, stemAngle: -10, size: 1.05 },
  { x: 210, y: 110, stemAngle: 10, size: 1.05 },
  { x: 195, y: 55, stemAngle: 0, size: 1.1 },
];

export interface TreeMilestone {
  minCount: number;
  level: number;
  levelTitle: string;
  icon: string;
  message: string;
}

export const TREE_MILESTONES: TreeMilestone[] = [
  {
    minCount: 600,
    level: 8,
    levelTitle: 'المستوى ٨: نُورٌ عَلَىٰ نُورٍ',
    icon: '👑',
    message: 'نُّورٌ عَلَىٰ نُورٍ! شجرة مباركة أينعت بالذكر 💫',
  },
  {
    minCount: 300,
    level: 7,
    levelTitle: 'المستوى ٧: وفرعها في السماء',
    icon: '🌟',
    message: 'وفرعها في السماء! روضة من رياض الذكر المباركة',
  },
  {
    minCount: 200,
    level: 6,
    levelTitle: 'المستوى ٦: شجرة يانعة',
    icon: '✨',
    message: 'بركة متواصلة! زيتونة يانعة تفيض بالحسنات والبركات',
  },
  {
    minCount: 100,
    level: 5,
    levelTitle: 'المستوى ٥: ثمار الزيتون الأولى',
    icon: '🫒',
    message: '100 تسبيحة! أورقت وتدلت حبات الزيتون الذهبي 🌟',
  },
  {
    minCount: 67,
    level: 4,
    levelTitle: 'المستوى ٤: رواء وخضرة',
    icon: '🌳',
    message: 'همّة عالية! الشجرة تخضرّ وثمار الزيتون تتهيأ',
  },
  {
    minCount: 33,
    level: 3,
    levelTitle: 'المستوى ٣: تفرع الأغصان',
    icon: '🌸',
    message: 'تبارك الله! بلغتَ 33 وتفرعت الأغصان بالذكر',
  },
  {
    minCount: 10,
    level: 2,
    levelTitle: 'المستوى ٢: بداية الإيراق',
    icon: '🌿',
    message: 'ما شاء الله! أوراق الزيتون تتفتح مع كل تسبيحة',
  },
  {
    minCount: 1,
    level: 1,
    levelTitle: 'المستوى ١: البذرة المباركة',
    icon: '🌱',
    message: 'بداية مباركة! بذور الذكر تنبت في أرض البركة',
  },
  {
    minCount: 0,
    level: 0,
    levelTitle: 'المستوى ٠: غرس جديد',
    icon: '💧',
    message: 'اسقِ الشجرة بالذكر — انقر للغرس والبداية 🌱',
  },
];

export class LushSpiritualTreeWidget {
  private container: HTMLElement;
  private svg!: SVGSVGElement;
  private leavesGroup!: SVGGElement;
  private fruitsGroup!: SVGGElement;
  private glowGroup!: SVGGElement;
  private activeBudGroup!: SVGGElement;
  private floatingParticlesGroup!: SVGGElement;
  private skyAuraEl!: SVGEllipseElement;

  private progress: SpiritualProgress;
  private currentGoal = 33;
  private currentSessionCount = 0;
  private activeLeafScale = 0.28;
  private previousLevel = -1;

  constructor(initialProgress: SpiritualProgress) {
    this.progress = initialProgress;
    this.currentSessionCount = initialProgress.dhikrCount;
    this.container = document.createElement('div');
    this.container.className = 'spiritual-tree-card';
    this.initSvg();
    this.update(initialProgress);
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setGoal(goal: number): void {
    this.currentGoal = Math.max(1, goal);
    this.updateActiveBudGrowth(Math.max(this.currentSessionCount, this.progress.dhikrCount));
  }

  private initSvg(): void {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', '0 0 390 310');
    this.svg.setAttribute('class', 'shajarah-svg realistic-olive-svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'شجرة الزيتونة المباركة - Realistic Moroccan Olive Tree');

    // 1. Defs: Botanical Olive Bark & Leaf Palette
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = `
      <!-- Weathered Cork Bark Palette (Old Moroccan Olive Wood) -->
      <linearGradient id="barkCoreGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#141009"/>
        <stop offset="20%" stop-color="#241e14"/>
        <stop offset="50%" stop-color="#3b3223"/>
        <stop offset="80%" stop-color="#4f4633"/>
        <stop offset="100%" stop-color="#343d2c"/>
      </linearGradient>

      <!-- Moss & Lichen Overlays on Trunk -->
      <linearGradient id="barkLichenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#556b2f" stop-opacity="0.8"/>
        <stop offset="50%" stop-color="#73864c" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#3e4a22" stop-opacity="0.4"/>
      </linearGradient>

      <!-- Sunlit Organic Bark Ridges -->
      <linearGradient id="barkRidgeGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#4a3e2a" stop-opacity="0.2"/>
        <stop offset="55%" stop-color="#a39a82" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#ded7c7" stop-opacity="0.95"/>
      </linearGradient>

      <!-- Soil Terraces & Zellige Base -->
      <linearGradient id="terraceGroundGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2b3b27"/>
        <stop offset="35%" stop-color="#1e2d1c"/>
        <stop offset="100%" stop-color="#0e170d"/>
      </linearGradient>

      <!-- Atmospheric Golden Sky Aura -->
      <radialGradient id="sacredSkyAura" cx="50%" cy="38%" r="62%">
        <stop offset="0%" stop-color="rgba(254, 240, 138, 0.35)"/>
        <stop offset="45%" stop-color="rgba(110, 231, 183, 0.15)"/>
        <stop offset="80%" stop-color="rgba(16, 185, 129, 0.04)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>

      <!-- 3D Moroccan Beldi Olive (Green to Golden Amber) -->
      <radialGradient id="beldiOliveGrad" cx="30%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="25%" stop-color="#ca8a04"/>
        <stop offset="65%" stop-color="#854d0e"/>
        <stop offset="100%" stop-color="#3b1602"/>
      </radialGradient>

      <radialGradient id="oliveHaloGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(254, 240, 138, 0.65)"/>
        <stop offset="50%" stop-color="rgba(202, 138, 4, 0.3)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>

      <!-- Leaf Face Gradients (Botanical Dual-Tone) -->
      <linearGradient id="leafDeepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1b3d24"/>
        <stop offset="100%" stop-color="#2d5838"/>
      </linearGradient>

      <linearGradient id="leafMidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#284e32"/>
        <stop offset="100%" stop-color="#487854"/>
      </linearGradient>

      <linearGradient id="leafSilveryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6f8b78"/>
        <stop offset="55%" stop-color="#a8beaf"/>
        <stop offset="100%" stop-color="#d6e3db"/>
      </linearGradient>

      <!-- Active Blooming Golden Glow Filter -->
      <filter id="budBloomFilter" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3.5" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    `;
    this.svg.appendChild(defs);

    // 2. Dynamic Sky Aura
    this.skyAuraEl = document.createElementNS(NS, 'ellipse');
    this.skyAuraEl.setAttribute('cx', '195');
    this.skyAuraEl.setAttribute('cy', '125');
    this.skyAuraEl.setAttribute('rx', '165');
    this.skyAuraEl.setAttribute('ry', '120');
    this.skyAuraEl.setAttribute('fill', 'url(#sacredSkyAura)');
    this.skyAuraEl.setAttribute('class', 'tree-sky-aura');
    this.skyAuraEl.style.opacity = '0.4';
    this.svg.appendChild(this.skyAuraEl);

    // 3. Ambient Sakinah Fireflies
    const firefliesGroup = document.createElementNS(NS, 'g');
    firefliesGroup.setAttribute('class', 'tree-fireflies');
    firefliesGroup.setAttribute('aria-hidden', 'true');
    firefliesGroup.innerHTML = `
      <circle cx="85" cy="115" r="1.8" fill="#fef08a" class="sakinah-firefly firefly-1"/>
      <circle cx="305" cy="105" r="1.6" fill="#6ee7b7" class="sakinah-firefly firefly-2"/>
      <circle cx="140" cy="55" r="2.0" fill="#fef08a" class="sakinah-firefly firefly-3"/>
      <circle cx="250" cy="58" r="1.7" fill="#fef08a" class="sakinah-firefly firefly-4"/>
      <circle cx="65" cy="175" r="1.5" fill="#34d399" class="sakinah-firefly firefly-5"/>
      <circle cx="325" cy="170" r="1.9" fill="#fef08a" class="sakinah-firefly firefly-6"/>
      <circle cx="195" cy="35" r="2.2" fill="#fde047" class="sakinah-firefly firefly-7"/>
    `;
    this.svg.appendChild(firefliesGroup);

    // 4. Ground Hillock & Andalusian Soil Baraka Embers
    const ground = document.createElementNS(NS, 'g');
    ground.setAttribute('class', 'tree-ground');
    ground.innerHTML = `
      <!-- Back Soil Mound -->
      <path d="M 15 285 Q 195 240 375 285 L 375 310 L 15 310 Z" fill="url(#terraceGroundGrad)"/>
      <!-- Mossy Terrace Front Crest -->
      <path d="M 25 288 Q 195 250 365 288 L 365 310 L 25 310 Z" fill="#1c2818"/>
      <!-- Soft Moss Highlight Crest -->
      <path d="M 25 288 Q 195 250 365 288" fill="none" stroke="#6b8e23" stroke-width="2.2" stroke-linecap="round" opacity="0.65"/>

      <!-- Glowing Soil Embers of Baraka -->
      <g class="soil-embers">
        <circle cx="70" cy="285" r="1.8" fill="#fef08a" class="soil-ember" style="animation-delay: 0.1s"/>
        <circle cx="105" cy="278" r="2.0" fill="#6ee7b7" class="soil-ember" style="animation-delay: 1.2s"/>
        <circle cx="145" cy="268" r="1.7" fill="#fef08a" class="soil-ember" style="animation-delay: 0.5s"/>
        <circle cx="175" cy="262" r="2.2" fill="#eab308" class="soil-ember" style="animation-delay: 1.8s"/>
        <circle cx="195" cy="260" r="2.5" fill="#fef08a" class="soil-ember" style="animation-delay: 0.2s"/>
        <circle cx="215" cy="262" r="2.2" fill="#eab308" class="soil-ember" style="animation-delay: 1.5s"/>
        <circle cx="245" cy="268" r="1.7" fill="#fef08a" class="soil-ember" style="animation-delay: 0.8s"/>
        <circle cx="285" cy="278" r="2.0" fill="#6ee7b7" class="soil-ember" style="animation-delay: 1.9s"/>
        <circle cx="320" cy="285" r="1.8" fill="#fef08a" class="soil-ember" style="animation-delay: 0.4s"/>
      </g>
    `;
    this.svg.appendChild(ground);

    // 5. Undulating Anchor Roots (جذور الزيتونة العتيقة الممتدة في الأرض)
    const roots = document.createElementNS(NS, 'g');
    roots.setAttribute('class', 'tree-roots');
    roots.innerHTML = `
      <!-- Far Left Outer Root -->
      <path d="M 170 252 C 145 264, 115 278, 65 290 C 85 288, 125 276, 178 258 Z" fill="url(#barkCoreGrad)"/>
      <!-- Mid-Left Anchor Root -->
      <path d="M 180 256 C 166 270, 146 284, 118 294 C 136 292, 166 280, 188 262 Z" fill="url(#barkCoreGrad)"/>
      <!-- Mid-Right Anchor Root -->
      <path d="M 202 262 C 216 278, 238 290, 266 294 C 242 284, 224 270, 210 256 Z" fill="url(#barkCoreGrad)"/>
      <!-- Far Right Outer Root -->
      <path d="M 212 258 C 265 276, 300 288, 325 290 C 275 278, 245 264, 218 252 Z" fill="url(#barkCoreGrad)"/>
    `;
    this.svg.appendChild(roots);

    // 6. Masterpiece Moroccan Ancient Olive Woodwork (Gnarled Trunk & Sinuous Spreading Boughs)
    // 100% Organic Cubic Bézier contours — No sharp polygon edges
    const trunk = document.createElementNS(NS, 'g');
    trunk.setAttribute('class', 'tree-woodwork');
    trunk.innerHTML = `
      <!-- Fluid Muscular Moroccan Olive Tree Trunk & Sinuous Boughs -->
      <path class="trunk-silhouette" d="
        M 170 255
        C 174 235, 172 215, 165 195
        C 155 178, 138 165, 108 152
        C 85 142, 65 136, 52 130
        C 50 126, 54 122, 60 124
        C 78 128, 98 135, 114 140
        C 112 125, 96 112, 78 98
        C 75 94, 79 90, 85 92
        C 100 104, 125 118, 142 128
        C 146 108, 150 85, 148 65
        C 146 60, 152 58, 156 62
        C 162 76, 172 95, 180 108
        C 184 85, 190 60, 194 40
        C 192 35, 198 35, 196 40
        C 200 62, 206 82, 210 108
        C 218 95, 228 76, 234 62
        C 238 58, 244 60, 242 65
        C 240 85, 244 108, 248 128
        C 265 118, 290 104, 305 92
        C 311 90, 315 94, 312 98
        C 294 112, 278 125, 276 140
        C 292 135, 312 128, 330 124
        C 336 122, 340 126, 338 130
        C 325 136, 305 142, 282 152
        C 252 165, 235 178, 225 195
        C 218 215, 216 235, 220 255
        Z"
        fill="url(#barkCoreGrad)"
      />

      <!-- Hollow Ancient Trunk Cavity (خوخة الجذع العتيق) -->
      <ellipse cx="195" cy="212" rx="7.5" ry="15" fill="#0c0906" opacity="0.88" transform="rotate(-6, 195, 212)"/>
      <ellipse cx="194" cy="211" rx="5" ry="11" fill="#040302" transform="rotate(-6, 194, 211)"/>

      <!-- Organic Wood Grain Striations (Twisting Tendons of Old Bark) -->
      <path d="M 174 255 C 176 232, 173 205, 160 185 C 145 168, 122 154, 98 142 C 78 132, 60 126, 54 126" fill="none" stroke="url(#barkRidgeGrad)" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M 184 255 C 185 228, 182 200, 178 172 C 174 148, 162 120, 152 75" fill="none" stroke="url(#barkRidgeGrad)" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M 195 255 C 196 230, 197 195, 194 165 C 192 138, 191 105, 195 48" fill="none" stroke="url(#barkRidgeGrad)" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M 206 255 C 205 228, 208 200, 212 172 C 216 148, 228 120, 238 75" fill="none" stroke="url(#barkRidgeGrad)" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M 216 255 C 214 232, 217 205, 230 185 C 245 168, 268 154, 292 142 C 312 132, 330 126, 336 126" fill="none" stroke="url(#barkRidgeGrad)" stroke-width="1.8" stroke-linecap="round"/>

      <!-- Moss & Lichen Patches (خضرة وأشنة على لحاء الزيتونة) -->
      <path d="M 178 232 C 176 218, 179 200, 174 190" fill="none" stroke="url(#barkLichenGrad)" stroke-width="3.2" stroke-linecap="round" opacity="0.8"/>
      <path d="M 212 236 C 215 222, 212 204, 216 192" fill="none" stroke="url(#barkLichenGrad)" stroke-width="3" stroke-linecap="round" opacity="0.8"/>

      <!-- Sun-Bleached Bark Crest Highlights -->
      <path d="M 155 180 C 130 162, 105 146, 68 132" fill="none" stroke="#d5cebc" stroke-width="1.2" stroke-linecap="round" opacity="0.55" stroke-dasharray="8 3 11 3"/>
      <path d="M 235 180 C 260 162, 285 146, 322 132" fill="none" stroke="#d5cebc" stroke-width="1.2" stroke-linecap="round" opacity="0.55" stroke-dasharray="8 3 11 3"/>
      <path d="M 194 140 C 194 110, 194 75, 195 45" fill="none" stroke="#e8e2d4" stroke-width="1.3" stroke-linecap="round" opacity="0.6" stroke-dasharray="6 3 10 3"/>
    `;
    this.svg.appendChild(trunk);

    // 7. Full Botanical Canopy Leaves Group
    this.leavesGroup = document.createElementNS(NS, 'g');
    this.leavesGroup.setAttribute('class', 'tree-leaves');
    this.svg.appendChild(this.leavesGroup);

    // 8. Dynamic Growing Bud / Active Dhikr Leaf Node
    this.activeBudGroup = document.createElementNS(NS, 'g');
    this.activeBudGroup.setAttribute('class', 'active-bud-group');
    this.activeBudGroup.setAttribute('transform', 'translate(195, 32)');
    this.svg.appendChild(this.activeBudGroup);

    // 9. Golden 3D Olives Group
    this.fruitsGroup = document.createElementNS(NS, 'g');
    this.fruitsGroup.setAttribute('class', 'tree-fruits');
    this.svg.appendChild(this.fruitsGroup);

    // 10. Floating Interactive Touch Noor Particles & Motes
    this.floatingParticlesGroup = document.createElementNS(NS, 'g');
    this.floatingParticlesGroup.setAttribute('class', 'floating-dhikr-particles');
    this.svg.appendChild(this.floatingParticlesGroup);

    // 11. Sparks / Noor Rising Group
    this.glowGroup = document.createElementNS(NS, 'g');
    this.glowGroup.setAttribute('class', 'tree-glow-sparks');
    this.svg.appendChild(this.glowGroup);

    // 12. Card Header
    const infoHeader = document.createElement('div');
    infoHeader.className = 'tree-header-info';
    infoHeader.innerHTML = `
      <div class="tree-title-row">
        <span class="tree-badge">🌿 شجرة الزيتونة المباركة</span>
        <span class="tree-level-pill" id="tree-level-pill">المستوى ٠: غرس جديد</span>
      </div>
      <div class="tree-motivational-banner" id="tree-progress-summary" role="status">
        <span class="tree-motivational-icon" aria-hidden="true">💧</span>
        <span class="tree-motivational-text">اسقِ الشجرة بالذكر — انقر للغرس والبداية 🌱</span>
      </div>
      <p class="tree-ayah">﴿يُوقَدُ مِن شَجَرَةٍ مُّبَارَكَةٍ زَيْتُونَةٍ لَّا شَرْقِيَّةٍ وَلَا غَرْبِيَّةٍ يَكَادُ زَيْتُهَا يُضِيءُ﴾</p>
    `;

    this.container.appendChild(infoHeader);
    this.container.appendChild(this.svg);
  }

  /**
   * Updates the tree based on completed deeds & current session
   * Count drives leaf growth dynamically:
   * - count = 0: 0 leaves (bare ancient branches waiting for tasbih)
   * - count 1..33: 1 leaf per tasbih
   * - count 34..100: fills to 80 leaves + olives
   * - count 101..300: 132 leaves + olives
   * - count 301..600+: 166 leaves (maximum lush canopy) + 14 olives + radiant aura
   */
  public update(progress: SpiritualProgress, currentSessionCount?: number): void {
    this.progress = progress;
    if (typeof currentSessionCount === 'number') {
      this.currentSessionCount = currentSessionCount;
    } else {
      this.currentSessionCount = progress.dhikrCount;
    }

    const effectiveCount = Math.max(this.currentSessionCount, progress.dhikrCount);

    let totalLeaves = 0;
    if (effectiveCount <= 0) {
      totalLeaves = 0;
    } else if (effectiveCount <= 33) {
      totalLeaves = effectiveCount;
    } else if (effectiveCount <= 100) {
      totalLeaves = 33 + Math.floor(((effectiveCount - 33) * 47) / 67);
    } else if (effectiveCount <= 300) {
      totalLeaves = 80 + Math.floor(((effectiveCount - 100) * 52) / 200);
    } else {
      totalLeaves = Math.min(
        REALISTIC_LEAF_MATRIX.length,
        132 + Math.floor(((effectiveCount - 300) * 34) / 300),
      );
    }

    // Add bonus leaves for other daily spiritual deeds when actively engaged
    if (effectiveCount > 0) {
      if (progress.prayersCompleted > 0) {
        totalLeaves = Math.min(REALISTIC_LEAF_MATRIX.length, totalLeaves + progress.prayersCompleted * 2);
      }
      if (progress.morningAdhkarDone) totalLeaves = Math.min(REALISTIC_LEAF_MATRIX.length, totalLeaves + 2);
      if (progress.eveningAdhkarDone) totalLeaves = Math.min(REALISTIC_LEAF_MATRIX.length, totalLeaves + 2);
    }

    this.renderLeaves(totalLeaves);

    // Number of ripe golden Beldi olives
    let fruitCount = 0;
    if (effectiveCount >= 33) fruitCount += 2;
    if (effectiveCount >= 66) fruitCount += 2;
    if (effectiveCount >= 100) fruitCount += 2;
    if (effectiveCount >= 200) fruitCount += 2;
    if (effectiveCount >= 300) fruitCount += 2;
    if (effectiveCount >= 450) fruitCount += 2;
    if (effectiveCount >= 600) fruitCount += 2;

    this.renderFruits(Math.min(REALISTIC_FRUITS_COORDS.length, fruitCount));

    // Dynamic Sky Aura intensity
    if (this.skyAuraEl) {
      const auraRatio = Math.min(1.0, Math.max(0.2, effectiveCount / 600));
      this.skyAuraEl.style.opacity = String(0.25 + auraRatio * 0.7);
    }

    // Update active blooming bud
    this.updateActiveBudGrowth(effectiveCount);

    // Dynamic Summary Caption & Motivational Milestones
    const levelPill = this.container.querySelector('#tree-level-pill');
    const summary = this.container.querySelector('#tree-progress-summary');
    const defaultMilestone = TREE_MILESTONES[TREE_MILESTONES.length - 1] as TreeMilestone;
    const milestone: TreeMilestone =
      TREE_MILESTONES.find((m) => effectiveCount >= m.minCount) ?? defaultMilestone;

    if (levelPill) {
      levelPill.textContent = milestone.levelTitle;
    }

    if (summary) {
      summary.innerHTML = `
        <span class="tree-motivational-icon" aria-hidden="true">${milestone.icon}</span>
        <span class="tree-motivational-text">${milestone.message}</span>
      `;
      if (this.previousLevel !== -1 && this.previousLevel !== milestone.level) {
        summary.classList.remove('has-level-up');
        void (summary as HTMLElement).offsetWidth;
        summary.classList.add('has-level-up');
      }
    }
    this.previousLevel = milestone.level;
  }

  /**
   * Live Bud-to-Leaf Blooming Engine
   */
  private updateActiveBudGrowth(effectiveCount: number): void {
    if (effectiveCount <= 0) {
      this.activeBudGroup.replaceChildren();
      return;
    }

    const cycleProgress = this.currentGoal > 0 ? (effectiveCount % this.currentGoal) / this.currentGoal : 0;
    this.activeLeafScale = 0.35 + cycleProgress * 0.85;

    this.activeBudGroup.replaceChildren();

    // Radiant Gold Halo
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('cx', '0');
    halo.setAttribute('cy', '0');
    halo.setAttribute('r', String(9 * this.activeLeafScale));
    halo.setAttribute('fill', 'url(#sacredSkyAura)');
    halo.setAttribute('opacity', '0.75');

    // Blooming Lanceolate Leaf
    const bud = document.createElementNS(NS, 'path');
    bud.setAttribute('d', 'M 0 -13 C 4.5 -7, 5.5 6, 0 13 C -5.5 6, -4.5 -7, 0 -13 Z');
    bud.setAttribute('fill', 'url(#leafSilveryGrad)');
    bud.setAttribute('stroke', '#fef08a');
    bud.setAttribute('stroke-width', '0.8');
    bud.setAttribute('filter', 'url(#budBloomFilter)');
    bud.setAttribute('transform', `scale(${this.activeLeafScale})`);

    // Midrib vein
    const vein = document.createElementNS(NS, 'line');
    vein.setAttribute('x1', '0');
    vein.setAttribute('y1', String(-10 * this.activeLeafScale));
    vein.setAttribute('x2', '0');
    vein.setAttribute('y2', String(10 * this.activeLeafScale));
    vein.setAttribute('stroke', '#ffffff');
    vein.setAttribute('stroke-width', '0.7');
    vein.setAttribute('opacity', '0.85');

    this.activeBudGroup.append(halo, bud, vein);
  }

  /**
   * Renders true botanical olive leaves
   */
  private renderLeaves(count: number): void {
    this.leavesGroup.replaceChildren();
    if (count <= 0) return;

    const activeLeaves = REALISTIC_LEAF_MATRIX.slice(0, count);

    for (let i = 0; i < activeLeaves.length; i++) {
      const spec = activeLeaves[i]!;
      const leafG = document.createElementNS(NS, 'g');
      leafG.setAttribute('class', `tree-leaf shade-${spec.shade} tier-${spec.tier}`);
      leafG.setAttribute('transform', `translate(${spec.x}, ${spec.y}) rotate(${spec.rot}) scale(${spec.scale})`);
      leafG.style.animationDelay = `${spec.swayDelay}s`;

      const fillGrad =
        spec.shade === 'deep'
          ? 'url(#leafDeepGrad)'
          : spec.shade === 'silvery'
            ? 'url(#leafSilveryGrad)'
            : 'url(#leafMidGrad)';

      leafG.innerHTML = `
        <!-- Botanical Lanceolate Olive Leaf -->
        <path d="M 0 -13 C 4.8 -7, 5.5 6, 0 13 C -5.5 6, -4.8 -7, 0 -13 Z"
              fill="${fillGrad}"
              stroke="rgba(0,0,0,0.22)"
              stroke-width="0.5"
        />
        <!-- Silvery Reverse Half-Face -->
        <path d="M 0 -13 C 4.8 -7, 5.5 6, 0 13 Z"
              fill="url(#leafSilveryGrad)"
              opacity="0.4"
        />
        <!-- Pale Delicate Central Midrib -->
        <line x1="0" y1="-11" x2="0" y2="11" stroke="#e5efe7" stroke-width="0.75" opacity="0.65"/>
      `;

      this.leavesGroup.appendChild(leafG);
    }
  }

  /**
   * Renders 3D Moroccan Beldi Olives with stalks
   */
  private renderFruits(count: number): void {
    this.fruitsGroup.replaceChildren();
    if (count <= 0) return;

    const activeFruits = REALISTIC_FRUITS_COORDS.slice(0, count);

    for (const f of activeFruits) {
      const fruitGroup = document.createElementNS(NS, 'g');
      fruitGroup.setAttribute('class', 'tree-fruit');
      fruitGroup.setAttribute('transform', `translate(${f.x}, ${f.y}) scale(${f.size})`);

      fruitGroup.innerHTML = `
        <!-- Golden Aura Ring -->
        <circle cx="0" cy="0" r="11" fill="url(#oliveHaloGlow)"/>
        <!-- Natural Pedicel Stem -->
        <path d="M 0 -7 C ${f.stemAngle > 0 ? 3 : -3} -12, ${f.stemAngle > 0 ? 5 : -5} -16, ${f.stemAngle} -20"
              fill="none" stroke="#3b2b1a" stroke-width="1.3" stroke-linecap="round"/>
        <!-- 3D Beldi Moroccan Olive -->
        <ellipse cx="0" cy="0" rx="4.8" ry="7.2" fill="url(#beldiOliveGrad)" filter="url(#budBloomFilter)"/>
        <!-- Calyx at base -->
        <circle cx="0" cy="7" r="1.1" fill="#2b1a0a"/>
        <!-- Specular Highlight Glint -->
        <ellipse cx="-1.6" cy="-2.5" rx="1.3" ry="2.0" fill="#ffffff" opacity="0.8" transform="rotate(-15, -1.6, -2.5)"/>
      `;

      this.fruitsGroup.appendChild(fruitGroup);
    }
  }

  /**
   * Interactive Feedback on Tap:
   * Triggers active leaf spring pop, shockwave, and floating Dhikr particle rising from touch point.
   */
  public pulseTapFeedback(touchX?: number, touchY?: number, dhikrText?: string): void {
    this.activeBudGroup.classList.remove('bud-pop-anim');
    void this.activeBudGroup.getBoundingClientRect(); // restart reflow
    this.activeBudGroup.classList.add('bud-pop-anim');

    // Spawn floating touch particle
    if (typeof touchX === 'number' && typeof touchY === 'number') {
      this.spawnFloatingTouchParticle(touchX, touchY, dhikrText ?? '+1');
    } else {
      this.spawnFloatingTouchParticle(195, 230, dhikrText ?? '+1');
    }

    this.spawnAscendingNoorSpark();

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch {
        // Safe vibration fallback
      }
    }
  }

  private spawnFloatingTouchParticle(screenX: number, screenY: number, text: string): void {
    const textEl = document.createElementNS(NS, 'text');
    textEl.setAttribute('x', String(Math.max(50, Math.min(340, screenX))));
    textEl.setAttribute('y', String(Math.max(40, Math.min(270, screenY))));
    textEl.setAttribute('class', 'touch-mote-text');
    textEl.setAttribute('text-anchor', 'middle');
    textEl.textContent = text;

    this.floatingParticlesGroup.appendChild(textEl);

    setTimeout(() => {
      textEl.remove();
    }, 1100);
  }

  private spawnAscendingNoorSpark(): void {
    const startX = 160 + Math.random() * 70;
    const spark = document.createElementNS(NS, 'g');
    spark.setAttribute('class', 'rising-spark-anim');
    spark.innerHTML = `
      <circle cx="${startX}" cy="265" r="7" fill="url(#beldiOliveGrad)" filter="url(#budBloomFilter)"/>
      <circle cx="${startX}" cy="265" r="3.2" fill="#ffffff"/>
    `;
    this.glowGroup.appendChild(spark);

    setTimeout(() => {
      spark.remove();
    }, 1200);
  }
}

// Backward-compatibility export alias
export { LushSpiritualTreeWidget as SpiritualTreeWidget };

/**
 * Computes today's spiritual progress from the app state and persistent stores.
 * Correctly reads and sums counts from TASBIH_STORAGE_KEY ('azan.tasbih.v1').
 */
export function computeTodaySpiritualProgress(store?: SettingsStore): SpiritualProgress {
  let dhikrCount = 0;
  let morningAdhkarDone = false;
  let eveningAdhkarDone = false;
  let quranRead = false;
  let prayersCompleted = 0;

  try {
    const rawTasbih = localStorage.getItem('azan.tasbih.v1');
    if (rawTasbih) {
      const parsed = JSON.parse(rawTasbih);
      if (parsed && parsed.counts && typeof parsed.counts === 'object') {
        for (const val of Object.values(parsed.counts)) {
          if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
            dhikrCount += val;
          }
        }
      }
      if (parsed && Array.isArray(parsed.history)) {
        const todayMid = new Date();
        todayMid.setHours(0, 0, 0, 0);
        const todayTs = todayMid.getTime();
        for (const h of parsed.history) {
          if (h && typeof h.finishedAt === 'number' && h.finishedAt >= todayTs && typeof h.total === 'number') {
            dhikrCount += h.total;
          }
        }
      }
    }

    if (sessionStorage.getItem('azan.adhkar_sabah_done') === 'true') {
      morningAdhkarDone = true;
    }
    if (sessionStorage.getItem('azan.adhkar_masaa_done') === 'true') {
      eveningAdhkarDone = true;
    }

    const khatmah = loadKhatmahState();
    if (khatmah && khatmah.readAhzab && khatmah.readAhzab.length > 0) {
      quranRead = true;
    }

    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour >= 5) prayersCompleted++;  // Fajr
    if (currentHour >= 13) prayersCompleted++; // Dhuhr
    if (currentHour >= 16) prayersCompleted++; // Asr
    if (currentHour >= 19) prayersCompleted++; // Maghrib
    if (currentHour >= 21) prayersCompleted++; // Isha
  } catch {
    // Graceful fallback on restricted sandboxed storage
  }

  return {
    prayersCompleted,
    dhikrCount,
    morningAdhkarDone,
    eveningAdhkarDone,
    quranRead,
  };
}
