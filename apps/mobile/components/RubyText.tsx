import React, { memo, useCallback, useEffect, useState } from 'react';
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native';
import type { RubySegment } from '@langplayer/utils';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeRubyTextProps } from '../modules/ruby-text/src';
import { log, logwarn } from '@/lib/logger';

/**
 * Kill switch: if the native renderer misbehaves in a build, flip this to
 * false and every token falls back to the View-column renderer (the previous
 * behavior), with no other code changes.
 */
const NATIVE_RUBY_ENABLED = true;

let NativeRubyTextView: React.ComponentType<NativeRubyTextProps> | null = null;
if (NATIVE_RUBY_ENABLED && (Platform.OS === 'ios' || Platform.OS === 'android')) {
  try {
    // The module only exists in development/release builds compiled from this
    // repo — Expo Go does not contain it, so availability must be checked at
    // runtime rather than assumed.
    if (requireOptionalNativeModule('RubyText') != null) {
      NativeRubyTextView = requireNativeViewManager<NativeRubyTextProps>('RubyText');
      log('[LP Mobile] [RubyText] native ruby renderer available');
    } else {
      logwarn('[LP Mobile] [RubyText] native module not found — using View fallback');
    }
  } catch (err) {
    NativeRubyTextView = null;
    logwarn('[LP Mobile] [RubyText] native ruby renderer unavailable, using View fallback', err);
  }
}

export interface RubyTextProps {
  /** One kanji↔reading pair from buildRuby() — each segment renders its own
   *  native view (or fallback column), mirroring web's per-kanji <ruby>. */
  segment: RubySegment;
  /** Keep an empty reading slot above segments without a reading so line
   *  heights stay uniform (true in ruby mode, and for kana segments inside a
   *  ruby-bearing word). */
  reserveReadingSlot: boolean;
  readingSize: number;
  rubyPull: number;
  baseLeading?: number;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number; fontWeight?: 'normal' | 'bold' };
  /** Resolved dark-theme hex colors for the native renderer. */
  colorHex: string;
  readingColorHex: string;
  bold?: boolean;
  underline?: boolean;
  /** Token this segment belongs to — reported back by the native tap event. */
  tokenIndex?: number;
  onTokenPress?: (index: number) => void;
  /** Karaoke dimming — applied as opacity on the native view (no wrapper). */
  dimmed?: boolean;
  /** Exact classes the View fallback used before the native path existed. */
  fallbackBaseClassName?: string;
  fallbackReadingClassName?: string;
}

/** Whether the native RubyText view manager is available in this build. */
export function isNativeRubyActive(): boolean {
  return NativeRubyTextView != null;
}

/**
 * Renders ONE ruby segment with the native text engine when the local RubyText
 * Expo module is linked (development/release builds), and with the previous
 * View-column layout everywhere else (Expo Go, web, module missing).
 *
 * Fabric/Yoga does not measure custom host views, so the fallback is rendered
 * once, measured via onLayout, and the exact box is handed to the native view.
 * The swap is layout-neutral, so no line wrapping or baseline math changes.
 *
 * Multiple segments of a token are rendered by the parent (RubyTokenSpan) as
 * sibling RubyText views with NO wrapping view between them — a fragment, so
 * each segment is a direct flex child of the token's row, like inline <ruby>
 * elements in a paragraph.
 */
export const RubyText = memo(function RubyText(props: RubyTextProps) {
  const {
    segment,
    reserveReadingSlot,
    readingSize,
    rubyPull,
    baseLeading,
    textStyle,
    colorHex,
    readingColorHex,
    bold = false,
    underline = false,
    tokenIndex,
    onTokenPress,
    dimmed = false,
    fallbackBaseClassName,
    fallbackReadingClassName,
  } = props;

  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  // Reset the measured size whenever anything that affects glyph metrics or
  // content changes — otherwise the native view would keep a stale box after
  // font/size/zoom updates.
  const sizeKey = [
    textStyle.fontSize ?? 16,
    textStyle.fontFamily ?? '',
    textStyle.fontWeight ?? '',
    baseLeading ?? '',
    readingSize,
    rubyPull,
    reserveReadingSlot,
    bold,
    underline,
    `${segment.text}|${segment.reading ?? ''}`,
  ].join(':');

  const [activeSizeKey, setActiveSizeKey] = useState(sizeKey);
  useEffect(() => {
    if (activeSizeKey !== sizeKey) {
      setActiveSizeKey(sizeKey);
      setMeasured(null);
    }
  }, [sizeKey, activeSizeKey]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((prev) =>
      prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height }
    );
  }, []);

  if (NativeRubyTextView && measured) {
    return (
      <NativeRubyTextView
        // Omit the `reading` key when absent — NSNull in the array poisoned the
        // Swift record conversion and blanked every segment without a reading.
        segments={[{ text: segment.text, ...(segment.reading ? { reading: segment.reading } : {}) }]}
        reserveReadingSlot={reserveReadingSlot}
        fontSize={textStyle.fontSize ?? 16}
        lineHeight={baseLeading ?? textStyle.fontSize ?? 16}
        readingSize={readingSize}
        rubyPull={rubyPull}
        color={colorHex}
        readingColor={readingColorHex}
        fontWeight={bold || textStyle.fontWeight === 'bold' ? 'bold' : 'normal'}
        underline={underline}
        fontFamily={textStyle.fontFamily ?? null}
        onTap={() => {
          if (tokenIndex != null) onTokenPress?.(tokenIndex);
        }}
        style={{ width: measured.width, height: measured.height, opacity: dimmed ? 0.4 : 1 }}
      />
    );
  }

  // View fallback: one column, identical to the pre-native per-segment markup.
  return (
    <View className="items-center" onLayout={NativeRubyTextView ? onLayout : undefined}>
      {segment.reading ? (
        <Text
          style={{ fontSize: readingSize, lineHeight: readingSize, marginBottom: -rubyPull }}
          className={fallbackReadingClassName}
        >
          {segment.reading}
        </Text>
      ) : reserveReadingSlot ? (
        <View style={{ height: readingSize, marginBottom: -rubyPull }} />
      ) : null}
      <Text style={[textStyle, baseLeading ? { lineHeight: baseLeading } : undefined]} className={fallbackBaseClassName}>
        {segment.text}
      </Text>
    </View>
  );
});
