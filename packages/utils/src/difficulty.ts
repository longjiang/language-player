/**
 * Difficulty / Level calculations shared across platforms.
 *
 * These formulas are derived from the classic Nuxt app's logic and
 * the MAX_DIFFICULTY_BY_LEVEL data.
 */

/** Maximum difficulty thresholds per CEFR level per language. */
const MAX_DIFFICULTY: Record<string, number[]> = {
  ar: [0.00168681, 0.00279967, 0.00453687, 0.00779097, 0.0138839, 0.023465, 0.183862],
  de: [0.00234459, 0.0032763, 0.00433635, 0.00539367, 0.00649187, 0.00805098, 0.0580363],
  en: [0.00334957, 0.00425345, 0.00488847, 0.00558807, 0.00644014, 0.0077838, 0.0578485],
  es: [0.00287356, 0.0032967, 0.00396694, 0.00467804, 0.00568506, 0.00737864, 0.0667576],
  fr: [0.00329562, 0.00371517, 0.00427184, 0.00491248, 0.00580396, 0.00712503, 0.045214],
  it: [0.0021097, 0.0029304, 0.0037594, 0.00480994, 0.00624059, 0.00815024, 0.0523786],
  ja: [0.0015, 0.0025, 0.004, 0.006, 0.009, 0.013, 0.08],
  ko: [0.0015, 0.0025, 0.004, 0.006, 0.009, 0.013, 0.08],
  pt: [0.00276153, 0.00334096, 0.00394281, 0.00466106, 0.00557831, 0.0069948, 0.0545557],
  ru: [0.00226176, 0.00393957, 0.00533333, 0.0070193, 0.00893468, 0.0116931, 0.0589474],
  zh: [0.001, 0.002, 0.004, 0.007, 0.012, 0.02, 0.12],
};

const DEFAULT_MAX_DIFFICULTY = [0.002, 0.0035, 0.005, 0.007, 0.01, 0.015, 0.08];

/**
 * Clamp a difficulty score to the valid range for a given language and level.
 * Level is 1-indexed (1–7).
 */
export function clampDifficulty(difficulty: number, lang: string, level: number): number {
  const thresholds = MAX_DIFFICULTY[lang] ?? DEFAULT_MAX_DIFFICULTY;
  const max = thresholds[Math.min(level, thresholds.length) - 1] ?? thresholds[thresholds.length - 1]!;
  return Math.min(difficulty, max);
}

/** Approximate CEFR level from hours watched. */
export function levelFromHours(hours: number): number {
  if (hours < 50) return 1;
  if (hours < 150) return 2;
  if (hours < 300) return 3;
  if (hours < 600) return 4;
  if (hours < 1000) return 5;
  if (hours < 2000) return 6;
  return 7;
}

/** Approximate hours needed for a given CEFR level. */
export function hoursFromLevel(level: number): number {
  const hours = [0, 25, 100, 225, 450, 725, 1500, 3000];
  return hours[Math.min(level, 7)] ?? 3000;
}
