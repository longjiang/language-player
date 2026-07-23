import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useDictionary } from '@langplayer/api-client';
import { decomposeWordId } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_ON_PRIMARY, ICON_DESTRUCTIVE, ICON_PRIMARY } from '@/lib/theme-colors';
import { RotateCcw, CheckCircle2, BookOpen } from 'lucide-react-native';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import type { DictionaryEntry } from '@langplayer/shared';

type Rating = 'again' | 'hard' | 'good' | 'easy';

const RATING_COLORS: Record<Rating, string> = {
  again: 'bg-red-600',
  hard: 'bg-orange-500',
  good: 'bg-green-600',
  easy: 'bg-blue-600',
};

const RATING_ICON_COLORS: Record<Rating, string> = {
  again: '#dc2626',
  hard: '#f97316',
  good: '#16a34a',
  easy: '#2563eb',
};

function useRatingLabels() {
  const t = useT();
  return [
    { key: 'again' as const, label: t('review.again'), hint: t('review.again_hint'), keyShortcut: '1' },
    { key: 'hard' as const, label: t('review.hard'), hint: t('review.hard_hint'), keyShortcut: '2' },
    { key: 'good' as const, label: t('review.good'), hint: t('review.good_hint'), keyShortcut: '3' },
    { key: 'easy' as const, label: t('review.easy'), hint: t('review.easy_hint'), keyShortcut: '4' },
  ];
}

function getDisplayName(word: { head?: string; forms?: string[]; id: string }): string {
  return word.head || word.forms?.[0] || word.id;
}

function getRatingColor(rating: Rating): string {
  if (rating === 'again') return 'bg-destructive';
  if (rating === 'hard') return 'bg-orange-500';
  if (rating === 'good') return 'bg-green-600';
  return 'bg-blue-600';
}

export default function ReviewScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const t = useT();
  const { savedWords, loaded } = useSavedWords();
  const words = savedWords[l2Lang.code] ?? [];
  const RATING_LABELS = useRatingLabels();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rated, setRated] = useState(false);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loadingDef, setLoadingDef] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const dict = useDictionary();
  const currentWord = words[currentIndex];

  const handleReveal = () => {
    setFlipped(true);
    if (!entry && currentWord) {
      setLoadingDef(true);
      const decomposed = decomposeWordId(currentWord.id, l2Lang.code);
      if (decomposed) {
        const { dict: dictId, id: scopedId } = decomposed;
        dict.getEntry(l2Lang.code, dictId, scopedId, l1Lang.code)
          .then((res) => setEntry(res.entry))
          .catch(() => {})
          .finally(() => setLoadingDef(false));
      } else {
        setLoadingDef(false);
      }
    }
  };

  React.useEffect(() => { setEntry(null); setRated(false); }, [currentIndex]);

  const handleRate = useCallback((quality: Rating) => {
    setRated(true);
    // Move to next card after a brief pause (matches Next.js animation timing)
    setTimeout(() => {
      if (currentIndex < words.length - 1) {
        setCurrentIndex((i) => i + 1);
        setFlipped(false);
      } else {
        setJustCompleted(true);
      }
    }, 600);
  }, [currentIndex, words.length]);

  const handleRestart = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setRated(false);
    setJustCompleted(false);
  };

  // ── Card counts (new / learning / review) — matches Next.js colored dots ──
  const cardCounts = React.useMemo(() => {
    const remaining = words.length - currentIndex;
    const reviewed = currentIndex;
    return { remaining, reviewed, newCount: remaining, reviewCount: reviewed, total: words.length };
  }, [currentIndex, words.length]);

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
        <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="text-center text-muted-foreground">{t('msg.no_saved_words')}</Text>
      </View>
    );
  }

  if (currentIndex >= words.length || justCompleted) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <CheckCircle2 size={56} color={ICON_PRIMARY} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-2xl font-bold text-foreground">{t('review.complete')}</Text>
        <Text className="mb-4 text-center text-muted-foreground">
{t('review.complete_desc', { count: cardCounts.reviewed })}
        </Text>
        <Pressable onPress={handleRestart} className="flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2">
          <RotateCcw size={16} color={ICON_ON_PRIMARY} />
          <Text className="text-sm font-bold text-primary-foreground">{t('action.review_again')}</Text>
        </Pressable>
      </View>
    );
  }

  const progress = words.length > 0 ? (currentIndex + 1) / words.length : 0;

  return (
    <View className="flex-1 bg-background">
      {/* Header with card counts */}
      <View className="mb-2 flex-row items-center justify-between px-4 py-4">
        <View>
          <Text className="text-xl font-bold text-foreground">{t('title.review')}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {t('review.progress', { done: cardCounts.reviewed, remaining: cardCounts.remaining })}
          </Text>
        </View>
        <Pressable onPress={handleRestart} className="rounded-full bg-muted p-2">
          <RotateCcw size={16} color={ICON_MUTED} />
        </Pressable>
      </View>

      {/* Card count indicators — matches Next.js colored dots */}
      {cardCounts.total > 0 && (
        <View className="mt-2 flex-row items-center gap-3 px-4">
          {cardCounts.newCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-blue-500" />
              <Text className="text-xs text-blue-600">{cardCounts.newCount}</Text>
            </View>
          )}
          {cardCounts.reviewCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-green-500" />
              <Text className="text-xs text-green-600">{cardCounts.reviewCount}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <View className="h-2 w-2 rounded-full bg-muted-foreground" />
            <Text className="text-xs text-muted-foreground">{cardCounts.total}</Text>
          </View>
        </View>
      )}

      {/* Progress bar */}
      <View className="mx-4 h-1 rounded-full bg-muted">
        <View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
      </View>

      {/* Card count indicator */}
      <Text className="mt-2 px-4 text-xs text-muted-foreground">
        {currentIndex + 1} / {words.length}
      </Text>

      {/* Flashcard — left/right tap regions match Next.js */}
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full max-w-sm rounded-xl border border-border bg-card p-8" style={{ minHeight: 240 }}>
          {!flipped ? (
            <Pressable onPress={handleReveal} className="flex-1">
              <Text className="text-center text-2xl font-bold text-foreground">
                {getDisplayName(currentWord!)}
              </Text>
              <Text className="mt-4 text-center text-xs text-muted-foreground">
                {t('action.tap_to_reveal')}
              </Text>
            </Pressable>
          ) : !rated ? (
            <View className="flex-1 flex-row">
              {/* Left half → Again */}
              <Pressable onPress={() => handleRate('again')} className="flex-1 justify-center" />
              {loadingDef ? (
                <ActivityIndicator size="small" color={ICON_MUTED} />
              ) : (
                <View className="flex-2">
                  <Text className="text-center text-2xl font-bold text-foreground">
                    {getDisplayName(currentWord!)}
                  </Text>
                  <ScrollView className="mt-4 max-h-96 w-full border-t border-border pt-4">
                    {entry ? (
                      <View>
                        <DictionaryEntryCard entry={entry} variant="full" />
                        {currentWord?.context && (
                          <View className="mt-3 rounded-lg bg-muted/30 p-3">
                            <Text className="mb-1 text-xs font-medium text-muted-foreground">{t('review.source')}</Text>
                            {(currentWord.context as any).videoTitle && (
                              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                                📺 {(currentWord.context as any).videoTitle}
                              </Text>
                            )}
                            {(currentWord.context as any).text && (
                              <Text className="mt-1 text-sm text-foreground" numberOfLines={3}>
                                {(currentWord.context as any).text}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text className="text-center text-sm text-muted-foreground">{getDisplayName(currentWord!)}</Text>
                    )}
                  </ScrollView>
                </View>
              )}
              {/* Right half → Good */}
              <Pressable onPress={() => handleRate('good')} className="flex-1 justify-center" />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-center text-2xl font-bold text-foreground">
                {getDisplayName(currentWord!)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Rating buttons — matches Next.js Again/Hard/Good/Easy */}
      {flipped && !rated && (
        <View className="flex-row gap-2 px-4 pb-8">
          {RATING_LABELS.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => handleRate(r.key)}
              className="flex-1 items-center rounded-lg py-3"
              style={{ backgroundColor: RATING_ICON_COLORS[r.key] }}
            >
              <Text className="text-xs font-bold text-white">{r.label}</Text>
              <Text className="mt-0.5 text-[10px] text-white/70">{r.hint}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
