import React, { useEffect, useCallback, useState, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useStreamingExplanation } from '@langplayer/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@langplayer/utils';
import { MarkdownText } from '@/components/MarkdownText';
import { Sparkles, RefreshCw, Lock, Loader2 } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

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
 *
 * Matches the web's AiExplanation component behavior:
 * - Free users see an upgrade prompt
 * - Pro users get a streaming AI explanation of the word in context
 */
export function AiExplanation({ word, contextForm, contextText, entryFound, autoLoad = false }: AiExplanationProps) {
  const { isPro, loaded: subLoaded } = useSubscription();
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { text: explanation, error, loading, stream, reset } = useStreamingExplanation();
  const [showAi, setShowAi] = useState(false);
  const l1NameRef = useRef(l1Lang.name);
  const l2NameRef = useRef(l2Lang.name);
  const l2CodeRef = useRef(l2Lang.code);
  l1NameRef.current = l1Lang.name;
  l2NameRef.current = l2Lang.name;
  l2CodeRef.current = l2Lang.code;

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

    // Languages that don't inflect don't need the morphology prompt
    const nonInflecting = ['zh', 'vi', 'th', 'lo', 'km'];
    if (!nonInflecting.includes(code)) {
      prompt += ' ' + t('prompt.explain_morphology');
    }

    return prompt;
  }, [t, word, contextText, contextForm]);

  const fetchExplanation = useCallback(() => {
    stream(buildPrompt());
  }, [stream, buildPrompt]);

  const handleRegenerate = useCallback(() => {
    stream(buildPrompt(), { regenerate: true });
  }, [stream, buildPrompt]);

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
      <View className="mt-4 mb-2 rounded-lg border border-border bg-muted/30 p-4">
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
          <Pressable onPress={handleRegenerate} className="mt-3 flex-row items-center gap-1">
            <RefreshCw size={14} color={ICON_PRIMARY} />
            <Text className="text-sm text-primary">{t('action.regenerate')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return null;
}
