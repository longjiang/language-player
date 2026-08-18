import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View, findNodeHandle, type LayoutChangeEvent } from 'react-native';
import type { RubySegment } from '@langplayer/utils';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import type {
  NativeRubyTextParagraphProps,
  NativeRubyTextParagraphRun,
  NativeRubyTextProps,
} from '../modules/ruby-text/src';
import type { GridLine, TextLayoutLine } from '@/lib/aligned-translation';
import { log, logwarn } from '@/lib/logger';

/**
 * Kill switch: if the native renderer misbehaves in a build, flip this to
 * false and every token falls back to the View-column renderer (the previous
 * behavior), with no other code changes.
 *
 * EXPERIMENT B (furigana-missing diagnosis): temporarily false to confirm the
 * JS View fallback paints readings when the native path does not. Reverted to
 * true — the fallback is not an acceptable permanent fix.
 */
const NATIVE_RUBY_ENABLED = true;

let NativeRubyTextView: React.ComponentType<NativeRubyTextProps> | null = null;
type NativeParagraphComponent = React.ComponentType<
  NativeRubyTextParagraphProps & { ref?: React.Ref<unknown> }
>;
let NativeRubyTextParagraphView: NativeParagraphComponent | null = null;
/** Dev-only: paragraph prop combos already logged (one-shot). */
const loggedParagraphProps = new Set<string>();
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
      // Do NOT reset measured here. onLayout for the new size can fire during
      // the layout pass — before this passive effect — and nulling it would
      // leave the paragraph blank with no further onLayout to re-measure
      // (the measuring Text has already laid out). The activeSizeKey guard
      // below already keeps the native view from mounting with a stale box.
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
    log(`[LP Mobile] [RubyText] native render seg="${segment.text}" reading="${segment.reading ?? ''}" box=${measured.width.toFixed(1)}x${measured.height.toFixed(1)} platform=${Platform.OS}`);
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
          style={{
            fontSize: readingSize,
            lineHeight: readingSize,
            marginBottom: -rubyPull,
            ...(textStyle.fontFamily ? { fontFamily: textStyle.fontFamily } : {}),
          }}
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
  /** Real base-text line grid of the paragraph (measured natively on the
   *  paragraph's own TextKit 2 layout WITH the ruby annotations, so the
   *  baseline includes the reading band). Readers use it to baseline-align
   *  the translation column (SPEC-082 web AlignedTranslation parity). Must
   *  be identity-stable (the paragraph is memoized). */
  onLineGrid?: (lines: GridLine[]) => void;
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
    onLineGrid,
    testID,
  } = props;

  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
    sizeKey: string;
  } | null>(null);
  const nativeRef = useRef<unknown>(null);

  // Dev-only: one-shot log of EVERY prop the native paragraph view receives
  // (anything anomalous here — 0/NaN fontSize or readingSize, a surprise
  // fontFamily, opacity — would explain readings not painting while base
  // text still draws).
  {
    const propKey = [fontSize, lineHeight, readingSize, isRtl, fontFamily ?? '', fontWeight ?? '', runs.length, runs[0]?.text].join('|');
    if (__DEV__ && !loggedParagraphProps.has(propKey)) {
      loggedParagraphProps.add(propKey);
      const firstRuns = runs.slice(0, 3).map((r) => ({
        t: r.text,
        ...(r.reading ? { rd: r.reading } : {}),
        fs: r.fontSize ?? fontSize,
        op: r.opacity,
        bg: r.background ?? null,
      }));
      log(
        `[LP Mobile] [RubyText] paragraph props fontSize=${fontSize} lineHeight=${lineHeight} readingSize=${readingSize} isRtl=${isRtl} fontFamily=${String(fontFamily)} fontWeight=${String(fontWeight)} runs=${runs.length} sample=${JSON.stringify(firstRuns)}`,
      );
    }
  }

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

  // Dev-only: after the native paragraph mounts, pull its internal state
  // (runs parsed, attributed-string length, frames) so a blank render can be
  // diagnosed from the Metro log. Probes EVERY mounted paragraph in dev:
  // the old gate counted space-separated syllables, which is 1 for Japanese
  // readings (no spaces) — it never fired for ja.
  const mountedKey =
    measured && measured.sizeKey === sizeKey
      ? `${measured.width.toFixed(1)}x${measured.height.toFixed(1)}`
      : null;
  const probeDiagnostics = useCallback((tag: string) => {
    try {
      const module = requireOptionalNativeModule('RubyText') as
        | { getParagraphDiagnosticsForTag?: (viewTag: number) => unknown }
        | null;
      const viewTag = findNodeHandle(nativeRef.current as never);
      const diagnostics =
        typeof viewTag === 'number'
          ? module?.getParagraphDiagnosticsForTag?.(viewTag)
          : { noTag: true };
      log(
        `[LP Mobile] [RubyText] paragraph native diagnostics [${tag}] tag=${viewTag}`,
        JSON.stringify(diagnostics ?? null),
      );
    } catch (err) {
      logwarn('[LP Mobile] [RubyText] paragraph diagnostics failed', err);
    }
  }, []);

  useEffect(() => {
    if (!mountedKey || !__DEV__) return;
    const timer = setTimeout(() => probeDiagnostics('settled'), 250);
    return () => clearTimeout(timer);
  }, [mountedKey, probeDiagnostics]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((prev) =>
      prev &&
      prev.sizeKey === sizeKey &&
      Math.abs(prev.width - width) < 0.5 &&
      Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height, sizeKey }
    );
  }, [runs.length, sizeKey]);

  // ── Base-text line grid for translation baseline alignment ──
  // The ruby-free measuring Text gives the line count, pitch, and box
  // heights; the native paragraph reports the REAL base baseline(s) with the
  // ruby band included (the reading pushes the base text down inside the
  // pinned line box — at least on the first line). Two sources merged:
  //   - nativeGrid with >1 line (future native fix) → use it directly;
  //   - nativeGrid with 1 line (current build: the whole paragraph comes
  //     back as one fragment, so only line 0's baseline is meaningful) →
  //     override line 0's ascender on the measuring grid;
  //   - no native grid yet → measuring grid as-is.
  const [measuringLines, setMeasuringLines] = useState<TextLayoutLine[] | null>(null);
  const [nativeGrid, setNativeGrid] = useState<GridLine[] | null>(null);

  useEffect(() => {
    if (!onLineGrid) return;
    if (nativeGrid && nativeGrid.length > 1) {
      onLineGrid(nativeGrid);
      return;
    }
    if (!measuringLines || measuringLines.length === 0) return;
    // The ruby band pushes the base baseline down inside EVERY pinned line
    // box, not just the first. The current native build reports only line 0's
    // true baseline, so apply its delta to every measuring line (uniform
    // shift — e.g. 38 − 29 = 9px at 20px/43px settings).
    const native0 = nativeGrid && nativeGrid.length === 1 ? nativeGrid[0]!.ascender : null;
    const shift = native0 != null ? native0 - measuringLines[0]!.ascender : 0;
    const merged: GridLine[] = measuringLines.map((l) => ({
      y: l.y,
      height: l.height,
      ascender: l.ascender + shift,
    }));
    onLineGrid(merged);
  }, [onLineGrid, nativeGrid, measuringLines]);

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
        key={sizeKey}
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
        onTextLayout={onLineGrid ? (e) => setMeasuringLines(e.nativeEvent.lines) : undefined}
      >
        {plainText}
      </Text>
      {measured && measured.sizeKey === sizeKey ? (
        (() => {
          return (
            <NativeRubyTextParagraphView
              ref={nativeRef}
              runs={runs}
              fontSize={fontSize}
              lineHeight={lineHeight}
              readingSize={readingSize}
              isRtl={isRtl}
              fontFamily={fontFamily ?? null}
              onTokenTap={(event) => onTokenTap?.(event.nativeEvent.tokenId)}
              onLineGrid={(event) => setNativeGrid(event.nativeEvent.lines)}
              style={{ width: measured.width, height: measured.height }}
            />
          );
        })()
      ) : null}
    </View>
  );
});
