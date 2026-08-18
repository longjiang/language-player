import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import * as Clipboard from 'expo-clipboard';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { MarkdownExplanation } from '@/components/dictionary/MarkdownExplanation';
import { ErrorNotice } from '@/components/ui/error-notice';
import { localizedError } from '@/lib/errors';
import { Sparkles, RefreshCw, Copy, Check } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

type FollowUpKind = 'inflection' | 'morphemes' | 'etymology' | 'syntax' | 'synonyms';

const FOLLOW_UPS: { kind: FollowUpKind; labelKey: string }[] = [
  { kind: 'inflection', labelKey: 'action.inflection' },
  { kind: 'morphemes', labelKey: 'action.morphemes' },
  { kind: 'etymology', labelKey: 'action.etymology' },
  { kind: 'syntax', labelKey: 'action.syntax' },
  { kind: 'synonyms', labelKey: 'action.synonyms' },
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
  /** The word being looked up (surface form). */
  word: string;
  /** The inflected form as it appears in context (may differ from word). */
  contextForm?: string;
  /** The surrounding context sentence. */
  contextText?: string;
  /** Whether a dictionary entry was found (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams immediately without showing a button. */
  autoLoad?: boolean;
}

/**
 * "Let DeepSeek Explain" — Pro-only feature for the dictionary popup.
 * Matches web: streaming chat with regenerate, copy, and follow-up question
 * buttons (inflection / morphemes / etymology / syntax / synonyms).
 */
export function AiExplanation({ word, contextForm, contextText, entryFound, autoLoad = false }: AiExplanationProps) {
  const { isPro, loaded: subLoaded } = useSubscription();
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();
  const [showAi, setShowAi] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [usedFollowUps, setUsedFollowUps] = useState<Set<FollowUpKind>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messageIdRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const l1NameRef = useRef(l1Lang.name);
  const l2NameRef = useRef(l2Lang.name);
  const l2CodeRef = useRef(l2Lang.code);
  l1NameRef.current = l1Lang.name;
  l2NameRef.current = l2Lang.name;
  l2CodeRef.current = l2Lang.code;

  const appendMessage = useCallback((message: Omit<ChatMessage, 'id'>) => {
    const id = messageIdRef.current++;
    setMessages((prev) => [...prev, { ...message, id }]);
    return id;
  }, []);

  const updateMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const buildPrompt = useCallback((): string => {
    const l1Name = l1NameRef.current;
    const l2Name = l2NameRef.current;
    const code = l2CodeRef.current;

    let prompt: string;
    if (contextText && contextForm && contextForm !== word) {
      prompt = t('prompt.explain_word_context_form', { l1Name, l2Name, code, word, contextForm, context: contextText });
    } else if (contextText) {
      prompt = t('prompt.explain_word_context', { l1Name, l2Name, code, word, context: contextText });
    } else {
      prompt = t('prompt.explain_word', { l1Name, l2Name, code, word });
    }

    const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
    if (!nonInflecting.includes(code)) {
      prompt += ' ' + t('prompt.explain_morphology');
    }

    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, word, contextText, contextForm]);

  const buildFollowUpPrompt = useCallback((kind: FollowUpKind): string => {
    const l1Name = l1NameRef.current;
    const l2Name = l2NameRef.current;
    const cleanContext = contextText ? contextText.replace(/[.。！!？?…]+$/, '') : undefined;
    const wordParams = { l1Name, l2Name, word };

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
    } else if (kind === 'syntax') {
      prompt = cleanContext
        ? t('prompt.followup_syntax_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_syntax', wordParams);
    } else {
      // synonyms
      prompt = cleanContext
        ? t('prompt.followup_synonyms_context', { ...wordParams, context: cleanContext })
        : t('prompt.followup_synonyms', wordParams);
    }

    const ticksPrompt = t('prompt.explain_ticks', { l2Name });
    return `${prompt}\n\n${ticksPrompt}`;
  }, [t, word, contextText, contextForm]);

  const startStream = useCallback((prompt: string, regenerate = false) => {
    const aiId = appendMessage({ role: 'assistant', text: '', prompt });
    setStreamingId(aiId);
    void stream(prompt, regenerate ? { regenerate: true } : undefined);
  }, [appendMessage, stream]);

  const fetchExplanation = useCallback(() => {
    startStream(buildPrompt());
  }, [startStream, buildPrompt]);

  const handleRegenerate = useCallback((messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    updateMessage(messageId, { text: '', prompt: target.prompt ?? buildPrompt() });
    setStreamingId(messageId);
    void stream(target.prompt ?? buildPrompt(), { regenerate: true });
  }, [messages, updateMessage, buildPrompt, stream]);

  const handleFollowUp = useCallback((kind: FollowUpKind) => {
    const followUp = FOLLOW_UPS.find((f) => f.kind === kind);
    setUsedFollowUps((prev) => {
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
    appendMessage({ role: 'user', text: '', label: followUp ? t(followUp.labelKey) : '' });
    startStream(buildFollowUpPrompt(kind));
  }, [appendMessage, startStream, buildFollowUpPrompt, t]);

  const handleCopy = useCallback(async (messageId: number) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target?.text) return;
    await Clipboard.setStringAsync(target.text);
    setCopiedId(messageId);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
  }, [messages]);

  // Mirror the streaming hook's text into the assistant message being streamed.
  useEffect(() => {
    if (streamingId === null) return;
    updateMessage(streamingId, { text: explanation });
  }, [explanation, streamingId, updateMessage]);

  // Clear streamingId when the stream finishes.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setStreamingId(null);
    }
  }, [loading]);

  // Fetch when `showAi` is toggled, or when autoLoad + Pro resolve.
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && messages.length === 0 && !loading) {
      fetchExplanation();
    }
  }, [showAi, autoLoad, isPro, subLoaded, messages.length, loading, fetchExplanation]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    reset();
  }, [reset]);

  // Pro gate — still loading subscription
  if (!subLoaded) return null;

  // Pro gate — free user
  if (!isPro) {
    return (
      <View className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <Text className="text-center text-sm text-amber-700 dark:text-amber-300">
          <Sparkles size={14} color="#d97706" /> {t('msg.ai_pro_feature')}
        </Text>
      </View>
    );
  }

  // Not yet toggled — show the button (skip when autoLoad)
  if (!showAi && !autoLoad) {
    return (
      <View className="mt-4 pb-2">
        <Pressable
          onPress={() => setShowAi(true)}
          className="flex-row items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 active:bg-muted"
        >
          <Sparkles size={16} color={ICON_PRIMARY} />
          <Text className="text-sm font-medium text-foreground">{t('action.let_ai_explain')}</Text>
        </Pressable>
      </View>
    );
  }

  // Loading before the first assistant placeholder exists
  if (loading && !explanation && messages.length === 0) {
    return (
      <View className="mt-4">
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={ICON_MUTED} />
          <Text className="text-sm text-muted-foreground">{t('msg.getting_ai_response')}</Text>
        </View>
      </View>
    );
  }

  // Streaming or complete — show the chat transcript
  if (messages.length > 0 || loading || error) {
    return (
      <View className="mt-4 mb-2">
        <View className="mb-2 flex-row items-center gap-2">
          <Sparkles size={12} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{t('label.ai_says')}</Text>
          {loading && <ActivityIndicator size="small" color={ICON_MUTED} />}
        </View>

        {/* Chat transcript — explicit per-message margins (mb-3) so the gap
            between a user follow-up bubble and the AI response that follows
            is always visible, independent of container space-y support. */}
        <View>
          {messages.map((message) =>
            message.role === 'user' ? (
              <View key={message.id} className="mb-3 items-end">
                <View className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2">
                  <Text className="text-sm text-primary-foreground">{message.label}</Text>
                </View>
              </View>
            ) : (
              <View key={message.id} className="mb-3 items-start">
                <View className="max-w-[95%] rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2">
                  {loading && message.id === streamingId && !message.text ? (
                    <ActivityIndicator size="small" color={ICON_MUTED} />
                  ) : (
                    <MarkdownExplanation
                      text={message.text}
                      l2Code={l2Lang.code}
                      streaming={loading && message.id === streamingId}
                    />
                  )}
                </View>
                <View className="mt-1 flex-row items-center gap-1 pl-1">
                  <Pressable
                    onPress={() => handleRegenerate(message.id)}
                    disabled={loading}
                    className="rounded p-1 active:bg-muted disabled:opacity-40"
                    accessibilityLabel={t('action.regenerate')}
                  >
                    <RefreshCw size={12} color={ICON_MUTED} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleCopy(message.id)}
                    disabled={loading || !message.text}
                    className="rounded p-1 active:bg-muted disabled:opacity-40"
                    accessibilityLabel={t('action.copy')}
                  >
                    {copiedId === message.id ? (
                      <Check size={12} color={ICON_PRIMARY} />
                    ) : (
                      <Copy size={12} color={ICON_MUTED} />
                    )}
                  </Pressable>
                </View>
              </View>
            ),
          )}
        </View>

        {error && (
          <ErrorNotice message={localizedError(t, error)} className="mt-2" />
        )}

        {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).length > 0 && (
          <View className="mt-3 flex-row flex-wrap justify-end gap-2">
            {FOLLOW_UPS.filter((followUp) => !usedFollowUps.has(followUp.kind)).map((followUp) => (
              <Pressable
                key={followUp.kind}
                onPress={() => handleFollowUp(followUp.kind)}
                disabled={loading}
                className="rounded-lg rounded-br-none border border-border px-3 py-1.5 active:bg-muted disabled:opacity-40"
              >
                <Text className="text-xs font-medium text-foreground">{t(followUp.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }

  return null;
}
