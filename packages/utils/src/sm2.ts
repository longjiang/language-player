/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Implements the SuperMemo 2 algorithm used by Anki and other SRS tools.
 * Quality ratings:
 *   0 = complete blackout (forgot entirely)
 *   1 = incorrect, but correct answer looked familiar
 *   2 = incorrect, but correct answer was easy to recall after seeing it
 *   3 = correct with significant difficulty
 *   4 = correct after hesitation
 *   5 = correct with perfect recall (easy)
 *
 * Returns updated SrsFields. Does not mutate the input.
 *
 * Usage:
 *   import { sm2, newCard } from '@langplayer/utils';
 *   const card = sm2(card, quality);
 */

export interface SrsFields {
  ease: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  /** Unix-ms timestamp when the card was first created. Used to limit new cards/day. */
  createdAt?: number;
}

/** Create a new, unreviewed card. */
export function newCard(): SrsFields {
  const now = Date.now();
  return {
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: now,
    lastReview: now,
    createdAt: now,
  };
}

/** Apply the SM-2 algorithm to a card after a review. */
export function sm2(card: SrsFields, quality: 0 | 1 | 2 | 3 | 4 | 5): SrsFields {
  const now = Date.now();

  if (quality < 3) {
    // Failed — reset
    return {
      ease: card.ease,
      interval: 1,         // review again in 1 day
      repetitions: 0,      // reset streak
      nextReview: now + 60_000, // show again in 1 minute (same session)
      lastReview: now,
      createdAt: card.createdAt ?? now,
    };
  }

  // Passed — graduate the card
  const newEase = Math.max(
    1.3,
    card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  let newInterval: number;
  if (card.repetitions === 0) {
    newInterval = 1;       // 1st pass → 1 day
  } else if (card.repetitions === 1) {
    newInterval = 6;       // 2nd pass → 6 days
  } else {
    newInterval = Math.round(card.interval * newEase);
  }

  return {
    ease: newEase,
    interval: newInterval,
    repetitions: card.repetitions + 1,
    nextReview: now + newInterval * 86_400_000, // days → ms
    lastReview: now,
    createdAt: card.createdAt ?? now,
  };
}

/** Check if a card is due for review. */
export function isDue(card: SrsFields): boolean {
  return card.nextReview <= Date.now();
}

/** Get all due cards from a record of cards. */
export function getDueCards(cards: Record<string, SrsFields>): string[] {
  const now = Date.now();
  return Object.entries(cards)
    .filter(([_, c]) => c.nextReview <= now)
    .sort(([, a], [, b]) => a.nextReview - b.nextReview)
    .map(([id]) => id);
}

/** Get the number of cards due today. */
export function countDueCards(cards: Record<string, SrsFields>): number {
  const now = Date.now();
  let count = 0;
  for (const c of Object.values(cards)) {
    if (c.nextReview <= now) count++;
  }
  return count;
}

/** Default max new cards introduced per day. */
export const DEFAULT_DAILY_NEW_LIMIT = 20;

/** Count how many cards were created today (by createdAt timestamp). */
export function countNewCardsToday(cards: Record<string, SrsFields>): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();

  let count = 0;
  for (const c of Object.values(cards)) {
    if (c.createdAt && c.createdAt >= cutoff) count++;
  }
  return count;
}

/** How many more new cards can be introduced today. Never negative. */
export function remainingNewCardsToday(
  cards: Record<string, SrsFields>,
  limit: number = DEFAULT_DAILY_NEW_LIMIT,
): number {
  return Math.max(0, limit - countNewCardsToday(cards));
}

/** Get the next review time as a human-readable countdown. */
export function nextReviewText(card: SrsFields): string {
  const diff = card.nextReview - Date.now();
  if (diff <= 0) return 'now';

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;

  const months = Math.floor(days / 30);
  return `${months}mo`;
}

// ── Store shape ───────────────────────────────

/** Top-level SRS progress store. Cards keyed by l2Code → wordId. */
export interface SrsProgressStore {
  settings: {
    dailyNewLimit: number;
  };
  cards: Record<string, Record<string, SrsFields>>;
}

/** Create a new, empty SRS progress store with defaults. */
export function createSrsStore(): SrsProgressStore {
  return {
    settings: { dailyNewLimit: DEFAULT_DAILY_NEW_LIMIT },
    cards: {},
  };
}

/** Safely get the cards record for a given language code. */
export function getLanguageCards(
  store: SrsProgressStore,
  l2Code: string,
): Record<string, SrsFields> {
  return store.cards[l2Code] ?? {};
}
