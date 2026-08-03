'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useT } from '@/hooks/use-t';
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { MarkdownExplanation } from '@/components/markdown-explanation';
import { Sparkles, Loader2, AlertCircle, RefreshCw, Check, Copy } from 'lucide-react';

type FollowUpKind = 'inflection' | 'morphemes' | 'etymology' | 'syntax';

const FOLLOW_UPS: { kind: FollowUpKind; labelKey: string }[] = [
  { kind: 'inflection', labelKey: 'action.inflection' },
  { kind: 'morphemes', labelKey: 'action.morphemes' },
  { kind: 'etymology', labelKey: 'action.etymology' },
  { kind: 'syntax', labelKey: 'action.syntax' },
];

interface AiExplanationProps {
  /** The word being looked up (lemma/dictionary form). */
  word: string;
  /** The surrounding context sentence (the subtitle line). */
  contextText?: string;
  /** The inflected form of the word as it appears in the context text. */
  contextForm?: string;
  /** Whether the entry was found in the dictionary (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams the explanation immediately without showing a button. */
  autoLoad?: boolean;
}

/**
 * "Let DeepSeek Explain" — Pro-only feature shown in the dictionary popup.
 *
 * Matches Classic + GO behaviour:
 * - Free users see an upgrade prompt
 * - Pro users get an AI explanation of the word in context
 * - The prompt asks for a succinct explanation plus 2 translated examples
 */
export function AiExplanation({ word, contextText, contextForm, entryFound, autoLoad = false }: AiExplanationProps) {
  const { data: session } = useSession();
  const { l1, l2 } = useLanguage();
  const t = useT();
  const { isPro, loaded: subLoaded } = useSubscriptionContext();

  const [showAi, setShowAi] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeFollowUp, setActiveFollowUp] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();

  // Build the prompt: succinct explanation of the word in context, then 2
  // examples with translations. The backtick instruction is appended so L2
  // strings render as interactive tokenized text in MarkdownExplanation.
  const buildPrompt = useCallback((): string => {
    // L2 name in the L1 language (e.g., "Japanese" for en, "日语" for zh-Hans)
    const l2Name = languageName(l2.code, l1.code);

    // Strip trailing punctuation from context to avoid doubled periods
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;

    let prompt: string;
    if (cleanContext && contextForm && contextForm !== word) {
      prompt = t('prompt.explain_word_context_form', { l2Name, word, contextForm, context: cleanContext });
    } else if (cleanContext) {
      prompt = t('prompt.explain_word_context', { l2Name, word, context: cleanContext });
    } else {
      prompt = t('prompt.explain_word', { l2Name, word });
    }

    // L2 strings are backticked so they render as interactive tokenized text
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [
    t,
    l1.code,
    l2.code,
    word,
    contextText,
    contextForm,
  ]);

  const fetchExplanation = useCallback(() => {
    const prompt = buildPrompt();
    setActiveFollowUp(null);
    log('AI explain stream start', { word });
    stream(prompt);
  }, [stream, buildPrompt, word]);

  const handleRegenerate = useCallback(() => {
    const prompt = buildPrompt();
    setActiveFollowUp(null);
    log('AI explain stream start (regenerate)', { word });
    stream(prompt, { regenerate: true });
  }, [stream, buildPrompt, word]);

  const buildFollowUpPrompt = useCallback((kind: FollowUpKind): string => {
    const l2Name = languageName(l2.code, l1.code);

    // Strip trailing punctuation from context to avoid doubled periods
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;

    const wordParams = { l2Name, word };
    let prompt: string;
    if (kind === 'inflection') {
      if (cleanContext && contextForm && contextForm !== word) {
        prompt = t('prompt.followup_inflection_context_form', { ...wordParams, contextForm, context: cleanContext });
      } else if (cleanContext) {
        prompt = t('prompt.followup_inflection_context', { ...wordParams, context: cleanContext });
      } else {
        prompt = t('prompt.followup_inflection', wordParams);
      }
    } else if (kind === 'morphemes') {
      prompt = cleanContext
        ? t('prompt.followup_morphemes_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_morphemes', wordParams);
    } else if (kind === 'etymology') {
      prompt = t('prompt.followup_etymology', wordParams);
    } else {
      prompt = cleanContext
        ? t('prompt.followup_syntax_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_syntax', wordParams);
    }

    // L2 strings are backticked so they render as interactive tokenized text
    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, l1.code, l2.code, word, contextText, contextForm]);

  const handleFollowUp = useCallback((kind: FollowUpKind) => {
    const followUp = FOLLOW_UPS.find((f) => f.kind === kind);
    setActiveFollowUp(followUp?.labelKey ?? null);
    const prompt = buildFollowUpPrompt(kind);
    log('AI explain follow-up stream start', { word, kind });
    stream(prompt);
  }, [buildFollowUpPrompt, stream, word]);

  const handleCopy = useCallback(async () => {
    if (!explanation) return;
    try {
      await navigator.clipboard.writeText(explanation);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      log('AI explain copy failed', { error: err });
    }
  }, [explanation]);

  // Abort the in-flight stream when the component unmounts (also neutralizes
  // React StrictMode's double-mounted effect: the first fetch is aborted before
  // the second runs, so only one stream proceeds).
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
  }, [reset]);

  // Debug: track streaming lifecycle — per-chunk updates and stream end
  useEffect(() => {
    if (loading && explanation) {
      log('AI explain streaming', { chars: explanation.length });
    }
  }, [explanation, loading]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      log('AI explain stream finished', { chars: explanation.length, error: error ?? undefined });
      wasLoadingRef.current = false;
    }
  }, [loading, explanation, error]);

  // Fetch when "show AI" is toggled on, or when autoLoad + Pro status resolve
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && !explanation && !loading) {
      fetchExplanation();
    }
  }, [showAi, autoLoad, isPro, subLoaded, explanation, loading, fetchExplanation]);

  // Pro gate — free user (skip the gate while still loading — show the button optimistically)
  if (subLoaded && !isPro && (showAi || autoLoad)) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center dark:border-amber-800 dark:bg-amber-950">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          {t('msg.ai_pro_feature')}
        </p>
      </div>
    );
  }

  // Waiting for subscription check after user clicked — show spinner
  if (!subLoaded && (showAi || autoLoad)) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Not yet toggled — always show the button (don't wait for subscription check)
  if (!showAi && !autoLoad) {
    return (
      <div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => setShowAi(true)}
        >
          <Sparkles className="h-4 w-4" />
          {t('action.let_ai_explain')}
        </Button>
      </div>
    );
  }

  // Loading (no tokens yet)
  if (loading && !explanation) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Error
  if (error && !explanation) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <div className="mb-2 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchExplanation}>
          <RefreshCw className="mr-1 h-3 w-3" /> {t('action.retry')}
        </Button>
      </div>
    );
  }

  // Streaming or complete — always show the explanation card
  if (explanation || loading || error) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {t('label.ai_says')}
          {activeFollowUp && <> · {t(activeFollowUp)}</>}
          {loading && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
        </div>
        <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
          <MarkdownExplanation text={explanation} l2Code={l2.code} streaming={loading} />
        </div>
        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
        {!loading && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              aria-label={t('action.regenerate')}
              title={t('action.regenerate')}
              onClick={handleRegenerate}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              aria-label={t('action.copy')}
              title={t('action.copy')}
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            {FOLLOW_UPS.map((followUp) => (
              <Button
                key={followUp.kind}
                variant="outline"
                size="sm"
                onClick={() => handleFollowUp(followUp.kind)}
              >
                {t(followUp.labelKey)}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}
