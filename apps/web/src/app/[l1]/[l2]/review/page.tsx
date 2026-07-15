'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useSrs } from '@/hooks/use-srs';
import { useSpeech } from '@/hooks/use-speech';
import { sm2, newCard, remainingNewCardsToday, formatPronunciation } from '@langplayer/utils';
import type { SrsFields, DictionaryEntry, SavedWord } from '@langplayer/shared';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { TokenizedText } from '@/components/tokenized-text';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Volume2,
  BookmarkCheck,
} from 'lucide-react';

type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Quality → SM-2 quality mapping */
const RATING_MAP: Record<Rating, 0 | 2 | 4 | 5> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
};

const RATING_LABELS = [
  { key: 'again', label: 'Again', hint: 'Forgot entirely', color: 'bg-red-600 hover:bg-red-700', keyShortcut: '1' },
  { key: 'hard', label: 'Hard', hint: 'Recalled with difficulty', color: 'bg-orange-500 hover:bg-orange-600', keyShortcut: '2' },
  { key: 'good', label: 'Good', hint: 'Recalled correctly', color: 'bg-green-600 hover:bg-green-700', keyShortcut: '3' },
  { key: 'easy', label: 'Easy', hint: 'Instant recall', color: 'bg-blue-600 hover:bg-blue-700', keyShortcut: '4' },
] as const;

interface ReviewCard {
  word: SavedWord;
  srs: SrsFields;
  entry: DictionaryEntry | null;
}

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const { l1, l2 } = useLanguage();
  const { savedWords, loaded: wordsLoaded, removeSavedWord } = useSavedWordsContext();
  const { store, loaded: srsLoaded, updateCard, removeCard, dailyNewLimit: dailyLimit } = useSrs();
  const { speak } = useSpeech();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [fetchingEntries, setFetchingEntries] = useState(false);
  const [rated, setRated] = useState(false);
  const [initializing, setInitializing] = useState(false);
  /** True when the user just finished reviewing the last due card. */
  const [justCompleted, setJustCompleted] = useState(false);
  /** Cache of fetched dictionary entries keyed by saved word ID. */
  const [entriesCache, setEntriesCache] = useState<Record<string, DictionaryEntry | null>>({});
  /** Track which fetch batch we're on so we can ignore stale results. */
  const fetchGenerationRef = useRef(0);

  const l2Code = baseCode(l2.code);
  const l2SavedWords = useMemo(() => savedWords[l2Code] ?? [], [savedWords, l2Code]);

  // ── Auto-initialize SRS cards for saved words that don't have them ──
  useEffect(() => {
    if (!srsLoaded || !wordsLoaded) return;

    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const unscheduled = l2SavedWords.filter((sw) => !langCards[sw.id]);

    if (unscheduled.length > 0) {
      // Respect daily new card limit
      const remaining = remainingNewCardsToday(langCards, dailyLimit);
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
  }, [srsLoaded, wordsLoaded, l2SavedWords, store, l2Code, dailyLimit, updateCard]);

  // ── Compute due cards (without entries — entries merged below) ──
  const dueCards = useMemo((): Omit<ReviewCard, 'entry'>[] => {
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
      })
      .map((sw) => ({
        word: sw,
        srs: langCards[sw.id] || newCard(),
      }));
  }, [l2SavedWords, store, l2Code]);

  // ── Merge due cards with cached entries ──
  const cards: ReviewCard[] = useMemo(
    () => dueCards.map((dc) => ({
      ...dc,
      entry: entriesCache[dc.word.id] ?? null,
    })),
    [dueCards, entriesCache],
  );

  // ── Fetch dictionary entries for due cards not yet cached ──
  useEffect(() => {
    if (dueCards.length === 0 || fetchingEntries || initializing) return;

    const uncachedIds = dueCards
      .map((dc) => dc.word.id)
      .filter((id) => !(id in entriesCache));

    if (uncachedIds.length === 0) return;

    const generation = ++fetchGenerationRef.current;

    const fetchEntries = async () => {
      setFetchingEntries(true);
      const controller = new AbortController();
      const batchSize = 8;
      const newEntries: Record<string, DictionaryEntry | null> = {};

      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        const batchIds = uncachedIds.slice(i, i + batchSize);
        const batchCards = batchIds
          .map((id) => dueCards.find((dc) => dc.word.id === id))
          .filter(Boolean) as Omit<ReviewCard, 'entry'>[];

        const results = await Promise.all(
          batchCards.map(async (card) => {
            try {
              const res = await fetch(`${PYTHON_API_URL}/dictionary/lookup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: card.word.forms[0] || card.word.id,
                  l2: l2Code,
                  l1: baseCode(l1.code),
                }),
                signal: controller.signal,
              });
              if (!res.ok) return { id: card.word.id, entry: null };
              const data = await res.json();
              const entries: DictionaryEntry[] = data.results ?? [];
              const match =
                entries.find((e) => e.id === card.word.id) ||
                entries.find((e) => e.head === card.word.forms[0]) ||
                entries[0];
              return { id: card.word.id, entry: match || null };
            } catch {
              return { id: card.word.id, entry: null };
            }
          })
        );

        for (const r of results) {
          newEntries[r.id] = r.entry;
        }
      }

      // Only apply if this is still the latest fetch generation
      if (!controller.signal.aborted && generation === fetchGenerationRef.current) {
        setEntriesCache((prev) => ({ ...prev, ...newEntries }));
        setFetchingEntries(false);
      }
    };

    fetchEntries();
  }, [dueCards, fetchingEntries, initializing]);

  // ── Handlers ──

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    setRated(true);
    setShowDefinition(false); // hide answer immediately for next card

    const card = cards[currentIndex];
    if (!card) {
      setRated(false);
      return;
    }

    // Detect if this is the last card in the session
    const isLastCard = currentIndex >= cards.length - 1;

    const sm2Quality = RATING_MAP[quality];
    const updated = sm2(card.srs, sm2Quality);
    updateCard(l2Code, card.word.id, updated);

    if (isLastCard) {
      setJustCompleted(true);
    }

    setTimeout(() => {
      setRated(false);
    }, 400);
  }, [cards, currentIndex, rated, updateCard, l2Code]);

  const handleReveal = useCallback(() => {
    setShowDefinition(true);
  }, []);

  /** Remove this word from saved words and SRS. The card drops from the list naturally. */
  const handleRemove = useCallback(() => {
    const card = cards[currentIndex];
    if (!card) return;
    removeSavedWord(l2Code, card.word.id);
    removeCard(l2Code, card.word.id);
    setShowDefinition(false);
    setRated(false);
    // Don't increment currentIndex — the removed card drops from the array,
    // so the next card shifts into the current slot.
  }, [cards, currentIndex, l2Code, removeSavedWord, removeCard]);

  /** Speak the word form. */
  const handleSpeak = useCallback(() => {
    const card = cards[currentIndex];
    if (!card) return;
    const form = card.word.forms[0] || card.entry?.head || card.word.id;
    speak(form, l2Code);
  }, [cards, currentIndex, l2Code, speak]);

  // ── Clamp currentIndex if it exceeds the cards array (cards shrunk after removal) ──
  useEffect(() => {
    if (cards.length > 0 && currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex]);

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
    setEntriesCache({});
  }, [l2Code]);

  // ── Keyboard shortcuts (after reveal: rate with 1-4) ──
  useEffect(() => {
    if (!showDefinition || rated) return;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      if (key === '1') handleRate('again');
      else if (key === '2') handleRate('hard');
      else if (key === '3') handleRate('good');
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

  // ── Render states ──

  const isLoading = status === 'loading' || !wordsLoaded || !srsLoaded || initializing;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {initializing ? 'Preparing review cards...' : 'Loading...'}
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Sign in to review words.</p>
        <Link href="/login">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  // No saved words at all
  if (l2SavedWords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Words to Review</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Save words while watching videos to build your review deck.
          Tap any word in the subtitles to look it up and save it.
        </p>
        <Link href={`/${l1.code}/${l2.code}/explore`}>
          <Button>Explore Videos</Button>
        </Link>
      </div>
    );
  }

  // Fetching dictionary entries
  if (fetchingEntries && cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading review cards...</p>
      </div>
    );
  }

  // All done — just finished reviewing all due cards
  if (justCompleted) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.nextReview > Date.now())
      .sort((a, b) => a.nextReview - b.nextReview)[0];

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <h2 className="text-xl font-semibold">All Done for Now!</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You&apos;ve reviewed all due cards in {l2.name}.
          {nextDue && (
            <> Next review: {new Date(nextDue.nextReview).toLocaleDateString()}.</>
          )}
        </p>
        <div className="flex gap-3">
          <Link href={`/${l1.code}/${l2.code}/explore`}>
            <Button variant="outline">Explore Videos</Button>
          </Link>
        </div>
      </div>
    );
  }

  // No due cards right now
  if (cards.length === 0) {
    const langCards: Record<string, SrsFields> = store.cards[l2Code] ?? {};
    const nextDue = Object.values(langCards)
      .filter((c) => c.nextReview > Date.now())
      .sort((a, b) => a.nextReview - b.nextReview)[0];

    const unscheduledCount = l2SavedWords.filter((sw) => !langCards[sw.id]).length;
    const remaining = remainingNewCardsToday(langCards, dailyLimit);
    const queued = unscheduledCount > 0 && remaining === 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Cards Due</h2>
        <p className="text-muted-foreground text-center max-w-md">
          You have {Object.keys(langCards).length} {Object.keys(langCards).length === 1 ? 'card' : 'cards'} in your {l2.name} deck.
          {nextDue ? (
            <> Your next review is on {new Date(nextDue.nextReview).toLocaleDateString()}.</>
          ) : (
            <> Save more words to continue learning.</>
          )}
          {queued && (
            <> {unscheduledCount} more {unscheduledCount === 1 ? 'word is' : 'words are'} queued for tomorrow&apos;s batch.</>
          )}
          {unscheduledCount > 0 && remaining > 0 && (
            <> {remaining} new {remaining === 1 ? 'card' : 'cards'} available today (of {dailyLimit}/day).</>
          )}
        </p>
        <Link href={`/${l1.code}/${l2.code}/explore`}>
          <Button variant="outline">Explore Videos</Button>
        </Link>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  if (!currentCard) return null;

  const entry = currentCard.entry;
  const wordForm = currentCard.word.forms[0] || entry?.head || currentCard.word.id;
  const srs = currentCard.srs;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link
          href={`/${l1.code}/${l2.code}/explore`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-muted rounded-full mb-8">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${((currentIndex + (rated ? 1 : 0)) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="bg-card border rounded-xl p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center">
        {/* Action buttons row */}
        <div className="w-full flex justify-end gap-1 mb-2 -mt-2">
          <button
            onClick={handleSpeak}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Pronounce"
          >
            <Volume2 className="h-5 w-5" />
          </button>
          <button
            onClick={handleRemove}
            className="p-2 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
            title="Remove from review"
          >
            <BookmarkCheck className="h-5 w-5 fill-current" />
          </button>
        </div>

        {/* Word */}
        <h1 className="text-3xl font-bold mb-2" lang={l2.code}>
          {wordForm}
        </h1>

        {/* Context sentence — always visible, tokenized/interactive */}
        {currentCard.word.context.text && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg text-left w-full">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Context</p>
            <TokenizedText
              text={currentCard.word.context.text}
              l2Code={l2Code}
              context={{
                form: wordForm,
                text: currentCard.word.context.text,
                youtube_id: currentCard.word.context.youtube_id,
                videoTitle: currentCard.word.context.videoTitle,
              }}
            />
            {currentCard.word.context.videoTitle && (
              <p className="text-xs mt-2 opacity-70">
                — {currentCard.word.context.videoTitle}
              </p>
            )}
          </div>
        )}

        {/* SRS info (compact) */}
        <p className="text-xs text-muted-foreground mb-4">
          {srs.interval > 0 ? `${srs.interval}d` : 'new'}
          {' · '}{srs.ease.toFixed(1)}x
          {' · '}{srs.repetitions} review{srs.repetitions !== 1 ? 's' : ''}
        </p>

        {/* Definition (hidden until revealed) */}
        {!showDefinition ? (
          <Button
            onClick={handleReveal}
            variant="outline"
            size="lg"
            className="mt-4 gap-2"
          >
            Show Definition
          </Button>
        ) : (
          <div className="mt-4 w-full text-center space-y-3">
            {/* Pronunciation (hidden until reveal) */}
            {(() => {
              const pron = formatPronunciation(entry, l2Code);
              if (pron) {
                return (
                  <p className="text-lg text-muted-foreground" lang={l2.code}>
                    {pron}
                  </p>
                );
              }
              return null;
            })()}

            {entry?.definitions && entry.definitions.length > 0 ? (
              <div className="space-y-1.5">
                {entry.definitions.slice(0, 5).map((def, i) => (
                  <div key={i} className="text-base">
                    {entry.part_of_speech && i === 0 ? (
                      <span className="text-muted-foreground text-sm mr-1">
                        {entry.part_of_speech}
                      </span>
                    ) : null}
                    <span>{def}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic text-sm">
                No definition available. Look up this word while watching videos.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Rating buttons (only visible after reveal) */}
      {showDefinition && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {RATING_LABELS.map(({ key, label, hint, color, keyShortcut }) => (
              <button
                key={key}
                onClick={() => handleRate(key as 'again' | 'hard' | 'good' | 'easy')}
                disabled={rated}
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
                <span className="text-xs opacity-80">{hint}</span>
              </button>
            ))}
          </div>

          {/* Keyboard shortcuts hint */}
          <p className="text-center text-xs text-muted-foreground mt-4">
            Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">1</kbd>–<kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">4</kbd>
            to rate · <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Space</kbd>
            or <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Enter</kbd> to reveal
          </p>
        </>
      )}
    </div>
  );
}

