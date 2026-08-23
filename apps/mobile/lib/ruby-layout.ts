/**
 * Ruby layout math + theme colors for TokenizedText (mobile).
 * Extracted from components/TokenizedText.tsx (file-size refactor).
 */

import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useColorScheme } from 'nativewind';
import { colors } from '@langplayer/shared';
import { semanticColorsForMobile, hslToHex } from '@langplayer/shared';
import { isNativeRubyActive, isNativeRubyParagraphActive } from '@/components/RubyText';

/** Whether the native per-token RubyText view manager is linked in this build
 *  (evaluated once at module load — the native module is absent in Expo Go). */
export const NATIVE_RUBY_ACTIVE = isNativeRubyActive();
/** Whether the native paragraph ruby renderer is linked in this build. */
export const NATIVE_PARAGRAPH_ACTIVE = isNativeRubyParagraphActive();

/**
 * Platform-specific font family for a typeFace display setting (serif /
 * sans-serif): real named fonts on iOS (Georgia / Avenir Next), generic
 * families on Android. undefined for the 'default' typeface.
 */
export function typeFaceFontFamily(typeFace: 'default' | 'serif' | 'sans-serif'): string | undefined {
  if (typeFace === 'serif') return Platform.OS === 'ios' ? 'Georgia' : 'serif';
  if (typeFace === 'sans-serif') return Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif';
  return undefined;
}

/** RTL-script languages: the View-based ruby layout must reverse its flex
 *  row, otherwise words and their readings render in mirrored (LTR) order. */
export const RTL_L2S = new Set(['ar', 'fa', 'he', 'ur', 'sd', 'ps', 'dv']);

/** Target gap (px) between furigana glyphs and the base text. Web's native
 *  <ruby> annotation sits ~0–2px above the base, so mobile matches that
 *  instead of leaving the base line's full half-leading as a gap.
 *
 *  Native renderers reproduce this gap on their own:
 *  - iOS (Core Text CTRubyAnnotation) positions the reading a fixed ~4–5px
 *    above the base text — the base run is nudged down by `rubyBaseTextOffset`
 *    (2) in RubyTextView.swift / RubyTextParagraphView.swift so the visible
 *    gap lands back at ~2px.
 *  - Android per-token canvas anchors the reading baseline 2dp above the base
 *    glyphs' top edge in RubyTextView.kt. */
export const RUBY_READING_GAP = 2;

/** Reading glyph body in em — ascender + descender of a typical reading font
 *  (~0.97em ascent + ~0.24em descent for SF/Roboto Latin; kana/CJK fonts are
 *  smaller). Used to reserve the reading's FULL glyph height in the line box,
 *  not just its nominal point size — reserving less is what made readings
 *  poke into the line above (see ARCH-030). */
export const RUBY_READING_BODY_FACTOR = 1.2;

/** `bg-yellow-200/20` from the View fallback (saved-word highlight), resolved
 *  to a hex base color; the native paragraph applies /20 alpha itself. */
export const MOBILE_RUBY_SAVED_BG = hslToHex(colors.yellow[200]);

/**
 * Resolved theme colors for the native ruby renderer. These mirror the
 * NativeWind classes used by the View fallback (text-foreground,
 * text-primary, text-muted-foreground) so both paths stay in sync — and they
 * follow the app's live light/dark/system theme instead of a fixed palette.
 */
export function useMobileRubyColors() {
  const { colorScheme } = useColorScheme();
  return useMemo(
    () => semanticColorsForMobile(colorScheme === 'dark' ? 'dark' : 'light'),
    [colorScheme],
  );
}

export interface RubyLayoutInput {
  fontSize: number;
  /** Explicit line height from the caller (undefined → fontSize). */
  lineHeight: number | undefined;
  showPhonetics: boolean;
  phoneticsShow: string | false;
}

export interface RubyLayout {
  isRtl: boolean;
  tokenFontSize: number;
  /** Reading (furigana) font size — ≈55% of the base, min 8px. */
  readingSize: number;
  /** Base line height (explicit leading or fontSize). */
  baseLeading: number;
  halfLeading: number;
  /** How far the base text is pulled up so the reading gap ≈ RUBY_READING_GAP. */
  rubyPull: number;
  isRubyMode: boolean;
  /** The reading's full vertical extent that must fit inside the line box
   *  above the base glyphs: glyph body (ascender + descender) + gap. This is
   *  the space CSS `rt` occupies inside a ruby line box. */
  readingBand: number;
  /** Uniform line pitch of the rendered paragraph in ruby mode:
   *  `baseLeading + readingBand` (CSS parity — a ruby line box is the base
   *  line box plus the annotation above it; the browser GROWS the line box to
   *  fit the reading rather than keeping `fontSize × leading` and letting the
   *  annotation overlap the previous line). `baseLeading` otherwise. Every
   *  line — ruby or not — uses this pitch so the grid stays uniform, which is
   *  what the reader's translation column baseline-aligns to. */
  linePitch: number;
}

/**
 * Ruby metrics shared by the View-column fallback and the native renderers.
 * Match web's native ruby: the reading's line box (readingSize, no extra
 * leading) overlaps the base text's top half-leading, so the column stays
 * ≈ baseLeading tall. Pulling the base text up by `rubyPull` leaves only
 * RUBY_READING_GAP px between the reading glyphs and the base glyphs.
 */
export function computeRubyLayout(
  l2Code: string,
  input: RubyLayoutInput,
): RubyLayout {
  const isRtl = RTL_L2S.has(l2Code);
  const tokenFontSize = input.fontSize;
  const readingSize = Math.max(8, Math.round(tokenFontSize * 0.55));
  const baseLeading = input.lineHeight ?? tokenFontSize;
  const halfLeading = Math.round((baseLeading - tokenFontSize) / 2);
  const rubyPull = Math.max(0, halfLeading - RUBY_READING_GAP);
  const isRubyMode = input.showPhonetics && input.phoneticsShow === 'ruby';
  const readingBand = Math.round(readingSize * RUBY_READING_BODY_FACTOR) + RUBY_READING_GAP;
  return {
    isRtl,
    tokenFontSize,
    readingSize,
    baseLeading,
    halfLeading,
    rubyPull,
    isRubyMode,
    readingBand,
    linePitch: isRubyMode ? baseLeading + readingBand : baseLeading,
  };
}
