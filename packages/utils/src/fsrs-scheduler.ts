/**
 * FSRS scheduler integration (SPEC-066).
 *
 * Thin wrapper around `ts-fsrs` (v5.4.1, FSRS-6) so web and mobile share one
 * scheduler implementation. Cards are persisted as a fully serialized ts-fsrs
 * `Card` (dates as Unix ms) plus app bookkeeping (`lastReview`, `createdAt`)
 * and deprecated SM-2 fields (`ease`, `interval`, `repetitions`,
 * `nextReview`) that are written for the legacy-client compatibility window
 * (Phase 0 decision) and ignored by new code.
 */

import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type CardInput,
  type Grade,
} from 'ts-fsrs';
import type { SrsFields, SrsProgressStore } from '@langplayer/shared';

/** The four rating buttons, shared by web and mobile. */
export type SrsRating = 'again' | 'hard' | 'good' | 'easy';

/** App-facing card states (mirror ts-fsrs `State`). */
export type SrsCardState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Fully serialized FSRS card persisted by web/mobile stores. The single type
 * declaration lives in `@langplayer/shared`; this alias keeps the scheduler
 * module's vocabulary explicit.
 */
export type FsrsCard = SrsFields;

/** Versioned SRS store shape produced by the FSRS migration. */
export type FsrsSrsStore = SrsProgressStore;

const DAY_MS = 86_400_000;

/** Milliseconds since epoch for the UTC day containing `now`. */
function utcDayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Single shared scheduler instance; parameters stay at ts-fsrs defaults. */
const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

const RATING_TO_GRADE: Record<SrsRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** Convert a ts-fsrs `Card` (Date fields) into the persisted shape. */
export function serializeFsrsCard(
  card: Card,
  app: { lastReview: number; createdAt: number; prevEase?: number },
): FsrsCard {
  const due = card.due.getTime();
  const intervalDays = Math.max(0, Math.round((due - app.lastReview) / DAY_MS));
  return {
    v: 2,
    state: card.state,
    due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review ? card.last_review.getTime() : null,
    lastReview: app.lastReview,
    createdAt: app.createdAt,
    // Deprecated legacy fields (Phase 0 compatibility window).
    ease: typeof app.prevEase === 'number' && app.prevEase >= 1.3 ? app.prevEase : 2.5,
    interval: intervalDays,
    repetitions: card.reps,
    nextReview: due,
  };
}

/** Create a new, due-now FSRS card. */
export function newCard(now: number = Date.now()): FsrsCard {
  const card = createEmptyCard(new Date(now));
  return serializeFsrsCard(card, { lastReview: now, createdAt: now, prevEase: 2.5 });
}

/** Convert the persisted shape back into a ts-fsrs `CardInput`. */
function toFsrsCardInput(card: FsrsCard): CardInput {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review == null ? null : new Date(card.last_review),
  };
}

/** Apply a rating through ts-fsrs and return the next serialized card. */
export function rate(
  card: FsrsCard,
  rating: SrsRating,
  now: number = Date.now(),
): FsrsCard {
  const result = scheduler.next(toFsrsCardInput(card), new Date(now), RATING_TO_GRADE[rating]);
  return serializeFsrsCard(result.card, {
    lastReview: now,
    createdAt: card.createdAt,
    prevEase: card.ease,
  });
}

/** Client-generated id for one interactive rating (backend cap log). */
export function newRatingId(
  userId: string | undefined,
  wordId: string,
  now: number = Date.now(),
): string {
  return `${userId ?? 'anon'}:${wordId}:${now}:${Math.random().toString(36).slice(2, 10)}`;
}

/** Map a legacy SM-2 card (or partial FSRS card) to a full `FsrsCard`. */
export function normalizeFsrsCard(value: unknown): FsrsCard {
  if (!value || typeof value !== 'object') return newCard();
  const raw = value as Record<string, unknown>;

  const hasFsrsState =
    typeof raw.state === 'number' &&
    typeof raw.due === 'number' &&
    typeof raw.stability === 'number';

  if (!hasFsrsState) return normalizeLegacyCard(raw);

  const now = Date.now();
  const due = raw.due as number;
  const lastReview =
    typeof raw.lastReview === 'number'
      ? (raw.lastReview as number)
      : typeof raw.last_review === 'number'
        ? (raw.last_review as number)
        : now;
  const createdAt =
    typeof raw.createdAt === 'number' ? (raw.createdAt as number) : Math.min(lastReview, now);
  const reps = typeof raw.reps === 'number' ? (raw.reps as number) : 0;
  const intervalDays = Math.max(0, Math.round((due - lastReview) / DAY_MS));
  const ratingId = typeof raw.ratingId === 'string' ? (raw.ratingId as string) : undefined;
  const rating = raw.rating === 'again' || raw.rating === 'hard' || raw.rating === 'good' || raw.rating === 'easy'
    ? (raw.rating as SrsRating)
    : undefined;
  const voidRatingId = typeof raw.voidRatingId === 'string' ? (raw.voidRatingId as string) : undefined;

  return {
    v: 2,
    state: raw.state as State,
    due,
    stability: typeof raw.stability === 'number' ? (raw.stability as number) : 1,
    difficulty: typeof raw.difficulty === 'number' ? (raw.difficulty as number) : 5,
    elapsed_days: typeof raw.elapsed_days === 'number' ? (raw.elapsed_days as number) : 0,
    scheduled_days:
      typeof raw.scheduled_days === 'number' ? (raw.scheduled_days as number) : intervalDays,
    learning_steps: typeof raw.learning_steps === 'number' ? (raw.learning_steps as number) : 0,
    reps,
    lapses: typeof raw.lapses === 'number' ? (raw.lapses as number) : 0,
    last_review:
      typeof raw.last_review === 'number'
        ? (raw.last_review as number)
        : typeof raw.lastReview === 'number'
          ? (raw.lastReview as number)
          : null,
    lastReview,
    createdAt,
    ease: typeof raw.ease === 'number' ? (raw.ease as number) : 2.5,
    interval: typeof raw.interval === 'number' ? (raw.interval as number) : intervalDays,
    repetitions: typeof raw.repetitions === 'number' ? (raw.repetitions as number) : reps,
    nextReview: typeof raw.nextReview === 'number' ? (raw.nextReview as number) : due,
    ...(ratingId ? { ratingId } : {}),
    ...(rating ? { rating } : {}),
    ...(voidRatingId ? { voidRatingId } : {}),
  };
}

/** Alias for callers that think in serialize/deserialize terms. */
export const deserializeSrsCard = normalizeFsrsCard;

/**
 * Merge two per-language card records (local vs cloud) with the app LWW rule:
 * newer `lastReview` wins. Both sides are normalized first, so mixed
 * old/new-shape cards can never resurrect malformed state.
 */
export function mergeSrsCards(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
): Record<string, SrsFields> {
  const merged: Record<string, SrsFields> = {};
  for (const [id, raw] of Object.entries(local)) {
    merged[id] = normalizeFsrsCard(raw);
  }
  for (const [id, raw] of Object.entries(cloud)) {
    const cloudCard = normalizeFsrsCard(raw);
    const localCard = merged[id];
    if (!localCard || cloudCard.lastReview > localCard.lastReview) {
      merged[id] = cloudCard;
    }
  }
  return merged;
}

/** Convert a legacy SM-2 card to a seeded FSRS card without resetting `due`. */
function normalizeLegacyCard(raw: Record<string, unknown>): FsrsCard {
  const now = Date.now();
  const createdAt = typeof raw.createdAt === 'number' ? (raw.createdAt as number) : now;
  const lastReview =
    typeof raw.lastReview === 'number' ? (raw.lastReview as number) : createdAt;
  const due =
    typeof raw.nextReview === 'number' ? (raw.nextReview as number) : now;
  const repetitions = typeof raw.repetitions === 'number' ? (raw.repetitions as number) : 0;
  const interval = typeof raw.interval === 'number' ? (raw.interval as number) : 0;
  const graduated = repetitions > 0 || interval > 0;
  const stability = graduated ? Math.max(interval, 1) : 1;

  return {
    v: 2,
    state: graduated ? State.Review : State.New,
    due,
    stability,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: graduated ? Math.max(interval, 1) : 0,
    learning_steps: 0,
    reps: repetitions,
    lapses: 0,
    last_review: lastReview,
    lastReview,
    createdAt,
    ease: typeof raw.ease === 'number' ? (raw.ease as number) : 2.5,
    interval,
    repetitions,
    nextReview: due,
  };
}

/** Migrate any stored SRS progress blob (v1/legacy) to the v2 FSRS shape. */
export function migrateSrsStore(value: unknown): FsrsSrsStore {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawCards =
    raw.cards && typeof raw.cards === 'object'
      ? (raw.cards as Record<string, Record<string, unknown>>)
      : {};
  const rawSettings =
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as { dailyNewLimit?: unknown })
      : {};

  const cards: Record<string, Record<string, FsrsCard>> = {};
  for (const [l2, langCards] of Object.entries(rawCards)) {
    if (!langCards || typeof langCards !== 'object') continue;
    cards[l2] = {};
    for (const [wordId, card] of Object.entries(langCards as Record<string, unknown>)) {
      cards[l2][wordId] = normalizeFsrsCard(card);
    }
  }

  const dailyNewLimit =
    typeof rawSettings.dailyNewLimit === 'number' ? rawSettings.dailyNewLimit : 20;
  return { v: 2, settings: { dailyNewLimit }, cards };
}

/** Create a new, empty v2 SRS store with default settings. */
export function createSrsStore(): SrsProgressStore {
  return { v: 2, settings: { dailyNewLimit: 20 }, cards: {} };
}

/** Safely get the cards record for a given language code. */
export function getLanguageCards<T>(
  store: { cards?: Record<string, Record<string, T>> },
  l2Code: string,
): Record<string, T> {
  return store.cards?.[l2Code] ?? {};
}

/** Check if a card is due at `now`. */
export function isDue(card: FsrsCard, now: number = Date.now()): boolean {
  return card.due <= now;
}

/** Get due card ids, oldest-due first. */
export function getDueCards(
  cards: Record<string, FsrsCard>,
  now: number = Date.now(),
): string[] {
  return Object.entries(cards)
    .filter(([, card]) => isDue(card, now))
    .sort(([, a], [, b]) => a.due - b.due)
    .map(([id]) => id);
}

/** Count due cards in a language deck. */
export function countDueCards(
  cards: Record<string, FsrsCard>,
  now: number = Date.now(),
): number {
  return getDueCards(cards, now).length;
}

/** A card is "new" only while it is still in the unrated blue deck. */
export function isNewCard(card: FsrsCard): boolean {
  return card.state === State.New;
}

/** Human-facing card state for header counts / status dots. */
export function getCardState(card: FsrsCard): SrsCardState {
  switch (card.state) {
    case State.Learning:
      return 'learning';
    case State.Review:
      return 'review';
    case State.Relearning:
      return 'relearning';
    default:
      return 'new';
  }
}

/** Blue/red/green deck counts from the whole saved-word deck (not just due). */
export function countDeckStates(
  savedWords: Array<{ id: string }>,
  cards: Record<string, FsrsCard>,
): { newCount: number; againCount: number; reviewCount: number } {
  let newCount = 0;
  let againCount = 0;
  let reviewCount = 0;
  for (const sw of savedWords) {
    const card = cards[sw.id];
    if (!card) continue;
    const state = getCardState(card);
    if (state === 'new') {
      newCount++;
    } else if (state === 'learning' || state === 'relearning') {
      againCount++;
    } else {
      reviewCount++;
    }
  }
  return { newCount, againCount, reviewCount };
}

/** Short human label for a card's next due time ("0m", "10m", "3d"). */
export function srsDueLabel(card: FsrsCard, now: number = Date.now()): string {
  const diff = card.due - now;
  if (diff <= 0) return '0m';
  const mins = Math.ceil(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Number of cards introduced (created) for saved words on the current UTC day. */
export function newCardsIntroducedToday(
  savedWords: Array<{ id: string }>,
  cards: Record<string, FsrsCard>,
  now: number = Date.now(),
): number {
  const start = utcDayStart(now);
  let count = 0;
  for (const sw of savedWords) {
    const card = cards[sw.id];
    if (card && card.createdAt >= start) count++;
  }
  return count;
}

/**
 * How many new-card introductions remain for today (Anki/FSRS daily quota).
 *
 * Cards introduced today plus older unrated cards still sitting in the blue
 * deck both count toward `limit`. The deck does not refill during a session.
 */
export function remainingNewCardsToday(
  savedWords: Array<{ id: string }>,
  cards: Record<string, FsrsCard>,
  limit: number = 20,
  now: number = Date.now(),
): number {
  const cap = Math.max(0, Math.floor(limit));
  const start = utcDayStart(now);
  const introducedToday = newCardsIntroducedToday(savedWords, cards, now);
  const olderUnrated = savedWords.filter((sw) => {
    const card = cards[sw.id];
    return !!card && isNewCard(card) && card.createdAt < start;
  }).length;
  return Math.max(0, cap - introducedToday - olderUnrated);
}

/**
 * Compute the blue ("new") deck for today: up to `limit` most recently saved
 * words that have no card yet or an unreviewed `state: new` card, newest-saved
 * first, but never more than today's remaining new-card budget. Rated cards
 * (learning/review/relearning) are never displaced.
 */
export function planNewDeck(
  savedWords: Array<{ id: string; date?: number }>,
  cards: Record<string, FsrsCard>,
  limit: number,
  now: number = Date.now(),
): { toCreate: string[]; toRemove: string[] } {
  const cap = Math.max(0, Math.floor(limit));
  const remaining = remainingNewCardsToday(savedWords, cards, cap, now);

  const pool = savedWords
    .filter((sw) => {
      const srs = cards[sw.id];
      return !srs || isNewCard(srs);
    })
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

  const desired = pool.slice(0, cap);

  return {
    toCreate: desired
      .filter((sw) => !cards[sw.id])
      .slice(0, Math.max(0, remaining))
      .map((sw) => sw.id),
    toRemove: pool.slice(cap).filter((sw) => cards[sw.id]).map((sw) => sw.id),
  };
}
