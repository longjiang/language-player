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
    }
  } catch (err) {
    NativeRubyTextView = null;
    logwarn('[LP Mobile] [RubyText] native ruby renderer unavailable, using View fallback', err);
  }
}

export interface RubyTextProps {
  /** Kanji↔reading pairs from buildRuby(). */
  segments: RubySegment[];
  /** True when at least one segment may carry a reading (affects the reserved slot). */
  hasRuby: boolean;
  /** Keep an empty reading slot above tokens without ruby so line heights stay uniform. */
  reserveReadingSlot: boolean;
  readingSize: number;
  rubyPull: number;
  baseLeading?: number;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number; fontWeight?: 'normal' | 'bold' };
  /** Resolved dark-theme hex colors for the native renderer. */
  colorHex: string;
  bold?: boolean;
  underline?: boolean;
  /** Background classes for saved/search highlights on the native path (the
   *  fallback keeps its classes on the base Text, matching the old markup). */
  nativeHighlightClassName?: string;
  /** Exact classes the View fallback used before the native path existed. */
  fallbackBaseClassName?: string;
  fallbackReadingClassName?: string;
}

/**
 * Renders ruby-annotated text with the native text engine when the local
 * RubyText Expo module is linked (development/release builds), and with the
 * previous View-column layout everywhere else (Expo Go, web, module missing).
 *
 * Fabric/Yoga does not measure custom host views, so the fallback is rendered
 * once, measured via onLayout, and the exact box is handed to the native view.
 * The swap is layout-neutral, so no line wrapping or baseline math changes.
 */
export const RubyText = memo(function RubyText(props: RubyTextProps) {
  const {
    segments,
    hasRuby,
    reserveReadingSlot,
    readingSize,
    rubyPull,
    baseLeading,
    textStyle,
    colorHex,
    bold = false,
    underline = false,
    nativeHighlightClassName,
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
    hasRuby,
    bold,
    underline,
    segments.map((s) => `${s.text}|${s.reading ?? ''}`).join('~'),
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
      <View className={nativeHighlightClassName}>
        <NativeRubyTextView
          segments={segments.map((s) => ({ text: s.text, reading: s.reading ?? null }))}
          reserveReadingSlot={reserveReadingSlot}
          fontSize={textStyle.fontSize ?? 16}
          lineHeight={baseLeading ?? textStyle.fontSize ?? 16}
          readingSize={readingSize}
          rubyPull={rubyPull}
          color={colorHex}
          fontWeight={bold || textStyle.fontWeight === 'bold' ? 'bold' : 'normal'}
          underline={underline}
          fontFamily={textStyle.fontFamily ?? null}
          style={{ width: measured.width, height: measured.height }}
        />
      </View>
    );
  }

  // View fallback: identical markup to the pre-native RubyTokenSpan columns.
  return (
    <View className="flex-row items-end" onLayout={NativeRubyTextView ? onLayout : undefined}>
      {segments.map((seg, j) => (
        <View key={j} className="items-center">
          {seg.reading ? (
            <Text
              style={{ fontSize: readingSize, lineHeight: readingSize, marginBottom: -rubyPull }}
              className={fallbackReadingClassName}
            >
              {seg.reading}
            </Text>
          ) : hasRuby || reserveReadingSlot ? (
            <View style={{ height: readingSize, marginBottom: -rubyPull }} />
          ) : null}
          <Text style={[textStyle, baseLeading ? { lineHeight: baseLeading } : undefined]} className={fallbackBaseClassName}>
            {seg.text}
          </Text>
        </View>
      ))}
    </View>
  );
});
