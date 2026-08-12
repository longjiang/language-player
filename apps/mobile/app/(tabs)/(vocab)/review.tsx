import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useSrs } from '@/hooks/use-srs';
import {
  fsrs,
  baseCode,
  dailyReviewCounterKey,
  msUntilNextUtcDay,
  newRatingId,
} from '@langplayer/utils';
import { useEntryCache, useEntryByIdCache } from '@langplayer/utils/src/use-entry-cache';
import type { SrsFields } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckCircle2, BookOpen } from 'lucide-react-native';
import { SavedWordSource } from '@/components/dictionary/SavedWordSource';
import { DictionaryEntryTabs } from '@/components/dictionary/DictionaryEntryTabs';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { lemmatizeText } from '@/lib/tokenizer';
import {
  enqueueLookupWords,
  getCachedEntryById,
  getL1CachedEntry,
  setCachedEntryById,
} from '@/lib/dictionary-cache';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { useOfflineDictionaryAvailable } from '@/hooks/use-offline-dictionary';
import { lookupL1Text } from '@/lib/l1-lookup';
import type { DictionaryEntry, LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';
import { PYTHON_API_URL } from '@/lib/api-url';
import { srsLogger } from '@/lib/logger';

const { log } = srsLogger;

type Rating = 'again' | 'hard' | 'good' | 'easy';

/** ADR-0034: free users can complete 20 SRS reviews per day. */
const FREE_SRS_DAILY_CAP = 20;

const RATING_ICON_COLORS: Record<Rating, string> = {
  again: '#dc2626',
  hard: '#f97316',
  good: '#16a34a',
  easy: '#2563eb',
};

/** State saved before a rating, so the user can undo it. */
interface UndoState {
  wordId: string;
  head: string;
  prevSrs: SrsFields;
  wasLastCard: boolean;
  /** Client id of the rating being undone, so the backend voids its cap slot. */
  ratingId?: string;
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

/**
 * Emphasize the target form inside a review translation (SPEC-049 §6.2).
 * Returns the translation with the first occurrence of the target form
 * removed from the front (the translation usually echoes it) — the form is
 * rendered separately in primary color by the caller.
 */
function renderTranslation(translation: string, form: string): string {
  if (!translation || !form) return translation;
  const idx = translation.indexOf(form);
  if (idx === 0) {
    const rest = translation.slice(form.length).replace(/^[\s:：·]+/, '');
    return rest;
  }
  return translation;
}

/** Human-friendly label for a saved word (surface form > headword > id). */
function wordLabel(word: { id: string; head?: string; forms?: string[] }): string {
  return word.forms?.[0] || word.head || word.id;
}

export default function ReviewScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();
  const router = useRouter();
  const { isSm } = useResponsive();
  const { isPro } = useSubscription();

  const { savedWords, loaded: wordsLoaded, cloudHydrated } = useSavedWords();
  const { store, loaded: srsLoaded, updateCard, removeCard, pruneOrphans } = useSrs();
  const { review, display } = useSettingsContext();
  const dailyNewLimit = review.dailyNewLimit;
  const insets = useSafeAreaInsets();

  const RATING_LABELS = useRatingLabels();

  const l2Code = l2Lang.code;
  const dictAvailable = useOfflineDictionaryAvailable(l2Code);
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [rated, setRated] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [initializing, setInitializing] = useState(false);
  /** Auto-translated context text (fetched on-demand when no saved translation exists). */
  const [contextTranslation, setContextTranslation] = useState<string | null>(null);
  const [showTabs, setShowTabs] = useState(false);
  /** L1-translated dictionary entry, fetched on reveal for non-English L1. */
  const [l1Entry, setL1Entry] = useState<DictionaryEntry | null>(null);
  /** Cards whose offline entry lookup already finished (even with a miss). */
  const [offlineEntryLookupDone, setOfflineEntryLookupDone] = useState<Record<string, boolean>>({});
  const [reviewsDoneToday, setReviewsDoneToday] = useState(0);
  /** Current UTC day (YYYY-MM-DD); rolls over at midnight while the screen is open. */
  const [utcDay, setUtcDay] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const timer = setTimeout(() => {
      setUtcDay(new Date().toISOString().slice(0, 10));
    }, msUntilNextUtcDay());
    return () => clearTimeout(timer);
  }, [utcDay]);

  const reviewCounterKey = user?.id
    ? dailyReviewCounterKey(user.id, Date.parse(`${utcDay}T00:00:00Z`))
    : null;

  useEffect(() => {
    if (!reviewCounterKey) return;
    AsyncStorage.getItem(reviewCounterKey)
      .then((v) => setReviewsDoneToday(Number(v ?? 0)))
      .catch(() => {});
  }, [reviewCounterKey]);

  /** Previous card SRS state saved before a rating, used by the Undo action. */
  const undoRef = useRef<UndoState | null>(null);
  /** Track the current card's word info to detect unsave/advance changes. */
  const lastCardInfoRef = useRef<{ id: string; head: string } | null>(null);
  /** Log the loaded deck once per language + user. */
  const deckLoggedKeyRef = useRef<string | null>(null);

  // ── Auto-initialize SRS cards for saved words that don't have them ──
  // The blue ("new") deck always holds the `dailyNewLimit` most recently saved
  // words that haven't been rated yet. Newly saved words displace the oldest
  // blue cards when the deck is full (their cards are removed and re-queued).
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const plan = fsrs.planNewDeck(l2SavedWords, langCards, dailyNewLimit);

    // Push back: drop blue cards that fell outside the newest `dailyNewLimit`.
    for (const id of plan.toRemove) {
      removeCard(l2Code, id);
    }

    // Introduce: create due-now cards for the newest unrated words lacking one.
    if (plan.toCreate.length > 0) {
      setInitializing(true);
      for (const id of plan.toCreate) {
        updateCard(l2Code, id, fsrs.newCard());
      }
      setTimeout(() => setInitializing(false), 100);
    }
  }, [srsLoaded, wordsLoaded, l2SavedWords, store, l2Code, dailyNewLimit, updateCard, removeCard]);

  // ── Prune orphaned SRS cards ──
  // Cards only make sense for words that are still saved; unsaving through
  // any path must not let a stale card resurrect later.
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;
    if (l2SavedWords.length === 0) {
      pruneOrphans(l2Code, new Set<string>());
      return;
    }
    pruneOrphans(l2Code, new Set(l2SavedWords.map((sw) => sw.id)));
  }, [srsLoaded, wordsLoaded, l2SavedWords, l2Code, pruneOrphans]);

  // ── Compute due cards ──
  const dueCards = useMemo(() => {
    const now = Date.now();
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    return l2SavedWords
      .filter((sw) => {
        const srs = langCards[sw.id];
        if (!srs) return false;
        return srs.due <= now;
      })
      .sort((a, b) => {
        const sa = langCards[a.id];
        const sb = langCards[b.id];
        if (!sa || !sb) return 0;
        return sa.due - sb.due;
      });
  }, [l2SavedWords, store, l2Code]);

  // ── Derive entry for the current card from the reactive ID cache ──
  const currentDueCard = dueCards[currentIndex];
  const wordForm = currentDueCard?.forms?.[0] || currentDueCard?.head || currentDueCard?.id || '';
  // The ID cache stores entries by their raw `entry.id` from the dictionary
  // API response — EDICT entries use bare numeric IDs ("73458"), LLM entries
  // use their full ID ("ja-03254ca173ab"). Both are stored as-is, so the
  // saved word's raw `id` field is the correct cache key.
  const currentEntry =
    useEntryByIdCache(l2Code, currentDueCard?.id ?? '') ??
    currentDueCard?.canonicalEntry ??
    null;

  // ── Offline-first entry hydration for the current card ──
  // Old cards often have no shared-cache entry (they were never enriched
  // online); without this the "Show definition" panel spins forever offline.
  useEffect(() => {
    const id = currentDueCard?.id;
    if (!id) return;
    if (getCachedEntryById(l2Code, id)) return;
    if (currentDueCard?.canonicalEntry) {
      setCachedEntryById(l2Code, currentDueCard.canonicalEntry);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const entry = await getOfflineEntryById(l2Code.split('-')[0], id);
        if (!cancelled && entry) {
          setCachedEntryById(l2Code, entry);
        }
      } catch {
        // Offline dict missing/corrupt — leave unresolvable.
      }
      if (!cancelled) {
        setOfflineEntryLookupDone((prev) => ({ ...prev, [id]: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [currentDueCard?.id, currentDueCard?.canonicalEntry, l2Code]);

  // ── Merge due cards with the reactive entry ──
  const cards = useMemo(() => dueCards.map((word) => ({
    word,
    srs: (store.cards[l2Code] ?? {})[word.id] || fsrs.newCard(),
    entry: word.id === currentDueCard?.id ? currentEntry : null,
  })), [dueCards, store, l2Code, currentDueCard?.id, currentEntry]);

  // ── Handlers ──

  /** Reveal the definition + translation for the current card. */
  const handleReveal = useCallback(() => {
    const card = cards[currentIndex];
    log('[srs] reveal', {
      wordId: card?.word.id,
      head: card ? wordLabel(card.word) : undefined,
      index: currentIndex,
      totalCards: cards.length,
    });
    setShowTabs(true);
  }, [cards, currentIndex]);

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    if (!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP) return;
    setRated(true);

    const card = cards[currentIndex];
    if (!card) {
      setRated(false);
      return;
    }

    // Save state for undo
    const wasLastCard = currentIndex >= cards.length - 1;
    undoRef.current = {
      wordId: card.word.id,
      head: wordLabel(card.word),
      prevSrs: { ...card.srs },
      wasLastCard,
    };

    // Apply FSRS schedule
    const updated = fsrs.rate(card.srs, quality);
    updated.ratingId = newRatingId(user?.id, card.word.id);
    updated.rating = quality;
    undoRef.current.ratingId = updated.ratingId;
    log('[srs] mark', {
      quality,
      wordId: card.word.id,
      head: wordLabel(card.word),
      index: currentIndex,
      totalCards: cards.length,
      prev: { ...card.srs },
      next: { ...updated },
    });
    updateCard(l2Code, card.word.id, updated);

    if (!isPro) {
      const next = reviewsDoneToday + 1;
      setReviewsDoneToday(next);
      if (reviewCounterKey) {
        AsyncStorage.setItem(reviewCounterKey, String(next)).catch(() => {});
      }
    }

    if (wasLastCard) {
      log('[srs] complete', {
        wordId: card.word.id,
        head: wordLabel(card.word),
        quality,
      });
      setJustCompleted(true);
    }

    // Show toast with undo button (matches web behavior)
    const label = RATING_LABELS.find((r) => r.key === quality);
    if (label) {
      Toast.show({
        type: 'info',
        visibilityTime: 3000,
        position: 'top',
        props: { quality, label, undoLabel: t('action.undo'), handleUndo: () => handleUndo() },
      });
    }

    // Brief pause so the user sees the settled card before buttons reappear.
    // No index advancement needed — updateCard mutates the store, which
    // recomputes dueCards with the rated card filtered out. The array
    // shifts left, so currentIndex naturally points to the next card.
    setTimeout(() => {
      setRated(false);
    }, 600);
  }, [cards, currentIndex, rated, updateCard, l2Code, t, isPro, reviewsDoneToday, reviewCounterKey]);

  /** Undo the most recent rating — restores the card's previous SRS state. */
  const handleUndo = useCallback(() => {
    const state = undoRef.current;
    if (!state) return;

    log('[srs] undo', { wordId: state.wordId, head: state.head });
    updateCard(l2Code, state.wordId, {
      ...state.prevSrs,
      ...(state.ratingId ? { voidRatingId: state.ratingId } : {}),
    });

    // Release the rating back to the free daily budget (SPEC-066 Phase 4).
    if (!isPro && reviewsDoneToday > 0) {
      const next = reviewsDoneToday - 1;
      setReviewsDoneToday(next);
      if (reviewCounterKey) {
        AsyncStorage.setItem(reviewCounterKey, String(next)).catch(() => {});
      }
    }

    if (state.wasLastCard) {
      setJustCompleted(false);
    }

    // Reset currentIndex so the undone card reappears at the top
    setCurrentIndex(0);
    setRated(false);
    undoRef.current = null;
  }, [l2Code, updateCard, isPro, reviewsDoneToday, reviewCounterKey]);

  // ── Clamp currentIndex if it exceeds the cards array (cards shrunk after removal) ──
  useEffect(() => {
    if (cards.length > 0 && currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex]);

  // ── When card changes (rate/unsave), log the advance ──
  useEffect(() => {
    const card = cards[currentIndex];
    const currentId = card?.word.id ?? null;
    const currentHead = card ? wordLabel(card.word) : '';
    const prev = lastCardInfoRef.current;

    if (prev === null) {
      lastCardInfoRef.current = currentId ? { id: currentId, head: currentHead } : null;
      return;
    }

    const prevStillSaved = l2SavedWords.some((w) => w.id === prev.id);
    if (!prevStillSaved) {
      log('[srs] unsave', {
        wordId: prev.id,
        head: prev.head,
        remainingCards: cards.length,
      });
      if (currentId) {
        log('[srs] advance', {
          wordId: currentId,
          head: currentHead,
          index: currentIndex,
          remainingCards: cards.length,
        });
        lastCardInfoRef.current = { id: currentId, head: currentHead };
      } else {
        lastCardInfoRef.current = null;
      }
      return;
    }

    if (currentId && currentId !== prev.id) {
      log('[srs] advance', {
        wordId: currentId,
        head: currentHead,
        index: currentIndex,
        remainingCards: cards.length,
      });
      lastCardInfoRef.current = { id: currentId, head: currentHead };
    }
  }, [cards, currentIndex, rated, l2SavedWords]);

  // ── Reset justCompleted when new cards become due ──
  useEffect(() => {
    if (cards.length > 0 && justCompleted) {
      setJustCompleted(false);
      setCurrentIndex(0);
    }
  }, [cards.length, justCompleted]);

  // ── Reset state when card changes ──
  useEffect(() => {
    const card = cards[currentIndex];
    setContextTranslation(null);
    setL1Entry(null);
    setShowTabs(false);
    if (!card) return;
    const rawInstances = (card.word as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined;
    const instances = (rawInstances ?? (card.word.context ? [{ timestamp: card.word.date ?? 0, form: card.word.forms?.[0] ?? '', context: card.word.context as unknown as SavedWordContext }] : []))
      .filter((inst) => !!inst.context?.text);
    log('[srs] context-loaded', {
      wordId: card.word.id,
      head: wordLabel(card.word),
      count: instances.length,
      hasSavedTranslation: instances.some((inst) => !!inst.context.translation),
    });
  }, [cards[currentIndex]?.word.id]);

  // ── Auto-translate context text (if no saved translation) ──
  useEffect(() => {
    if (!display.translation) return;

    const card = cards[currentIndex];
    const ctxText = card?.word.context?.text;
    const savedTranslation = card?.word.context?.translation;
    if (!ctxText || savedTranslation) {
      setContextTranslation(null);
      return;
    }

    let cancelled = false;
    const fetchTranslation = async () => {
      try {
        const res = await fetch(`${PYTHON_API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ctxText, l1: baseCode(l1Lang.code), l2: l2Code }),
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const translated = data?.translated_text ?? data?.translation ?? data?.text ?? null;
          setContextTranslation(translated);
          if (translated) {
            log('[srs] context-translation-loaded', {
              wordId: card.word.id,
              head: wordLabel(card.word),
              source: 'api',
              length: translated.length,
            });
          }
        }
      } catch { /* network error — silently ignore */ }
    };
    fetchTranslation();
    return () => { cancelled = true; };
  }, [cards, currentIndex, l2Code, l1Lang.code, display.translation]);

  // ── Per-card L1 dictionary lookup (non-English L1 users) ──
  // The batched lookup returns English-only definitions for speed; on reveal,
  // fetch the L1-translated entry so the card back shows the user's language.
  useEffect(() => {
    if (!showTabs || l1Lang.code === 'en') return;
    const card = cards[currentIndex];
    if (!card) return;
    const form = card.word.forms?.[0] || card.word.head || card.word.id;
    if (l1Entry?.id === card.word.id) return;

    const cached = getL1CachedEntry(l2Code, l1Lang.code, card.word.id);
    if (cached) {
      setL1Entry(cached);
      return;
    }

    let cancelled = false;
    lookupL1Text(form, l2Code, l1Lang.code)
      .then((results) => {
        if (cancelled) return;
        const match = results.find((e) => e.id === card.word.id) ?? results[0] ?? null;
        setL1Entry(match);
      })
      .catch(() => {
        // Silently fall back to the cached/offline entry.
      });
    return () => { cancelled = true; };
  }, [showTabs, currentIndex, cards, l1Lang.code, l2Code, l1Entry?.id]);

  // ── Pre-tokenize + pre-lookup the next 3 cards' context sentence(s) ──
  const preWarmInstances = useMemo(() => {
    const result: Array<{ text: string; l2Code: string; l1Code: string }> = [];
    for (let i = 1; i <= 3; i++) {
      const card = cards[currentIndex + i];
      if (!card) break;
      const cardInstances = ((card.word as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined) ?? (
        card.word.context
          ? [{ timestamp: card.word.date ?? 0, form: card.word.forms?.[0] ?? '', context: card.word.context as unknown as SavedWordContext }]
          : []
      );
      for (const inst of cardInstances) {
        if (inst.context?.text) {
          result.push({ text: inst.context.text, l2Code, l1Code: l1Lang.code });
        }
      }
    }
    return result;
  }, [currentIndex, cards, l2Code, l1Lang.code]);

  // ── Pre-warm the current card's dictionary entry ──
  useEffect(() => {
    if (!wordForm) return;
    enqueueLookupWords(
      [{ text: wordForm, l2Code }],
      PYTHON_API_URL,
    );
  }, [currentIndex, l2Code, wordForm]);

  // ── Pre-warm tokenization + dictionary cache for upcoming cards ──
  useEffect(() => {
    for (const ctx of preWarmInstances) {
      // Step 1: pre-tokenize (populates the in-memory lemmatizeText cache)
      lemmatizeText(ctx.text, ctx.l2Code).then((tokens: LemmatizedToken[]) => {
        // Step 2: pre-lookup definitions for all unique lemmas
        const uniqueLemmas = [...new Set(
          tokens.flatMap(t => t.lemmas.map(l => l.lemma).filter(Boolean))
        )];
        if (uniqueLemmas.length > 0) {
          enqueueLookupWords(
            uniqueLemmas.map(text => ({ text, l2Code: ctx.l2Code })),
            PYTHON_API_URL,
          );
        }
      });
    }
  }, [preWarmInstances]);

  // ── Reset session state when language changes ──
  useEffect(() => {
    setJustCompleted(false);
    setCurrentIndex(0);
    undoRef.current = null;
    lastCardInfoRef.current = null;
    deckLoggedKeyRef.current = null;
  }, [l2Code]);

  // ── Anki-style card counts (new / again / review) ──
  const langCardsForCounts = store.cards[l2Code] ?? {};
  const cardCounts = useMemo(
    () => fsrs.countDeckStates(l2SavedWords, langCardsForCounts),
    [l2SavedWords, langCardsForCounts],
  );

  // ── Render states ──

  const isLoading = !wordsLoaded || !srsLoaded || initializing || (user && !cloudHydrated);

  // ── Log the loaded review deck once per language ──
  useEffect(() => {
    const deckKey = `${l2Code}:${user?.id ?? 'anon'}`;
    if (isLoading || deckLoggedKeyRef.current === deckKey) return;
    deckLoggedKeyRef.current = deckKey;
    log('[srs] loaded', {
      l2: l2Code,
      savedWords: l2SavedWords.length,
      dueCards: cards.length,
      newCards: cardCounts.newCount,
      againCards: cardCounts.againCount,
      reviewCards: cardCounts.reviewCount,
    });
  }, [isLoading, l2Code, user?.id, l2SavedWords.length, cards.length, cardCounts]);

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
        <Pressable
          onPress={() => router.push('/(tabs)/(media)' as any)}
          className="rounded-lg bg-primary px-5 py-2.5 active:bg-primary/80"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {t('action.explore_videos')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // All done — just finished reviewing all due cards
  if (justCompleted) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.due > Date.now())
      .sort((a, b) => a.due - b.due)[0];

    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <CheckCircle2 size={56} color={ICON_PRIMARY} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.all_done_for_now')}</Text>
        <Text className="mb-4 text-center text-muted-foreground">
          {t('msg.all_done_desc')}
          {nextDue && (
            <>{' '}{t('msg.next_review')}: {new Date(nextDue.due).toLocaleDateString()}.</>
          )}
        </Text>
        {fsrs.remainingNewCardsToday(l2SavedWords, langCards) === 0 && (
          <Text className="mb-2 text-center text-sm text-muted-foreground">
            {t('msg.no_more_new_cards_today')}
          </Text>
        )}
        <Pressable
          onPress={() => router.push('/(tabs)/(media)' as any)}
          className="rounded-lg bg-primary px-5 py-2.5 active:bg-primary/80"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {t('action.explore_videos')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // No due cards right now
  if (cards.length === 0) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.due > Date.now())
      .sort((a, b) => a.due - b.due)[0];

    const unscheduledCount = l2SavedWords.filter((sw) => !langCards[sw.id]).length;
    const queued = unscheduledCount > 0;

    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <BookOpen size={48} color={ICON_MUTED} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.no_cards_due')}</Text>
        <Text className="mb-4 text-center text-muted-foreground">
          {t('msg.no_cards_due_desc', { total: Object.keys(langCards).length, deck: l2Lang.name })}
          {nextDue ? (
            <> {t('msg.next_review_date', { date: new Date(nextDue.due).toLocaleDateString() })}</>
          ) : (
            <> {t('msg.save_more_words')}</>
          )}
          {queued && (
            <> {unscheduledCount} {t('msg.more_queued', { count: unscheduledCount })}</>
          )}
        </Text>
        {fsrs.remainingNewCardsToday(l2SavedWords, langCards) === 0 && (
          <Text className="mb-2 text-center text-sm text-muted-foreground">
            {t('msg.no_more_new_cards_today')}
          </Text>
        )}
        <Pressable
          onPress={() => router.push('/(tabs)/(media)' as any)}
          className="rounded-lg bg-primary px-5 py-2.5 active:bg-primary/80"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {t('action.explore_videos')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;
  const currentCardState = fsrs.getCardState(currentCard.srs);

  const entry = l1Entry ?? currentEntry;
  const savedWord = currentCard.word;
  const savedWordInstances = (savedWord as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined;
  const instances = (savedWordInstances ?? (savedWord.context ? [{ timestamp: savedWord.date ?? 0, form: savedWord.forms?.[0] ?? '', context: savedWord.context as unknown as SavedWordContext }] : []))
    // Old records store an empty default context instance — skip it so the
    // review card doesn't render a dead "…" trigger that copies nothing.
    .filter((inst) => !!inst.context?.text);
  const srs = currentCard.srs;

  return (
    <PageContainer maxWidth="2xl">
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
              <Text className={`text-xs text-blue-600 ${currentCardState === 'new' ? 'underline' : ''}`}>{cardCounts.newCount}</Text>
            </View>
          )}
          {cardCounts.againCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-red-500" />
              <Text className={`text-xs text-red-600 ${currentCardState === 'learning' || currentCardState === 'relearning' ? 'underline' : ''}`}>{cardCounts.againCount}</Text>
            </View>
          )}
          {cardCounts.reviewCount > 0 && (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-green-500" />
              <Text className={`text-xs text-green-600 ${currentCardState === 'review' ? 'underline' : ''}`}>{cardCounts.reviewCount}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Flashcard — only as tall as content, max height fills remaining space */}
      <View className="px-4 mb-2 flex-1">
        <View className={`max-h-full rounded-xl border border-border bg-card ${isSm ? 'p-8' : 'p-4'}`}>
          <ScrollView>
            {/* Context sentences — loop over saved word instances */}
          {instances.length === 0 ? (
            /* No saved context (e.g. word saved from dictionary search):
               show the headword itself so the reviewer knows what's being
               tested. */
            <View className="mb-3 rounded-lg bg-muted/50 p-3">
              <Text className="text-center text-2xl font-bold text-foreground">
                {wordForm}
              </Text>
            </View>
          ) : instances.map((inst, idx) => (
            <View key={inst.timestamp?.toString() ?? idx} className="mb-3 rounded-lg bg-muted/50 p-3">
              {instances.length > 1 && (
                <Text className="mb-1 text-[10px] font-medium text-muted-foreground/70">
                  {t('review.context_label')} {idx + 1}
                </Text>
              )}
              <TextActionMenu text={inst.context.text} l2Code={l2Code} l1Code={baseCode(l1Lang.code)}>
                <TokenizedText
                  text={inst.context.text}
                  l2Code={l2Code}
                  highlightTerms={[inst.form]}
                  phoneticsOnHighlight={showTabs}
                />
              </TextActionMenu>
              <View className="mt-1">
                <SavedWordSource context={inst.context} date={inst.timestamp ?? savedWord.date} locale={baseCode(l1Lang.code)} />
              </View>
              {showTabs && display.translation && (inst.context.translation || contextTranslation) && (
                <View className="mt-2 border-t border-border pt-2">
                  <Text className="text-xs leading-relaxed text-muted-foreground">
                    <Text className="font-semibold text-primary">
                      {inst.form}
                    </Text>
                    {renderTranslation(inst.context.translation ?? contextTranslation ?? '', inst.form)}
                  </Text>
                </View>
              )}
            </View>
          ))}

          {/* SRS info (compact) */}
          <Text className="mb-4 text-center text-xs text-muted-foreground">
            {srs.state === 0 ? t('review.srs_new') : fsrs.srsDueLabel(srs)}
            {srs.reps > 0 && (
              <>{' · '}{t('review.srs_review', { count: srs.reps })}</>
            )}
          </Text>

          {/* Toggle button for definition + translation — hidden once shown */}
          {!showTabs && (
            <Pressable
              onPress={handleReveal}
              className="mb-2 rounded-lg border border-border py-1.5 active:bg-muted"
            >
              <Text className="text-center text-xs text-muted-foreground">
                {t('review.show_definition')}
              </Text>
            </Pressable>
          )}

          {/* Matched entry card — full with tabs (no double border inside card) */}
          {showTabs && (
            <View className="mb-2">
              {entry ? (
                <DictionaryEntryTabs
                  entry={entry}
                  showDefinitionTab
                  embedded
                  l2Code={l2Lang.code}
                  contextText={instances[0]?.context?.text}
                  contextForm={wordForm}
                />
              ) : offlineEntryLookupDone[currentCard.word.id] ? (
                <View className="items-center justify-center py-8">
                  <Text className="text-sm text-muted-foreground">
                    {dictAvailable === false
                      ? t('msg.offline_dictionary_required')
                      : t('msg.no_definition_offline')}
                  </Text>
                </View>
              ) : (
                <View className="items-center justify-center py-8">
                  <ActivityIndicator size="small" color={ICON_MUTED} />
                </View>
              )}
            </View>
          )}
          </ScrollView>
        </View>
      </View>

      {/* Rating buttons — pinned to bottom with safe area */}
      {!rated && (
        <View className="px-4" style={{ paddingBottom: insets.bottom + 8 }}>
          {!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP && (
            <View className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 items-center">
              <Text className="text-sm text-center font-medium text-foreground">
                {t('msg.upgrade_to_pro_banner')}
              </Text>
              <Pressable onPress={() => router.push('/(tabs)/(me)/go-pro' as any)} className="mt-1">
                <Text className="text-sm font-semibold text-primary underline">
                  {t('action.upgrade_to_pro')}
                </Text>
              </Pressable>
            </View>
          )}
          <View className="flex-row gap-2">
            {RATING_LABELS.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => handleRate(r.key)}
                disabled={!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP}
                className="flex-1 items-center rounded-lg py-3"
                style={{ backgroundColor: RATING_ICON_COLORS[r.key], opacity: !isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP ? 0.5 : 1 }}
              >
                <Text className="text-xs font-bold text-white">{r.label}</Text>
                <Text className="mt-0.5 text-[10px] text-white/70">{r.hint}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </PageContainer>
  );
}
