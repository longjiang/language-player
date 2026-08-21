'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/providers/language-provider';
import { useGlyphLang } from '@/hooks/use-glyph-lang';
import { useSettingsContext } from '@/providers/settings-provider';
import { useTextActions } from '@/hooks/use-text-actions';
import { ExplainPanel, TranslatePanel, renderInlineMarkdown } from '@/components/text-action-panels';
import { TokenizedText } from '@/components/tokenized-text';
import { AlignedTranslation } from '@/components/reader/aligned-translation';
import { SegmentedTranslation } from '@/components/reader/sentence-highlight';
import { TranslationSplitHandle } from '@/components/reader/translation-split-handle';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { clampTranslationSize } from '@/lib/reader-text-size';
import { isRTL } from '@/lib/language-data';
import type { SentenceMap } from '@langplayer/utils';
import {
  MoreVertical, Copy, Volume2, Square, Sparkles, Languages, Loader2,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface TextActionMenuProps {
  /** Plain text of the block/line. */
  text: string;
  /** Target language code for TTS + API calls. */
  l2Code: string;
  /** Native language code for translation target. */
  l1Code?: string;
  /** Surrounding context for AI explanation (full paragraph, previous lines, etc.). */
  context?: string;
  /** Always show the trigger (default: only on hover via group). */
  alwaysShow?: boolean;
  /** Center the content while keeping the action trigger out of the layout
   *  flow. Used by single-line subtitle displays. */
  centered?: boolean;
  /** Pre-fetched translation to show inline to the right of children. */
  translation?: ReactNode;
  /** Tailwind classes for the translation element (e.g. match heading size). */
  translationClass?: string;
  /** Always render the translation below the content, even on xl screens. */
  translationBelow?: boolean;
  /** Remove the default bottom margin (`mb-4`). Used in dense lists (e.g.
   *  per-line subtitles) where the container supplies its own spacing. */
  noMargin?: boolean;
  /** The L2 tokenized text's rendered size (rem). The translation column is
   *  sized at `tokenizedText.translationSize` × this. Omit (defaults to 1)
   *  when the L2 text is at its base size, and also omit for the aligned
   *  readers, which set `translationFontSize` per block or let
   *  AlignedTranslation measure the L2 size itself. */
  translationFactor?: number;
  /** Explicit translation font size (rem). When set, overrides the default
   *  `TRANSLATION_FACTOR × translationFactor` sizing — used by the readers,
   *  which size each aligned block individually (headings vs body text). */
  translationFontSize?: number;
  /** When true and no translation, show skeleton placeholder lines. */
  loading?: boolean;
  /** Per-line baseline alignment (readers): the translation column is sliced
   *  into its visual lines and each line is baseline-aligned to the L2
   *  block's line grid (same leading, top-aligned). Replaces `translation`
   *  with a measuring renderer; falls back to a plain paragraph when the
   *  layout can't be measured or the column is stacked below the L2 text. */
  translationAligned?: {
    text: string;
    map: SentenceMap | null;
    active: number | null;
    measureNonce?: string | number;
  } | null;
  /** Fraction (0–1) of the side-by-side row given to the L2 column. When set
   *  with `onTranslationSplitChange`, renders the draggable splitter handle on
   *  wide screens (readers only); otherwise uses the default 3:2 split. */
  translationSplit?: number;
  /** Called with a new L2-column fraction while the splitter is dragged. */
  onTranslationSplitChange?: (ratio: number) => void;
  /** Called ONCE with the final fraction when a splitter drag ends. */
  onTranslationSplitCommit?: (ratio: number) => void;
  /** Breakpoint at which the translation goes side-by-side with the L2 text.
   *  Readers pass 'md' so portrait iPads (>=768px) get the dual-column layout;
   *  everything else keeps 'lg' (>=1024px) so e.g. subtitle rows only split on
   *  genuinely wide screens. Default 'lg'. */
  sideBySideBreakpoint?: 'md' | 'lg';
  /** Visible gap between L2 and translation columns, in CSS pixels. */
  sideBySideGapPx?: number;
  children: ReactNode;
}

export function TextActionMenu({
  text,
  l2Code,
  l1Code,
  context,
  alwaysShow = false,
  centered = false,
  translation,
  translationClass = '',
  translationBelow = false,
  noMargin = false,
  translationFactor,
  translationFontSize,
  loading = false,
  translationAligned = null,
  translationSplit,
  onTranslationSplitChange,
  onTranslationSplitCommit,
  sideBySideBreakpoint = 'lg',
  sideBySideGapPx,
  children,
}: TextActionMenuProps) {
  const t = useT();
  const { l1 } = useLanguage();
  const { tokenizedText } = useSettingsContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSideBySide, setIsSideBySide] = useState(false);
  // The L2 content wrapper — the aligned translation measures its line grid.
  const l2Ref = useRef<HTMLDivElement>(null);
  const aligned = translationAligned ?? null;
  const hasTranslation = !!(translation || aligned);
  // Translation content is L1, not L2. Tag it explicitly so browsers choose
  // the user's regional glyph domain (e.g. zh-Hans) instead of inheriting the
  // browser/device language, which can make Chinese glyphs render as Japanese.
  const effectiveL1Code = l1Code ?? l1.code;
  const translationGlyphLang = useGlyphLang(effectiveL1Code);
  const translationDir = isRTL(effectiveL1Code) ? 'rtl' : 'ltr';
  // Translation:tokenized ratio from settings (0.5–1); the caller's
  // `translationFactor` carries the L2 text size (rem) it should scale against
  // (defaults to 1). The aligned readers let AlignedTranslation measure the L2
  // size itself and only needs the ratio.
  const translationRatio = clampTranslationSize(tokenizedText.translationSize);
  const l2Scale = translationFactor ?? 1;
  // The L2 tokenized text's leading (user setting, default 1.625). The
  // stacked translation column uses the SAME leading so its line pitch
  // matches the L2 text exactly (narrow screens / below md).
  const translationLeading = tokenizedText.leading ?? 1.625;
  // Show the draggable splitter only when the caller wired a ratio + handler
  // (readers); everything else keeps the fixed default split and no handle.
  const resizable = translationSplit != null && onTranslationSplitChange != null;
  // L2 column flex-grow factor (basis 0% → grow ratio distributes the row).
  const l2Grow = resizable ? translationSplit! : 3;
  const trGrow = resizable ? 1 - translationSplit! : 2;
  // The split handle occupies 8px of the visible row after its negative
  // margins, so reduce the flex gap by that footprint and keep the requested
  // text-leading gap between the two text columns.
  const sideBySideGap = sideBySideGapPx == null
    ? undefined
    : resizable
      ? Math.max(0, (sideBySideGapPx - 8) / 2)
      : sideBySideGapPx;
  const sideBySideGapClass = sideBySideGap == null
    ? (resizable ? `${sideBySideBreakpoint}:gap-2` : `${sideBySideBreakpoint}:gap-4`)
    : `${sideBySideBreakpoint}:gap-[var(--reader-side-gap)]`;
  const sideBySideGapStyle = sideBySideGap == null
    ? undefined
    : { '--reader-side-gap': `${sideBySideGap}px` } as CSSProperties;

  // `translationAligned` is supplied by reader blocks even while their
  // responsive row is stacked. Baseline alignment is meaningful only in the
  // side-by-side reader layout; the stacked layout needs a normal paragraph
  // so its distance from the L2 line is controlled by the row gap alone.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const breakpointPx = sideBySideBreakpoint === 'md' ? 768 : 1024;
    const media = window.matchMedia(`(min-width: ${breakpointPx}px)`);
    const update = () => setIsSideBySide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [sideBySideBreakpoint]);

  const useAlignedTranslation = !!aligned && !translationBelow && isSideBySide;

  const {
    activeAction,
    close,
    resetTranslate,
    handleCopy,
    handleSpeak,
    handleExplain,
    handleTranslate,
    isSpeaking,
    explainText,
    explainError,
    explainLoading,
    resetExplain,
    translateText,
    translateError,
    textZoomFactor,
  } = useTextActions({ text, l2Code, l1Code, context });

  const menuItems: { kind: string; icon: typeof Copy; label: string; onClick: () => void; loading?: boolean }[] = [
    { kind: 'copy', icon: Copy, label: t('action.copy'), onClick: handleCopy },
    { kind: 'speak', icon: isSpeaking ? Square : Volume2, label: isSpeaking ? t('action.stop') : t('action.speak'), onClick: handleSpeak },
    { kind: 'explain', icon: Sparkles, label: t('action.let_ai_explain'), onClick: handleExplain, loading: activeAction === 'explain' && explainLoading },
    { kind: 'translate', icon: Languages, label: t('action.translation'), onClick: handleTranslate, loading: activeAction === 'translate' && !translateText && !translateError },
  ];

  return (
    <div className={`group relative ${centered ? 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start' : 'flex items-start gap-3'} ${noMargin ? '' : 'mb-4'}`}>
      {/* Content + inline translation */}
      <div
        className={centered
          ? 'col-start-2 min-w-0 max-w-full flex flex-col items-center gap-y-1'
          : `flex-1 min-w-0 flex flex-col gap-y-2 ${translationBelow ? '' : `${sideBySideBreakpoint}:flex-row ${sideBySideGapClass}`} ${aligned && !translationBelow ? `${sideBySideBreakpoint}:items-start` : translationBelow ? '' : `${sideBySideBreakpoint}:items-center`}`}
        style={sideBySideGapStyle}
      >
        <div
          className={centered ? 'w-max max-w-full min-w-0' : 'min-w-0'}
          style={centered ? undefined : { flexBasis: 0, flexGrow: l2Grow, flexShrink: 1 }}
          ref={l2Ref}
        >
          {children}
        </div>
        {resizable && hasTranslation && !translationBelow && (
          <TranslationSplitHandle
            ratio={translationSplit!}
            onChange={onTranslationSplitChange!}
            onCommit={onTranslationSplitCommit}
          />
        )}
        {hasTranslation && (
          <div
            className={centered
              ? `w-full text-center text-muted-foreground ${translationClass}`
              : `min-w-0 ${translationBelow ? '' : `${sideBySideBreakpoint}:pt-0`} text-muted-foreground ${translationClass}`}
            lang={translationGlyphLang}
            dir={translationDir}
            style={
              centered
                ? { fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, lineHeight: translationLeading }
                : useAlignedTranslation
                ? { flexBasis: 0, flexGrow: trGrow, flexShrink: 1, lineHeight: translationLeading }
                : { fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, flexBasis: 0, flexGrow: trGrow, flexShrink: 1, lineHeight: translationLeading }
            }
          >
            {useAlignedTranslation ? (
              <AlignedTranslation
                text={aligned.text}
                map={aligned.map}
                active={aligned.active}
                measureNonce={aligned.measureNonce}
                anchorRef={l2Ref}
                translationFactor={translationRatio}
              />
            ) : aligned ? (
              <SegmentedTranslation text={aligned.text} map={aligned.map} active={aligned.active} />
            ) : typeof translation === 'string' ? renderInlineMarkdown(translation) : translation}
          </div>
        )}
        {loading && !translation && !aligned && (
          <div
            className={centered
              ? `w-full text-center ${translationClass || 'text-sm'}`
              : `min-w-0 pt-1 ${translationBelow ? '' : `${sideBySideBreakpoint}:pt-0`} ${translationClass || 'text-sm'}`}
            lang={translationGlyphLang}
            dir={translationDir}
            style={centered
              ? { fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, lineHeight: translationLeading }
              : { fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, flexBasis: 0, flexGrow: trGrow, flexShrink: 1, lineHeight: translationLeading }}
          >
            <TranslationSkeleton
              text={text}
              className={translationClass.includes('text-center') ? 'items-center' : ''}
            />
          </div>
        )}
      </div>

      {/* Action menu dropdown — controlled so any option click closes it
          immediately (Radix popovers don't auto-close on item click). */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-muted hover:text-foreground opacity-100 ${centered ? 'col-start-3 row-start-1 mt-1 justify-self-end' : 'mt-1'}`} aria-label={t('action.more')}>
          <MoreVertical className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={4} className="min-w-[180px] p-1">
          {menuItems.map((item) => (
            <button
              key={item.kind}
              onClick={() => {
                setMenuOpen(false);
                item.onClick();
              }}
              disabled={item.loading}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {item.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <item.icon className="h-4 w-4 text-muted-foreground" />
              )}
              {item.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Explain modal */}
      {activeAction === 'explain' && (explainText || explainError || explainLoading) && (
        <ExplainPanel
          l2Code={l2Code}
          explainText={explainText}
          explainError={explainError}
          explainLoading={explainLoading}
          onClose={() => { close(); resetExplain(); }}
        >
          {/* Original text — tokenized after the stream ends */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            {explainLoading ? (
              <span className="text-muted-foreground/80">{text}</span>
            ) : (
              <TokenizedText text={text} l2Code={l2Code} />
            )}
          </div>
        </ExplainPanel>
      )}

      {/* Translate result */}
      {activeAction === 'translate' && (translateText || translateError) && (
        <TranslatePanel
          translateText={translateText}
          translateError={translateError}
          textZoomFactor={textZoomFactor}
          onClose={() => { close(); resetTranslate(); }}
        />
      )}
    </div>
  );
}
