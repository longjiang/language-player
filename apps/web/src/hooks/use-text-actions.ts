'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/providers/language-provider';
import { useT } from '@/hooks/use-t';
import { useTextScale } from '@/hooks/use-text-scale';
import { useSpeech } from '@/hooks/use-speech';
import { languageName } from '@/lib/language-data';
import { log, logwarn } from '@/lib/logger';
import { copyText } from '@/lib/clipboard';
import { useStreamingExplanation } from '@langplayer/api-client';
import { PYTHON_API_URL } from '@/lib/api-url';
import { toast } from 'sonner';

export type TextActionKind = 'copy' | 'speak' | 'explain' | 'translate';

export interface UseTextActionsOptions {
  /** The text the actions operate on (a block/line, or a selected substring). */
  text: string;
  /** Target language code for TTS + API calls. */
  l2Code: string;
  /** Native language code for the translation target. */
  l1Code?: string;
  /** Surrounding context for the AI explanation (full paragraph, previous lines, etc.). */
  context?: string;
}

/**
 * Shared copy / speak / AI-explain / translate logic for TextActionMenu
 * (the per-block ⋯ menu).
 */
export function useTextActions({ text, l2Code, l1Code, context }: UseTextActionsOptions) {
  const { l1 } = useLanguage();
  const effectiveL1 = l1Code ?? l1.code;
  const t = useT();
  const textZoomFactor = useTextScale();
  const { speak: speakTts, stop: stopTts, isSpeaking } = useSpeech();
  const {
    text: explainText,
    error: explainError,
    loading: explainLoading,
    stream: streamExplain,
    reset: resetExplain,
  } = useStreamingExplanation();
  const [activeAction, setActiveAction] = useState<TextActionKind | null>(null);
  const [translateText, setTranslateText] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const close = useCallback(() => {
    setActiveAction(null);
  }, []);

  const resetTranslate = useCallback(() => {
    setTranslateText(null);
    setTranslateError(null);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(text);
    if (ok) {
      toast.success(t('msg.copy_success'));
    } else {
      logwarn('Clipboard write failed', { chars: text.length });
      toast.error(t('error.something_went_wrong'));
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
    const item3 = t('prompt.explain_ticks', { l2Name: languageName(l2Code, effectiveL1) });
    const textLabel = t('prompt.explain_text_label');
    const lines = [header, `1. ${item1}`, `2. ${item2}`, `3. ${item3}`];
    if (context) {
      const ctxLabel = t('prompt.explain_context_label');
      lines.push('', `${ctxLabel}: ${context}`);
    }
    lines.push('', `${textLabel}: ${text}`);
    const prompt = lines.join('\n');
    log('AI explain stream start', { l2Code, chars: prompt.length });
    streamExplain(prompt);
  }, [text, l2Code, effectiveL1, context, l1.name, t, streamExplain]);

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

  // Debug: track the streaming lifecycle — per-chunk updates and stream end.
  useEffect(() => {
    if (explainLoading && explainText) {
      log('AI explain streaming', { chars: explainText.length });
    }
  }, [explainText, explainLoading]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (explainLoading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      log('AI explain stream finished', { chars: explainText.length, error: explainError ?? undefined });
      wasLoadingRef.current = false;
    }
  }, [explainLoading, explainText, explainError]);

  return {
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
  };
}
