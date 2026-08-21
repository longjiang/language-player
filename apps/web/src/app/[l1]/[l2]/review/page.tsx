'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
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
import {
  getCachedEntries,
  setCachedEntryById,
  enqueueLookupWords,
  getL1CachedEntry,
  setL1CachedEntry,
} from '@langplayer/utils';
import { lookupL1Text } from '@/lib/l1-lookup';
import { clampTranslationSize } from '@/lib/reader-text-size';
import {
  decomposeWordId,
  isSameEntryId,
  type SrsFields,
  type DictionaryEntry,
  type SavedLexicalItemRecord,
} from '@langplayer/shared';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { buildEntryRoute } from '@/lib/entry-route';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { TranslationSkeleton } from '@/components/ui/translation-skeleton';
import { DictionaryEntryTabs } from '@/components/dictionary-entry-tabs';
import { SavedWordSource } from '@/components/saved-word-source';
import { useT } from '@/hooks/use-t';
import { log, logerr } from '@/lib/logger';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

type Rating = 'again' | 'hard' | 'good' | 'easy';

type TestAnswer = { answer: string; correct: boolean; score: 1 | 2 | 3 | 4 };

/** ADR-0034: free users can complete 20 SRS reviews per day. */
const FREE_SRS_DAILY_CAP = 20;

/** State saved before a rating, so the user can undo it. */
interface UndoState {
  wordId: string;
  prevSrs: SrsFields;
  wasLastCard: boolean;
  /** Client id of the rating being undone, so the backend voids its cap slot. */
  ratingId?: string;
}

function useRatingLabels() {
  const t = useT();
  return [
    { key: 'again' as const, label: t('review.again'), hint: t('review.again_hint'), color: 'bg-red-600 hover:bg-red-700', keyShortcut: '1' },
    { key: 'hard' as const, label: t('review.hard'), hint: t('review.hard_hint'), color: 'bg-orange-500 hover:bg-orange-600', keyShortcut: '2' },
    { key: 'good' as const, label: t('review.good'), hint: t('review.good_hint'), color: 'bg-green-600 hover:bg-green-700', keyShortcut: '3' },
    { key: 'easy' as const, label: t('review.easy'), hint: t('review.easy_hint'), color: 'bg-blue-600 hover:bg-blue-700', keyShortcut: '4' },
  ];
}

interface ReviewCard {
  word: SavedLexicalItemRecord;
  srs: SrsFields;
  entry: DictionaryEntry | null;
}

/** First real dictionary-lookup form for a saved word (skips legacy "?"). */
function firstLookupForm(word: SavedLexicalItemRecord): string {
  const candidates = [
    ...(word.forms ?? []),
    word.context?.form,
    ...(word.instances ?? []).map((i) => i.form),
  ];
  return candidates.find((f) => typeof f === 'string' && f && f !== '?') ?? word.id;
}

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const { l1, l2 } = useLanguage();
  const { savedWords, loaded: wordsLoaded, cloudHydrated, removeSavedWord } = useSavedWordsContext();
  const { store, loaded: srsLoaded, cloudHydrated: srsCloudHydrated, updateCard, removeCard, pruneOrphans } = useSrs();
  const { loaded: settingsLoaded, cloudHydrated: settingsCloudHydrated, display, tokenizedText, review: { dailyNewLimit: dailyLimit, dayStartHour } } = useSettingsContext();
  const srsCardMeta = useMemo(
    () => ({ timezone: deviceTimezone(), dayStartHour }),
    [dayStartHour],
  );
  const { isPro } = useSubscriptionContext();
  const t = useT();
  const router = useRouter();
  const RATING_LABELS = useRatingLabels();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [reviewMode, setReviewMode] = useState<'recall' | 'test'>(() => {
    if (typeof window === 'undefined') return 'recall';
    return window.localStorage.getItem('lp:srs-review-mode') === 'test' ? 'test' : 'recall';
  });
  const [testError, setTestError] = useState<string | null>(null);
  const testAutoLoadKeyRef = useRef<string | null>(null);
  const testRequestVersionRef = useRef(0);

  const changeReviewMode = useCallback((mode: 'recall' | 'test') => {
    testRequestVersionRef.current += 1;
    setTestLoading(false);
    setReviewMode(mode);
    window.localStorage.setItem('lp:srs-review-mode', mode);
    setTestQuestions([]);
    setTestAnswers([]);
    setTestStartedAt(null);
    testAutoLoadKeyRef.current = null;
    setShowDefinition(false);
    setTestError(null);
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
  const [initializing, setInitializing] = useState(false);
  /** True when the user just finished reviewing the last due card. */
  const [justCompleted, setJustCompleted] = useState(false);
  /** Auto-translated context text (fetched on-demand when no saved translation exists). */
  const [contextTranslation, setContextTranslation] = useState<string | null>(null);
  /** True while the context translation above is being fetched. */
  const [contextTranslating, setContextTranslating] = useState(false);
  /** Per-card L1-translated dictionary entry (fetched on reveal for non-English L1 users).
   *  Batch lookup returns English-only definitions for speed; this provides the
   *  translated version when the user actually interacts with a card. */
  const [l1Entry, setL1Entry] = useState<DictionaryEntry | null>(null);
  /** Best text-lookup entry when the exact saved id is stale/unresolvable. */
  const [fallbackEntry, setFallbackEntry] = useState<DictionaryEntry | null>(null);
  /** True while the exact saved entry is being fetched for the back side. */
  const [exactEntryLoading, setExactEntryLoading] = useState<Record<string, boolean>>({});
  /** Track the current card's word ID to detect unsave-triggered card changes. */
  const lastCardIdRef = useRef<string | null>(null);
  /** Previous card SRS state saved before a rating, used by the Undo action. */
  const undoRef = useRef<UndoState | null>(null);
  /** Toast ID of the most recent rating toast, so undo can dismiss it. */
  const ratingToastIdRef = useRef<string | number | null>(null);
  const [reviewsDoneToday, setReviewsDoneToday] = useState(0);
  /** Current local day (YYYY-MM-DD); rolls over at the configured hour. */
  const [day, setDay] = useState(() => dayKey(Date.now(), dayStartHour));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDay(dayKey(Date.now(), dayStartHour));
    }, msUntilNextDay(Date.now(), dayStartHour));
    return () => clearTimeout(timer);
  }, [day, dayStartHour]);

  const reviewCounterKey = session?.user?.id
    ? dailyReviewCounterKey(session.user.id, Date.now(), dayStartHour)
    : null;

  useEffect(() => {
    if (!reviewCounterKey) return;
    setReviewsDoneToday(Number(localStorage.getItem(reviewCounterKey) ?? 0));
  }, [reviewCounterKey]);

  // If the server rejects a rating (multi-device cap edge), reconcile the
  // local counter so the upgrade banner shows immediately.
  useEffect(() => {
    const onCapReached = () => setReviewsDoneToday(FREE_SRS_DAILY_CAP);
    window.addEventListener('lp:srs-cap-reached', onCapReached);
    return () => window.removeEventListener('lp:srs-cap-reached', onCapReached);
  }, []);

  const l2Code = baseCode(l2.code);
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  // ── Auto-initialize SRS cards up to today's new-card budget ──
  // The blue ("new") deck holds at most `dailyLimit` new cards per local day.
  // Once today's budget is used, rated cards are not replaced until tomorrow.
  useEffect(() => {
    if (!settingsLoaded || !settingsCloudHydrated || !srsLoaded || !wordsLoaded) return;
    // Never auto-create cards from stale local state before the server's SRS
    // cards have been fetched (SPEC-066): a "new" card minted here can
    // overwrite a rated card from another device.
    if (status === 'authenticated' && !srsCloudHydrated) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const budget = fsrs.getNewCardBudget(
      l2SavedWords,
      langCards,
      dailyLimit,
      Date.now(),
      dayStartHour,
    );
    const candidates = fsrs.countNewCardCandidates(l2SavedWords, langCards);
    const plan = fsrs.planNewDeck(
      l2SavedWords,
      langCards,
      dailyLimit,
      Date.now(),
      dayStartHour,
    );
    log('[SRS] planNewDeck', {
      l2: l2Code,
      dailyLimit,
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
      toRemove: plan.toRemove.length,
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
      log('[SRS] introducedToday cards', introduced);
    }

    // Push back: drop blue cards that fell outside the newest `dailyLimit`.
    for (const id of plan.toRemove) {
      removeCard(l2Code, id);
    }

    // Introduce: create due-now cards for the newest unrated words lacking one.
    if (plan.toCreate.length > 0) {
      setInitializing(true);
      for (const id of plan.toCreate) {
        updateCard(l2Code, id, fsrs.newCard(), srsCardMeta);
      }
      setTimeout(() => setInitializing(false), 100);
    }
  }, [settingsLoaded, settingsCloudHydrated, srsLoaded, wordsLoaded, status, srsCloudHydrated, l2SavedWords, store, l2Code, dailyLimit, dayStartHour, updateCard, removeCard]);

  // ── Prune orphaned SRS cards ──
  // An SRS card is only meaningful for a word that's still saved. When a word
  // is unsaved through any path (bookmark toggle, saved list, dictionary popup),
  // its card can linger in srs_progress and later "come back" as a stale "new"
  // card if the word is re-encountered. This effect removes cards for words that
  // are no longer in the saved list, keeping the deck in sync with savedWords.
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;
    // Never prune while the cloud saved-words hydration is still pending: an
    // empty local list at that point is a loading state, not a real "no saved
    // words" state, and pruning would delete the whole deck (SPEC-066).
    if (status === 'authenticated' && !cloudHydrated) return;
    if (l2SavedWords.length === 0) {
      // No saved words at all → purge the entire language deck.
      pruneOrphans(l2Code, new Set<string>());
      return;
    }
    pruneOrphans(l2Code, new Set(l2SavedWords.map((sw) => sw.id)));
  }, [srsLoaded, wordsLoaded, status, cloudHydrated, l2SavedWords, l2Code, pruneOrphans]);

  // ── Compute due cards ──
  const dueCards = useMemo((): Omit<ReviewCard, 'entry'>[] => {
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
      })
      .map((sw) => ({
        word: sw,
        srs: langCards[sw.id] || fsrs.newCard(),
      }));
  }, [l2SavedWords, store, l2Code]);

  // ── Pre-fetch dictionary entries for all due cards ──
  // This ensures entries are in the cache before the user reveals a card,
  // avoiding a misleading "no definition" flash. Routes through the shared
  // lazy batch queue so every caller dedupes against the same flush.
  // Batch lookup returns English-only definitions for speed.
  // Per-card L1 translation (if needed) happens on reveal below.
  useEffect(() => {
    if (dueCards.length === 0) return;
    const words = dueCards.map((dc) => ({
      text: dc.word.forms[0] || dc.word.id,
      l2Code,
    }));
    enqueueLookupWords(words, PYTHON_API_URL);
  }, [dueCards, l2Code]);

  // ── Derive entry for the current card from the reactive cache ──
  const currentDueCard = dueCards[currentIndex];
  const wordForm = currentDueCard?.word ? firstLookupForm(currentDueCard.word) : '';
  const allCachedEntries = useEntryCache(l2Code, wordForm);
  const exactCachedEntry = useEntryByIdCache(l2Code, currentDueCard?.word.id ?? '');

  // Try all forms for cache lookup, not just forms[0]
  const cachedEntry = useMemo(() => {
    const sw = currentDueCard?.word;
    if (!sw) return null;
    if (exactCachedEntry) return exactCachedEntry;
    // Try each form (including kana/kanji variants) to find a cache match
    for (const form of sw.forms) {
      const entries = getCachedEntries(l2Code, form);
      if (entries) {
        const match = entries.find((e) => e.id === sw.id);
        if (match) return match;
      }
    }
    // Fall back to the reactive hook value for forms[0]
    return allCachedEntries?.find((e) => e.id === sw.id) ?? null;
  }, [currentDueCard?.word?.id, currentDueCard?.word?.forms, exactCachedEntry, l2Code, wordForm, allCachedEntries]);

  const currentEntry = useMemo((): DictionaryEntry | null => {
    return cachedEntry;
  }, [cachedEntry]);

  // ── Merge due cards with the reactive entry ──
  const cards: ReviewCard[] = useMemo(
    () => dueCards.map((dc) => ({
      ...dc,
      entry: dc.word.id === currentDueCard?.word.id ? currentEntry : null,
    })),
    [dueCards, currentDueCard?.word.id, currentEntry],
  );

  const nextReviewLabelFor = useCallback((card: ReviewCard, quality: Rating) => {
    const nextReviewInterval = getNextReviewInterval(fsrs.rate(card.srs, quality).due);
    const nextReviewKey = nextReviewInterval.unit === 'minutes'
      ? 'msg.next_review_in_minutes'
      : nextReviewInterval.unit === 'hours'
        ? 'msg.next_review_in_hours'
        : 'msg.next_review_in_days';
    return t(nextReviewKey, { n: nextReviewInterval.value });
  }, [t]);

  // ── Handlers ──

  /** Toast background/border colors matching the rating buttons. */
  const RATING_TOAST_COLORS: Record<Rating, string> = {
    again: '!bg-red-600 !border-red-700',
    hard:  '!bg-orange-500 !border-orange-600',
    good:  '!bg-green-600 !border-green-700',
    easy:  '!bg-blue-600 !border-blue-700',
  };

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    if (!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP) return;
    setRated(true);
    testRequestVersionRef.current += 1;
    setTestLoading(false);
    setShowDefinition(false); // hide answer immediately for next card
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
    undoRef.current = { wordId: card.word.id, prevSrs: { ...card.srs }, wasLastCard };

    const updated = fsrs.rate(card.srs, quality);
    updated.ratingId = newRatingId(session?.user?.id, card.word.id);
    updated.rating = quality;
    undoRef.current.ratingId = updated.ratingId;

    const nextReviewLabel = nextReviewLabelFor(card, quality);

    // Visual feedback via toast — matches button color, includes Undo
    const label = RATING_LABELS.find((r) => r.key === quality);
    if (label) {
      ratingToastIdRef.current = toast(
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{label.label}</p>
            <p className="text-xs text-white/80 truncate">{nextReviewLabel}</p>
          </div>
          <button
            onClick={() => {
              if (ratingToastIdRef.current != null) {
                toast.dismiss(ratingToastIdRef.current);
                ratingToastIdRef.current = null;
              }
              handleUndo();
            }}
            className="shrink-0 rounded-lg border border-white/60 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            {t('action.undo')}
          </button>
        </div>,
        {
          duration: 3000,
          className: `${RATING_TOAST_COLORS[quality]} !text-white !border`,
        },
      );
    }

    updateCard(l2Code, card.word.id, updated, srsCardMeta);

    if (!isPro) {
      const next = reviewsDoneToday + 1;
      setReviewsDoneToday(next);
      if (reviewCounterKey) {
        localStorage.setItem(reviewCounterKey, String(next));
      }
    }

    if (wasLastCard) {
      setJustCompleted(true);
    }

    setTimeout(() => {
      setRated(false);
    }, 400);
  }, [cards, currentIndex, rated, updateCard, l2Code, t, isPro, reviewsDoneToday, reviewCounterKey, nextReviewLabelFor]);

  /** Undo the most recent rating — restores the card's previous SRS state. */
  const handleUndo = useCallback(() => {
    const state = undoRef.current;
    if (!state) return;

    updateCard(l2Code, state.wordId, {
      ...state.prevSrs,
      ...(state.ratingId ? { voidRatingId: state.ratingId } : {}),
    }, srsCardMeta);

    // Release the rating back to the free daily budget (SPEC-066 Phase 4).
    if (!isPro && reviewsDoneToday > 0) {
      const next = reviewsDoneToday - 1;
      setReviewsDoneToday(next);
      if (reviewCounterKey) {
        localStorage.setItem(reviewCounterKey, String(next));
      }
    }

    if (state.wasLastCard) {
      setJustCompleted(false);
    }

    // Reset currentIndex so the undone card reappears at the top
    setCurrentIndex(0);
    undoRef.current = null;

    // No toast here — the undo action within the rating toast is
    // feedback enough, and a second toast would be redundant.
  }, [l2Code, updateCard, isPro, reviewsDoneToday, reviewCounterKey]);

  const loadTestQuestions = useCallback(async (options?: { retry?: boolean }) => {
    const card = cards[currentIndex];
    if (!card) return;
    const requestVersion = ++testRequestVersionRef.current;
    const context = card.word.context?.text ?? '';
    const entryForQuestion = currentEntry ?? l1Entry ?? fallbackEntry;
    const kinds = needsPronunciationTest(l2Code, wordForm) ? ['definition', 'pronunciation'] as const : ['definition'] as const;
    log('[SRS Test] question generation started', { l2Code, word: wordForm, kinds, hasContext: Boolean(context), retry: Boolean(options?.retry), requestVersion });
    setTestError(null);
    setTestLoading(true);
    try {
      const questions = await Promise.all(kinds.map(async (kind) => {
        const prompt = buildSrsQuestionPrompt({ word: wordForm, contextSentence: context, l1Code: baseCode(l1.code), l2Code, kind, definition: entryForQuestion?.definitions?.[0], pronunciation: entryForQuestion?.pronunciation });
        log('[SRS Test] request started', { l2Code, word: wordForm, kind });
        const response = await fetch(`${PYTHON_API_URL}/chatgpt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, cache: !options?.retry, max_tokens: 500 }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        log('[SRS Test] response received', { l2Code, word: wordForm, kind, status: response.status, responseType: typeof payload.response, responseLength: typeof payload.response === 'string' ? payload.response.length : null });
        let parsed: ReturnType<typeof parseSrsQuestionResponse>;
         try {
          parsed = parseSrsQuestionResponse(payload.response);
         } catch (error) {
           logerr('[SRS Test] response JSON parse failed', {
             l2Code,
             word: wordForm,
             kind,
             responsePreview: typeof payload.response === 'string' ? payload.response.slice(0, 500) : payload.response,
             error: error instanceof Error ? error.message : String(error),
           });
           throw error;
         }
        if (parsed.kind !== kind) throw new Error('LLM returned the wrong question type');
        if (kind === 'pronunciation' && l2Code.split('-')[0] === 'ja' && !/^[\u3040-\u309fー\s]+$/.test(parsed.correct_answer) ) throw new Error('Japanese pronunciation must be hiragana');
        if (typeof parsed.question !== 'string' || !parsed.question.trim()) throw new Error('LLM returned an invalid question');
        const confounders = Array.isArray(parsed.confounders) ? parsed.confounders : [];
        const rawChoices = [parsed.correct_answer, ...confounders].filter((x): x is string => typeof x === 'string');
        const choices = rawChoices.filter((choice, index) => rawChoices.findIndex((candidate) => normalizeTestChoice(candidate) === normalizeTestChoice(choice)) === index).slice(0, 4);
        log('[SRS Test] choices parsed', { l2Code, word: wordForm, kind, rawChoiceCount: rawChoices.length, uniqueChoiceCount: choices.length, confoundersIsArray: Array.isArray(parsed.confounders) });
        if (choices.length < 3) throw new Error('Invalid question choices');
        return { kind, prompt: parsed.question, choices: choices.sort(() => Math.random() - 0.5), correctAnswer: parsed.correct_answer };
      }));
      if (requestVersion !== testRequestVersionRef.current) return;
      setTestQuestions(questions);
      setTestError(null);
      setTestAnswers([]);
      setTestQuestionIndex(0);
      setTestStartedAt(Date.now());
      log('[SRS Test] question generation succeeded', { l2Code, word: wordForm, requestVersion, questionCount: questions.length });
    } catch (error) {
      if (requestVersion !== testRequestVersionRef.current) {
        log('[SRS Test] stale question generation error ignored', {
          l2Code,
          word: wordForm,
          requestVersion,
          currentRequestVersion: testRequestVersionRef.current,
        });
        return;
      }
      const message = error instanceof Error ? error.message : t('error.unexpected');
      log('[SRS Test] question generation failed', { l2Code, word: wordForm, error: message });
      setTestError(message);
      setTestQuestions([]);
    } finally {
      const isCurrentRequest = requestVersion === testRequestVersionRef.current;
      log('[SRS Test] question generation finished', {
        l2Code,
        word: wordForm,
        requestVersion,
        currentRequestVersion: testRequestVersionRef.current,
        isCurrentRequest,
      });
      if (isCurrentRequest) setTestLoading(false);
    }
  }, [cards, currentIndex, currentEntry, l1Entry, fallbackEntry, wordForm, l1.code, l2Code, t]);

  const handleRetryTestQuestions = useCallback(() => {
    log('[SRS Test] retry requested', { l2Code, word: wordForm });
    setTestError(null);
    setTestQuestions([]);
    setTestAnswers([]);
    setTestQuestionIndex(0);
    setTestStartedAt(null);
    void loadTestQuestions({ retry: true });
  }, [l2Code, wordForm, loadTestQuestions]);

  useEffect(() => {
    const cardId = cards[currentIndex]?.word.id;
    if (reviewMode !== 'test' || !cardId || testQuestions.length > 0 || testLoading || testError || rated) return;
    const requestKey = `${l2Code}:${cardId}`;
    if (testAutoLoadKeyRef.current === requestKey) return;
    testAutoLoadKeyRef.current = requestKey;
    log('[SRS Test] auto-loading questions', { l2Code, cardId });
    void loadTestQuestions();
  }, [reviewMode, cards, currentIndex, l2Code, testQuestions.length, testLoading, testError, rated, loadTestQuestions]);

  const handleReveal = useCallback(() => {
    if (reviewMode === 'test') { void loadTestQuestions(); return; }
    setShowDefinition(true);
  }, [reviewMode, loadTestQuestions]);

  const handleTestAnswer = useCallback((answer: string) => {
    log('[SRS Test] answer clicked', { word: wordForm, questionIndex: testQuestionIndex, answer, testAnswered, hasTimer: Boolean(testStartedAt), alreadyAnswered: Boolean(testAnswers[testQuestionIndex]), answerCount: testAnswers.length, questionCount: testQuestions.length });
    if (!testStartedAt || testAnswers[testQuestionIndex]) {
      log('[SRS Test] answer ignored', { word: wordForm, questionIndex: testQuestionIndex, reason: !testStartedAt ? 'timer missing' : 'question already answered' });
      return;
    }
    const question = testQuestions[testQuestionIndex];
    if (!question) {
      log('[SRS Test] answer ignored', { word: wordForm, questionIndex: testQuestionIndex, reason: 'question missing' });
      return;
    }
    const isCorrect = answer === question.correctAnswer;
    const score = scoreTestAnswer(isCorrect, Date.now() - testStartedAt);
    log('[SRS Test] answer accepted', { word: wordForm, questionIndex: testQuestionIndex, correct: isCorrect, score, isFinal: testQuestionIndex === testQuestions.length - 1 });
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
    const rating = testScoreToRating(finalScore);
    // Always reveal the dictionary back after the final answer, correct or wrong.
    setSuggestedRating(rating);
    setTestScores([]);
    setTestStartedAt(null);
    setShowDefinition(true);
    setTestQuestionIndex(testQuestions.length - 1);
    setTestStartedAt(null);
  }, [testAnswered, testStartedAt, testAnswers, testQuestions, testQuestionIndex, testScores, wordForm, handleRate]);

  /** Remove this word from saved words and SRS. The card drops from the list naturally. */
  const handleRemove = useCallback(() => {
    const card = cards[currentIndex];
    if (!card) return;
    testRequestVersionRef.current += 1;
    setTestLoading(false);
    removeSavedWord(l2Code, card.word.id);
    removeCard(l2Code, card.word.id);
    setShowDefinition(false);
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
    setRated(false);
    // Don't increment currentIndex — the removed card drops from the array,
    // so the next card shifts into the current slot.
  }, [cards, currentIndex, l2Code, removeSavedWord, removeCard]);

  // ── Clamp currentIndex if it exceeds the cards array (cards shrunk after removal) ──
  useEffect(() => {
    if (cards.length > 0 && currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex]);

  // ── When card changes without a rating (e.g. unsave), reset to front ──
  useEffect(() => {
    const card = cards[currentIndex];
    const currentId = card?.word.id ?? null;
    if (currentId && currentId !== lastCardIdRef.current) {
      // The first card is not a change. The auto-loader effect runs before
      // this effect on the initial render, so invalidating here would discard
      // the first request and leave its spinner stuck on a stale response.
      if (lastCardIdRef.current === null) {
        lastCardIdRef.current = currentId;
        return;
      }
      lastCardIdRef.current = currentId;
      if (!rated) {
        testRequestVersionRef.current += 1;
        setTestLoading(false);
        setShowDefinition(false);
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
      }
    }
  }, [cards, currentIndex, showDefinition, rated]);

  // ── Reset justCompleted when new cards become due ──
  useEffect(() => {
    if (cards.length > 0 && justCompleted) {
      setJustCompleted(false);
      // Also reset currentIndex to start from the beginning of the new batch
      setCurrentIndex(0);
    }
  }, [cards.length, justCompleted]);

  // ── Reset session state when language changes ──
  useEffect(() => {
    setJustCompleted(false);
    setCurrentIndex(0);
  }, [l2Code]);

  // ── Keyboard shortcuts (after reveal: rate with 1-4, Space/Enter = Good) ──
  useEffect(() => {
    if (!showDefinition || rated) return;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      if (key === '1') handleRate('again');
      else if (key === '2') handleRate('hard');
      else if (key === '3' || key === ' ' || key === 'Enter') handleRate('good');
      else if (key === '4') handleRate('easy');
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDefinition, rated, handleRate]);

  // ── Keyboard shortcuts (before reveal: Space/Enter to reveal) ──
  useEffect(() => {
    if (showDefinition || rated) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleReveal();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDefinition, rated, handleReveal]);

  // ── Keyboard shortcut: u = unsave the current word (always active) ──
  useEffect(() => {
    if (cards.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleRemove();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cards.length, handleRemove]);

  // ── Keyboard shortcut: Ctrl/Cmd+Z to undo the last rating ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo]);

  // ── Anki-style card counts (new / again / review) ──
  // Must be BEFORE any conditional returns (React hooks rule).
  const langCardsForCounts = store.cards[l2Code] ?? {};
  const cardCounts = useMemo(
    () => fsrs.countDeckStates(l2SavedWords, langCardsForCounts, { dailyNewLimit: dailyLimit }),
    [l2SavedWords, langCardsForCounts, dailyLimit],
  );
  useEffect(() => {
    const budget = fsrs.getNewCardBudget(
      l2SavedWords,
      langCardsForCounts,
      dailyLimit,
      Date.now(),
      dayStartHour,
    );
    log('[SRS] cardCounts', {
      l2: l2Code,
      ...cardCounts,
      dailyLimit,
      dayStartHour,
      remaining: budget.remaining,
      savedWords: l2SavedWords.length,
      cards: Object.keys(langCardsForCounts).length,
    });
  }, [cardCounts, dailyLimit, dayStartHour, l2Code, l2SavedWords, langCardsForCounts]);

  const currentCard = cards[currentIndex];
  const currentCardState = currentCard ? fsrs.getCardState(currentCard.srs) : null;
  const definitionTestAnswered = reviewMode === 'test'
    && testQuestions.some((question, index) => question.kind === 'definition' && Boolean(testAnswers[index]));
  const showContextTranslation = showDefinition || definitionTestAnswered;
  /** Every form the saved word can appear as: canonical, legacy context, and
   *  per-instance surfaces (multi-token selections like "got even with me"
   *  saved under the canonical "to get even with someone"). */
  const highlightForms = useMemo(() => {
    const sw = currentCard?.word;
    if (!sw) return [];
    const set = new Set<string>(sw.forms ?? []);
    if (sw.context?.form) set.add(sw.context.form);
    for (const inst of sw.instances ?? []) if (inst.form) set.add(inst.form);
    return [...set];
  }, [currentCard?.word]);

  // Target highlight for the context sentence: match by ALL of the saved
  // word's forms (head + inflections) and by dictionary-entry id — not just
  // the exact `context.form`. The sentence may contain an inflected surface
  // form (e.g. 言い寄りました) that differs from the head form (言い寄る); the
  // dictionary tabs already use this highlightForms + highlightEntryIds
  // pattern. Stable id array so TokenizedText's highlightEntryIdSet memo
  // doesn't churn on every render.
  const targetHighlightEntryIds = useMemo(
    () => (currentCard ? [currentCard.word.id] : []),
    [currentCard?.word.id],
  );

  // ── Clear stale context translation when card changes ──
  useEffect(() => {
    setContextTranslation(null);
    setContextTranslating(false);
  }, [currentCard?.word.id]);

  // ── Per-card L1 dictionary lookup (non-English L1 users) ──
  // Batch lookup returns English-only definitions for speed. When the user
  // reveals a card and their L1 is not English, fetch the L1-translated
  // entry so they see definitions in their language.
  useEffect(() => {
    if (!showDefinition || l1.code === 'en') return;
    const card = cards[currentIndex];
    if (!card) return;
    const sw = card.word;
    const form = firstLookupForm(sw);
    // Skip if we already have an L1 entry for this word
    if (l1Entry?.id === sw.id) return;

    // Reuse an L1-translated entry already fetched elsewhere (e.g. by the
    // dictionary popup) — keyed by entry id, so the same entry's definitions
    // are translated only once instead of on every reveal.
    const cached = getL1CachedEntry(l2Code, l1.code, sw.id);
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
        (sw as { head?: string }).head,
        sw.context?.form,
        ...(sw.instances ?? []).map((i) => i.form),
      ].filter((f): f is string => typeof f === 'string' && !!f && f !== '?')),
    ];

    // lookupL1Text dedupes concurrent fetches and caches each result by entry
    // id, so the popup and this back side always share the exact translation.
    let cancelled = false;
    (async () => {
      for (const candidate of candidates) {
        if (cancelled) return;
        const results = await lookupL1Text(candidate, l2Code, l1.code).catch(() => []);
        // Only accept the exact saved entry — a text-lookup can return a
        // different entry (e.g. EDICT instead of the saved LLM entry) and
        // would make the bookmark read "not saved".
        const match = results.find((e) => isSameEntryId(sw.id, e.id, baseCode(l2.code))) ?? null;
        if (match) {
          const normalized = match.id === sw.id ? match : { ...match, id: sw.id };
          setL1CachedEntry(l2Code, l1.code, normalized);
          setL1Entry(normalized);
          return;
        }
      }
      if (!cancelled) setL1Entry(null);
    })();
    return () => { cancelled = true; };
  }, [showDefinition, currentIndex, cards, l1.code, l2Code, l1Entry?.id, currentEntry?.id]);

  // ── Resolve the exact saved entry before showing the back side ──
  // The batch lookup caches curated entries by text; a saved LLM-generated
  // entry may not be in the cache yet, so fetch it by its exact id on reveal.
  // Never render a different entry under the saved word's id — that makes
  // the bookmark read "not saved" for an entry that is actually saved.
  useEffect(() => {
    const sw = currentCard?.word;
    if (!sw || !showDefinition || fallbackEntry || l1Entry?.id === sw.id) return;
    const id = sw.id;
    // An English cache hit must not block the L1 fetch — the whole point of
    // this effect is to replace the English definitions with translated ones.
    if (getL1CachedEntry(l2Code, l1.code, id)) return;

    let cancelled = false;
    setExactEntryLoading((prev) => ({ ...prev, [id]: true }));
    (async () => {
      const base = baseCode(l2.code);
      const form = firstLookupForm(sw);
      log('[review] exact-entry resolve', {
        id,
        form,
        forms: sw.forms,
        contextForm: sw.context?.form,
        instanceForms: (sw.instances ?? []).map((i) => i.form),
      });
      let exactFound = false;
      try {
        const decomposed = decomposeWordId(id, base);
        if (decomposed) {
          const res = await fetch(
            `${PYTHON_API_URL}/dictionary/entry?l2=${base}&dict=${encodeURIComponent(decomposed.dict)}&id=${encodeURIComponent(decomposed.id)}&l1=${baseCode(l1.code)}`,
          );
          if (res.ok) {
            const data = await res.json();
            const entry = data?.entry as DictionaryEntry | undefined;
            const matches = !!entry && isSameEntryId(id, entry.id, base);
            log('[review] exact-entry fetch', {
              id,
              dict: decomposed.dict,
              entryId: entry?.id,
              status: res.status,
              matches,
            });
            if (!cancelled && matches) {
              // Cache under the saved id even when the API returns the scoped
              // form (e.g. "ja-…" for a saved "llm-ja-…" id).
              const normalized = entry.id === id ? entry : { ...entry, id };
              setCachedEntryById(l2Code, normalized);
              // The /dictionary/entry response was requested with the user's
              // L1, so it is already translated — promote it to the L1 entry.
              setL1CachedEntry(l2Code, l1.code, normalized);
              setL1Entry(normalized);
              exactFound = true;
            }
          }
        }
      } catch {
        // Network failure — fall through to the text-lookup fallback.
      }

      // The saved id may be stale (e.g. the dictionary was updated and the old
      // EDICT row no longer resolves). Fall back to the best text-lookup entry
      // for the same head so the back side still shows a definition. The
      // bookmark reflects the current entry id, so it won't falsely show as
      // saved.
      if (!cancelled && !exactFound) {
        const pickBest = (results: DictionaryEntry[]): DictionaryEntry | undefined =>
          results.find((e) => isSameEntryId(id, e.id, base))
          ?? results.find((e) => e.head === form)
          ?? results.find((e) => e.match_type === 'exact')
          ?? results[0];

        const candidates = [
          ...new Set([
            form,
            ...(sw.forms ?? []),
            sw.context?.form,
            ...(sw.instances ?? []).map((i) => i.form),
          ].filter((f): f is string => typeof f === 'string' && !!f && f !== '?')),
        ];
        let cacheFound: DictionaryEntry | undefined;
        for (const candidate of candidates) {
          const fromCache = pickBest(getCachedEntries(base, candidate) ?? []);
          if (fromCache) {
            cacheFound = fromCache;
            break;
          }
        }
        if (cacheFound) {
          log('[review] fallback cache hit', { id, candidate: cacheFound.id, head: cacheFound.head });
          setFallbackEntry(cacheFound);
        } else {
          try {
            for (const candidate of candidates) {
              if (cancelled) break;
              const results = await lookupL1Text(candidate, l2Code, l1.code);
              log('[review] fallback lookup', {
                id,
                candidate,
                count: results.length,
                results: results.map((r) => ({ id: r.id, head: r.head, match_type: r.match_type })),
              });
              const found = pickBest(results);
              if (found) {
                setFallbackEntry(found);
                break;
              }
            }
          } catch {
            // Keep the no-definition state.
          }
        }
        if (!cancelled && !exactFound && !cacheFound) {
          log('[review] no definition after fallback', { id });
        }
      }
      if (!cancelled) {
        setExactEntryLoading((prev) => ({ ...prev, [id]: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [
    showDefinition,
    currentCard?.word.id,
    currentEntry,
    fallbackEntry,
    l2Code,
    l1.code,
    l2.code,
  ]);

  // Clear L1 entry when card changes
  useEffect(() => {
    setL1Entry(null);
    setFallbackEntry(null);
  }, [currentCard?.word.id]);

  // ── Auto-translate context text after the definition test (or back reveal) ──
  useEffect(() => {
    if (!showContextTranslation || !display.translation) return;

    const ctxText = currentCard?.word.context?.text;
    const savedTranslation = currentCard?.word.context?.translation;
    if (!ctxText || savedTranslation) {
      setContextTranslation(null);
      setContextTranslating(false);
      return;
    }

    const targetForm = currentCard?.word.context?.form
      ?? currentCard?.word.forms[0]
      ?? currentCard?.word.id;

    let cancelled = false;
    const fetchTranslation = async () => {
      setContextTranslating(true);
      try {
        // Send the original text plus the target form — the server wraps the
        // term in **bold** with its own tokenizer (the same one behind the
        // sentence highlight) and preserves the markers in the translation.
        const res = await fetch(`${PYTHON_API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: ctxText, form: targetForm, l1: baseCode(l1.code), l2: l2Code }),
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setContextTranslation(data?.translated_text ?? data?.translation ?? data?.text ?? null);
        }
      } catch { /* network error — silently ignore */ }
      finally {
        if (!cancelled) setContextTranslating(false);
      }
    };
    fetchTranslation();
    return () => { cancelled = true; };
  }, [showContextTranslation, currentCard?.word.context?.text, currentCard?.word.context?.form, l2Code, l1.code, display.translation]);

  // ── Render states ──

  // For authenticated users, wait for the row-API hydration to finish
  // (even when the account is genuinely empty) so we don't flash a false
  // "no cards to review" state while the cloud store is still loading.
  const isLoading = status === 'loading' || !settingsLoaded || !settingsCloudHydrated || !wordsLoaded || !srsLoaded || initializing
    || (status === 'authenticated' && (!cloudHydrated || !srsCloudHydrated));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t('msg.sign_in_to_review')}</p>
        <Link href="/login">
          <Button>{t('action.sign_in')}</Button>
        </Link>
      </div>
    );
  }

  // No saved words at all
  if (l2SavedWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{t('msg.no_words_to_review')}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t('msg.save_words_to_build_deck')}
        </p>
        <Link href={`/${l1.code}/${l2.code}/explore`}>
          <Button>{t('action.explore_videos')}</Button>
        </Link>
      </div>
    );
  }

  // All done — just finished reviewing all due cards
  if (justCompleted) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.due > Date.now())
      .sort((a, b) => a.due - b.due)[0];

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <h2 className="text-xl font-semibold">{t('msg.all_done_for_now')}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t('msg.all_done_desc')}
          {nextDue && (
            <> {t('msg.next_review')}: {formatNextDueLabel(nextDue.due, l1.code)}.</>
          )}
        </p>
        <div className="flex gap-3">
          <Link href={`/${l1.code}/${l2.code}/explore`}>
            <Button>{t('action.explore_videos')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // No due cards right now
  if (cards.length === 0) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.due > Date.now())
      .sort((a, b) => a.due - b.due)[0];

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <h2 className="text-xl font-semibold">{t('msg.no_cards_due')}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t('msg.no_cards_due_desc', { total: Object.keys(langCards).length, deck: l2.name })}
          {nextDue ? (
            <> {t('msg.next_review_date', { date: formatNextDueLabel(nextDue.due, l1.code) })}</>
          ) : (
            <> {t('msg.save_more_words')}</>
          )}
        </p>
        <Link href={`/${l1.code}/${l2.code}/explore`}>
          <Button>{t('action.explore_videos')}</Button>
        </Link>
      </div>
    );
  }

  if (!currentCard) return null;

  // Prefer the L1-translated entry (fetched on reveal for non-English users)
  // over the cached English-only entry from batch lookup.
  const entry = l1Entry ?? fallbackEntry ?? currentCard.entry;
  const wordCtx = currentCard.word.context ?? { form: wordForm, text: '', textTitle: '' };
  const srs = currentCard.srs;
  // Keep later tests hidden until the preceding test has been answered.
  const visibleTestQuestions = testQuestions.slice(0, testQuestionIndex + 1);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="inline-flex rounded-lg border border-border p-1" role="group" aria-label={t('review.test_mode')}>
          <button type="button" onClick={() => { changeReviewMode('recall'); }} className={`rounded-md px-3 py-1.5 text-sm ${reviewMode === 'recall' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t('review.recall_mode')}</button>
          <button type="button" onClick={() => { changeReviewMode('test'); }} className={`rounded-md px-3 py-1.5 text-sm ${reviewMode === 'test' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{t('review.test_mode')}</button>
        </div>
        <span className="text-sm text-muted-foreground flex items-center gap-2 text-xs">
            {cardCounts.newCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span className={`text-blue-600 dark:text-blue-400 tabular-nums ${currentCardState === 'new' ? 'underline decoration-2 underline-offset-4' : ''}`}>{cardCounts.newCount}</span>
              </span>
            )}
            {cardCounts.againCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <span className={`text-red-600 dark:text-red-400 tabular-nums ${currentCardState === 'learning' || currentCardState === 'relearning' ? 'underline decoration-2 underline-offset-4' : ''}`}>{cardCounts.againCount}</span>
              </span>
            )}
            {cardCounts.reviewCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className={`text-green-600 dark:text-green-400 tabular-nums ${currentCardState === 'review' ? 'underline decoration-2 underline-offset-4' : ''}`}>{cardCounts.reviewCount}</span>
              </span>
            )}
          </span>
      </div>

      {/* Card */}
      <div
        className={`bg-card border rounded-xl p-4 sm:p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center select-none
          ${!showDefinition && !rated ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''}`}
        onClick={() => {
          // Tapping the card front reveals the answer. Rating is done only via
          // the explicit buttons — no tap-to-rate zones on the card.
          if (!showDefinition && !rated) handleReveal();
        }}
      >
        {/* Context sentence — always visible, tokenized/interactive */}
        {wordCtx.text && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-left w-full">
            <p className="text-xs text-muted-foreground mb-1 font-medium">{t('review.context_label')}</p>
            <TextActionMenu
              text={wordCtx.text}
              l2Code={l2Code}
              l1Code={baseCode(l1.code)}
            >
              <TokenizedText
                text={wordCtx.text}
                l2Code={l2Code}
                highlightForm={wordCtx.form}
                highlightForms={highlightForms}
                highlightEntryIds={targetHighlightEntryIds}
                phoneticsOnHighlight={showDefinition}
                quickGlossOnHighlight={showDefinition}
                context={{
                  youtube_id: wordCtx.youtube_id,
                  videoTitle: wordCtx.videoTitle,
                }}
              />
            </TextActionMenu>
            <div className="text-xs text-muted-foreground/70 mt-1">
              <SavedWordSource context={wordCtx} date={currentCard.word.date} />
            </div>
            {showContextTranslation && display.translation && !wordCtx.translation && !contextTranslation && contextTranslating && (
              <TranslationSkeleton text={wordCtx.text} className="mt-2 border-t border-border pt-2" barClassName="h-3" />
            )}
            {showContextTranslation && display.translation && (wordCtx.translation || contextTranslation) && (
              wordCtx.translation ? (
                <p
                  className="mt-2 leading-relaxed text-muted-foreground border-t border-border pt-2"
                  style={{ fontSize: `${clampTranslationSize(tokenizedText.translationSize)}rem` }}
                >
                  {wordCtx.translation}
                </p>
              ) : (
                <div
                  className="mt-2 leading-relaxed text-muted-foreground border-t border-border pt-2"
                  style={{ fontSize: `${clampTranslationSize(tokenizedText.translationSize)}rem` }}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => (
                        <strong className="font-semibold text-primary">{children}</strong>
                      ),
                    }}
                  >
                    {contextTranslation ?? ''}
                  </ReactMarkdown>
                </div>
              )
            )}
          </div>
        )}

        {/* No saved context (e.g. word saved from dictionary search):
            show the headword itself so the reviewer knows what's being tested. */}
        {!wordCtx.text && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg w-full text-center">
            <p className="text-2xl font-bold text-foreground">{wordForm}</p>
          </div>
        )}

        {/* SRS info (compact) */}
        <p className="text-xs text-muted-foreground mb-4">
          {srs.state === 0 ? t('review.srs_new') : fsrs.srsDueLabel(srs)}
          {srs.reps > 0 && (
            <>{' · '}{t('review.srs_review', { count: srs.reps })}</>
          )}
        </p>

        {testError && (
          <div className="mt-4 w-full rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <p>{testError}</p>
            <button type="button" onClick={handleRetryTestQuestions} className="mt-2 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium hover:bg-destructive/10">
              {t('action.try_again')}
            </button>
          </div>
        )}

        {/* Test results stay on screen; each answered question is followed by the next. */}
        {reviewMode === 'test' && testQuestions.length > 0 ? (
          <div className="mt-4 w-full space-y-6 text-left" onClick={(e) => e.stopPropagation()}>
            {visibleTestQuestions.map((question, questionIndex) => {
              const result = testAnswers[questionIndex];
              const isCurrent = questionIndex === testQuestionIndex;
              return (
                <div key={`${question.kind}-${questionIndex}`} className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <p className="font-medium text-foreground">{question.prompt}</p>
                  {question.choices.map((choice, index) => {
                    const isSelected = result?.answer === choice;
                    const isCorrectChoice = Boolean(result) && choice === question.correctAnswer;
                    const choiceClass = result
                      ? isCorrectChoice ? 'border-green-500 bg-green-500/10' : isSelected ? 'border-destructive bg-destructive/10' : 'border-border bg-background opacity-60'
                      : 'border-border bg-background hover:border-primary';
                    return (
                      <button key={`${choice}-${index}`} type="button" disabled={Boolean(result) || !isCurrent} onClick={() => handleTestAnswer(choice)} className={`w-full rounded-lg border px-4 py-3 text-left text-sm disabled:cursor-default ${choiceClass}`}>
                        <span className="mr-2 font-semibold">{String.fromCharCode(97 + index)}.</span>{choice}
                      </button>
                    );
                  })}
                  {result && <p className={`text-sm font-semibold ${result.correct ? 'text-green-600' : 'text-destructive'}`}>{result.correct ? t('review.answer_correct') : t('review.answer_incorrect')}</p>}
                </div>
              );
            })}
          </div>
        ) : !showDefinition && reviewMode === 'recall' ? (
          <Button onClick={handleReveal} variant="outline" size="lg" className="mt-4 gap-2">
            {t('review.show_definition')}
          </Button>
        ) : reviewMode === 'test' && testLoading ? (
          <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : null}

        {showDefinition && (
          <div className="mt-4 w-full text-left space-y-3">
            {entry ? (
              <DictionaryEntryTabs
                entry={entry}
                showDefinitionTab
                embedded
                l2Code={l2Code}
                l1Code={baseCode(l1.code)}
                saveContext={{ form: wordForm, text: wordCtx.text, youtube_id: wordCtx.youtube_id, videoTitle: wordCtx.videoTitle }}
                contextText={wordCtx.text}
                contextForm={wordCtx.form}
                onCardClick={(e) => { const dictId = e.dictionary?.id ?? 'llm'; router.push(buildEntryRoute(l1.code, l2.code, dictId, e.id)); }}
              />
            ) : exactEntryLoading[currentCard.word.id] ? (
              <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <p className="text-muted-foreground italic text-sm text-center">{t('review.no_definition_available')}</p>
            )}
          </div>
        )}
      </div>

      {/* Rating buttons (only visible after reveal) */}
      {showDefinition && (
        <>
          {!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
              <p className="text-sm font-medium">{t('msg.upgrade_to_pro_banner')}</p>
              <Link
                href={`/${l1.code}/${l2.code}/go-pro`}
                className="mt-1 inline-block text-sm font-semibold text-primary underline"
              >
                {t('action.upgrade_to_pro')}
              </Link>
            </div>
          )}
          <div className="grid grid-cols-4 gap-3">
            {RATING_LABELS.map(({ key, label, color, keyShortcut }) => (
              <button
                key={key}
                onClick={() => handleRate(key as 'again' | 'hard' | 'good' | 'easy')}
                disabled={rated || (suggestedRating ? key !== suggestedRating : false) || (!isPro && reviewsDoneToday >= FREE_SRS_DAILY_CAP)}
                className={`${color} text-white rounded-lg py-3 px-2 text-sm font-medium transition-all
                  hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                  flex flex-col items-center gap-1`}
              >
                <span className="flex items-center gap-1.5">
                  {label}
                  <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 text-xs font-mono">
                    {keyShortcut}
                  </kbd>
                </span>
                <span className="text-xs opacity-80">{currentCard ? nextReviewLabelFor(currentCard, key) : ''}</span>
              </button>
            ))}
          </div>

          {/* Keyboard shortcuts hint */}
          <p className="text-center text-xs text-muted-foreground mt-4">
            {t.rich('review.shortcut_hint', {
              k1: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">1</kbd>,
              k2: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">4</kbd>,
              space: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Space</kbd>,
              enter: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Enter</kbd>,
            })}
            {' · '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">u</kbd>
            {' '}{t('action.delete').toLowerCase()}
          </p>
        </>
      )}
    </div>
  );
}
