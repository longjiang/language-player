import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native';
import type { RubySegment } from '@langplayer/utils';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type {
  NativeRubyTextParagraphProps,
  NativeRubyTextParagraphRun,
  NativeRubyTextProps,
} from '../modules/ruby-text/src';
import { log, logwarn } from '@/lib/logger';

/**
 * Kill switch: if the native renderer misbehaves in a build, flip this to
 * false and every token falls back to the View-column renderer (the previous
 * behavior), with no other code changes.
 */
const NATIVE_RUBY_ENABLED = true;

let NativeRubyTextView: React.ComponentType<NativeRubyTextProps> | null = null;
let NativeRubyTextParagraphView: React.ComponentType<NativeRubyTextParagraphProps> | null = null;
if (NATIVE_RUBY_ENABLED && (Platform.OS === 'ios' || Platform.OS === 'android')) {
  try {
    // The module only exists in development/release builds compiled from this
    // repo — Expo Go does not contain it, so availability must be checked at
    // runtime rather than assumed.
    if (requireOptionalNativeModule('RubyText') != null) {
      const rubyModule = requireOptionalNativeModule('RubyText');
      NativeRubyTextView = requireNativeViewManager<NativeRubyTextProps>('RubyText');
      log('[LP Mobile] [RubyText] native ruby renderer available');

      // The paragraph renderer is iOS-only, and older iOS builds ship the
      // module without the view. requireNativeViewManager does not throw for
      // a missing view manager — it returns a placeholder that fails at
      // render time ("Unable to get the view config ..."), so availability is
      // probed via an explicit native function added in the same build as the
      // paragraph view.
      try {
        const probe = (rubyModule as { isParagraphRendererAvailable?: () => boolean })
          .isParagraphRendererAvailable;
        if (typeof probe === 'function' && probe()) {
          NativeRubyTextParagraphView =
            // Named (non-default) views are addressed as module + view name:
            // the first View in the module is "RubyText", every later view is
            // "<module>", "<Swift class name>".
            requireNativeViewManager<NativeRubyTextParagraphProps>(
              'RubyText',
              'RubyTextParagraphView'
            );
          log('[LP Mobile] [RubyText] paragraph ruby renderer available');
        } else {
          NativeRubyTextParagraphView = null;
          logwarn(
            '[LP Mobile] [RubyText] paragraph ruby renderer not in this build — using per-token path',
          );
        }
      } catch (paragraphErr) {
        NativeRubyTextParagraphView = null;
        logwarn(
          '[LP Mobile] [RubyText] paragraph ruby renderer unavailable — using per-token path',
          paragraphErr,
        );
      }
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
  italic?: boolean;
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

/** Whether the paragraph-level ruby renderer is linked in this build. */
export function isNativeRubyParagraphActive(): boolean {
  return NativeRubyTextParagraphView != null;
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
    italic = false,
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
    italic,
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
        italic={italic}
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

export interface RubyTextParagraphProps {
  /** Flat list of text runs spanning the whole block (one attributed string). */
  runs: NativeRubyTextParagraphRun[];
  fontSize: number;
  lineHeight: number;
  readingSize: number;
  isRtl: boolean;
  fontFamily?: string | null;
  /** Bold the measuring text too — bold glyphs are wider and wrap differently. */
  fontWeight?: 'normal' | 'bold';
  /** Reported with the tapped token's index. */
  onTokenTap?: (tokenId: number) => void;
  testID?: string;
}

/**
 * Renders an entire block of ruby segments as ONE native text layout
 * (iOS builds only). JS keeps an invisible RN Text with the same font and
 * line box to measure the exact width/height Fabric/Yoga won't measure for
 * a custom host view; the native view then gets that box via style.
 */
export const RubyTextParagraph = memo(function RubyTextParagraph(props: RubyTextParagraphProps) {
  const {
    runs,
    fontSize,
    lineHeight,
    readingSize,
    isRtl,
    fontFamily,
    fontWeight,
    onTokenTap,
    testID,
  } = props;

  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  // Only the glyph metrics matter for the box: text content, font, sizes.
  // Style-only changes (colors, bold, opacity) keep the same measured box.
  const plainText = useMemo(() => runs.map((run) => run.text).join(''), [runs]);
  const sizeKey = [
    plainText,
    fontSize,
    lineHeight,
    readingSize,
    fontFamily ?? '',
    fontWeight ?? '',
  ].join(':');

  const [activeSizeKey, setActiveSizeKey] = useState(sizeKey);
  useEffect(() => {
    if (activeSizeKey !== sizeKey) {
      setActiveSizeKey(sizeKey);
      setMeasured(null);
    }
  }, [sizeKey, activeSizeKey]);

  // Dev-only: after the native paragraph mounts, pull its internal state
  // (runs parsed, attributed-string length, frames) so a blank render can be
  // diagnosed from the Metro log.
  const mountedKey = measured ? `${measured.width.toFixed(1)}x${measured.height.toFixed(1)}` : null;
  const probeDiagnostics = useCallback((tag: string) => {
    try {
      const module = requireOptionalNativeModule('RubyText') as
        | { getParagraphDiagnostics?: () => unknown }
        | null;
      const diagnostics = module?.getParagraphDiagnostics?.();
      log(`[LP Mobile] [RubyText] paragraph native diagnostics [${tag}]`, JSON.stringify(diagnostics ?? null));
    } catch (err) {
      logwarn('[LP Mobile] [RubyText] paragraph diagnostics failed', err);
    }
  }, []);

  useEffect(() => {
    if (!mountedKey) return;
    probeDiagnostics('mount');
    const timer = setTimeout(() => probeDiagnostics('settled'), 250);
    return () => clearTimeout(timer);
  }, [mountedKey, probeDiagnostics]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    log(`[LP Mobile] [RubyText] paragraph measured w=${width.toFixed(1)} h=${height.toFixed(1)} runs=${runs.length}`);
    setMeasured((prev) =>
      prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height }
    );
  }, [runs.length]);

  if (!NativeRubyTextParagraphView) return null;

  return (
    // The wrapper must claim the parent's full width explicitly: readers put
    // blocks inside `items-center` containers, where a view with only
    // absolutely-positioned children (the measuring Text) collapses to width
    // 0. The old flex-row token container got its width from its children.
    <View testID={testID} style={{ width: '100%' }}>
      {/* Invisible measuring text: RN Text wraps with the same font and line
          box as the native paragraph, so its laid-out size is the exact box
          the native view needs. Kept mounted so width changes (rotation,
          zoom) re-measure automatically. */}
      <Text
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          opacity: 0,
          fontSize,
          lineHeight,
          fontWeight: fontWeight ?? 'normal',
          ...(fontFamily ? { fontFamily } : {}),
        }}
        onLayout={onLayout}
      >
        {plainText}
      </Text>
      {measured && activeSizeKey === sizeKey ? (
        (() => {
          log(`[LP Mobile] [RubyText] paragraph mounting native view runs=${runs.length} box=${measured.width.toFixed(1)}x${measured.height.toFixed(1)}`);
          return (
            <NativeRubyTextParagraphView
              runs={runs}
              fontSize={fontSize}
              lineHeight={lineHeight}
              readingSize={readingSize}
              isRtl={isRtl}
              fontFamily={fontFamily ?? null}
              onTokenTap={(event) => onTokenTap?.(event.nativeEvent.tokenId)}
              style={{ width: measured.width, height: measured.height }}
            />
          );
        })()
      ) : null}
    </View>
  );
});
