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
  fontFamily?: string | null;
  style?: ViewStyle | ViewStyle[];
}
