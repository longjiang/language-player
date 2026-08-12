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
 *
 * NOTE: `LegacySrsFields` is the legacy SM-2 card shape, kept for the transition
 * window (SPEC-066 Phase 0/6). The single type declaration lives in
 * `@langplayer/shared`; new FSRS cards use `FsrsCard` from `./fsrs-scheduler`.
 */

import type { LegacySrsFields, LegacySrsProgressStore } from '@langplayer/shared';

export type { LegacySrsFields, LegacySrsProgressStore };

/** Create a new, unreviewed card. */
export function newCard(): LegacySrsFields {
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
export function sm2(card: LegacySrsFields, quality: 0 | 1 | 2 | 3 | 4 | 5): LegacySrsFields {
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
export function isDue(card: LegacySrsFields): boolean {
  return card.nextReview <= Date.now();
}

/** Get all due cards from a record of cards. */
export function getDueCards(cards: Record<string, LegacySrsFields>): string[] {
  const now = Date.now();
  return Object.entries(cards)
    .filter(([_, c]) => c.nextReview <= now)
    .sort(([, a], [, b]) => a.nextReview - b.nextReview)
    .map(([id]) => id);
}

/** Get the number of cards due today. */
export function countDueCards(cards: Record<string, LegacySrsFields>): number {
  const now = Date.now();
  let count = 0;
  for (const c of Object.values(cards)) {
    if (c.nextReview <= now) count++;
  }
  return count;
}

/** Default max new cards introduced per day. */
export const DEFAULT_DAILY_NEW_LIMIT = 20;

/** A "new" (blue) card — created but never rated yet. A card leaves the new
 *  deck the moment it's rated, whether it passed (green) or failed (red). */
export function isNewCard(card: LegacySrsFields): boolean {
  const createdAt = card.createdAt ?? 0;
  return card.repetitions === 0 && (card.lastReview ?? createdAt) <= createdAt;
}

/** Count how many cards were created today (by createdAt timestamp). */
export function countNewCardsToday(cards: Record<string, LegacySrsFields>): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();

  let count = 0;
  for (const c of Object.values(cards)) {
    if (c.createdAt && c.createdAt >= cutoff) count++;
  }
  return count;
}

/**
 * Count cards created before today that are still sitting unreviewed in the
 * "new" deck (still blue — never rated). Cards created today are skipped —
 * they're already counted by `countNewCardsToday()`.
 */
export function countUnreviewedNewCards(cards: Record<string, LegacySrsFields>): number {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = todayStart.getTime();

  let count = 0;
  for (const c of Object.values(cards)) {
    const createdAt = c.createdAt ?? 0;
    if (createdAt >= cutoff) continue; // introduced today → counted by countNewCardsToday
    if (isNewCard(c)) count++;
  }
  return count;
}

/**
 * How many more new cards can be introduced today. Never negative.
 *
 * The budget does NOT roll over day to day: cards introduced today (whether or
 * not already rated) plus older cards still sitting unreviewed in the "new"
 * deck both count toward the daily limit. So if a user never reviews, the deck
 * stays capped at `limit` (e.g. 20) instead of growing by `limit` every day.
 */
export function remainingNewCardsToday(
  cards: Record<string, LegacySrsFields>,
  limit: number = DEFAULT_DAILY_NEW_LIMIT,
): number {
  return Math.max(0, limit - countNewCardsToday(cards) - countUnreviewedNewCards(cards));
}

/**
 * Compute the blue ("new") deck: the `limit` most recently saved words that
 * have no card yet or an unreviewed (blue) card, newest-saved first.
 *
 * New saves displace the oldest blue cards when the deck is full — a freshly
 * saved word enters the deck and the least-recent blue card is pushed back
 * (its card is removed) to make room. Rated cards (green/red) are never
 * displaced.
 *
 * @param savedWords Saved lexical items (only `id` and save `date` are read).
 * @param cards      Current SRS cards for this language (wordId → LegacySrsFields).
 * @param limit      Max blue deck size (the daily new-card limit).
 * @returns `toCreate` — word ids that should get a brand-new card,
 *          `toRemove` — word ids whose blue cards should be dropped.
 */
export function planNewDeck(
  savedWords: Array<{ id: string; date?: number }>,
  cards: Record<string, LegacySrsFields>,
  limit: number,
): { toCreate: string[]; toRemove: string[] } {
  const cap = Math.max(0, Math.floor(limit));

  const pool = savedWords
    .filter((sw) => {
      const srs = cards[sw.id];
      return !srs || isNewCard(srs);
    })
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  const desired = pool.slice(0, cap);

  return {
    toCreate: desired.filter((sw) => !cards[sw.id]).map((sw) => sw.id),
    toRemove: pool.slice(cap).filter((sw) => cards[sw.id]).map((sw) => sw.id),
  };
}

/** Get the next review time as a human-readable countdown. */
export function nextReviewText(card: LegacySrsFields): string {
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

/** Top-level SRS progress store. Cards keyed by l2Code → wordId.
 *  The type lives in @langplayer/shared; re-exported above for legacy code. */

/** Create a new, empty SRS progress store with defaults. */
export function createSrsStore(): LegacySrsProgressStore {
  return {
    settings: { dailyNewLimit: DEFAULT_DAILY_NEW_LIMIT },
    cards: {},
  };
}

/** Safely get the cards record for a given language code. */
export function getLanguageCards(
  store: LegacySrsProgressStore,
  l2Code: string,
): Record<string, LegacySrsFields> {
  return store.cards[l2Code] ?? {};
}
