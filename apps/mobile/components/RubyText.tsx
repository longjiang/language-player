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
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number; fontWeight?: 'normal' | 'bold'; textAlign?: 'left' | 'center' | 'right' };
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
  /** Opacity used when karaoke dims this segment. */
  dimmedOpacity?: number;
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
    dimmedOpacity = 0.4,
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
        style={{ width: measured.width, height: measured.height, opacity: dimmed ? dimmedOpacity : 1 }}
      />
    );
  }

  // View fallback: one column, identical to the pre-native per-segment markup.
  return (
    <View className="items-center" style={dimmed ? { opacity: dimmedOpacity } : undefined} onLayout={NativeRubyTextView ? onLayout : undefined}>
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
  /** Line box handed to the native paragraph view. May be the COMPENSATED
   *  value (baseLeading − ruby slab) so the native Core Text / Android renderer
   *  (which inflates every line by the reading slab) lands on the intended
   *  `baseLeading` pitch. */
  lineHeight: number;
  /** Line height of the JS measuring text, which drives the measured box AND
   *  the `onLineGrid` used to baseline-align the translation column. Must
   *  equal the ACTUAL rendered L2 pitch — in ruby mode that is `linePitch` =
   *  `baseLeading + readingBand` (CSS parity: the line box GROWS to include
   *  the reading; see ruby-layout.ts). When the native renderer also grows
   *  lines beyond the pin, the native line grid reports the real per-line
   *  geometry and is used instead (see merge below). */
  gridLineHeight?: number;
  readingSize: number;
  isRtl: boolean;
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string | null;
  /** BCP-47 language of the base text — tags the runs so the system font's CJK
   *  fallback picks the correct script font + glyph variants. */
  language?: string | null;
  /** Optional separate font for READINGS only (furigana/kana). */
  rubyFontFamily?: string | null;
  /** Paint base (yellow) vs reading (cyan) backgrounds — SPEC-087 diagnostic. */
  diagnosticMetrics?: boolean;
  /** Bold the measuring text too — bold glyphs are wider and wrap differently. */
  fontWeight?: 'normal' | 'bold';
  /** Reported with the tapped token's index. */
  onTokenTap?: (tokenId: number) => void;
  /** Reported with the drag-selected base-text range { start, end } (UTF-16,
   *  readings excluded — SPEC-084). Fires continuously while selection
   *  handles move; the consumer applies a settle timer. */
  onSelectionChange?: (range: { start: number; end: number }) => void;
  /** Bump to collapse the native selection (dictionary popup dismiss —
   *  SPEC-084). */
  clearSelection?: number;
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
    gridLineHeight,
    readingSize,
    isRtl,
    textAlign = 'left',
    fontFamily,
    language,
    rubyFontFamily,
    diagnosticMetrics,
    fontWeight,
    onTokenTap,
    onSelectionChange,
    clearSelection,
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
    gridLineHeight ?? lineHeight,
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
  // The native paragraph measures its OWN line grid on an in-memory TextKit 1
  // replica — the same engine, string, and pinned box as the live view — so
  // the reported per-line y/height/ascender ARE the rendered geometry (the
  // reading band included; a ruby-free RN Text cannot reproduce it). Use it
  // as-is. The ruby-free measuring grid is only a fallback while the native
  // grid hasn't arrived yet (a value, not a correction of it — short-lived).
  const [measuringLines, setMeasuringLines] = useState<TextLayoutLine[] | null>(null);
  const [nativeGrid, setNativeGrid] = useState<GridLine[] | null>(null);

  // Reset the native grid for a new paragraph so a previous sentence can't
  // temporarily donate its geometry while the new runs mount.
  useEffect(() => {
    setNativeGrid(null);
  }, [sizeKey]);

  const nativeMeasuredHeight = nativeGrid && nativeGrid.length > 0
    ? Math.max(...nativeGrid.map((line) => line.y + line.height))
    : 0;
  // The native paragraph's line grid IS the true rendered extent (ruby band
  // included). The JS measuring text can OVER-report the line count — it wraps
  // the ruby-free base text and here measured 16 lines (768px) while the native
  // TextKit layout settled on 14 lines (644px). Taking `max(measured, native)`
  // then sizes the View to the inflated JS height and leaves a blank gap below
  // the last line (the reader's "huge space between paragraphs").
  // Prefer the native extent when it has landed; use the JS measure only as a
  // pre-native fallback so the View never clips the true ruby-aware text.
  const renderedHeight = nativeMeasuredHeight > 0
    ? nativeMeasuredHeight
    : (measured?.height ?? undefined);

  useEffect(() => {
    if (!__DEV__ || !measured || nativeMeasuredHeight <= measured.height + 0.5) return;
    log(
      `[LP Mobile] [RubyText] paragraph ruby-height correction textLen=${plainText.length} measured=${measured.height.toFixed(1)} native=${nativeMeasuredHeight.toFixed(1)} width=${measured.width.toFixed(1)}`,
    );
  }, [measured, nativeMeasuredHeight, plainText.length]);

  useEffect(() => {
    if (!onLineGrid) return;
    if (nativeGrid && nativeGrid.length > 0) {
      onLineGrid(nativeGrid);
      return;
    }
    if (!measuringLines || measuringLines.length === 0) return;
    onLineGrid(
      measuringLines.map((l) => ({ y: l.y, height: l.height, ascender: l.ascender })),
    );
  }, [onLineGrid, nativeGrid, measuringLines]);

  if (!NativeRubyTextParagraphView) return null;

  // ── Anti-blank re-measure (SPEC-087 "no layout change flashes") ──
  // The wrapper must claim the parent's full width explicitly: readers put
  // blocks inside `items-center` containers, where a view with only
  // absolutely-positioned children (the measuring Text) collapses to width 0.
  // The measuring Text is `position: absolute`, so it contributes NO height to
  // the wrapper — until `measured` lands the wrapper had no in-flow child and
  // its height collapsed to 0, i.e. a visible BLANK for a frame on page turn /
  // remount, and again on any content/size change that bumped `sizeKey`.
  //
  // Fix (keeps the renderer native — no RN-Text fallback for the L2 body):
  // 1. Render a VISIBLE in-flow fallback <Text> (same font / line pitch /
  //    color) for the mount so the wrapper always reserves its real height and
  //    never shows a zero-height blank; it is removed the moment a box exists.
  // 2. Keep the native view mounted across `sizeKey` changes — previously the
  //    `measured.sizeKey === sizeKey` gate unmounted it (→ blank) until the
  //    measuring Text re-fired onLayout. Now it keeps painting with the last
  //    known box (re-measure corrects it next frame), so a plain→tokenized or
  //    width change never blanks the paragraph.
  const fallbackColor = runs[0]?.color ?? '#888888';
  const fallbackLineHeight = gridLineHeight ?? lineHeight;

  return (
    <View testID={testID} style={{ width: '100%' }}>
      {/* Visible layer: the native paragraph once a box exists (kept mounted
          across sizeKey changes — blanking on `sizeKey` mismatch is exactly the
          flash), else an in-flow fallback <Text> so the wrapper reserves its
          real height (the absolute measuring text contributes none) and the
          paragraph never collapses to a zero-height blank. */}
      {measured ? (
        (() => {
          if (__DEV__ && measured.sizeKey !== sizeKey) {
            log(
              `[LP Mobile] [RubyText] paragraph re-measure keep-mounted sizeKey=${measured.sizeKey === sizeKey ? 'matched' : 'stale'} w=${measured.width.toFixed(1)} h=${(renderedHeight ?? measured.height).toFixed(1)} runs=${runs.length} textLen=${plainText.length}`,
            );
          }
          return (
            <NativeRubyTextParagraphView
              ref={nativeRef}
              runs={runs}
              fontSize={fontSize}
              lineHeight={lineHeight}
              readingSize={readingSize}
              isRtl={isRtl}
              textAlign={textAlign}
              fontFamily={fontFamily ?? null}
              language={language ?? null}
              rubyFontFamily={rubyFontFamily ?? null}
              diagnosticMetrics={diagnosticMetrics}
              onTokenTap={(event) => onTokenTap?.(event.nativeEvent.tokenId)}
              onSelection={(event) =>
                onSelectionChange?.({ start: event.nativeEvent.start, end: event.nativeEvent.end })
              }
              clearSelection={clearSelection ?? 0}
              onLineGrid={(event) => setNativeGrid(event.nativeEvent.lines)}
              // The RN Text measurement excludes the ruby annotation band.
              // Once the native paragraph reports its ruby-aware fragment
              // height, use that larger height so wrapped base lines remain
              // visible instead of being clipped at the bottom.
              style={{ width: measured.width, height: renderedHeight ?? measured.height }}
            />
          );
        })()
      ) : (
        <Text
          pointerEvents="none"
          lang={language ?? undefined}
          style={{
            fontSize,
            lineHeight: fallbackLineHeight,
            fontWeight: fontWeight ?? 'normal',
            textAlign,
            color: fallbackColor,
            ...(fontFamily ? { fontFamily } : {}),
          }}
        >
          {plainText}
        </Text>
      )}
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
          lineHeight: fallbackLineHeight,
          fontWeight: fontWeight ?? 'normal',
          textAlign,
          ...(fontFamily ? { fontFamily } : {}),
        }}
        onLayout={onLayout}
        onTextLayout={onLineGrid ? (e) => setMeasuringLines(e.nativeEvent.lines) : undefined}
      >
        {plainText}
      </Text>
    </View>
  );
});
