import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useSrs } from '@/hooks/use-srs';
import { useDictionary } from '@langplayer/api-client';
import { decomposeWordId } from '@langplayer/shared';
import { sm2, newCard, remainingNewCardsToday, baseCode } from '@langplayer/utils';
import type { SrsFields } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { CheckCircle2, BookOpen, Trash2, Undo2 } from 'lucide-react-native';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SavedWordSource } from '@/components/dictionary/SavedWordSource';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import type { DictionaryEntry } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';

type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Quality → SM-2 quality mapping (0-5 scale) */
const RATING_MAP: Record<Rating, 0 | 2 | 4 | 5> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
};

const RATING_ICON_COLORS: Record<Rating, string> = {
  again: '#dc2626',
  hard: '#f97316',
  good: '#16a34a',
  easy: '#2563eb',
};

/** State saved before a rating, so the user can undo it. */
interface UndoState {
  wordId: string;
  prevSrs: SrsFields;
  wasLastCard: boolean;
}

function useRatingLabels() {
  const t = useT();
  return [
    { key: 'again' as const, label: t('review.again'), hint: t('review.again_hint') },
    { key: 'hard' as const, label: t('review.hard'), hint: t('review.hard_hint') },
    { key: 'good' as const, label: t('review.good'), hint: t('review.good_hint') },
    { key: 'easy' as const, label: t('review.easy'), hint: t('review.easy_hint') },
  ];
}

function getDisplayName(word: { head?: string; forms?: string[]; id: string }): string {
  return word.head || word.forms?.[0] || word.id;
}

export default function ReviewScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();

  const { savedWords, loaded: wordsLoaded, removeWord } = useSavedWords();
  const { store, loaded: srsLoaded, updateCard, removeCard } = useSrs();
  const { review, display } = useSettingsContext();
  const dailyNewLimit = review.dailyNewLimit;
  const dict = useDictionary();

  const RATING_LABELS = useRatingLabels();

  const l2Code = l2Lang.code;
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [rated, setRated] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [fetchingEntries, setFetchingEntries] = useState(false);
  const [entriesCache, setEntriesCache] = useState<Record<string, DictionaryEntry | null>>({});

  /** Previous card SRS state saved before a rating, used by the Undo action. */
  const undoRef = useRef<UndoState | null>(null);
  /** Track which fetch batch we're on so we can ignore stale results. */
  const fetchGenerationRef = useRef(0);
  /** Track the current card's word ID to detect unsave-triggered card changes. */
  const lastCardIdRef = useRef<string | null>(null);

  // ── Auto-initialize SRS cards for saved words that don't have them ──
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const unscheduled = l2SavedWords.filter((sw) => !langCards[sw.id]);

    if (unscheduled.length > 0) {
      const remaining = remainingNewCardsToday(langCards, dailyNewLimit);
      const toAdd = unscheduled.slice(0, Math.max(0, remaining));

      if (toAdd.length > 0) {
        setInitializing(true);
        for (const sw of toAdd) {
          const card = newCard();
          card.nextReview = Date.now(); // due now
          updateCard(l2Code, sw.id, card);
        }
        setTimeout(() => setInitializing(false), 100);
      }
    }
  }, [srsLoaded, wordsLoaded, l2SavedWords, store, l2Code, dailyNewLimit, updateCard]);

  // ── Compute due cards (without entries — entries merged below) ──
  const dueCards = useMemo(() => {
    const now = Date.now();
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    return l2SavedWords
      .filter((sw) => {
        const srs = langCards[sw.id];
        if (!srs) return false;
        return srs.nextReview <= now;
      })
      .sort((a, b) => {
        const sa = langCards[a.id];
        const sb = langCards[b.id];
        if (!sa || !sb) return 0;
        return sa.nextReview - sb.nextReview;
      });
  }, [l2SavedWords, store, l2Code]);

  // ── Merge due cards with cached entries ──
  const cards = useMemo(() => dueCards.map((word) => ({
    word,
    srs: (store.cards[l2Code] ?? {})[word.id] || newCard(),
    entry: entriesCache[word.id] ?? null,
  })), [dueCards, entriesCache, store, l2Code]);

  // ── Fetch dictionary entries for the current card + a small lookahead ──
  const ENTRY_LOOKAHEAD = 2;

  useEffect(() => {
    if (dueCards.length === 0 || fetchingEntries || initializing) return;

    const windowEnd = Math.min(currentIndex + ENTRY_LOOKAHEAD, dueCards.length - 1);
    const uncachedInWindow: string[] = [];
    for (let i = currentIndex; i <= windowEnd; i++) {
      const id = dueCards[i]?.id;
      if (id && !(id in entriesCache)) {
        uncachedInWindow.push(id);
      }
    }

    if (uncachedInWindow.length === 0) return;

    const generation = ++fetchGenerationRef.current;
    let cancelled = false;

    const fetchEntries = async () => {
      setFetchingEntries(true);
      const newEntries: Record<string, DictionaryEntry | null> = {};

      const results = await Promise.all(
        uncachedInWindow.map(async (id) => {
          try {
            const decomposed = decomposeWordId(id, l2Code);
            if (!decomposed) return { id, entry: null };
            const { dict: dictId, id: scopedId } = decomposed;
            const res = await dict.getEntry(l2Code, dictId, scopedId, l1Lang.code);
            return { id, entry: (res as any)?.entry ?? null };
          } catch {
            return { id, entry: null };
          }
        })
      );

      if (!cancelled && generation === fetchGenerationRef.current) {
        for (const r of results) {
          newEntries[r.id] = r.entry;
        }
        setEntriesCache((prev) => ({ ...prev, ...newEntries }));
        setFetchingEntries(false);
      }
    };

    fetchEntries();
    return () => { cancelled = true; };
  }, [dueCards, currentIndex, fetchingEntries, initializing]);

  // ── Handlers ──

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    setRated(true);

    const card = cards[currentIndex];
    if (!card) {
      setRated(false);
      return;
    }

    // Save state for undo
    const wasLastCard = currentIndex >= cards.length - 1;
    undoRef.current = { wordId: card.word.id, prevSrs: { ...card.srs }, wasLastCard };

    // Apply SM-2 algorithm
    const sm2Quality = RATING_MAP[quality];
    const updated = sm2(card.srs, sm2Quality);
    updateCard(l2Code, card.word.id, updated);

    if (wasLastCard) {
      setJustCompleted(true);
    }

    // Auto-advance after a brief pause (shows undo opportunity)
    setTimeout(() => {
      setRated(false);
      if (!wasLastCard) {
        setCurrentIndex((i) => i + 1);
      }
    }, 600);
  }, [cards, currentIndex, rated, updateCard, l2Code]);

  /** Undo the most recent rating — restores the card's previous SRS state. */
  const handleUndo = useCallback(() => {
    const state = undoRef.current;
    if (!state) return;

    updateCard(l2Code, state.wordId, state.prevSrs);

    if (state.wasLastCard) {
      setJustCompleted(false);
    }

    // Reset currentIndex so the undone card reappears at the top
    setCurrentIndex(0);
    setRated(false);
    undoRef.current = null;
  }, [l2Code, updateCard]);

  /** Remove this word from saved words and SRS. */
  const handleRemove = useCallback(() => {
    const card = cards[currentIndex];
    if (!card) return;
    removeWord(l2Code, card.word.id);
    removeCard(l2Code, card.word.id);
    setRated(false);
  }, [cards, currentIndex, l2Code, removeWord, removeCard]);

  // ── Clamp currentIndex if it exceeds the cards array (cards shrunk after removal) ──
  useEffect(() => {
    if (cards.length > 0 && currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex]);

  // ── When card changes without a rating (e.g. unsave) ──
  useEffect(() => {
    const card = cards[currentIndex];
    const currentId = card?.word.id ?? null;
    if (currentId && currentId !== lastCardIdRef.current) {
      lastCardIdRef.current = currentId;
    }
  }, [cards, currentIndex, rated]);

  // ── Reset justCompleted when new cards become due ──
  useEffect(() => {
    if (cards.length > 0 && justCompleted) {
      setJustCompleted(false);
      setCurrentIndex(0);
    }
  }, [cards.length, justCompleted]);

  // ── Reset session state when language changes ──
  useEffect(() => {
    setJustCompleted(false);
    setCurrentIndex(0);
    setEntriesCache({});
    undoRef.current = null;
  }, [l2Code]);

  // ── Anki-style card counts (new / again / review) ──
  const cardCounts = useMemo(() => {
    let newCount = 0;
    let againCount = 0;
    let reviewCount = 0;
    for (const c of cards) {
      if (c.srs.repetitions >= 1) {
        reviewCount++;
      } else if (c.srs.lastReview > (c.srs.createdAt ?? 0)) {
        againCount++;
      } else {
        newCount++;
      }
    }
    return { newCount, againCount, reviewCount };
  }, [cards]);

  // ── Render states ──

  const isLoading = !wordsLoaded || !srsLoaded || initializing;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={ICON_MUTED} />
      </View>
    );
  }

  // No saved words at all
  if (l2SavedWords.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.no_words_to_review')}</Text>
        <Text className="mb-4 text-center text-muted-foreground max-w-md">
          {t('msg.save_words_to_build_deck')}
        </Text>
      </View>
    );
  }

  // All done — just finished reviewing all due cards
  if (justCompleted) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.nextReview > Date.now())
      .sort((a, b) => a.nextReview - b.nextReview)[0];

    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <CheckCircle2 size={56} color={ICON_PRIMARY} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.all_done_for_now')}</Text>
        <Text className="mb-4 text-center text-muted-foreground">
          {t('msg.all_done_desc')}
          {nextDue && (
            <>{' '}{t('msg.next_review')}: {new Date(nextDue.nextReview).toLocaleDateString()}.</>
          )}
        </Text>
        {undoRef.current && (
          <Pressable
            onPress={handleUndo}
            className="mb-3 flex-row items-center gap-1.5 rounded-lg border border-border px-4 py-2"
          >
            <Undo2 size={14} color={ICON_MUTED} />
            <Text className="text-sm text-muted-foreground">{t('action.undo')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // No due cards right now
  if (cards.length === 0) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.nextReview > Date.now())
      .sort((a, b) => a.nextReview - b.nextReview)[0];

    const unscheduledCount = l2SavedWords.filter((sw) => !langCards[sw.id]).length;
    const remaining = remainingNewCardsToday(langCards, dailyNewLimit);
    const queued = unscheduledCount > 0 && remaining === 0;

    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.no_cards_due')}</Text>
        <Text className="mb-4 text-center text-muted-foreground">
          {t('msg.no_cards_due_desc', { total: Object.keys(langCards).length, deck: l2Lang.name })}
          {nextDue ? (
            <> {t('msg.next_review_date', { date: new Date(nextDue.nextReview).toLocaleDateString() })}</>
          ) : (
            <> {t('msg.save_more_words')}</>
          )}
          {queued && (
            <> {unscheduledCount} {t('msg.more_queued', { count: unscheduledCount })}</>
          )}
          {unscheduledCount > 0 && remaining > 0 && (
            <> {remaining} {t('msg.new_cards_available', { count: remaining, limit: dailyNewLimit })}</>
          )}
        </Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;

  const entry = currentCard.entry;
  const wordForm = currentCard.word.head || currentCard.word.forms?.[0] || entry?.head || currentCard.word.id;
  const wordCtx = currentCard.word.context ?? {};
  const srs = currentCard.srs;

  return (
    <PageContainer>
      {/* Header with card counts */}
      <View className="flex-row items-center justify-between px-4 py-4">
        <View>
          <Text className="text-xl font-bold text-foreground">{t('title.review')}</Text>
        </View>
        {/* Anki-style colored dots */}
        <View className="flex-row items-center gap-3">
          {cardCounts.newCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-blue-500" />
              <Text className="text-xs text-blue-600">{cardCounts.newCount}</Text>
            </View>
          )}
          {cardCounts.againCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-red-500" />
              <Text className="text-xs text-red-600">{cardCounts.againCount}</Text>
            </View>
          )}
          {cardCounts.reviewCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-green-500" />
              <Text className="text-xs text-green-600">{cardCounts.reviewCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Flashcard */}
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          className="w-full max-w-sm rounded-xl border border-border bg-card p-8"
          style={{ minHeight: 240 }}
        >
          {/* Context sentence — always visible, tokenized/interactive */}
          {(wordCtx as any)?.text ? (
            <View className="mb-4 rounded-lg bg-muted/50 p-3">
              <Text className="mb-1 text-xs font-medium text-muted-foreground">{t('review.context_label')}</Text>
              <TextActionMenu text={(wordCtx as any).text} l2Code={l2Code} l1Code={baseCode(l1Lang.code)}>
                <TokenizedText
                  text={(wordCtx as any).text}
                  l2Code={l2Code}
                  highlightTerms={[wordForm]}
                />
              </TextActionMenu>
              <View className="mt-1">
                <SavedWordSource context={wordCtx as any} date={currentCard.word.date ?? 0} />
              </View>
              {display.translation && ((wordCtx as any).translation) && (
                <Text className="mt-2 text-sm italic text-muted-foreground border-t border-border pt-2">
                  {(wordCtx as any).translation}
                </Text>
              )}
            </View>
          ) : null}

          {/* SRS info (compact) */}
          <Text className="mb-4 text-center text-xs text-muted-foreground">
            {srs.interval > 0 ? `${srs.interval}d` : t('review.srs_new')}
            {srs.repetitions > 0 && (
              <>{' · '}{srs.ease.toFixed(1)}x{' · '}{t('review.srs_review', { count: srs.repetitions })}</>
            )}
          </Text>

          {/* Card face */}
          {!rated ? (
            <View>
              <View className="flex-row">
                {/* Left half → Again */}
                <Pressable onPress={() => handleRate('again')} className="h-32 flex-1" />
                {/* Center content */}
                <View className="flex-[2] items-center">
                  <Text className="text-center text-2xl font-bold text-foreground">
                    {getDisplayName(currentCard.word)}
                  </Text>
                  <ScrollView className="mt-4 max-h-96 w-full border-t border-border pt-4">
                    {fetchingEntries && !entry ? (
                      <ActivityIndicator size="small" color={ICON_MUTED} />
                    ) : entry ? (
                      <DictionaryEntryCard entry={entry} variant="full" l2Code={l2Lang.code} />
                    ) : (
                      <Text className="text-center text-sm italic text-muted-foreground">
                        {t('review.no_definition_available')}
                      </Text>
                    )}
                  </ScrollView>
                </View>
                {/* Right half → Good */}
                <Pressable onPress={() => handleRate('good')} className="h-32 flex-1" />
              </View>
            </View>
          ) : (
            <View className="items-center justify-center">
              <Text className="text-center text-2xl font-bold text-foreground">
                {getDisplayName(currentCard.word)}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Undo + Remove row */}
        {!rated && (
          <View className="mt-3 w-full max-w-sm flex-row justify-between">
            {undoRef.current ? (
              <Pressable
                onPress={handleUndo}
                className="flex-row items-center gap-1 rounded-lg border border-border px-3 py-1.5"
              >
                <Undo2 size={14} color={ICON_MUTED} />
                <Text className="text-xs text-muted-foreground">{t('action.undo')}</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={handleRemove}
              className="flex-row items-center gap-1 rounded-lg border border-border px-3 py-1.5"
            >
              <Trash2 size={14} color={ICON_MUTED} />
              <Text className="text-xs text-muted-foreground">{t('action.delete')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Rating buttons */}
      {!rated && (
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
    </PageContainer>
  );
}
