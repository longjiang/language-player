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
 *  instead of leaving the base line's full half-leading as a gap. */
export const RUBY_READING_GAP = 2;

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
  return {
    isRtl,
    tokenFontSize,
    readingSize,
    baseLeading,
    halfLeading,
    rubyPull,
    isRubyMode,
  };
}
