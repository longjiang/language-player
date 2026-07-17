'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useSpeech } from '@/hooks/use-speech';
import { TokenizedText } from '@/components/tokenized-text';
import { useStreamingExplanation } from '@/hooks/use-streaming-explanation';
import { PYTHON_API_URL } from '@/lib/api-url';
import { toast } from 'sonner';
import {
  MoreHorizontal, Copy, Volume2, Square, Sparkles, Languages, Loader2,
} from 'lucide-react';

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
  translation?: string;
  /** Tailwind classes for the translation element (e.g. match heading size). */
  translationClass?: string;
  children: ReactNode;
}

type ActionKind = 'copy' | 'speak' | 'explain' | 'translate';

export function TextActionMenu({
  text,
  l2Code,
  l1Code,
  context,
  alwaysShow = false,
  translation,
  translationClass = '',
  children,
}: TextActionMenuProps) {
  const { l1 } = useLanguage();
  const effectiveL1 = l1Code ?? l1.code;
  const t = useT();
  const { speak: speakTts, stop: stopTts, isSpeaking } = useSpeech();
  const { text: explainText, error: explainError, loading: explainLoading, stream: streamExplain, reset: resetExplain } = useStreamingExplanation();
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveAction(null);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('msg.copy_success'));
    } catch {
      toast.error(t('msg.copy_success')); // fallback — key exists
    }
    close();
  }, [text, t, close]);

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      stopTts();
    } else {
      speakTts(text, l2Code);
    }
    close();
  }, [text, l2Code, speakTts, stopTts, isSpeaking, close]);

  const handleExplain = useCallback(() => {
    setActiveAction('explain');
    const l1Name = l1.name;
    const header = t('prompt.explain_block_header', { l2Code });
    const item1 = t('prompt.explain_block_item1', { l1Name });
    const item2 = t('prompt.explain_block_item2');
    const textLabel = t('prompt.explain_text_label');
    const lines = [header, `1. ${item1}`, `2. ${item2}`];
    if (context) {
      const ctxLabel = t('prompt.explain_context_label');
      lines.push('', `${ctxLabel}: ${context}`);
    }
    lines.push('', `${textLabel}: ${text}`);
    const prompt = lines.join('\n');
    streamExplain(prompt);
  }, [text, l2Code, context, l1.name, t, streamExplain]);

  const handleTranslate = useCallback(async () => {
    setActiveAction('translate');
    setTranslateText(null);
    setTranslateError(null);
    try {
      const res = await fetch(`${PYTHON_API_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, l1: effectiveL1, l2: l2Code }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTranslateText(data?.translated_text ?? data?.translation ?? data?.text ?? JSON.stringify(data));
    } catch (err: any) {
      setTranslateError(err?.message ?? t('error.occurred'));
    }
  }, [text, l2Code, effectiveL1, t]);

  const menuItems: { kind: ActionKind; icon: typeof Copy; label: string; onClick: () => void; loading?: boolean }[] = [
    { kind: 'copy', icon: Copy, label: t('action.copy'), onClick: handleCopy },
    { kind: 'speak', icon: isSpeaking ? Square : Volume2, label: isSpeaking ? t('action.stop') : t('action.speak'), onClick: handleSpeak },
    { kind: 'explain', icon: Sparkles, label: t('action.let_ai_explain'), onClick: handleExplain, loading: activeAction === 'explain' && explainLoading },
    { kind: 'translate', icon: Languages, label: t('action.translation'), onClick: handleTranslate, loading: activeAction === 'translate' && !translateText && !translateError },
  ];

  return (
    <div ref={menuRef} className="group relative flex items-start gap-3">
      {/* Content + inline translation */}
      <div className="flex-1 min-w-0 flex flex-col xl:flex-row xl:gap-4 xl:items-start">
        <div className="flex-[3] min-w-0">
          {children}
        </div>
        {translation && (
          <div className={`flex-[2] min-w-0 text-muted-foreground leading-relaxed pt-1 xl:pt-0 ${translationClass}`}>
            {translation}
          </div>
        )}
      </div>

      {/* Trigger button */}
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        aria-haspopup="true"
        aria-expanded={open}
        className={`z-10 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-muted hover:text-foreground ${
          alwaysShow || open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
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
        </div>
      )}

      {/* Explain modal */}
      {activeAction === 'explain' && (explainText || explainError || explainLoading) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]" onClick={() => { setActiveAction(null); resetExplain(); }}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-sm font-semibold">
                {t('action.let_ai_explain')}
                {explainLoading && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
              </span>
              <button onClick={() => { setActiveAction(null); resetExplain(); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">✕</button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              {/* Original text — tokenized */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <TokenizedText text={text} l2Code={l2Code} textScale={0} />
              </div>

              {/* DeepSeek breakdown */}
              <div>
                {explainError && !explainText ? (
                  <p className="text-sm text-destructive">{explainError}</p>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{explainText || '_'}</ReactMarkdown>
                  </div>
                )}
                {explainError && explainText && (
                  <p className="mt-2 text-xs text-destructive">{explainError}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Translate result */}
      {activeAction === 'translate' && (translateText || translateError) && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">{t('action.translation')}</span>
            <button onClick={() => { setActiveAction(null); setTranslateText(null); setTranslateError(null); }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground">✕</button>
          </div>
          {translateError ? (
            <p className="text-sm text-destructive">{translateError}</p>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{translateText}</div>
          )}
        </div>
      )}
    </div>
  );
}
