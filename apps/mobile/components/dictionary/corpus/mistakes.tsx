import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import type { SketchMistakesResponse } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { PYTHON_API_URL } from '@/lib/api-url';
import { ICON_MUTED } from '@/lib/theme-colors';
import { AlertCircle } from 'lucide-react-native';
import { useCorpusFetch } from './use-corpus-fetch';

interface MistakesProps {
  word: string;
}

/**
 * Chinese learner mistakes (guangwai corpus).
 * GET /sketch-engine/mistakes?word=  (ARCH-020 §7.4) — zh only.
 */
export function Mistakes({ word }: MistakesProps) {
  const t = useT();
  const url = `${PYTHON_API_URL}/sketch-engine/mistakes?word=${encodeURIComponent(word)}`;
  const { data, loading, error } = useCorpusFetch<SketchMistakesResponse>(url);

  if (loading) {
    return (
      <View className="items-center justify-center py-10">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <AlertCircle size={16} color="#ef4444" />
        <Text className="text-sm text-destructive">{t('error.failed_to_load', { status: error })}</Text>
      </View>
    );
  }

  if (!data || data.mistakes.length === 0) {
    return (
      <Text className="py-6 text-center text-sm text-muted-foreground">
        {t('msg.no_mistakes_found', { term: word })}
      </Text>
    );
  }

  return (
    <View>
      <Text className="mb-2 text-xs text-muted-foreground">{t('corpus.mistake_description')}</Text>
      <View className="gap-2">
        {data.mistakes.map((mistake, index) => (
          <View key={index} className="rounded-lg border border-border bg-muted/30 p-3">
            <Text className="text-sm leading-relaxed text-foreground" lang="zh">
              {mistake.leftContext && (
                <Text className="text-muted-foreground">{mistake.leftContext}</Text>
              )}
              {mistake.left && <Text>{mistake.left}</Text>}
              <Text className="font-bold text-destructive">{word}</Text>
              {mistake.right && <Text>{mistake.right}</Text>}
              {mistake.rightContext && (
                <Text className="text-muted-foreground">{mistake.rightContext}</Text>
              )}
            </Text>
            {mistake.errorType || mistake.proficiency || mistake.country ? (
              <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
                {mistake.errorType ? (
                  <Text className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    {mistake.errorType}
                  </Text>
                ) : null}
                {mistake.proficiency ? (
                  <Text className="text-[10px] text-muted-foreground">{mistake.proficiency}</Text>
                ) : null}
                {mistake.country?.name ? (
                  <Text className="text-[10px] text-muted-foreground/70">{mistake.country.name}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
