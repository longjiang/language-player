'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useStreamingExplanation, type StreamDiagnostics } from '@langplayer/api-client';
import { useT } from '@/hooks/use-t';
import { log, logwarn } from '@/lib/logger';
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

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Translated label shown in the user bubble (follow-up buttons only). */
  label?: string;
  /** The exact prompt that produced this assistant message (for regenerate). */
  prompt?: string;
}

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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<FollowUpKind>>(new Set());
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStreamStartedRef = useRef(false);
  const prevWordRef = useRef(word);
  const loggedEmptyBubbleRef = useRef<Set<number>>(new Set());
  /** Id of the latest empty assistant placeholder, if any (for retries). */
  const emptyAssistantIdRef = useRef<number | null>(null);

  // SSE-level diagnostics for the shared streaming hook — reveals whether an
  // empty bubble came from an empty server response, malformed SSE, an HTTP
  // error, or something else, without adding app-specific logging to
  // packages/api-client.
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation(
    useCallback(
      (d: StreamDiagnostics) => {
        const base = {
          word,
          chars: d.chars,
          sseLines: d.sseLines,
          parsedChunks: d.parsedChunks,
          skippedPayloads: d.skippedPayloads,
          malformedLines: d.malformedLines,
          sawDone: d.sawDone,
          httpStatus: d.httpStatus,
          durationMs: d.durationMs,
          error: d.error,
        };
        if (d.error) {
          logwarn('AI explain stream diagnostics (error)', base);
        } else if (d.chars === 0) {
          logwarn('AI explain stream diagnostics (EMPTY, no error)', base);
        } else {
          log('AI explain stream diagnostics', base);
        }
      },
      [word],
    ),
  );

  const appendMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    const id = messageIdRef.current++;
    setMessages((prev) => [...prev, { ...message, id }]);
    if (message.role === 'assistant' && !message.text) {
      emptyAssistantIdRef.current = id;
    }
    return id;
  }, []);

  const updateMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (next.role === 'assistant') {
          if (next.text) {
            if (emptyAssistantIdRef.current === id) emptyAssistantIdRef.current = null;
          } else {
            emptyAssistantIdRef.current = id;
          }
        }
        return next;
      }),
    );
  }, []);

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
    // Reuse the latest empty assistant placeholder (e.g. retry after an error
    // or StrictMode's double-mount abort) instead of stacking a new message.
    // Tracked in a ref because the StrictMode second effect pass re-runs this
    // callback with a stale `messages` closure.
    const existingEmptyId = emptyAssistantIdRef.current;
    let targetId: number;
    if (existingEmptyId !== null) {
      targetId = existingEmptyId;
      updateMessage(targetId, { text: '', prompt });
    } else {
      targetId = appendMessage({ role: 'assistant', text: '', prompt });
    }
    setStreamingId(targetId);
    log('AI explain stream start', {
      word,
      targetId,
      reusing: existingEmptyId !== null,
    });
    stream(prompt);
  }, [stream, buildPrompt, word, appendMessage, updateMessage]);

  const handleRegenerate = useCallback((messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    const prompt = target.prompt ?? buildPrompt();
    updateMessage(messageId, { text: '', prompt });
    setStreamingId(messageId);
    log('AI explain stream start (regenerate)', { word, messageId });
    stream(prompt, { regenerate: true });
  }, [stream, buildPrompt, word, messages, updateMessage]);

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
    const prompt = buildFollowUpPrompt(kind);
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
    const userId = appendMessage({
      role: 'user',
      text: '',
      label: followUp ? t(followUp.labelKey) : '',
    });
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    log('AI explain follow-up stream start', { word, kind });
    stream(prompt);
  }, [buildFollowUpPrompt, stream, word, appendMessage, t]);

  const handleCopy = useCallback(async (messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    const text = target?.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      log('AI explain copy failed', { error: err });
    }
  }, [messages]);

  // Abort the in-flight stream when the component unmounts (also neutralizes
  // React StrictMode's double-mounted effect: the first fetch is aborted before
  // the second runs, so only one stream proceeds).
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
    // StrictMode runs this cleanup between the double-mounted effect passes.
    // Reset the one-shot guard so the second pass re-fetches instead of
    // stranding the aborted empty placeholder (an empty bubble with no
    // regenerate/copy buttons). The re-fetch reuses that placeholder.
    initialStreamStartedRef.current = false;
  }, [reset]);

  // When the same component instance is reused for a new dictionary entry,
  // drop the old transcript so the new word can auto-fetch again.
  useEffect(() => {
    if (prevWordRef.current === word) return;
    prevWordRef.current = word;
    initialStreamStartedRef.current = false;
    loggedEmptyBubbleRef.current = new Set();
    emptyAssistantIdRef.current = null;
    setMessages([]);
    setStreamingId(null);
    setUsedFollowUps(new Set());
    reset();
  }, [word, reset]);

  // Mirror the streaming hook's text into the assistant message being streamed
  useEffect(() => {
    if (streamingId === null) return;
    updateMessage(streamingId, { text: explanation });
  }, [explanation, streamingId, updateMessage]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      if (!explanation && !error) {
        logwarn('AI explain stream finished EMPTY without error', {
          word,
          chars: explanation.length,
        });
      } else {
        log('AI explain stream finished', {
          word,
          chars: explanation.length,
          error: error ?? undefined,
        });
      }
      wasLoadingRef.current = false;
      setStreamingId(null);
    }
  }, [loading, explanation, error, word]);

  // Fetch when "show AI" is toggled on, or when autoLoad + Pro status resolve
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && !explanation && !loading) {
      if (initialStreamStartedRef.current) return;
      initialStreamStartedRef.current = true;
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
      <div>
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

  // Loading (no tokens yet) — only before the first assistant placeholder exists
  if (loading && !explanation && messages.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('msg.getting_ai_response')}
        </div>
      </div>
    );
  }

  // Streaming or complete — show the chat transcript
  if (messages.length > 0 || loading || error) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          {t('label.ai_says')}
          {loading && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
        </div>

        <div className="space-y-3">
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {message.label}
                </div>
              </div>
            ) : (
              (() => {
                const streamingThis = loading && message.id === streamingId;
                if (
                  !message.text &&
                  !streamingThis &&
                  !loggedEmptyBubbleRef.current.has(message.id)
                ) {
                  loggedEmptyBubbleRef.current.add(message.id);
                  logwarn('AI explain rendered empty assistant bubble', {
                    id: message.id,
                    word,
                    loading,
                    streamingId,
                    error: error ?? undefined,
                    messages: messages.length,
                  });
                }
                return (
                  <div key={message.id} className="flex justify-start">
                    <div className="max-w-[95%]">
                      <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
                    {loading && message.id === streamingId && !message.text ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : message.text ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed">
                        <MarkdownExplanation
                          text={message.text}
                          l2Code={l2.code}
                          streaming={loading && message.id === streamingId}
                        />
                      </div>
                    ) : null}
                  </div>
                  {message.text || (loading && message.id === streamingId) ? (
                    <div className="mt-1 flex items-center gap-1 pl-1">
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        aria-label={t('action.regenerate')}
                        title={t('action.regenerate')}
                        disabled={loading}
                        onClick={() => handleRegenerate(message.id)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                        aria-label={t('action.copy')}
                        title={t('action.copy')}
                        disabled={loading}
                        onClick={() => handleCopy(message.id)}
                      >
                        {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()
            ),
          )}
        </div>

        {error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {error}
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).map((followUp) => (
            <Button
              key={followUp.kind}
              variant="secondary"
              size="sm"
              className="rounded-lg rounded-br-none border border-border shadow-sm"
              disabled={loading}
              onClick={() => handleFollowUp(followUp.kind)}
            >
              {t(followUp.labelKey)}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}
