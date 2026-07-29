import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useT } from '@/hooks/use-t';
import { MarkdownText } from '@/components/MarkdownText';
import { Sparkles, RefreshCw, Lock, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

interface AiExplanationProps {
  /** The word being looked up (surface form). */
  word: string;
  /** The surrounding context sentence. */
  contextText?: string;
  /** Whether a dictionary entry was found (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams immediately without showing a button. */
  autoLoad?: boolean;
}

/**
 * "Let DeepSeek Explain" — Pro-only feature for the dictionary popup.
 *
 * Matches the web's AiExplanation component behavior:
 * - Free users see an upgrade prompt
 * - Pro users get a streaming AI explanation of the word in context
 */
export function AiExplanation({ word, contextText, entryFound, autoLoad = false }: AiExplanationProps) {
  const { isPro, loaded: subLoaded } = useSubscription();
  const t = useT();
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();
  const [showAi, setShowAi] = useState(false);

  const fetchExplanation = useCallback(() => {
    const prompt = buildPrompt(word, contextText, entryFound);
    stream(prompt);
  }, [word, contextText, entryFound, stream]);

  // Fetch when `showAi` is toggled, or when autoLoad + Pro resolve
  useEffect(() => {
    if ((showAi || autoLoad) && isPro && subLoaded && !explanation && !loading) {
      fetchExplanation();
    }
  }, [showAi, autoLoad, isPro, subLoaded, explanation, loading, fetchExplanation]);

  // Pro gate — still loading
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
      <View className="mt-4 pb-1">
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

  // Loading (no tokens yet)
  if (loading && !explanation) {
    return (
      <View className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color={ICON_MUTED} />
          <Text className="text-sm text-muted-foreground">{t('msg.getting_ai_response')}</Text>
        </View>
      </View>
    );
  }

  // Error with no explanation
  if (error && !explanation) {
    return (
      <View className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <Text className="mb-2 text-sm text-red-700 dark:text-red-300">{error}</Text>
        <Pressable onPress={fetchExplanation} className="flex-row items-center gap-1">
          <RefreshCw size={14} color={ICON_PRIMARY} />
          <Text className="text-sm text-primary">{t('action.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  // Streaming or complete
  if (explanation || loading || error) {
    return (
      <View className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
        <View className="mb-2 flex-row items-center gap-2">
          <Sparkles size={12} color={ICON_MUTED} />
          <Text className="text-xs text-muted-foreground">{t('label.ai_says')}</Text>
          {loading && <ActivityIndicator size="small" color={ICON_MUTED} />}
        </View>
        <MarkdownText>{explanation || ''}</MarkdownText>
        {error && explanation ? (
          <Text className="mt-2 text-xs text-red-600">{error}</Text>
        ) : null}
        {!loading && (
          <Pressable onPress={fetchExplanation} className="mt-3 flex-row items-center gap-1">
            <RefreshCw size={14} color={ICON_PRIMARY} />
            <Text className="text-sm text-primary">{t('action.regenerate')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return null;
}

/**
 * Build the prompt sent to DeepSeek, matching the web's AiExplanation prompt logic.
 */
function buildPrompt(word: string, contextText?: string, _entryFound?: boolean): string {
  // The prompt construction uses translation keys from the CSV,
  // but the streaming endpoint just takes a plain text prompt.
  // We construct it here in English (the server handles translations).
  let prompt = `Provide a clear analysis of the following text in the target language. Include:

1. A concise explanation of the word "${word}" in context
2. How its meaning relates to the surrounding text`;

  if (contextText) {
    prompt += `\n\nContext: ${contextText}`;
  }

  prompt += `\n\nWord: ${word}`;

  return prompt;
}
