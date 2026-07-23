import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useDictionary } from '@langplayer/api-client';
import { decomposeWordId } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_ON_PRIMARY, ICON_DESTRUCTIVE, ICON_PRIMARY } from '@/lib/theme-colors';
import { RotateCcw, Check, X } from 'lucide-react-native';
import type { DictionaryEntry } from '@langplayer/shared';

function getDisplayName(word: { head?: string; forms?: string[]; id: string }): string {
  return word.head || word.forms?.[0] || word.id;
}

export default function ReviewScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const { savedWords, loaded } = useSavedWords();
  const words = savedWords[l2Lang.code] ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [known, setKnown] = useState(0);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loadingDef, setLoadingDef] = useState(false);

  const dict = useDictionary();
  const currentWord = words[currentIndex];

  const handleFlip = () => {
    setFlipped(!flipped);
    // Fetch definition from API on first flip
    if (!entry && currentWord) {
      setLoadingDef(true);
      const decomposed = decomposeWordId(currentWord.id, l2Lang.code);
      if (decomposed) {
        const { dict: dictId, id: scopedId } = decomposed;
        dict.getEntry(l2Lang.code, dictId, scopedId)
          .then((res) => setEntry(res.entry))
          .catch(() => {})
          .finally(() => setLoadingDef(false));
      } else {
        setLoadingDef(false);
      }
    }
  };

  // Reset entry when word changes
  React.useEffect(() => { setEntry(null); }, [currentIndex]);

  const handleResponse = useCallback((knew: boolean) => {
    setReviewed((p) => p + 1);
    if (knew) setKnown((p) => p + 1);
    if (currentIndex < words.length - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
    }
  }, [currentIndex, words.length]);

  const handleRestart = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setReviewed(0);
    setKnown(0);
  };

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (words.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="mb-4 px-4 py-5 text-xl font-bold text-foreground">{t('title.review')}</Text>
        <RotateCcw size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="text-center text-muted-foreground">{t('msg.no_saved_words')}</Text>
      </View>
    );
  }

  if (currentIndex >= words.length) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="mb-2 text-2xl font-bold text-foreground">{t('title.review')}</Text>
        <Text className="mb-4 text-muted-foreground">
          Reviewed {reviewed}. Knew {known}.
        </Text>
        <Pressable onPress={handleRestart} className="flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2">
          <RotateCcw size={16} color={ICON_ON_PRIMARY} />
          <Text className="text-sm font-bold text-primary-foreground">{t('action.review')}</Text>
        </Pressable>
      </View>
    );
  }

  const progress = words.length > 0 ? (currentIndex + 1) / words.length : 0;

  return (
    <View className="flex-1 bg-background">
      <View className="mb-4 flex-row items-center justify-between px-4 py-5">
        <Text className="text-xl font-bold text-foreground">{t('title.review')}</Text>
        <Text className="text-sm text-muted-foreground">
          {currentIndex + 1} / {words.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View className="mx-4 h-1 rounded-full bg-muted">
        <View className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </View>

      {/* Flashcard */}
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          onPress={handleFlip}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-8"
          style={{ minHeight: 200 }}
        >
          <Text className="text-center text-2xl font-bold text-foreground">
            {getDisplayName(currentWord!)}
          </Text>
          {flipped && (
            <View className="mt-4 border-t border-border pt-4">
              {loadingDef ? (
                <ActivityIndicator size="small" color={ICON_MUTED} />
              ) : entry?.definitions?.length ? (
                entry.definitions.map((def, i) => (
                  <Text key={i} className="text-center text-base text-foreground">
                    {def}
                  </Text>
                ))
              ) : (
                <Text className="text-center text-sm text-muted-foreground">{getDisplayName(currentWord!)}</Text>
              )}
              {entry?.pronunciation && (
                <Text className="mt-2 text-center text-sm text-muted-foreground">{entry.pronunciation}</Text>
              )}
            </View>
          )}
          <Text className="mt-4 text-center text-xs text-muted-foreground">
            {flipped ? t('action.tap_to_hide') : t('action.tap_to_reveal')}
          </Text>
        </Pressable>
      </View>

      {/* Response buttons */}
      {flipped && (
        <View className="flex-row justify-center gap-4 px-4 pb-8">
          <Pressable onPress={() => handleResponse(false)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-3">
            <X size={18} color={ICON_DESTRUCTIVE} />
            <Text className="text-sm font-medium text-destructive">{t('action.didnt_know')}</Text>
          </Pressable>
          <Pressable onPress={() => handleResponse(true)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 py-3">
            <Check size={18} color={ICON_PRIMARY} />
            <Text className="text-sm font-medium text-primary">{t('action.knew_it')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
