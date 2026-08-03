'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Volume2, Square, Sparkles, Languages, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { useTextActions } from '@/hooks/use-text-actions';
import { ExplainPanel, TranslatePanel } from '@/components/text-action-panels';

const MENU_GAP = 8;

export interface SelectionActionMenuProps {
  /** The selected substring (source text of the tokenized block). */
  text: string;
  /** Target language code for TTS + API calls. */
  l2Code: string;
  /** Native language code for the translation target. */
  l1Code?: string;
  /** Surrounding context for the AI explanation (the full line/block). */
  context?: string;
  /** Viewport rect of the native selection — anchors the popup. */
  position: { x: number; y: number; width: number; height: number };
  /** Renders the "original text" section of the explain modal. Receives the
   *  streaming flag so callers can show plain text while the stream loads and
   *  tokenized text afterwards. Passed as a callback to keep TokenizedText
   *  from creating an import cycle (TokenizedText renders itself here). */
  renderOriginal?: (loading: boolean) => ReactNode;
  /** Ref from useSelectionPopup — lets the hook tell presses on the menu from
   *  clicks outside the tokenized text. */
  menuRef?: { current: HTMLElement | null };
}

/**
 * Popup action menu anchored to a native text selection inside TokenizedText.
 * Reuses the same copy / speak / AI-explain / translate actions as
 * TextActionMenu. Dismissal (outside click, Escape, scroll, selection change)
 * is handled by useSelectionPopup in the parent, which watches mousedown in
 * the capture phase and uses `menuRef` to tell presses on this menu from
 * clicks outside the tokenized text.
 */
export function SelectionActionMenu({
  text,
  l2Code,
  l1Code,
  context,
  position,
  renderOriginal,
  menuRef,
}: SelectionActionMenuProps) {
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

  const rootRef = useRef<HTMLDivElement | null>(null);
  // Start at the natural position (just below the selection) so there's no
  // visible jump; the layout effect clamps/flips for edge cases before paint.
  const [anchor, setAnchor] = useState(() => ({
    left: position.x,
    top: position.y + position.height + MENU_GAP,
  }));

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = position.x;
    let top = position.y + position.height + MENU_GAP;
    if (top + rect.height > window.innerHeight - MENU_GAP) {
      top = Math.max(MENU_GAP, position.y - rect.height - MENU_GAP);
    }
    if (left + rect.width > window.innerWidth - MENU_GAP) {
      left = Math.max(MENU_GAP, window.innerWidth - rect.width - MENU_GAP);
    }
    setAnchor({ left, top });
  }, [position]);

  const menuItems: { kind: string; icon: typeof Copy; label: string; onClick: () => void; loading?: boolean }[] = [
    { kind: 'copy', icon: Copy, label: t('action.copy'), onClick: handleCopy },
    { kind: 'speak', icon: isSpeaking ? Square : Volume2, label: isSpeaking ? t('action.stop') : t('action.speak'), onClick: handleSpeak },
    { kind: 'explain', icon: Sparkles, label: t('action.let_ai_explain'), onClick: handleExplain, loading: activeAction === 'explain' && explainLoading },
    { kind: 'translate', icon: Languages, label: t('action.translation'), onClick: handleTranslate, loading: activeAction === 'translate' && !translateText && !translateError },
  ];

  // The popup is portaled to <body>: TokenizedText is often rendered inside a
  // <p> (reader blocks), where a <div> child would be invalid HTML and trigger
  // a React DOM-nesting warning.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={(node) => {
        rootRef.current = node;
        if (menuRef) menuRef.current = node;
      }}
      role="menu"
      aria-label={t('action.more')}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg"
      style={{ left: anchor.left, top: anchor.top }}
    >
      {menuItems.map((item) => (
        <button
          key={item.kind}
          role="menuitem"
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

      {/* Translate result — positioned just below the menu */}
      {activeAction === 'translate' && (translateText || translateError) && (
        <TranslatePanel
          translateText={translateText}
          translateError={translateError}
          textZoomFactor={textZoomFactor}
          onClose={() => { close(); resetTranslate(); }}
          className="absolute left-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-lg"
        />
      )}

      {/* AI explain modal */}
      {activeAction === 'explain' && (explainText || explainError || explainLoading) && (
        <ExplainPanel
          l2Code={l2Code}
          explainText={explainText}
          explainError={explainError}
          explainLoading={explainLoading}
          onClose={() => { close(); resetExplain(); }}
        >
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            {renderOriginal ? (
              renderOriginal(explainLoading)
            ) : (
              <span className="text-muted-foreground/80 whitespace-pre-wrap">{text}</span>
            )}
          </div>
        </ExplainPanel>
      )}
    </div>,
    document.body,
  );
}
