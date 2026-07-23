import type { ProficiencyLevel, ScaleId } from './types';

// ── Canonical 1–7 colors (HSK brand palette) ──

export const LEVEL_HEX_COLORS: Record<number, string> = {
  1: '#f8b51e',  // HSK 1 — gold
  2: '#267f94',  // HSK 2 — teal
  3: '#fd4f1c',  // HSK 3 — orange-red
  4: '#bb1718',  // HSK 4 — dark red
  5: '#1b3e76',  // HSK 5 — navy
  6: '#6a3669',  // HSK 6 — purple
  7: '#e11d48',  // rose-600 (extends palette beyond HSK)
};

// ── Scale Registry ────────────────────────────

export interface ScaleMeta {
  id: ScaleId;
  shortPrefix: string;   // "HSK", "CEFR", "JLPT"
  longPrefix: string;    // "HSK (2010)", "CEFR"
  /** 1–7 numeric → scale-specific label. e.g., cefr: 3 → "A2", hsk_2010: 3 → "3" */
  labels: Record<number, string>;
}

export const SCALES: Record<ScaleId, ScaleMeta> = {
  hsk_2010: {
    id: 'hsk_2010',
    shortPrefix: 'HSK',
    longPrefix: 'HSK (2010)',
    labels: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' },
  },
  hsk_2025: {
    id: 'hsk_2025',
    shortPrefix: 'HSK',
    longPrefix: 'HSK (2025)',
    labels: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' },
  },
  cefr: {
    id: 'cefr',
    shortPrefix: 'CEFR',
    longPrefix: 'CEFR',
    labels: { 1: 'Pre-A1', 2: 'A1', 3: 'A2', 4: 'B1', 5: 'B2', 6: 'C1', 7: 'C2' },
  },
  jlpt: {
    id: 'jlpt',
    shortPrefix: 'JLPT',
    longPrefix: 'JLPT',
    labels: { 1: 'Pre-N5', 2: 'N5', 3: 'N4', 4: 'N3', 5: 'N2', 6: 'N1' },
  },
  topik: {
    id: 'topik',
    shortPrefix: 'TOPIK',
    longPrefix: 'TOPIK',
    labels: { 1: 'Pre-1', 2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6' },
  },
  ielts: {
    id: 'ielts',
    shortPrefix: 'IELTS',
    longPrefix: 'IELTS',
    labels: { 1: '1', 2: '2', 3: '3.5', 4: '5', 5: '6.5', 6: '8', 7: '9' },
  },
};

// ── Derived reverse lookup (built once lazily) ──

const _reverseLabelCache = new Map<ScaleId, Map<string, number>>();

function _reverseLabels(scale: ScaleMeta): Map<string, number> {
  let cached = _reverseLabelCache.get(scale.id);
  if (!cached) {
    cached = new Map<string, number>();
    for (const [numStr, label] of Object.entries(scale.labels)) {
      cached.set(label, Number(numStr));
    }
    _reverseLabelCache.set(scale.id, cached);
  }
  return cached;
}

// ── Public API ────────────────────────────────

export interface FormattedLevel {
  /** "HSK 3", "B1", "N4" */
  short: string;
  /** "HSK (2010) 3", "CEFR B1", "JLPT N4" */
  long: string;
  /** Universal 1–7, or undefined if unrecognized */
  numeric: number | undefined;
  /** Hex color from LEVEL_HEX_COLORS[numeric], or gray fallback */
  hexColor: string;
}

/** Format a proficiency level for display.
 *  Accepts `{ scale, value }` with optional `numeric` — `numeric` is
 *  derived from the scale+value pair if not provided. */
export function formatLevel(level: { scale: string; value: number | string; numeric?: number }): FormattedLevel {
  const scale = SCALES[level.scale as ScaleId];
  const valueStr = String(level.value);

  if (!scale) {
    return {
      short: valueStr,
      long: `${level.scale}: ${valueStr}`,
      numeric: undefined,
      hexColor: '#6b7280',
    };
  }

  const numeric = level.numeric ?? _reverseLabels(scale).get(valueStr);

  return {
    short: `${scale.shortPrefix} ${level.value}`,
    long: `${scale.longPrefix} ${level.value}`,
    numeric,
    hexColor: numeric ? (LEVEL_HEX_COLORS[numeric] ?? '#6b7280') : '#6b7280',
  };
}

/** Format a 1–7 numeric level for a given scale (primary direction — DB → display). */
export function formatNumericLevel(numeric: number, scaleId: ScaleId): FormattedLevel {
  const scale = SCALES[scaleId];
  const label = scale?.labels[numeric];

  if (!scale || label === undefined) {
    return {
      short: `Level ${numeric}`,
      long: `Level ${numeric}`,
      numeric,
      hexColor: LEVEL_HEX_COLORS[numeric] ?? '#6b7280',
    };
  }

  return {
    short: `${scale.shortPrefix} ${label}`,
    long: `${scale.longPrefix} ${label}`,
    numeric,
    hexColor: LEVEL_HEX_COLORS[numeric] ?? '#6b7280',
  };
}

/** Which scale is the primary exam for a given language? */
export function primaryScale(l2Code: string): ScaleId {
  if (l2Code === 'zh') return 'hsk_2010';
  if (l2Code === 'ja') return 'jlpt';
  if (l2Code === 'ko') return 'topik';
  if (l2Code === 'en') return 'ielts';
  return 'cefr';
}
