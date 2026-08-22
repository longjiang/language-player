import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
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
  formatNextDueLabel,
  getNextReviewInterval,
  dayKey,
  msUntilNextDay,
  deviceTimezone,
  newRatingId,
  buildSrsQuestionPrompt,
  needsPronunciationTest,
  scoreTestAnswer,
  testScoreToRating,
  type SrsTestQuestion,
  normalizeTestChoice,
  parseSrsQuestionResponse,
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
  getL1CachedEntry,
  setL1CachedEntry,
  setCachedEntryById,
} from '@/lib/dictionary-cache';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { useOfflineDictionaryAvailable } from '@/hooks/use-offline-dictionary';
import { lookupL1Text } from '@/lib/l1-lookup';
import {
  decomposeWordId,
  isSameEntryId,
  type DictionaryEntry,
  type LemmatizedToken,
  type SavedWordContext,
} from '@langplayer/shared';
import { PageContainer } from '@/components/layout/PageContainer';
import { PYTHON_API_URL } from '@/lib/api-url';
import { srsLogger } from '@/lib/logger';

const { log } = srsLogger;

type Rating = 'again' | 'hard' | 'good' | 'easy';

type TestAnswer = { answer: string; correct: boolean; score: 1 | 2 | 3 | 4 };

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
 * Render an on-the-fly context translation (web parity, SPEC-066).
 * The /translate endpoint receives `form` and wraps the target term in
 * `**bold**`; split on the markers so the term shows in primary color inside
 * the sentence instead of being prepended manually.
 */
function ReviewTranslationMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text className="text-xs leading-relaxed text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <Text key={i} className="font-semibold text-primary">
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}

/** Human-friendly label for a saved word (surface form > headword > id). */
function wordLabel(word: { id: string; head?: string; forms?: string[] }): string {
  return word.forms?.[0] || word.head || word.id;
}

/** First real dictionary-lookup form for a saved word (skips legacy "?"). */
function firstLookupForm(word: {
  id: string;
  head?: string;
  forms?: string[];
  context?: { form?: string };
  instances?: Array<{ form?: string }>;
}): string {
  const candidates = [
    ...(word.forms ?? []),
    word.head,
    word.context?.form,
    ...(word.instances ?? []).map((i) => i.form),
  ];
  return candidates.find((f) => typeof f === 'string' && !!f && f !== '?') ?? word.id;
}

export default function ReviewScreen() {
  const { l1Lang, l2Lang } = useLanguage();
  const { user } = useAuth();
  const t = useT();
  const router = useRouter();
  const { isSm } = useResponsive();
  const { isPro } = useSubscription();

  const { savedWords, loaded: wordsLoaded, cloudHydrated: savedWordsCloudHydrated } = useSavedWords();
  const {
    store,
    loaded: srsLoaded,
    cloudHydrated: srsCloudHydrated,
    capReached: srsCapReached,
    resetCapReached,
    updateCard,
    removeCard,
    pruneOrphans,
  } = useSrs();
  const { loaded: settingsLoaded, cloudHydrated: settingsCloudHydrated, review, display, offlineMode } = useSettingsContext();
  const dailyNewLimit = review.dailyNewLimit;
  const dayStartHour = review.dayStartHour;
  const srsCardMeta = useMemo(
    () => ({ timezone: deviceTimezone(), dayStartHour }),
    [dayStartHour],
  );
  const insets = useSafeAreaInsets();

  const RATING_LABELS = useRatingLabels();

  const l2Code = l2Lang.code;
  const dictAvailable = useOfflineDictionaryAvailable(l2Code);
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<'recall' | 'test'>('recall');
  const [testError, setTestError] = useState<string | null>(null);
  const testAutoLoadKeyRef = useRef<string | null>(null);
  const testRequestVersionRef = useRef(0);
  const testActiveRequestRef = useRef<number | null>(null);
  const changeReviewMode = useCallback((mode: 'recall' | 'test') => {
    testRequestVersionRef.current += 1;
    testActiveRequestRef.current = null;
    setReviewMode(mode);
    AsyncStorage.setItem('lp:srs-review-mode', mode).catch(() => {});
    setTestQuestions([]);
    setTestAnswers([]);
    setTestStartedAt(null);
    testAutoLoadKeyRef.current = null;
    setShowTabs(false);
    setTestError(null);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('lp:srs-review-mode').then((mode) => {
      if (mode === 'test' || mode === 'recall') setReviewMode(mode);
    }).catch(() => {});
  }, []);
  const [testQuestions, setTestQuestions] = useState<SrsTestQuestion[]>([]);
  const [testAnswers, setTestAnswers] = useState<TestAnswer[]>([]);
  const [testQuestionIndex, setTestQuestionIndex] = useState(0);
  const [testStartedAt, setTestStartedAt] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testAnswered, setTestAnswered] = useState(false);
  const [testSelectedAnswer, setTestSelectedAnswer] = useState<string | null>(null);
  const [testAnswerCorrect, setTestAnswerCorrect] = useState<boolean | null>(null);
  const [testScores, setTestScores] = useState<number[]>([]);
  const [suggestedRating, setSuggestedRating] = useState<Rating | null>(null);
  const [rated, setRated] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [initializing, setInitializing] = useState(false);
  /** Auto-translated context text (fetched on-demand when no saved translation exists). */
  const [contextTranslation, setContextTranslation] = useState<string | null>(null);
  const [showTabs, setShowTabs] = useState(false);
  /** L1-translated dictionary entry, fetched on reveal for non-English L1. */
  const [l1Entry, setL1Entry] = useState<DictionaryEntry | null>(null);
  /** Best text-lookup entry when the exact saved id is stale/unresolvable. */
  const [fallbackEntry, setFallbackEntry] = useState<DictionaryEntry | null>(null);
  /** Cards whose offline entry lookup already finished (even with a miss). */
  const [offlineEntryLookupDone, setOfflineEntryLookupDone] = useState<Record<string, boolean>>({});
  const [reviewsDoneToday, setReviewsDoneToday] = useState(0);
  /** Current local day (YYYY-MM-DD); rolls over at the configured hour. */
  const [day, setDay] = useState(() => dayKey(Date.now(), dayStartHour));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDay(dayKey(Date.now(), dayStartHour));
    }, msUntilNextDay(Date.now(), dayStartHour));
    return () => clearTimeout(timer);
  }, [day, dayStartHour]);

  const reviewCounterKey = user?.id
    ? dailyReviewCounterKey(user.id, Date.now(), dayStartHour)
    : null;

  useEffect(() => {
    if (!reviewCounterKey) return;
    AsyncStorage.getItem(reviewCounterKey)
      .then((v) => setReviewsDoneToday(Number(v ?? 0)))
      .catch(() => {});
  }, [reviewCounterKey]);

  // Backend cap rejection (e.g. another device already used today's free
  // quota) reconciles the local counter and shows the upgrade banner.
  useEffect(() => {
    if (!srsCapReached) return;
    setReviewsDoneToday(FREE_SRS_DAILY_CAP);
    if (reviewCounterKey) {
      AsyncStorage.setItem(reviewCounterKey, String(FREE_SRS_DAILY_CAP)).catch(() => {});
    }
  }, [srsCapReached, reviewCounterKey]);

  // A new local day resets the cap-rejection flag so reviews can resume.
  useEffect(() => {
    resetCapReached();
  }, [day, resetCapReached]);

  /** Previous card SRS state saved before a rating, used by the Undo action. */
  const undoRef = useRef<UndoState | null>(null);
  /** Track the current card's word info to detect unsave/advance changes. */
  const lastCardInfoRef = useRef<{ id: string; head: string } | null>(null);
  /** Log the loaded deck once per language + user. */
  const deckLoggedKeyRef = useRef<string | null>(null);

  // ── Auto-initialize SRS cards up to today's new-card budget ──
  // The blue ("new") deck holds at most `dailyNewLimit` new cards per local day.
  // Once today's budget is used, rated cards are not replaced until tomorrow.
  useEffect(() => {
    if (!settingsLoaded || !settingsCloudHydrated || !srsLoaded || !wordsLoaded) return;
    // Never auto-create cards from stale local state before the server's SRS
    // cards have been fetched (SPEC-066): a "new" card minted here can
    // overwrite a rated card from another device.
    if (user && !srsCloudHydrated) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const budget = fsrs.getNewCardBudget(
      l2SavedWords,
      langCards,
      dailyNewLimit,
      Date.now(),
      dayStartHour,
    );
    const candidates = fsrs.countNewCardCandidates(l2SavedWords, langCards);
    const plan = fsrs.planNewDeck(
      l2SavedWords,
      langCards,
      dailyNewLimit,
      Date.now(),
      dayStartHour,
    );
    log('[srs] planNewDeck', {
      l2: l2Code,
      dailyNewLimit,
      dayStartHour,
      day,
      now: new Date().toISOString(),
      savedWords: l2SavedWords.length,
      cards: Object.keys(langCards).length,
      introducedToday: budget.introducedToday,
      olderUnrated: budget.olderUnrated,
      remaining: budget.remaining,
      candidates,
      toCreate: plan.toCreate.length,
      inactiveNewCards: plan.toRemove.length,
    });
    const introduced = Object.entries(langCards)
      .filter(([, c]) => c.createdAt >= budget.dayStart)
      .map(([id, c]) => ({
        id,
        state: fsrs.getCardState(c),
        createdAt: new Date(c.createdAt).toISOString(),
        lastReview: c.lastReview ? new Date(c.lastReview).toISOString() : null,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (introduced.length > 0) {
      log('[srs] introducedToday cards', introduced);
    }

    // Cards outside the current blue-card window stay persisted but are not
    // selected for review. This makes changing the daily limit reversible and
    // avoids one DELETE request per card during page load.

    // Introduce: create due-now cards for the newest unrated words lacking one.
    if (plan.toCreate.length > 0) {
      setInitializing(true);
      for (const id of plan.toCreate) {
        updateCard(l2Code, id, fsrs.newCard(), srsCardMeta);
      }
      setTimeout(() => setInitializing(false), 100);
    }
  }, [settingsLoaded, settingsCloudHydrated, srsLoaded, wordsLoaded, user, srsCloudHydrated, l2SavedWords, store, l2Code, dailyNewLimit, dayStartHour, updateCard]);

  // ── Prune orphaned SRS cards ──
  // Cards only make sense for words that are still saved; unsaving through
  // any path must not let a stale card resurrect later.
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;
    // Never prune while the cloud saved-words hydration is still pending: an
    // empty local list at that point is a loading state, not a real "no saved
    // words" state, and pruning would delete the whole deck (SPEC-066).
    if (user && !savedWordsCloudHydrated) return;
    if (l2SavedWords.length === 0) {
      pruneOrphans(l2Code, new Set<string>());
      return;
    }
    pruneOrphans(l2Code, new Set(l2SavedWords.map((sw) => sw.id)));
  }, [srsLoaded, wordsLoaded, user, savedWordsCloudHydrated, l2SavedWords, l2Code, pruneOrphans]);

  // ── Compute due cards ──
  const dueCards = useMemo(() => {
    const now = Date.now();
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const activeNewCardIds = new Set(
      fsrs.getActiveNewCardIds(l2SavedWords, langCards, dailyNewLimit),
    );
    return l2SavedWords
      .filter((sw) => {
        const srs = langCards[sw.id];
        if (!srs) return false;
        if (fsrs.getCardState(srs) === 'new' && !activeNewCardIds.has(sw.id)) return false;
        return srs.due <= now;
      })
      .sort((a, b) => {
        const sa = langCards[a.id];
        const sb = langCards[b.id];
        if (!sa || !sb) return 0;
        return sa.due - sb.due;
      });
  }, [l2SavedWords, store, l2Code, dailyNewLimit]);

  // ── Derive entry for the current card from the reactive ID cache ──
  const currentDueCard = dueCards[currentIndex];
  const wordForm = currentDueCard ? firstLookupForm(currentDueCard) : '';
  // The ID cache stores entries by their raw `entry.id` from the dictionary
  // API response — EDICT entries use bare numeric IDs ("73458"), LLM entries
  // use their full ID ("llm-ja-…"). Both are stored as-is, so the saved
  // word's raw `id` field is the correct cache key. Never render an entry
  // whose id differs from the saved word id: that would show the bookmark as
  // "not saved" even though the saved LLM-generated entry is correct.
  const exactCachedEntry = useEntryByIdCache(l2Code, currentDueCard?.id ?? '');
  const baseL2ForEntry = l2Code.split('-')[0];
  const exactCanonicalEntry =
    currentDueCard?.canonicalEntry &&
    isSameEntryId(currentDueCard.id, currentDueCard.canonicalEntry.id, baseL2ForEntry)
      ? currentDueCard.canonicalEntry
      : null;
  const currentEntry = exactCachedEntry ?? exactCanonicalEntry ?? null;

  // ── Resolve the exact saved entry before showing the back side ──
  // Old cards often have no shared-cache entry (they were never enriched
  // online). On reveal, try offline first, then the exact /dictionary/entry
  // fetch by the saved id (with the user's L1, so definitions are
  // translated); only then fall back to a translated text-lookup entry.
  useEffect(() => {
    const id = currentDueCard?.id;
    if (!id || !showTabs || fallbackEntry || l1Entry?.id === id) return;
    const l1CacheL2 = baseCode(l2Code);
    if (getL1CachedEntry(l1CacheL2, l1Lang.code, id)) return;
    // Seed the English id cache from the canonical entry when present, but
    // keep going — the exact L1 fetch below is what translates the defs.
    if (
      currentDueCard?.canonicalEntry &&
      isSameEntryId(id, currentDueCard.canonicalEntry.id, baseL2ForEntry)
    ) {
      setCachedEntryById(l2Code, currentDueCard.canonicalEntry);
    }
    let cancelled = false;
    (async () => {
      const baseL2 = l2Code.split('-')[0];
      const decomposed = decomposeWordId(id, baseL2);
      const scopedId = decomposed?.id ?? id;
      let anyEntry = false;
      let l1Resolved = false;
      log('[srs] exact-entry resolve', {
        id,
        form: currentDueCard ? firstLookupForm(currentDueCard) : id,
        l1: l1Lang.code,
      });
      try {
        const entry = await getOfflineEntryById(baseL2, scopedId);
        if (!cancelled && entry) {
          setCachedEntryById(l2Code, entry);
          anyEntry = true;
        }
      } catch { /* no offline dict / corrupt — try network */ }
      if (cancelled || (anyEntry && offlineMode)) return;
      try {
        if (decomposed) {
          const { apiClient } = await import('@langplayer/api-client');
          const res = await apiClient.get('/dictionary/entry', {
            params: {
              l2: baseL2,
              dict: decomposed.dict,
              id: decomposed.id,
              l1: l1Lang.code,
            },
          });
          const entry = (res as any)?.entry as DictionaryEntry | undefined;
          const matches = !!entry && isSameEntryId(id, entry.id, baseL2ForEntry);
          log('[srs] exact-entry fetch', {
            id,
            dict: decomposed.dict,
            entryId: entry?.id,
            matches,
          });
          if (!cancelled && matches) {
            // Cache under the saved id even when the API returns the scoped
            // form (e.g. "ja-…" for a saved "llm-ja-…" id).
            const normalized = entry.id === id ? entry : { ...entry, id };
            setCachedEntryById(l2Code, normalized);
            // The /dictionary/entry response was requested with the user's
            // L1, so it is already translated — promote it to the L1 entry.
            setL1CachedEntry(l1CacheL2, l1Lang.code, normalized);
            setL1Entry(normalized);
            l1Resolved = true;
            anyEntry = true;
          }
        }
      } catch {
        // Network failure — fall through to the no-definition state.
      }
      if (!cancelled && !l1Resolved) {
        // The saved id may be stale (e.g. the dictionary was updated and the
        // old EDICT row no longer resolves). Fall back to the best text-lookup
        // entry for the same head so the back side still shows a translated
        // definition.
        const base = baseL2ForEntry;
        const form = currentDueCard ? firstLookupForm(currentDueCard) : id;
        const pickBest = (results: DictionaryEntry[]): DictionaryEntry | undefined =>
          results.find((e) => isSameEntryId(id, e.id, base))
          ?? results.find((e) => e.head === form)
          ?? results.find((e) => e.match_type === 'exact')
          ?? results[0];
        try {
          const candidates = [
            ...new Set([
              form,
              ...(currentDueCard?.forms ?? []),
              currentDueCard?.head,
              currentDueCard?.context?.form,
              ...(currentDueCard?.instances ?? []).map((i) => i.form),
            ].filter((f): f is string => typeof f === 'string' && !!f && f !== '?')),
          ];
          for (const candidate of candidates) {
            if (cancelled) break;
            const results = await lookupL1Text(candidate, l2Code, l1Lang.code);
            const fallback = pickBest(results);
            if (fallback) {
              setFallbackEntry(fallback);
              anyEntry = true;
              break;
            }
          }
        } catch {
          // Keep the no-definition state.
        }
      }
      if (!cancelled && !anyEntry) {
        setOfflineEntryLookupDone((prev) => ({ ...prev, [id]: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [
    showTabs,
    currentDueCard?.id,
    currentDueCard?.canonicalEntry,
    fallbackEntry,
    l1Entry?.id,
    baseL2ForEntry,
    l2Code,
    l1Lang.code,
    offlineMode,
  ]);

  // ── Merge due cards with the reactive entry ──
  const cards = useMemo(() => dueCards.map((word) => ({
    word,
    srs: (store.cards[l2Code] ?? {})[word.id] || fsrs.newCard(),
    entry: word.id === currentDueCard?.id ? currentEntry : null,
  })), [dueCards, store, l2Code, currentDueCard?.id, currentEntry]);
  const nextReviewLabelFor = useCallback((card: { srs: SrsFields }, quality: Rating) => {
    const nextReviewInterval = getNextReviewInterval(fsrs.rate(card.srs, quality).due);
    const nextReviewKey = nextReviewInterval.unit === 'minutes'
      ? 'msg.next_review_in_minutes'
      : nextReviewInterval.unit === 'hours'
        ? 'msg.next_review_in_hours'
        : 'msg.next_review_in_days';
    return t(nextReviewKey, { n: nextReviewInterval.value });
  }, [t]);
  const definitionTestAnswered = reviewMode === 'test'
    && testQuestions.some((question, index) => question.kind === 'definition' && Boolean(testAnswers[index]));
  const showContextTranslation = showTabs || definitionTestAnswered;

  // ── Handlers ──

  /** Reveal the definition + translation for the current card. */
  const loadTestQuestions = useCallback(async (options?: { retry?: boolean }) => {
    const card = cards[currentIndex];
    if (!card) return;
    if (testActiveRequestRef.current !== null) {
      log('[srs-test] question generation ignored — request already active', {
        l2Code,
        word: wordForm,
        activeRequestVersion: testActiveRequestRef.current,
        retry: Boolean(options?.retry),
      });
      return;
    }
    const requestVersion = ++testRequestVersionRef.current;
    testActiveRequestRef.current = requestVersion;
    const entryForQuestion = currentEntry ?? l1Entry ?? fallbackEntry;
    const kinds = needsPronunciationTest(l2Code, wordForm) ? ['definition', 'pronunciation'] as const : ['definition'] as const;
    log('[srs-test] question generation started', { l2Code, word: wordForm, kinds, hasContext: Boolean(cards[currentIndex]?.word.context?.text), retry: Boolean(options?.retry), requestVersion });
    setTestError(null);
    setTestLoading(true);
    try {
      const questionResults = await Promise.allSettled(kinds.map(async (kind) => {
        const prompt = buildSrsQuestionPrompt({ word: wordForm, contextSentence: cards[currentIndex]?.word.context?.text as string | undefined, l1Code: baseCode(l1Lang.code), l2Code, kind, definition: entryForQuestion?.definitions?.[0], pronunciation: entryForQuestion?.pronunciation });
        const { apiClient } = await import('@langplayer/api-client');
        const requestPrompt = options?.retry
          ? `${prompt}\n\nGenerate a fresh variation for retry ${requestVersion}; do not reuse any previous response.`
          : prompt;
        log('[srs-test] request started', { l2Code, word: wordForm, kind, cache: !options?.retry, cacheBust: Boolean(options?.retry) });
        const payload = await apiClient.post('/chatgpt', {
          prompt: requestPrompt,
          cache: !options?.retry,
          max_tokens: 500,
        }, options?.retry ? {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        } : undefined);
        log('[srs-test] response received', { l2Code, word: wordForm, kind, responseType: typeof (payload as any).response, responseLength: typeof (payload as any).response === 'string' ? (payload as any).response.length : null });
        const parsed = parseSrsQuestionResponse((payload as any).response);
        if (parsed.kind !== kind) throw new Error('LLM returned the wrong question type');
        if (kind === 'pronunciation' && l2Code.split('-')[0] === 'ja' && !/^[\u3040-\u309fー\s]+$/.test(parsed.correct_answer) ) throw new Error('Japanese pronunciation must be hiragana');
        if (typeof parsed.question !== 'string' || !parsed.question.trim()) throw new Error('LLM returned an invalid question');
        const confounders = Array.isArray(parsed.confounders) ? parsed.confounders : [];
        const rawChoices = [parsed.correct_answer, ...confounders].filter((x): x is string => typeof x === 'string');
        const choices = rawChoices.filter((choice, index) => rawChoices.findIndex((candidate) => normalizeTestChoice(candidate) === normalizeTestChoice(choice)) === index).slice(0, 4);
        log('[srs-test] choices parsed', { l2Code, word: wordForm, kind, rawChoiceCount: rawChoices.length, uniqueChoiceCount: choices.length, confoundersIsArray: Array.isArray(parsed.confounders) });
        if (choices.length !== 4) throw new Error('Invalid question choices');
        return { kind, prompt: parsed.question, choices: choices.sort(() => Math.random() - 0.5), correctAnswer: parsed.correct_answer };
      }));
      const failedQuestion = questionResults.find((result) => result.status === 'rejected');
      if (failedQuestion) throw failedQuestion.reason;
      const questions = questionResults.map((result) => {
        if (result.status !== 'fulfilled') throw result.reason;
        return result.value;
      });
      if (requestVersion !== testRequestVersionRef.current) return;
      setTestQuestions(questions);
      setTestError(null);
      setTestAnswers([]);
      setTestQuestionIndex(0);
      setTestStartedAt(Date.now());
      log('[srs-test] question generation succeeded', { l2Code, word: wordForm, requestVersion, questionCount: questions.length });
    } catch (error) {
      if (requestVersion !== testRequestVersionRef.current) return;
      const message = error instanceof Error ? error.message : t('error.unexpected');
      log('[srs-test] question generation failed', { l2Code, word: wordForm, error: message });
      setTestError(message);
      setTestQuestions([]);
    } finally {
      log('[srs-test] question generation finished', { l2Code, word: wordForm, loading: false });
      if (testActiveRequestRef.current === requestVersion) testActiveRequestRef.current = null;
      if (requestVersion !== testRequestVersionRef.current) return;
      setTestLoading(false);
    }
  }, [cards, currentIndex, currentEntry, l1Entry, fallbackEntry, wordForm, l1Lang.code, l2Code, t]);

  const handleRetryTestQuestions = useCallback(() => {
    log('[srs-test] retry requested', { l2Code, word: wordForm });
    const cardId = cards[currentIndex]?.word.id;
    if (cardId) testAutoLoadKeyRef.current = `${l2Code}:${cardId}`;
    setTestError(null);
    setTestQuestions([]);
    setTestAnswers([]);
    setTestQuestionIndex(0);
    setTestStartedAt(null);
    void loadTestQuestions({ retry: true });
  }, [cards, currentIndex, l2Code, wordForm, loadTestQuestions]);

  useEffect(() => {
    const cardId = cards[currentIndex]?.word.id;
    if (reviewMode !== 'test' || !cardId || testQuestions.length > 0 || testLoading || testError || rated || testActiveRequestRef.current !== null) return;
    const requestKey = `${l2Code}:${cardId}`;
    if (testAutoLoadKeyRef.current === requestKey) return;
    testAutoLoadKeyRef.current = requestKey;
    log('[srs-test] auto-loading questions', { l2Code, cardId });
    void loadTestQuestions();
  }, [reviewMode, cards, currentIndex, l2Code, testQuestions.length, testLoading, testError, rated, loadTestQuestions]);

  const handleTestAnswer = useCallback((answer: string) => {
    log('[srs-test] answer clicked', { word: wordForm, questionIndex: testQuestionIndex, answer, testAnswered, hasTimer: Boolean(testStartedAt), alreadyAnswered: Boolean(testAnswers[testQuestionIndex]), answerCount: testAnswers.length, questionCount: testQuestions.length });
    if (!testStartedAt || testAnswers[testQuestionIndex]) {
      log('[srs-test] answer ignored', { word: wordForm, questionIndex: testQuestionIndex, reason: !testStartedAt ? 'timer missing' : 'question already answered' });
      return;
    }
    const question = testQuestions[testQuestionIndex];
    if (!question) {
      log('[srs-test] answer ignored', { word: wordForm, questionIndex: testQuestionIndex, reason: 'question missing' });
      return;
    }
    const isCorrect = answer === question.correctAnswer;
    const score = scoreTestAnswer(isCorrect, Date.now() - testStartedAt);
    log('[srs-test] answer accepted', { word: wordForm, questionIndex: testQuestionIndex, correct: isCorrect, score, isFinal: testQuestionIndex === testQuestions.length - 1 });
    setTestScores((previous) => [...previous, score]);
    setTestAnswers((previous) => {
      const next = [...previous];
      next[testQuestionIndex] = { answer, correct: isCorrect, score };
      return next;
    });
    setTestSelectedAnswer(answer);
    setTestAnswerCorrect(isCorrect);
    setTestAnswered(true);
    if (testQuestionIndex < testQuestions.length - 1) {
      // Keep the answered question rendered and immediately append the next one below it.
      setTestQuestionIndex((i) => i + 1);
      setTestStartedAt(Date.now());
      setTestSelectedAnswer(null);
      setTestAnswerCorrect(null);
      setTestAnswered(false);
      return;
    }
    const finalScore = testQuestions.length === 1 ? score : Math.floor((testScores.reduce((a, b) => a + b, 0) + score) / (testScores.length + 1));
    setSuggestedRating(testScoreToRating(finalScore));
    setTestScores([]);
    setTestQuestionIndex(testQuestions.length - 1); setTestStartedAt(null); setShowTabs(true);
  }, [testAnswered, testStartedAt, testAnswers, testQuestions, testQuestionIndex, testScores, wordForm, cards, currentIndex]);

  const handleReveal = useCallback(() => {
    if (reviewMode === 'test') { void loadTestQuestions(); return; }
    const card = cards[currentIndex];
    log('[srs] reveal', {
      wordId: card?.word.id,
      head: card ? wordLabel(card.word) : undefined,
      index: currentIndex,
      totalCards: cards.length,
    });
    setShowTabs(true);
  }, [cards, currentIndex, reviewMode, loadTestQuestions]);

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    if (!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP) return;
    setRated(true);
    testRequestVersionRef.current += 1;
    testActiveRequestRef.current = null;
    setTestQuestions([]);
    setTestAnswers([]);
    setTestStartedAt(null);
    testAutoLoadKeyRef.current = null;
    setTestQuestionIndex(0);
    setTestSelectedAnswer(null);
    setTestAnswerCorrect(null);
    setTestScores([]);
    setSuggestedRating(null);

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
    const nextReviewLabel = nextReviewLabelFor(card, quality);
    log('[srs] mark', {
      quality,
      wordId: card.word.id,
      head: wordLabel(card.word),
      index: currentIndex,
      totalCards: cards.length,
      prev: { ...card.srs },
      next: { ...updated },
    });
    updateCard(l2Code, card.word.id, updated, srsCardMeta);

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
        props: {
          quality,
          label,
          nextReviewLabel,
          undoLabel: t('action.undo'),
          handleUndo: () => handleUndo(),
        },
      });
    }

    // Brief pause so the user sees the settled card before buttons reappear.
    // No index advancement needed — updateCard mutates the store, which
    // recomputes dueCards with the rated card filtered out. The array
    // shifts left, so currentIndex naturally points to the next card.
    setTimeout(() => {
      setRated(false);
    }, 600);
  }, [cards, currentIndex, rated, updateCard, l2Code, t, isPro, reviewsDoneToday, reviewCounterKey, nextReviewLabelFor]);

  /** Undo the most recent rating — restores the card's previous SRS state. */
  const handleUndo = useCallback(() => {
    const state = undoRef.current;
    if (!state) return;

    log('[srs] undo', { wordId: state.wordId, head: state.head });
    updateCard(l2Code, state.wordId, {
      ...state.prevSrs,
      ...(state.ratingId ? { voidRatingId: state.ratingId } : {}),
    }, srsCardMeta);

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
      testRequestVersionRef.current += 1;
      testActiveRequestRef.current = null;
       setTestQuestions([]);
       setTestAnswers([]);
       setTestQuestionIndex(0);
       setTestStartedAt(null);
       setTestSelectedAnswer(null);
       setTestAnswerCorrect(null);
       setTestScores([]);
       setTestError(null);
       setSuggestedRating(null);
       testAutoLoadKeyRef.current = null;
       setShowTabs(false);
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
    setFallbackEntry(null);
    setShowTabs(false);
    if (!card) return;
    const rawInstances = (card.word as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined;
    const instances = (rawInstances ?? (card.word.context ? [{ timestamp: card.word.date ?? 0, form: card.word.forms?.[0] ?? '', context: card.word.context as unknown as SavedWordContext }] : []))
      .filter((inst) => !!inst.context?.text);
    // ── Highlight diagnostics (review-card target word) ──
    // Mirrors the highlightTerms array passed to TokenizedText in the card
    // render (displayInstance.form = last instance form, then forms, then
    // head), so a missing/un-highlighted target word (e.g. a multi-token
    // selection like しかるべき) is traceable to which source field carries —
    // or fails to carry — the surface form.
    const instanceForms = instances.map((inst) => inst.form);
    const highlightTerms = Array.from(new Set(
      [...instanceForms, ...(card.word.forms ?? []), card.word.head ?? ''].filter(Boolean),
    ));
    log('[srs] context-loaded', {
      wordId: card.word.id,
      head: wordLabel(card.word),
      count: instances.length,
      hasSavedTranslation: instances.some((inst) => !!inst.context.translation),
      highlight: {
        highlightTerms,
        contextText: instances[instances.length - 1]?.context.text ?? null,
        record: {
          head: card.word.head ?? null,
          forms: card.word.forms ?? [],
          contextForm: card.word.context?.form ?? null,
          instanceForms,
        },
      },
    });
  }, [cards[currentIndex]?.word.id]);

  // ── Auto-translate context text after the definition test (or back reveal) ──
  useEffect(() => {
    if (!showContextTranslation || !display.translation) return;

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
          body: JSON.stringify({
            text: ctxText,
            // The server wraps this form in **bold** inside the translation
            // (web parity) — without it, we would have to prepend the word
            // manually, which puts the original word in front of the sentence.
            form: card?.word.context?.form
              ?? card?.word.forms?.[0]
              ?? card?.word.head
              ?? card?.word.id,
            l1: baseCode(l1Lang.code),
            l2: l2Code,
          }),
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
  }, [showContextTranslation, cards, currentIndex, l2Code, l1Lang.code, display.translation]);

  // ── Per-card L1 dictionary lookup (non-English L1 users) ──
  // The batched lookup returns English-only definitions for speed; on reveal,
  // fetch the L1-translated entry so the card back shows the user's language.
  useEffect(() => {
    if (!showTabs || l1Lang.code === 'en') return;
    const card = cards[currentIndex];
    if (!card) return;
    const sw = card.word;
    const form = firstLookupForm(sw);
    if (l1Entry?.id === card.word.id) return;

    const l2BaseForL1 = baseCode(l2Code);
    const cached = getL1CachedEntry(l2BaseForL1, l1Lang.code, sw.id);
    if (cached) {
      setL1Entry(cached);
      return;
    }

    // The first lookup form is often the inflected surface form (e.g.
    // 顰めらせられる), which the dictionary resolves to a different LLM entry
    // id than the saved word. Try every saved form/head until one matches the
    // exact saved id before giving up.
    const candidates = [
      ...new Set([
        form,
        ...(sw.forms ?? []),
        sw.head,
        sw.context?.form,
        ...(sw.instances ?? []).map((i) => i.form),
      ].filter((f): f is string => typeof f === 'string' && !!f && f !== '?')),
    ];

    let cancelled = false;
    (async () => {
      for (const candidate of candidates) {
        if (cancelled) return;
        const results = await lookupL1Text(candidate, l2Code, l1Lang.code).catch(() => []);
        // Only accept the exact saved entry — a text-lookup can return a
        // different entry (e.g. EDICT instead of the saved LLM entry) and
        // would make the bookmark read "not saved".
        const match = results.find((e) => isSameEntryId(sw.id, e.id, l2BaseForL1)) ?? null;
        if (match) {
          const normalized = match.id === sw.id ? match : { ...match, id: sw.id };
          setL1CachedEntry(l2BaseForL1, l1Lang.code, normalized);
          setL1Entry(normalized);
          return;
        }
      }
      if (!cancelled) setL1Entry(null);
    })();
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
    () => fsrs.countDeckStates(l2SavedWords, langCardsForCounts, { dailyNewLimit }),
    [l2SavedWords, langCardsForCounts, dailyNewLimit],
  );
  useEffect(() => {
    const budget = fsrs.getNewCardBudget(
      l2SavedWords,
      langCardsForCounts,
      dailyNewLimit,
      Date.now(),
      dayStartHour,
    );
    log('[srs] cardCounts', {
      l2: l2Code,
      ...cardCounts,
      dailyNewLimit,
      dayStartHour,
      remaining: budget.remaining,
      savedWords: l2SavedWords.length,
      cards: Object.keys(langCardsForCounts).length,
    });
  }, [cardCounts, dailyNewLimit, dayStartHour, l2Code, l2SavedWords, langCardsForCounts]);

  // ── Render states ──

  const isLoading = !settingsLoaded || !settingsCloudHydrated || !wordsLoaded || !srsLoaded || initializing || (user && (!savedWordsCloudHydrated || !srsCloudHydrated));

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
        <Text className="mb-4 text-center text-base text-muted-foreground max-w-md">
          {t('msg.save_words_to_build_deck')}
        </Text>
        <Button
          onPress={() => router.push('/(tabs)/(media)' as any)}
        >
          <Text className={buttonTextClass('default')}>
            {t('action.explore_videos')}
          </Text>
        </Button>
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
        <Text className="mb-4 text-center text-base text-muted-foreground">
          {t('msg.all_done_desc')}
          {nextDue && (
            <>{' '}{t('msg.next_review')}: {formatNextDueLabel(nextDue.due, l1Lang.code)}.</>
          )}
        </Text>
        <Button
          onPress={() => router.push('/(tabs)/(media)' as any)}
          className="mt-4"
        >
          <Text className={buttonTextClass('default')}>
            {t('action.explore_videos')}
          </Text>
        </Button>
      </View>
    );
  }

  // No due cards right now
  if (cards.length === 0) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.due > Date.now())
      .sort((a, b) => a.due - b.due)[0];

    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <CheckCircle2 size={56} color={ICON_PRIMARY} style={{ marginBottom: 16 }} />
        <Text className="mb-2 text-xl font-semibold text-foreground">{t('msg.no_cards_due')}</Text>
        <Text className="mb-4 text-center text-base text-muted-foreground">
          {t('msg.no_cards_due_desc', { total: Object.keys(langCards).length, deck: l2Lang.name })}
          {nextDue ? (
            <> {t('msg.next_review_date', { date: formatNextDueLabel(nextDue.due, l1Lang.code) })}</>
          ) : (
            <> {t('msg.save_more_words')}</>
          )}
        </Text>
        <Button
          onPress={() => router.push('/(tabs)/(media)' as any)}
          className="mt-4"
        >
          <Text className={buttonTextClass('default')}>
            {t('action.explore_videos')}
          </Text>
        </Button>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;
  const currentCardState = fsrs.getCardState(currentCard.srs);

  const entry = l1Entry ?? fallbackEntry ?? currentEntry;
  const savedWord = currentCard.word;
  const savedWordInstances = (savedWord as any).instances as Array<{ timestamp: number; form: string; context: SavedWordContext }> | undefined;
  const instances = (savedWordInstances ?? (savedWord.context ? [{ timestamp: savedWord.date ?? 0, form: savedWord.forms?.[0] ?? '', context: savedWord.context as unknown as SavedWordContext }] : []))
    // Old records store an empty default context instance — skip it so the
    // review card doesn't render a dead "…" trigger that copies nothing.
    .filter((inst) => !!inst.context?.text);
  // Multi-instance is a future feature (ADR-0006 / SPEC-066): render only the
  // latest context until the UI explicitly supports adding more instances.
  const displayInstance = instances[instances.length - 1] ?? null;
  const srs = currentCard.srs;
  // Keep later tests hidden until the preceding test has been answered.
  const visibleTestQuestions = testQuestions.slice(0, testQuestionIndex + 1);

  return (
    <PageContainer maxWidth="2xl">
      {/* Mode switch with card counts */}
      <View className="flex-row items-center justify-between px-4 py-4">
        <View className="flex-row rounded-lg border border-border p-1">
          <Pressable onPress={() => { changeReviewMode('recall'); }} className={`rounded-md px-3 py-2 ${reviewMode === 'recall' ? 'bg-primary' : ''}`}><Text className={reviewMode === 'recall' ? 'text-primary-foreground' : 'text-muted-foreground'}>{t('review.recall_mode')}</Text></Pressable>
          <Pressable onPress={() => { changeReviewMode('test'); }} className={`rounded-md px-3 py-2 ${reviewMode === 'test' ? 'bg-primary' : ''}`}><Text className={reviewMode === 'test' ? 'text-primary-foreground' : 'text-muted-foreground'}>{t('review.test_mode')}</Text></Pressable>
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
          ) : displayInstance && (
            <View className="mb-3 rounded-lg bg-muted/50 p-3">
              <TextActionMenu text={displayInstance.context.text} l2Code={l2Code} l1Code={baseCode(l1Lang.code)}>
                <TokenizedText
                  text={displayInstance.context.text}
                  l2Code={l2Code}
                  highlightTerms={Array.from(new Set(
                    [
                      displayInstance.form,
                      // The record's context.form is the exact surface saved
                      // (e.g. kana しかるべき) even when the instance form
                      // falls back to the head (然るべき) — the sentence
                      // contains the surface, so it must be matchable.
                      savedWord.context?.form ?? '',
                      ...(savedWord.forms ?? []),
                      savedWord.head ?? '',
                    ].filter((v): v is string => !!v),
                  ))}
                  highlightEntryIds={[savedWord.id]}
                  phoneticsOnHighlight={showTabs}
                />
              </TextActionMenu>
              <View className="mt-1">
                <SavedWordSource context={displayInstance.context} date={displayInstance.timestamp ?? savedWord.date} locale={baseCode(l1Lang.code)} />
              </View>
              {showContextTranslation && display.translation && (displayInstance.context.translation || contextTranslation) && (
                <View className="mt-2 border-t border-border pt-2">
                  {displayInstance.context.translation ? (
                    <Text className="text-xs leading-relaxed text-muted-foreground">
                      {displayInstance.context.translation}
                    </Text>
                  ) : (
                    <ReviewTranslationMarkdown text={contextTranslation ?? ''} />
                  )}
                </View>
              )}
            </View>
          )}

          {/* SRS info (compact) */}
          <Text className="mb-4 text-center text-xs text-muted-foreground">
            {srs.state === 0 ? t('review.srs_new') : fsrs.srsDueLabel(srs)}
            {srs.reps > 0 && (
              <>{' · '}{t('review.srs_review', { count: srs.reps })}</>
            )}
          </Text>

          {testError && (
            <View className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <Text className="text-sm text-destructive">{testError}</Text>
              <Button onPress={handleRetryTestQuestions} variant="outline" size="sm" className="mt-2">
                <Text className={buttonTextClass('outline')}>{t('action.try_again')}</Text>
              </Button>
            </View>
          )}

          {/* Test results stay on screen; each answered question is followed by the next. */}
          {reviewMode === 'test' && testQuestions.length > 0 ? (
            <View className="mt-2 gap-5" onStartShouldSetResponder={() => true}>
              {visibleTestQuestions.map((question, questionIndex) => {
                const result = testAnswers[questionIndex];
                const isCurrent = questionIndex === testQuestionIndex;
                return (
                  <View key={`${question.kind}-${questionIndex}`} className="gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
                    <Text className="mb-2 font-medium text-foreground">{question.prompt}</Text>
                    {question.choices.map((choice, index) => {
                      const isSelected = result?.answer === choice;
                      const isCorrectChoice = Boolean(result) && choice === question.correctAnswer;
                      const choiceClass = result
                        ? isCorrectChoice ? 'border-green-500 bg-green-500/10' : isSelected ? 'border-destructive bg-destructive/10' : 'border-border bg-background opacity-60'
                        : 'border-border bg-background';
                      return (
                        <Pressable key={`${choice}-${index}`} onPress={() => handleTestAnswer(choice)} disabled={Boolean(result) || !isCurrent} className={`rounded-lg border p-3 ${choiceClass}`}>
                          <Text className="text-foreground"><Text className="font-semibold">{String.fromCharCode(97 + index)}. </Text>{choice}</Text>
                        </Pressable>
                      );
                    })}
                    {result && <Text className={`text-sm font-semibold ${result.correct ? 'text-green-600' : 'text-destructive'}`}>{result.correct ? t('review.answer_correct') : t('review.answer_incorrect')}</Text>}
                  </View>
                );
              })}
            </View>
          ) : !showTabs && reviewMode === 'recall' ? (
            <Button onPress={handleReveal} variant="outline" size="sm" className="mb-2">
              <Text className={buttonTextClass('outline')}>{t('review.show_definition')}</Text>
            </Button>
          ) : reviewMode === 'test' && testLoading ? (
            <View className="mt-2 items-center"><ActivityIndicator size="small" color={ICON_MUTED} /></View>
          ) : null}

          {showTabs && (
            <View className="mb-2">
              {entry ? (
                <DictionaryEntryTabs
                  entry={entry}
                  showDefinitionTab
                  embedded
                  l2Code={l2Lang.code}
                  contextText={displayInstance?.context?.text}
                  contextForm={wordForm}
                />
              ) : offlineEntryLookupDone[currentCard.word.id] ? (
                <View className="items-center justify-center py-8">
                  <Text className="text-sm text-muted-foreground">{dictAvailable === false ? t('msg.offline_dictionary_required') : t('msg.no_definition_offline')}</Text>
                </View>
              ) : (
                <View className="items-center justify-center py-8"><ActivityIndicator size="small" color={ICON_MUTED} /></View>
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
              <Button onPress={() => router.push('/(tabs)/(me)/go-pro' as any)} variant="link" className="mt-1">
                <Text className={buttonTextClass('link')}>
                  {t('action.upgrade_to_pro')}
                </Text>
              </Button>
            </View>
          )}
          <View className="flex-row gap-2">
            {RATING_LABELS.map((r) => {
              const ratingDisabled = suggestedRating
                ? r.key !== suggestedRating
                : (!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP);
              return (
                <Pressable
                  key={r.key}
                  onPress={() => handleRate(r.key)}
                  disabled={ratingDisabled}
                  className="flex-1 items-center rounded-lg py-3"
                  style={{ backgroundColor: RATING_ICON_COLORS[r.key], opacity: ratingDisabled ? 0.5 : 1 }}
                >
                  <Text className="text-sm font-bold text-white">{r.label}</Text>
                  <Text className="mt-0.5 text-xs text-white/70">{currentCard ? nextReviewLabelFor(currentCard, r.key) : ''}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </PageContainer>
  );
}
