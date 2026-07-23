import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';
import { RotateCcw, Check, X } from 'lucide-react-native';

export default function ReviewScreen() {
  const { l2Lang } = useLanguage();
  const t = useT();
  const { savedWords, loading, loadWords } = useSavedWords();
  const words = savedWords[l2Lang.code] ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [known, setKnown] = useState(0);

  useEffect(() => { loadWords(); }, []);

  const currentWord = words[currentIndex];

  const handleFlipped = () => setFlipped(!flipped);

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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  if (words.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="px-4 py-5 mb-4 text-xl font-bold text-foreground">{t('title.review')}</Text>
        <RotateCcw size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="text-center text-muted-foreground">{t('msg.no_saved_words')}</Text>
      </View>
    );
  }

  if (currentIndex >= words.length) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-2xl font-bold text-foreground mb-2">{t('title.review')}</Text>
        <Text className="text-muted-foreground mb-4">
          {'Reviewed {n}. Knew {known}.'.replace('{n}', String(reviewed)).replace('{known}', String(known))}
        </Text>
        <Pressable onPress={handleRestart} className="flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2 active:bg-primary/80">
          <RotateCcw size={16} color="#fff" />
          <Text className="text-sm font-bold text-primary-foreground">{t('action.review')}</Text>
        </Pressable>
      </View>
    );
  }

  const progress = words.length > 0 ? (currentIndex + 1) / words.length : 0;

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 py-5 mb-4 flex-row items-center justify-between">
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
          onPress={handleFlipped}
          className="w-full max-w-sm rounded-xl border border-border bg-card p-8 active:bg-muted"
          style={{ minHeight: 200 }}
        >
          <Text className="text-center text-2xl font-bold text-foreground">
            {flipped ? (currentWord?.definition || currentWord?.head) : currentWord?.head}
          </Text>
          {flipped && currentWord?.pronunciation && (
            <Text className="mt-2 text-center text-muted-foreground">{currentWord.pronunciation}</Text>
          )}
          <Text className="mt-4 text-center text-xs text-muted-foreground">
            {flipped ? 'Tap to reveal' : 'Tap to reveal'}
          </Text>
        </Pressable>
      </View>

      {/* Response buttons */}
      {flipped && (
        <View className="flex-row justify-center gap-4 px-4 pb-8">
          <Pressable onPress={() => handleResponse(false)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 py-3 active:bg-destructive/20">
            <X size={18} color="#ef4444" />
            <Text className="text-sm font-medium text-destructive">{"Didn't know"}</Text>
          </Pressable>
          <Pressable onPress={() => handleResponse(true)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 py-3 active:bg-success/20">
            <Check size={18} color="#22c55e" />
            <Text className="text-sm font-medium text-success">{'Knew it'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
