/**
 * Memoized per-token / paragraph span components for TokenizedText (mobile).
 *
 * Extracted so a token press only re-renders the tapped token + the popup,
 * not the block's other N tokens. Re-rendering every token of a large
 * reader block on popup open cost seconds in dev (e.g. 4.6s for a ~300-token
 * block) and, combined with whole-page re-renders during scroll/sync, froze
 * the JS thread for up to ~47s.
 *
 * Split out of components/TokenizedText.tsx (file-size refactor).
 */

import { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RubySegment } from '@langplayer/utils';
import { buildRuby } from '@langplayer/utils';
import { RubyText, RubyTextParagraph } from '@/components/RubyText';
import { NATIVE_RUBY_ACTIVE, useMobileRubyColors } from '@/lib/ruby-layout';
import type { GridLine } from '@/lib/aligned-translation';
import { tokenizedTextLogger } from '@/lib/logger';

const { log } = tokenizedTextLogger;

export type PressWordHandler = (
  index: number,
  word: string,
  lemma: string | null,
  pron: string | null,
  linkUrl: string | null,
) => void;

// ── Memoized per-token span (ruby / definition path) ──────────────────
// Extracted so a token press only re-renders the tapped token + the popup,
// not the block's other N tokens. Re-rendering every token of a large
// reader block on popup open cost seconds in dev (e.g. 4.6s for a ~300-token
// block) and, combined with whole-page re-renders during scroll/sync, froze
// the JS thread for up to ~47s.
interface RubyTokenSpanProps {
  index: number;
  word: string;
  displayText: string;
  pronunciation: string | null;
  hasRuby: boolean;
  /** When true (furigana enabled), tokens without ruby still reserve the
   *  reading slot above the word so every wrapped line keeps the same height
   *  whether or not it contains furigana. */
  reserveRubySlot: boolean;
  isBlanked: boolean;
  isHighlighted: boolean;
  isBoldFormat: boolean;
  isItalicFormat: boolean;
  isCodeFormat: boolean;
  isLink: boolean;
  isSearchHighlight: boolean;
  isSavedWord: boolean;
  isTokenSelected: boolean;
  isKaraokeDimmed: boolean;
  showByeonggi: boolean;
  byeonggiText: string | null;
  showQuickGloss: boolean;
  quickGlossDef: string | null;
  showDefinition: boolean;
  showInterlinear: boolean;
  trimmedDef: string | null;
  firstLemma: string | null;
  linkUrl: string | null;
  l2Code: string;
  quizMode: boolean;
  popupEnabled: boolean;
  rubyPull: number;
  readingSize: number;
  baseLeading: number | undefined;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number };
  onOpenLink?: (href: string) => void;
  onPressWord: PressWordHandler;
  onReveal: (index: number) => void;
}

export const RubyTokenSpan = memo(function RubyTokenSpan(props: RubyTokenSpanProps) {
  const rubyColors = useMobileRubyColors();
  const {
    index, word, displayText, pronunciation, hasRuby, reserveRubySlot, isBlanked, isHighlighted, isLink,
    isBoldFormat, isItalicFormat, isCodeFormat, isSearchHighlight, isSavedWord, isTokenSelected, isKaraokeDimmed, showByeonggi, byeonggiText,
    showQuickGloss, quickGlossDef, showDefinition, showInterlinear, trimmedDef, firstLemma,
    linkUrl, l2Code, quizMode, popupEnabled, rubyPull, readingSize, baseLeading, textStyle,
    onOpenLink, onPressWord, onReveal,
  } = props;

  // Ruby segments are rebuilt only when the pieces change (displayText,
  // pronunciation, script); they are a fresh array each render otherwise,
  // which would defeat memoization.
  const rubySegs = useMemo<RubySegment[]>(() => {
    if (!hasRuby || !pronunciation) return [{ text: displayText }];
    return buildRuby(displayText, pronunciation, l2Code);
  }, [hasRuby, pronunciation, displayText, l2Code]);

  const handlePress = () => {
    if (linkUrl && !popupEnabled) {
      onOpenLink?.(linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(index);
      return;
    }
    if (popupEnabled) {
      log(`[TokenizedText] ⏱ TOKEN-PRESS t=${Date.now()} word="${word}" index=${index}`);
      onPressWord(index, word, firstLemma, pronunciation, linkUrl);
    }
  };

  return (
    <View className="items-center" style={[isKaraokeDimmed ? { opacity: 0.4 } : undefined]}>
      {/* One pressable per token: the whole word — kanji + kana +
          furigana + quick gloss — shares a single tap target, matching
          web's token-span.tsx wrapper span. */}
      <Pressable
        testID={`token-${index}`}
        onPress={handlePress}
        className={`rounded ${isTokenSelected ? 'bg-primary/20' : ''} active:bg-muted/80`}
        style={({ pressed }) => (pressed ? { opacity: 0.45 } : undefined)}
      >
        {/* Segment row + quick gloss: items-end so the gloss (no furigana)
            baseline-aligns with the word text at the bottom of the segment columns. */}
        <View
          className={`flex-row items-end${
            NATIVE_RUBY_ACTIVE && !isBlanked && (isSearchHighlight || isSavedWord)
              ? ` ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20 rounded' : ''}`.trim()
              : ''
          }`}
        >
          {/* One RubyText per ruby segment, as fragment siblings — no wrapping
              view, mirroring web's inline <ruby> elements. Each measures its
              own fallback column once and hands the box to the native view. */}
          {(isBlanked ? [{ text: '▯' }] : rubySegs).map((seg, j) => (
            <RubyText
              key={j}
              segment={seg}
              reserveReadingSlot={!isBlanked && (hasRuby || reserveRubySlot)}
              readingSize={readingSize}
              rubyPull={rubyPull}
              baseLeading={baseLeading}
              textStyle={textStyle}
              colorHex={isTokenSelected || isHighlighted ? rubyColors.primary : rubyColors.foreground}
              readingColorHex={isTokenSelected ? rubyColors.primary : rubyColors.mutedForeground}
              bold={!isBlanked && (isHighlighted || isBoldFormat)}
              underline={!isBlanked && isLink}
              italic={!isBlanked && isItalicFormat}
              fallbackBaseClassName={
                isBlanked
                  ? 'text-foreground'
                  : isTokenSelected
                    ? 'text-primary'
                    : `${isHighlighted || isBoldFormat ? 'font-bold' : ''} ${isHighlighted ? 'text-primary' : 'text-foreground'} ${isItalicFormat ? 'italic' : ''} ${isCodeFormat ? 'font-mono' : ''} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20 rounded' : ''}`
              }
              fallbackReadingClassName={isTokenSelected ? 'text-primary' : 'text-muted-foreground'}
            />
          ))}
          {/* Byeonggi: inline after the word, smaller size, muted (matching web's token-span.tsx) */}
          {showByeonggi ? (
            <Text
              style={{
                fontSize: readingSize,
                ...(textStyle.fontFamily ? { fontFamily: textStyle.fontFamily } : {}),
              }}
              className="text-muted-foreground/70"
            >
              {' '}{byeonggiText}
            </Text>
          ) : null}
          {/* Quick gloss: peer of the segment columns, not inside any segment.
              Placed after all segments so furigana centers over just the word,
              not the word + gloss combined width. items-end keeps the gloss on
              the same baseline as the word text.
              Uses readingSize for fontSize (both outer and inner) — when furigana is
              off, the outer wrapper must not inherit the word's full textStyle,
              otherwise the word's large lineHeight applies to the gloss text too,
              creating a tall invisible box that breaks baseline alignment. */}
          {showQuickGloss && (
            <Text style={{ fontSize: textStyle.fontSize ?? 16, lineHeight: baseLeading }}>
              <Text
                style={{
                  fontSize: textStyle.fontSize ?? 16,
                  ...(textStyle.fontFamily ? { fontFamily: textStyle.fontFamily } : {}),
                }}
                className="text-muted-foreground"
              >
                {` (‘${quickGlossDef}’) `}
              </Text>
            </Text>
          )}
        </View>
      </Pressable>
      {/* Universal definition slot: when showDefinition is on, every token
          gets a slot of the same height. Tokens without a definition get
          an empty spacer — this keeps all word texts on the same baseline
          regardless of which tokens have interlinear glosses. */}
      {showDefinition && (
        <View style={{ height: readingSize + 2, justifyContent: 'flex-start', alignItems: 'center' }}>
          {showInterlinear ? (
            <Text style={{ fontSize: readingSize, lineHeight: readingSize + 2 }} className="text-muted-foreground/60">{trimmedDef}</Text>
          ) : (
            <View style={{ height: readingSize + 2 }} />
          )}
        </View>
      )}
    </View>
  );
});

/**
 * Flat ruby token: renders the word's segments as direct fragment children —
 * NO wrapper View and NO Pressable. Interactivity comes from the native
 * RubyText view's onTap event (dictionary popup / quiz reveal / links).
 *
 * Used only when the native renderer is active AND interlinear definitions
 * are off (definition slots need a token column to sit under the word).
 */
export const RubyTokenFlat = memo(function RubyTokenFlat(props: RubyTokenSpanProps) {
  const rubyColors = useMobileRubyColors();
  const {
    index, word, displayText, pronunciation, hasRuby, reserveRubySlot, isBlanked, isHighlighted, isLink,
    isBoldFormat, isItalicFormat, isCodeFormat, isSearchHighlight, isSavedWord, isTokenSelected, isKaraokeDimmed, showByeonggi, byeonggiText,
    showQuickGloss, quickGlossDef, firstLemma, linkUrl, l2Code, quizMode, popupEnabled,
    rubyPull, readingSize, baseLeading, textStyle, onOpenLink, onPressWord, onReveal,
  } = props;

  const rubySegs = useMemo<RubySegment[]>(() => {
    if (!hasRuby || !pronunciation) return [{ text: displayText }];
    return buildRuby(displayText, pronunciation, l2Code);
  }, [hasRuby, pronunciation, displayText, l2Code]);

  const handlePress = () => {
    if (linkUrl && !popupEnabled) {
      onOpenLink?.(linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(index);
      return;
    }
    if (popupEnabled) {
      onPressWord(index, word, firstLemma, pronunciation, linkUrl);
    }
  };

  return (
    <>
      {(isBlanked ? [{ text: '▯' }] : rubySegs).map((seg, j) => (
        <RubyText
          key={j}
          segment={seg}
          reserveReadingSlot={!isBlanked && (hasRuby || reserveRubySlot)}
          readingSize={readingSize}
          rubyPull={rubyPull}
          baseLeading={baseLeading}
          textStyle={textStyle}
          colorHex={isTokenSelected || isHighlighted ? rubyColors.primary : rubyColors.foreground}
          readingColorHex={isTokenSelected ? rubyColors.primary : rubyColors.mutedForeground}
          bold={!isBlanked && (isHighlighted || isBoldFormat)}
          underline={!isBlanked && isLink}
          italic={!isBlanked && isItalicFormat}
          tokenIndex={index}
          onTokenPress={handlePress}
          dimmed={isKaraokeDimmed}
          fallbackBaseClassName={
            isBlanked
              ? 'text-foreground'
              : isTokenSelected
                ? 'text-primary'
                : `${isHighlighted || isBoldFormat ? 'font-bold' : ''} ${isHighlighted ? 'text-primary' : 'text-foreground'} ${isItalicFormat ? 'italic' : ''} ${isCodeFormat ? 'font-mono' : ''} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord ? 'bg-yellow-200/20 rounded' : ''}`
          }
          fallbackReadingClassName={isTokenSelected ? 'text-primary' : 'text-muted-foreground'}
        />
      ))}
      {showByeonggi ? (
        <Text
          style={{
            fontSize: readingSize,
            opacity: isKaraokeDimmed ? 0.4 : 1,
            ...(textStyle.fontFamily ? { fontFamily: textStyle.fontFamily } : {}),
          }}
          className="text-muted-foreground/70"
        >
          {' '}{byeonggiText}
        </Text>
      ) : null}
      {showQuickGloss ? (
        <Text style={{ fontSize: textStyle.fontSize ?? 16, lineHeight: baseLeading, opacity: isKaraokeDimmed ? 0.4 : 1 }}>
          <Text
            style={{
              fontSize: textStyle.fontSize ?? 16,
              ...(textStyle.fontFamily ? { fontFamily: textStyle.fontFamily } : {}),
            }}
            className="text-muted-foreground"
          >
            {` (‘${quickGlossDef}’) `}
          </Text>
        </Text>
      ) : null}
    </>
  );
});

// ── Paragraph-level ruby path ─────────────────────────────────────────
// One native attributed string per block (iOS): the whole block is sent as
// flat runs, so Core Text can apply ruby alignment/overhang against real
// neighbors instead of one token-sized text layout at a time.
export interface ParagraphRun {
  tokenId: number;
  text: string;
  reading?: string;
  fontSize?: number;
  tappable: boolean;
  color: string;
  readingColor: string;
  bold: boolean;
  underline: boolean;
  italic?: boolean;
  background?: string;
  backgroundAlpha?: number;
  opacity: number;
}

/** Per-token tap payload used when the native paragraph reports a tokenId. */
export interface ParagraphTapAction {
  word: string;
  lemma: string | null;
  pronunciation: string | null;
  linkUrl: string | null;
}

interface RubyTextParagraphBlockProps {
  testID?: string;
  runs: ParagraphRun[];
  taps: Array<ParagraphTapAction | null>;
  fontSize: number;
  lineHeight: number;
  readingSize: number;
  fontFamily: string | null;
  isRtl: boolean;
  fontWeight?: 'normal' | 'bold';
  quizMode: boolean;
  popupEnabled: boolean;
  onOpenLink?: (href: string) => void;
  onPressWord: PressWordHandler;
  onReveal: (index: number) => void;
  /** Measured paragraph line grid — reported up to readers for translation
   *  baseline alignment. Must be identity-stable (memoized component). */
  onLineGrid?: (lines: GridLine[]) => void;
}

export const RubyTextParagraphBlock = memo(function RubyTextParagraphBlock(props: RubyTextParagraphBlockProps) {
  const {
    testID,
    runs,
    taps,
    fontSize,
    lineHeight,
    readingSize,
    fontFamily,
    isRtl,
    fontWeight,
    quizMode,
    popupEnabled,
    onOpenLink,
    onPressWord,
    onReveal,
    onLineGrid,
  } = props;

  const handleTokenTap = useCallback((tokenId: number) => {
    const tap = taps[tokenId];
    if (!tap) return;
    if (tap.linkUrl && !popupEnabled) {
      onOpenLink?.(tap.linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(tokenId);
      return;
    }
    if (popupEnabled) {
      log(`[TokenizedText] ⏱ TOKEN-PRESS t=${Date.now()} word="${tap.word}" index=${tokenId}`);
      onPressWord(tokenId, tap.word, tap.lemma, tap.pronunciation, tap.linkUrl);
    }
  }, [taps, quizMode, popupEnabled, onOpenLink, onPressWord, onReveal]);

  return (
    <RubyTextParagraph
      testID={testID}
      runs={runs}
      fontSize={fontSize}
      lineHeight={lineHeight}
      readingSize={readingSize}
      fontFamily={fontFamily}
      isRtl={isRtl}
      fontWeight={fontWeight}
      onTokenTap={handleTokenTap}
      onLineGrid={onLineGrid}
    />
  );
});

// ── Memoized per-token span (plain inline-Text path) ─────────────────
interface PlainTokenSpanProps {
  index: number;
  word: string;
  displayText: string;
  isWordToken: boolean;
  isBlanked: boolean;
  isHighlighted: boolean;
  isBoldFormat: boolean;
  isItalicFormat: boolean;
  isCodeFormat: boolean;
  isLink: boolean;
  isSearchHighlight: boolean;
  isSavedWord: boolean;
  isTokenSelected: boolean;
  isPressed: boolean;
  isKaraokeDimmed: boolean;
  showByeonggi: boolean;
  byeonggiText: string | null;
  showQuickGloss: boolean;
  quickGlossDef: string | null;
  firstLemma: string | null;
  tokenPron: string | null;
  linkUrl: string | null;
  quizMode: boolean;
  popupEnabled: boolean;
  textColor: string;
  textStyle: { fontSize?: number; fontFamily?: string; lineHeight?: number };
  onOpenLink?: (href: string) => void;
  onPressWord: PressWordHandler;
  onReveal: (index: number) => void;
  onPressIn: (index: number) => void;
  onPressOut: (index: number | null) => void;
}

export const PlainTokenSpan = memo(function PlainTokenSpan(props: PlainTokenSpanProps) {
  const {
    index, word, displayText, isWordToken, isBlanked, isHighlighted, isLink, isSearchHighlight,
    isBoldFormat, isItalicFormat, isCodeFormat, isSavedWord, isTokenSelected, isPressed, isKaraokeDimmed, showByeonggi, byeonggiText,
    showQuickGloss, quickGlossDef, firstLemma, tokenPron, linkUrl, quizMode, popupEnabled,
    textColor, textStyle, onOpenLink, onPressWord, onReveal, onPressIn, onPressOut,
  } = props;

  const handlePress = () => {
    if (linkUrl && !popupEnabled) {
      onOpenLink?.(linkUrl);
      return;
    }
    if (quizMode) {
      onReveal(index);
      return;
    }
    if (popupEnabled && isWordToken) {
      log(`[TokenizedText] ⏱ TOKEN-PRESS t=${Date.now()} word="${word}" index=${index}`);
      onPressWord(index, word, firstLemma, tokenPron, linkUrl);
    }
  };

  return (
    <Text
      testID={`token-${index}`}
      onPressIn={() => onPressIn(index)}
      onPressOut={() => onPressOut(null)}
      onPress={handlePress}
      style={isKaraokeDimmed ? { opacity: 0.4 } : undefined}
      className={
        isTokenSelected
          ? 'rounded bg-primary/20 text-primary'
          : isPressed
            ? 'rounded bg-muted/80'
            : undefined
      }
    >
      {isBlanked ? (
        <Text className={textColor}>▯</Text>
      ) : (
        <Text className={`${isHighlighted || isBoldFormat ? 'font-bold' : ''} ${isHighlighted ? 'text-primary' : ''} ${isItalicFormat ? 'italic' : ''} ${isCodeFormat ? 'font-mono' : ''} ${isLink ? 'underline text-primary' : ''} ${isSearchHighlight ? 'bg-primary/20 rounded' : ''} ${isSavedWord && !isTokenSelected ? 'bg-yellow-200/20' : ''}`}>{displayText}</Text>
      )}
      {showByeonggi ? ` ${byeonggiText}` : ''}
      {showQuickGloss ? <Text style={{ fontSize: textStyle.fontSize ?? 16 }} className="text-muted-foreground">{` (‘${quickGlossDef}’) `}</Text> : ''}
    </Text>
  );
});

// ── Word difficulty helpers for hardWords filter ──────────────────
