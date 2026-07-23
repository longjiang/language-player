'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useSrs } from '@/hooks/use-srs';
import { useSpeech } from '@/hooks/use-speech';
import { sm2, newCard, remainingNewCardsToday } from '@langplayer/utils';
import type { SrsFields, DictionaryEntry, SavedLexicalItemRecord } from '@langplayer/shared';
import { normalizeInstances } from '@/hooks/use-saved-words';
import { baseCode } from '@/lib/language-data';
import { getShowTranslation } from '@/lib/settings';
import { PYTHON_API_URL } from '@/lib/api-url';
import { Button } from '@/components/ui/button';
import { TokenizedText } from '@/components/tokenized-text';
import { TextActionMenu } from '@/components/text-action-menu';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { SavedWordSource } from '@/components/saved-word-source';
import { useT } from '@/hooks/use-t';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Quality → SM-2 quality mapping */
const RATING_MAP: Record<Rating, 0 | 2 | 4 | 5> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
};

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

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const { l1, l2 } = useLanguage();
  const { savedWords, loaded: wordsLoaded, removeSavedWord } = useSavedWordsContext();
  const { store, loaded: srsLoaded, updateCard, removeCard, dailyNewLimit: dailyLimit } = useSrs();
  const { speak } = useSpeech();
  const t = useT();
  const RATING_LABELS = useRatingLabels();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [fetchingEntries, setFetchingEntries] = useState(false);
  const [rated, setRated] = useState(false);
  const [initializing, setInitializing] = useState(false);
  /** True when the user just finished reviewing the last due card. */
  const [justCompleted, setJustCompleted] = useState(false);
  /** Cache of fetched dictionary entries keyed by saved word ID. */
  const [entriesCache, setEntriesCache] = useState<Record<string, DictionaryEntry | null>>({});
  /** Auto-translated context text (fetched on-demand when no saved translation exists). */
  const [contextTranslation, setContextTranslation] = useState<string | null>(null);
  /** Track which fetch batch we're on so we can ignore stale results. */
  const fetchGenerationRef = useRef(0);
  /** Track the current card's word ID to detect unsave-triggered card changes. */
  const lastCardIdRef = useRef<string | null>(null);

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

  /** Toast background/border colors matching the rating buttons. */
  const RATING_TOAST_COLORS: Record<Rating, string> = {
    again: '!bg-red-600 !border-red-700',
    hard:  '!bg-orange-500 !border-orange-600',
    good:  '!bg-green-600 !border-green-700',
    easy:  '!bg-blue-600 !border-blue-700',
  };

  const handleRate = useCallback((quality: Rating) => {
    if (rated) return;
    setRated(true);
    setShowDefinition(false); // hide answer immediately for next card

    const card = cards[currentIndex];
    if (!card) {
      setRated(false);
      return;
    }

    // Visual feedback via toast — matches button color
    const label = RATING_LABELS.find((r) => r.key === quality);
    if (label) {
      toast(label.label, {
        description: label.hint,
        duration: 600,
        className: `${RATING_TOAST_COLORS[quality]} !text-white !border`,
      });
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

  // ── When card changes without a rating (e.g. unsave), reset to front ──
  useEffect(() => {
    const card = cards[currentIndex];
    const currentId = card?.word.id ?? null;
    if (currentId && currentId !== lastCardIdRef.current) {
      lastCardIdRef.current = currentId;
      if (showDefinition && !rated) {
        setShowDefinition(false);
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
    setEntriesCache({});
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

  // ── Anki-style card counts (new / again / review) ──
  // Must be BEFORE any conditional returns (React hooks rule).
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

  const currentCard = cards[currentIndex];

  // ── Auto-translate context text when back is revealed (if no saved translation) ──
  useEffect(() => {
    if (!showDefinition || !getShowTranslation()) return;

    const ctxText = currentCard?.word.context?.text;
    const savedTranslation = currentCard?.word.context?.translation;
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
          body: JSON.stringify({ text: ctxText, l1: baseCode(l1.code), l2: l2Code }),
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
  }, [showDefinition, currentCard?.word.context?.text, l2Code, l1.code]);

  // ── Render states ──

  const isLoading = status === 'loading' || !wordsLoaded || !srsLoaded || initializing;

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

  // Fetching dictionary entries
  if (fetchingEntries && cards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
        <h2 className="text-xl font-semibold">{t('msg.all_done_for_now')}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t('msg.all_done_desc')}
          {nextDue && (
            <> {t('msg.next_review')}: {new Date(nextDue.nextReview).toLocaleDateString()}.</>
          )}
        </p>
        <div className="flex gap-3">
          <Link href={`/${l1.code}/${l2.code}/explore`}>
            <Button variant="outline">{t('action.explore_videos')}</Button>
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
        <h2 className="text-xl font-semibold">{t('msg.no_cards_due')}</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {t('msg.no_cards_due_desc', { total: Object.keys(langCards).length, deck: l2.name })}
          {nextDue ? (
            <> {t('msg.next_review_date', { date: new Date(nextDue.nextReview).toLocaleDateString() })}</>
          ) : (
            <> {t('msg.save_more_words')}</>
          )}
          {queued && (
            <> {unscheduledCount} {t('msg.more_queued', { count: unscheduledCount })}</>
          )}
          {unscheduledCount > 0 && remaining > 0 && (
            <> {remaining} {t('msg.new_cards_available', { count: remaining, limit: dailyLimit })}</>
          )}
        </p>
        <Link href={`/${l1.code}/${l2.code}/explore`}>
          <Button variant="outline">{t('action.explore_videos')}</Button>
        </Link>
      </div>
    );
  }

  if (!currentCard) return null;

  const entry = currentCard.entry;
  const wordForm = currentCard.word.forms[0] || entry?.head || currentCard.word.id;
  const wordCtx = currentCard.word.context ?? { form: wordForm, text: '', textTitle: '' };
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
          {t('action.back')}
        </Link>
        <span className="text-sm text-muted-foreground flex items-center gap-2 text-xs">
            {cardCounts.newCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span className="text-blue-600 dark:text-blue-400 tabular-nums">{cardCounts.newCount}</span>
              </span>
            )}
            {cardCounts.againCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                <span className="text-red-600 dark:text-red-400 tabular-nums">{cardCounts.againCount}</span>
              </span>
            )}
            {cardCounts.reviewCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                <span className="text-green-600 dark:text-green-400 tabular-nums">{cardCounts.reviewCount}</span>
              </span>
            )}
          </span>
      </div>

      {/* Card */}
      <div
        className={`bg-card border rounded-xl p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center select-none
          ${!showDefinition && !rated ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''}
          ${showDefinition && !rated ? 'cursor-pointer' : ''}`}
        onClick={(e) => {
          if (!showDefinition && !rated) {
            handleReveal();
          } else if (showDefinition && !rated) {
            // Left half → Again, right half → Good
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width / 2) {
              handleRate('again');
            } else {
              handleRate('good');
            }
          }
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
                context={{
                  form: wordForm,
                  text: wordCtx.text,
                  youtube_id: wordCtx.youtube_id,
                  videoTitle: wordCtx.videoTitle,
                }}
              />
            </TextActionMenu>
            <div className="text-xs text-muted-foreground/70 mt-1">
              <SavedWordSource context={wordCtx} date={currentCard.word.date} />
            </div>
            {showDefinition && getShowTranslation() && (wordCtx.translation || contextTranslation) && (
              <p className="text-sm mt-2 italic text-muted-foreground border-t border-border pt-2">
                {wordCtx.translation || contextTranslation}
              </p>
            )}
          </div>
        )}

        {/* SRS info (compact) */}
        <p className="text-xs text-muted-foreground mb-4">
          {srs.interval > 0 ? `${srs.interval}d` : t('review.srs_new')}
          {' · '}{srs.ease.toFixed(1)}x
          {' · '}{srs.repetitions} {t('review.srs_review')}{srs.repetitions !== 1 ? 's' : ''}
        </p>

        {/* Definition (hidden until revealed) */}
        {!showDefinition ? (
          <Button
            onClick={handleReveal}
            variant="outline"
            size="lg"
            className="mt-4 gap-2"
          >
            {t('review.show_definition')}
          </Button>
        ) : (
          <div className="mt-4 w-full text-left space-y-3">
            {/* Full dictionary entry card (hidden until reveal) */}
            {entry ? (
              <DictionaryEntryCard
                entry={entry}
                variant="full"
                embedded
                l2Code={l2Code}
                l1Code={baseCode(l1.code)}
                saveContext={{
                  form: wordForm,
                  text: wordCtx.text,
                  youtube_id: wordCtx.youtube_id,
                  videoTitle: wordCtx.videoTitle,
                }}
                contextText={wordCtx.text}
                contextForm={wordCtx.form}
              />
            ) : (
              <p className="text-muted-foreground italic text-sm text-center">
                {t('review.no_definition_available')}
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
            {t.rich('review.shortcut_hint', {
              k1: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">1</kbd>,
              k2: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">4</kbd>,
              space: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Space</kbd>,
              enter: () => <kbd className="px-1 py-0.5 bg-muted rounded text-xs mx-0.5">Enter</kbd>,
            })}
          </p>
        </>
      )}
    </div>
  );
}

