/**
 * Props accepted by the native RubyText view.
 *
 * The shape is implemented twice natively:
 *   - ios/RubyTextView.swift (CTRubyAnnotation + Core Text)
 *   - android/.../RubyTextView.kt (framework RubySpan / pre-31 fallback span)
 *
 * `readingColor` is honored on iOS via CTRubyAnnotationCreateWithAttributes;
 * Android's framework RubySpan currently inherits the base color.
 *
 * `style` is the React Native layout style: apps/mobile/components/RubyText.tsx
 * measures the View-based fallback and passes the exact box back, because
 * Fabric/Yoga does not measure custom host views on its own.
 */
import type { ViewStyle } from 'react-native';

export interface NativeRubyTextProps {
  /** Kanji↔reading pairs from @langplayer/utils buildRuby(). */
  segments: { text: string; reading?: string | null }[];
  /** Render an empty reading slot above tokens without ruby so line height stays uniform. */
  reserveReadingSlot: boolean;
  /** Base text font size, px. */
  fontSize: number;
  /** Base text line height, px. */
  lineHeight: number;
  /** Reading (ruby) font size, px. */
  readingSize: number;
  /** Px the reading is pulled down toward the base text (mirrors the View fallback). */
  rubyPull: number;
  /** Base text color, hex (#rrggbb). */
  color: string;
  /** Reading (ruby) color, hex (#rrggbb). */
  readingColor: string;
  fontWeight: 'normal' | 'bold';
  underline: boolean;
  italic?: boolean;
  fontFamily?: string | null;
  /** Dispatched when the native view is tapped (dictionary popup / quiz reveal). */
  onTap?: (event: { nativeEvent: unknown }) => void;
  style?: ViewStyle | ViewStyle[];
}

/** One tappable text run inside a paragraph-level ruby renderer. */
export interface NativeRubyTextParagraphRun {
  /** Token index in the block; reported back by onTokenTap. */
  tokenId: number;
  text: string;
  reading?: string | null;
  /** Per-run base font size override (e.g. byeonggi at readingSize). */
  fontSize?: number;
  /** Whether taps on this run dispatch onTokenTap (words only). */
  tappable: boolean;
  color: string;
  readingColor: string;
  bold: boolean;
  underline: boolean;
  italic?: boolean;
  /** Base hex color for a per-run background highlight (e.g. search hit). */
  background?: string | null;
  /** Alpha for the background highlight (0–1). */
  backgroundAlpha?: number;
  /** Whole-run opacity (karaoke dimming). */
  opacity: number;
}

/** One measured line of the paragraph's base-text grid (line box top/height
 *  and the base text's baseline offset from the line top, ruby included). */
export interface NativeRubyTextParagraphLineGrid {
  y: number;
  height: number;
  ascender: number;
}

/**
 * Props for the paragraph-level RubyText view.
 *
 * The view renders ALL runs as one attributed string so Core Text can apply
 * ruby alignment/overhang against real neighbors. iOS only for now; Android
 * and Expo Go fall back to per-token RubyText views.
 */
export interface NativeRubyTextParagraphProps {
  runs: NativeRubyTextParagraphRun[];
  /** Base text font size, px. */
  fontSize: number;
  /** Total line box height, px — base line height plus the reserved reading slot. */
  lineHeight: number;
  /** Reading (ruby) font size, px. */
  readingSize: number;
  /** Right-to-left script layout (Arabic, Hebrew, ...). */
  isRtl: boolean;
  fontFamily?: string | null;
  /** Dispatched with { tokenId } when a tappable run is tapped. */
  onTokenTap?: (event: { nativeEvent: { tokenId: number } }) => void;
  /** Dispatched with the base-text line grid once the paragraph lays out
   *  (per-line y/height/ascender — ascender includes the ruby band, so the
   *  reader's translation baseline alignment can match the real render). */
  onLineGrid?: (event: { nativeEvent: { lines: NativeRubyTextParagraphLineGrid[] } }) => void;
  /** Dispatched with { start, end } (UTF-16 offsets into the BASE text —
   *  readings are ruby attributes, not part of the string) when the user
   *  drag-selects a non-collapsed range (SPEC-084). Fires continuously while
   *  selection handles move; JS applies a settle timer. */
  onSelection?: (event: { nativeEvent: { start: number; end: number } }) => void;
  /** Bump to collapse the native selection (dictionary popup dismiss) —
   *  SPEC-084 Task 1.3. */
  clearSelection?: number;
  style?: ViewStyle | ViewStyle[];
}
