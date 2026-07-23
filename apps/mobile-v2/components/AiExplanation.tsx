import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { MarkdownText } from '@/components/MarkdownText';

interface AiExplanationProps {
  /** The word being looked up (lemma/dictionary form). */
  word: string;
  /** Whether the entry was found in the dictionary (affects prompt wording). */
  entryFound: boolean;
  /** When true, streams the explanation immediately without showing a button. */
  autoLoad?: boolean;
}

/**
 * "Let DeepSeek Explain" — AI explanation of the word.
 *
 * Matches Next.js AiExplanation behaviour:
 * - Shows a button to trigger explanation
 * - Streams response via SSE (shared useStreamingExplanation hook)
 * - Supports autoLoad for tabbed panel integration
 */
export function AiExplanation({ word, entryFound, autoLoad = false }: AiExplanationProps) {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();

  const [showAi, setShowAi] = useState(false);
  const { text: explanation, error, loading, stream } = useStreamingExplanation();

  // Build the prompt matching Classic's chatGPTPrompt logic
  const buildPrompt = useCallback((): string => {
    const l1Name = l1Lang.name;
    const l2Name = l2Lang.name;
    const code = l2Lang.code;

    let prompt = t('prompt.explain_word', { l1Name, l2Name, code, word });

    // Languages that don't inflect don't need the morphology prompt
    const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
    if (!nonInflecting.includes(code)) {
      prompt += ' ' + t('prompt.explain_morphology');
    }

    return prompt;
  }, [word, l1Lang, l2Lang, t]);

  // Auto-load when visible
  useEffect(() => {
    if ((showAi || autoLoad) && !explanation && !loading) {
      stream(buildPrompt());
    }
  }, [showAi, autoLoad, explanation, loading, stream, buildPrompt]);

  // Not yet toggled — show the button
  if (!showAi && !autoLoad) {
    return (
      <View className="px-4 pt-4">
        <Pressable
          onPress={() => setShowAi(true)}
          className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-primary">
            ✨ {t('action.let_ai_explain')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Loading
  if (loading && !explanation) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator size="large" color={ICON_MUTED} />
        <Text className="mt-3 text-sm text-muted-foreground">{t('msg.getting_ai_response')}</Text>
      </View>
    );
  }

  // Error
  if (error && !explanation) {
    return (
      <View className="px-4 pt-4">
        <View className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <Text className="mb-2 text-sm text-destructive">{error}</Text>
          <Pressable
            onPress={() => stream(buildPrompt())}
            className="self-start rounded-full bg-muted px-3 py-1"
          >
            <Text className="text-xs text-foreground">{t('action.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Streaming or complete
  if (explanation || loading) {
    return (
      <ScrollView className="px-4 pt-3">
        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-2 text-xs font-medium text-primary">
            ✨ {t('label.ai_says')}
            {loading && ' ...'}
          </Text>
          <MarkdownText>{explanation}</MarkdownText>
          {error && (
            <Text className="mt-2 text-xs text-destructive">{error}</Text>
          )}
          {!loading && (
            <Pressable
              onPress={() => stream(buildPrompt())}
              className="mt-3 self-start rounded-full bg-muted px-3 py-1"
            >
              <Text className="text-xs text-foreground">{t('action.regenerate')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    );
  }

  return null;
}
