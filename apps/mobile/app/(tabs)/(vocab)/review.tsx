import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSavedWords } from '@/hooks/use-saved-words';
import { useSrs } from '@/hooks/use-srs';
import { sm2, newCard, isNewCard, planNewDeck, baseCode } from '@langplayer/utils';
import { useEntryCache, useEntryByIdCache } from '@langplayer/utils/src/use-entry-cache';
import type { SrsFields } from '@langplayer/utils';
import { useT } from '@/hooks/use-t';
import { useResponsive } from '@/hooks/use-responsive';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import Toast from 'react-native-toast-message';
import { CheckCircle2, BookOpen } from 'lucide-react-native';
import { SavedWordSource } from '@/components/dictionary/SavedWordSource';
import { DictionaryEntryTabs } from '@/components/dictionary/DictionaryEntryTabs';
import { TokenizedText } from '@/components/TokenizedText';
import { TextActionMenu } from '@/components/TextActionMenu';
import { lemmatizeText } from '@/lib/tokenizer';
import { enqueueLookupWords } from '@/lib/dictionary-cache';
import type { DictionaryEntry, LemmatizedToken, SavedWordContext } from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';
import { PYTHON_API_URL } from '@/lib/api-url';

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

export default function ReviewScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();
  const { isSm } = useResponsive();

  const { savedWords, loaded: wordsLoaded, removeWord } = useSavedWords();
  const { store, loaded: srsLoaded, updateCard, removeCard } = useSrs();
  const { review, display } = useSettingsContext();
  const dailyNewLimit = review.dailyNewLimit;
  const insets = useSafeAreaInsets();

  const RATING_LABELS = useRatingLabels();

  const l2Code = l2Lang.code;
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [rated, setRated] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [initializing, setInitializing] = useState(false);
  /** Auto-translated context text (fetched on-demand when no saved translation exists). */
  const [contextTranslation, setContextTranslation] = useState<string | null>(null);
  const [showTabs, setShowTabs] = useState(false);

  /** Previous card SRS state saved before a rating, used by the Undo action. */
  const undoRef = useRef<UndoState | null>(null);
  /** Track the current card's word ID to detect unsave-triggered card changes. */
  const lastCardIdRef = useRef<string | null>(null);

  // ── Auto-initialize SRS cards for saved words that don't have them ──
  // The blue ("new") deck always holds the `dailyNewLimit` most recently saved
  // words that haven't been rated yet. Newly saved words displace the oldest
  // blue cards when the deck is full (their cards are removed and re-queued).
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const plan = planNewDeck(l2SavedWords, langCards, dailyNewLimit);

    // Push back: drop blue cards that fell outside the newest `dailyNewLimit`.
    for (const id of plan.toRemove) {
      removeCard(l2Code, id);
    }

    // Introduce: create due-now cards for the newest unrated words lacking one.
    if (plan.toCreate.length > 0) {
      setInitializing(true);
      for (const id of plan.toCreate) {
        const card = newCard();
        card.nextReview = Date.now(); // due now
        updateCard(l2Code, id, card);
      }
      setTimeout(() => setInitializing(false), 100);
    }
  }, [srsLoaded, wordsLoaded, l2SavedWords, store, l2Code, dailyNewLimit, updateCard, removeCard]);

  // ── Compute due cards ──
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

  // ── Derive entry for the current card from the reactive ID cache ──
  const currentDueCard = dueCards[currentIndex];
  const wordForm = currentDueCard?.forms?.[0] || currentDueCard?.head || currentDueCard?.id || '';
  // The ID cache stores entries by their raw `entry.id` from the dictionary
  // API response — EDICT entries use bare numeric IDs ("73458"), LLM entries
  // use their full ID ("ja-03254ca173ab"). Both are stored as-is, so the
  // saved word's raw `id` field is the correct cache key.
  const currentEntry = useEntryByIdCache(l2Code, currentDueCard?.id ?? '') ?? null;

  // ── Merge due cards with the reactive entry ──
  const cards = useMemo(() => dueCards.map((word) => ({
    word,
    srs: (store.cards[l2Code] ?? {})[word.id] || newCard(),
    entry: word.id === currentDueCard?.id ? currentEntry : null,
  })), [dueCards, store, l2Code, currentDueCard?.id, currentEntry]);

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
  }, [cards, currentIndex, rated, updateCard, l2Code, t]);

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

  // ── Reset state when card changes ──
  useEffect(() => {
    setContextTranslation(null);
    setShowTabs(false);
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
          setContextTranslation(data?.translated_text ?? data?.translation ?? data?.text ?? null);
        }
      } catch { /* network error — silently ignore */ }
    };
    fetchTranslation();
    return () => { cancelled = true; };
  }, [cards, currentIndex, l2Code, l1Lang.code, display.translation]);

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
  }, [l2Code]);

  // ── Anki-style card counts (new / again / review) ──
  const cardCounts = useMemo(() => {
    let newCount = 0;
    let againCount = 0;
    let reviewCount = 0;
    for (const c of cards) {
      if (c.srs.repetitions >= 1) {
        reviewCount++;
      } else if (isNewCard(c.srs)) {
        newCount++;
      } else {
        againCount++;
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
    const queued = unscheduledCount > 0;

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
        </Text>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;

  const entry = currentEntry;
  const savedWord = currentCard.word;
  const savedWordInstances = (savedWord as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined;
  const instances = savedWordInstances ?? (savedWord.context ? [{ timestamp: savedWord.date ?? 0, form: savedWord.forms?.[0] ?? '', context: savedWord.context as unknown as SavedWordContext }] : []);
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

      {/* Flashcard — only as tall as content, max height fills remaining space */}
      <View className="px-4 mb-2 flex-1">
        <View className={`max-h-full rounded-xl border border-border bg-card ${isSm ? 'p-8' : 'p-4'}`}>
          <ScrollView>
            {/* Context sentences — loop over saved word instances */}
          {instances.map((inst, idx) => (
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
            {srs.interval > 0 ? `${srs.interval}d` : t('review.srs_new')}
            {srs.repetitions > 0 && (
              <>{' · '}{srs.ease.toFixed(1)}x{' · '}{t('review.srs_review', { count: srs.repetitions })}</>
            )}
          </Text>

          {/* Toggle button for definition + translation — hidden once shown */}
          {!showTabs && (
            <Pressable
              onPress={() => setShowTabs(true)}
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
        <View className="flex-row gap-2 px-4" style={{ paddingBottom: insets.bottom + 8 }}>
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
