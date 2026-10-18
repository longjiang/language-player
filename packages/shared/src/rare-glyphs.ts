/**
 * Rare-Han glyph helpers (SPEC-104).
 *
 * A "rare Han" codepoint is one outside the URO and Extension A blocks that
 * normal system CJK fonts cover. These codepoints are candidates for
 * on-demand font subsets; the text itself is always preserved.
 *
 * Pure helpers only — no React, React Native, Next.js, or Node imports.
 */

export interface RareHanRange {
  /** Inclusive first codepoint. */
  start: number;
  /** Inclusive last codepoint. */
  end: number;
  /** Human-readable block name (for tests/logs). */
  name: string;
}

/** Unicode 17 CJK extension ranges handled by the subset path. */
export const RARE_HAN_RANGES: readonly RareHanRange[] = [
  { start: 0x20000, end: 0x2a6df, name: 'CJK Ext B' },
  { start: 0x2a700, end: 0x2b73f, name: 'CJK Ext C' },
  { start: 0x2b740, end: 0x2b81f, name: 'CJK Ext D' },
  { start: 0x2b820, end: 0x2ceaf, name: 'CJK Ext E' },
  { start: 0x2ceb0, end: 0x2ebef, name: 'CJK Ext F' },
  { start: 0x2ebf0, end: 0x2ee5f, name: 'CJK Ext I' },
  { start: 0x30000, end: 0x3134f, name: 'CJK Ext G' },
  { start: 0x31350, end: 0x323af, name: 'CJK Ext H' },
  { start: 0x323b0, end: 0x3347f, name: 'CJK Ext J' },
  { start: 0x2f800, end: 0x2fa1f, name: 'CJK Compatibility Supplement' },
] as const;

export function isRareHanCodePoint(cp: number): boolean {
  if (!Number.isInteger(cp) || cp < 0) return false;
  for (const range of RARE_HAN_RANGES) {
    if (cp >= range.start && cp <= range.end) return true;
  }
  return false;
}

/** Unique rare codepoints in first-appearance order. */
export function collectRareCodePoints(text: string): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (isRareHanCodePoint(cp) && !seen.has(cp)) {
      seen.add(cp);
      result.push(cp);
    }
  }
  return result;
}

/** A display run: ordinary text, or one rare codepoint rendered as a chip. */
export type RareGlyphRun =
  | { kind: 'text'; text: string }
  | { kind: 'rare'; text: string; codePoint: number; label: string };

/**
 * Split text into ordinary and rare runs by code point.
 *
 * Consecutive ordinary characters are merged into one text run. Each rare
 * codepoint gets its own run so a mixed word can show a chip for the missing
 * character without hiding the rest of the word.
 */
export function splitRareGlyphRuns(text: string): RareGlyphRun[] {
  const runs: RareGlyphRun[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      runs.push({ kind: 'text', text: buffer });
      buffer = '';
    }
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp != null && isRareHanCodePoint(cp)) {
      flush();
      runs.push({ kind: 'rare', text: ch, codePoint: cp, label: rareGlyphLabel(cp) });
    } else {
      buffer += ch;
    }
  }
  flush();
  return runs;
}

/** Display label for a rare codepoint, e.g. `U+26030`. */
export function rareGlyphLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Font family name used by both the server subsetter and the clients. */
export function rareFontFamily(hash: string): string {
  return `LPRareHan-${hash}`;
}

/** Comma-separated lowercase hex, as accepted by /glyph-font/manifest. */
export function rareGlyphParam(cps: readonly number[]): string {
  return [...new Set(cps)]
    .sort((a, b) => a - b)
    .map((cp) => cp.toString(16))
    .join(',');
}

export type RareGlyphStyle = 'sans' | 'serif';

export type RareGlyphFormat = 'woff2' | 'ttf' | 'otf';

export interface RareGlyphFontEntry {
  url: string;
  bytes?: number;
}

/** Mirrors the /glyph-font/manifest response. */
export interface RareGlyphManifest {
  version: string;
  style: RareGlyphStyle;
  hash: string | null;
  covered: string[];
  missing: string[];
  fonts: Partial<Record<RareGlyphFormat, RareGlyphFontEntry>>;
}
