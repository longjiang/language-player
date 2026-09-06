/**
 * Difficulty / Level calculations shared across platforms.
 *
 * Note: the per-language difficulty thresholds (Video difficulty → 1–7 level)
 * live ONLY on the server: `DIFFICULTY_PROFILE` in
 * `zerotohero-python-server/utils_language.py`, served via
 * GET /difficulty-profiles and consumed by
 * `getLevelFromDifficulty()` in `@langplayer/shared`.
 * See `docs/arch/032-youtube-video-difficulty.md`.
 *
 * This module previously carried a hardcoded `MAX_DIFFICULTY` fallback map
 * (with a comment claiming it was derived from Classic's
 * MAX_DIFFICULTY_BY_LEVEL). The values for en/ja/ko/zh were hand-tuned round
 * numbers that did NOT match Classic or the server profile, the map was only
 * used by `clampDifficulty`, and nothing in any app imported either — the
 * fallback was dead code and a second source of truth, so it was removed.
 * When the `/difficulty-profiles` fetch fails, level badges are simply
 * omitted (no fallback level).
 */

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
