'use client';

import type { ReactNode } from 'react';
import { useT } from '@/hooks/use-t';
import { useTextActions } from '@/hooks/use-text-actions';
import { ExplainPanel, TranslatePanel, renderInlineMarkdown } from '@/components/text-action-panels';
import { TokenizedText } from '@/components/tokenized-text';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
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
  /** Scale factor for the inline translation column (matches L2 text zoom). */
  translationZoom?: number;
  /** When true and no translation, show skeleton placeholder lines. */
  loading?: boolean;
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
  translationZoom = 1,
  loading = false,
  children,
}: TextActionMenuProps) {
  const t = useT();
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
      <div className={`flex-1 min-w-0 flex flex-col gap-y-1 ${translationBelow ? '' : 'lg:flex-row lg:gap-4 lg:items-center'}`}>
        <div className="flex-[3] min-w-0">
          {children}
        </div>
        {translation && (
          <div
            className={`flex-[2] min-w-0 text-muted-foreground leading-relaxed ${translationBelow ? '' : 'lg:pt-0'} ${translationClass}`}
            style={{ zoom: translationZoom }}
          >
            {typeof translation === 'string' ? renderInlineMarkdown(translation) : translation}
          </div>
        )}
        {loading && !translation && (
          <div
            className={`flex-[2] min-w-0 pt-1 ${translationBelow ? '' : 'lg:pt-0'} ${translationClass || 'text-sm'}`}
            style={{ zoom: translationZoom }}
          >
            <TranslationSkeleton
              text={text}
              className={translationClass.includes('text-center') ? 'items-center' : ''}
            />
          </div>
        )}
      </div>

      {/* Action menu dropdown */}
      <Popover>
        <PopoverTrigger className="z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-muted hover:text-foreground opacity-100" aria-label={t('action.more')}>
          <MoreVertical className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={4} className="min-w-[180px] p-1">
          {menuItems.map((item) => (
            <button
              key={item.kind}
              onClick={item.onClick}
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
