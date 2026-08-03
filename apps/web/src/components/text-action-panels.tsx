'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { MarkdownExplanation } from '@/components/markdown-explanation';

/**
 * Render a translation string with the inline markdown the translate backend
 * emits (it bolds highlighted terms with `**…**`). Handles **bold**, *italic*,
 * and `code`; anything else passes through untouched.
 */
export function renderInlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.length >= 4 && token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
    key++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

interface ExplainPanelProps {
  l2Code: string;
  explainText: string;
  explainError: string | null;
  explainLoading: boolean;
  /** Optional block rendered above the explanation (the original text). */
  children?: ReactNode;
  onClose: () => void;
}

/** Full-screen modal for the streaming AI explanation. Shared by TextActionMenu
 *  and the selection popup so both stay in sync. */
export function ExplainPanel({
  l2Code,
  explainText,
  explainError,
  explainLoading,
  children,
  onClose,
}: ExplainPanelProps) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-semibold">
            {t('action.let_ai_explain')}
            {explainLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {children}
          <div>
            {explainError && !explainText ? (
              <p className="text-sm text-destructive">{explainError}</p>
            ) : (
              <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
                <MarkdownExplanation text={explainText || '_'} l2Code={l2Code} streaming={explainLoading} />
              </div>
            )}
            {explainError && explainText && (
              <p className="mt-2 text-xs text-destructive">{explainError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TranslatePanelProps {
  translateText: string | null;
  translateError: string | null;
  textZoomFactor: number;
  /** Positioning classes; defaults to a right-aligned panel under the ⋯ button
   *  (TextActionMenu's layout). */
  className?: string;
  onClose: () => void;
}

/** Inline translate result panel. Shared by TextActionMenu and the selection popup. */
export function TranslatePanel({
  translateText,
  translateError,
  textZoomFactor,
  className,
  onClose,
}: TranslatePanelProps) {
  const t = useT();
  return (
    <div
      className={className ?? 'absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-lg'}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{t('action.translation')}</span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {translateError ? (
        <p className="text-sm text-destructive">{translateError}</p>
      ) : (
        <div
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ fontSize: `${0.875 * textZoomFactor}rem` }}
        >
          {renderInlineMarkdown(translateText ?? '')}
        </div>
      )}
    </div>
  );
}
