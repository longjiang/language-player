'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/providers/settings-provider';
import { useTextActions } from '@/hooks/use-text-actions';
import { ExplainPanel, TranslatePanel, renderInlineMarkdown } from '@/components/text-action-panels';
import { TokenizedText } from '@/components/tokenized-text';
import { AlignedTranslation } from '@/components/reader/aligned-translation';
import { TranslationSplitHandle } from '@/components/reader/translation-split-handle';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { clampTranslationSize } from '@/lib/reader-text-size';
import type { SentenceMap } from '@/lib/sentence-map';
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
  /** Pre-fetched translation to show inline to the right of children. */
  translation?: ReactNode;
  /** Tailwind classes for the translation element (e.g. match heading size). */
  translationClass?: string;
  /** Always render the translation below the content, even on xl screens. */
  translationBelow?: boolean;
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
  children: ReactNode;
}

export function TextActionMenu({
  text,
  l2Code,
  l1Code,
  context,
  alwaysShow = false,
  translation,
  translationClass = '',
  translationBelow = false,
  translationFactor,
  translationFontSize,
  loading = false,
  translationAligned = null,
  translationSplit,
  onTranslationSplitChange,
  onTranslationSplitCommit,
  children,
}: TextActionMenuProps) {
  const t = useT();
  const { tokenizedText } = useSettingsContext();
  const [menuOpen, setMenuOpen] = useState(false);
  // The L2 content wrapper — the aligned translation measures its line grid.
  const l2Ref = useRef<HTMLDivElement>(null);
  const aligned = translationAligned ?? null;
  const hasTranslation = !!(translation || aligned);
  // Translation:tokenized ratio from settings (0.5–1); the caller's
  // `translationFactor` carries the L2 text size (rem) it should scale against
  // (defaults to 1). The aligned readers let AlignedTranslation measure the L2
  // size itself and only needs the ratio.
  const translationRatio = clampTranslationSize(tokenizedText.translationSize);
  const l2Scale = translationFactor ?? 1;
  // Show the draggable splitter only when the caller wired a ratio + handler
  // (readers); everything else keeps the fixed default split and no handle.
  const resizable = translationSplit != null && onTranslationSplitChange != null;
  // L2 column flex-grow factor (basis 0% → grow ratio distributes the row).
  const l2Grow = resizable ? translationSplit! : 3;
  const trGrow = resizable ? 1 - translationSplit! : 2;
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
    <div className="group relative flex items-start gap-3 mb-4">
      {/* Content + inline translation */}
      <div className={`flex-1 min-w-0 flex flex-col gap-y-1 ${translationBelow ? '' : resizable ? 'lg:flex-row lg:gap-2' : 'lg:flex-row lg:gap-4'} ${aligned && !translationBelow ? 'lg:items-start' : translationBelow ? '' : 'lg:items-center'}`}>
        <div className="min-w-0" style={{ flexBasis: 0, flexGrow: l2Grow, flexShrink: 1 }} ref={l2Ref}>
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
            className={`min-w-0 text-muted-foreground leading-relaxed ${translationBelow ? '' : 'lg:pt-0'} ${translationClass}`}
            style={
              aligned
                ? { flexBasis: 0, flexGrow: trGrow, flexShrink: 1 }
                : { fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, flexBasis: 0, flexGrow: trGrow, flexShrink: 1 }
            }
          >
            {aligned ? (
              <AlignedTranslation
                text={aligned.text}
                map={aligned.map}
                active={aligned.active}
                measureNonce={aligned.measureNonce}
                anchorRef={l2Ref}
                translationFactor={translationRatio}
              />
            ) : typeof translation === 'string' ? renderInlineMarkdown(translation) : translation}
          </div>
        )}
        {loading && !translation && !aligned && (
          <div
            className={`min-w-0 pt-1 ${translationBelow ? '' : 'lg:pt-0'} ${translationClass || 'text-sm'}`}
            style={{ fontSize: `${translationFontSize ?? (translationRatio * l2Scale)}rem`, flexBasis: 0, flexGrow: trGrow, flexShrink: 1 }}
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
        <PopoverTrigger className="z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-muted hover:text-foreground opacity-100" aria-label={t('action.more')}>
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
