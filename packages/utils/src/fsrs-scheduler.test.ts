import { describe, it, expect } from 'vitest';
import { State } from 'ts-fsrs';
import {
  countDueCards,
  countDeckStates,
  deserializeSrsCard,
  getActiveNewCardIds,
  getCardState,
  getDueCards,
  isDue,
  isNewCard,
  mergeSrsCards,
  migrateSrsStore,
  newCard,
  newRatingId,
  normalizeFsrsCard,
  planNewDeck,
  rate,
  reconcileCardsToServer,
  remainingNewCardsToday,
  srsDueLabel,
  type FsrsCard,
} from './fsrs-scheduler';

const NOW = Date.parse('2026-08-11T00:00:00Z');

function expectDueIn(card: FsrsCard, from: number, minMs: number, maxMs: number) {
  const delta = card.due - from;
  expect(delta).toBeGreaterThanOrEqual(minMs);
  expect(delta).toBeLessThanOrEqual(maxMs);
}

describe('fsrs-scheduler: newCard', () => {
  it('creates a due-now, unreviewed card with app + legacy fields', () => {
    const card = newCard(NOW);
    expect(card.v).toBe(2);
    expect(card.state).toBe(State.New);
    expect(card.due).toBe(NOW);
    expect(card.lastReview).toBe(NOW);
    expect(card.createdAt).toBe(NOW);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.ease).toBe(2.5);
    expect(card.interval).toBe(0);
    expect(card.repetitions).toBe(0);
    expect(card.nextReview).toBe(NOW);
    expect(isNewCard(card)).toBe(true);
    expect(isDue(card, NOW)).toBe(true);
  });
});

describe('fsrs-scheduler: new/learning ratings', () => {
  it('Again restarts the first learning step (1m)', () => {
    const next = rate(newCard(NOW), 'again', NOW);
    expect(next.state).toBe(State.Learning);
    expect(next.reps).toBe(1);
    expectDueIn(next, NOW, 50_000, 90_000);
    expect(isNewCard(next)).toBe(false);
  });

  it('Hard repeats a blended first step (~6m)', () => {
    const next = rate(newCard(NOW), 'hard', NOW);
    expect(next.state).toBe(State.Learning);
    expectDueIn(next, NOW, 5 * 60_000, 7 * 60_000);
  });

  it('Good advances to the second step (10m)', () => {
    const next = rate(newCard(NOW), 'good', NOW);
    expect(next.state).toBe(State.Learning);
    expect(next.learning_steps).toBe(1);
    expectDueIn(next, NOW, 9 * 60_000, 12 * 60_000);
  });

  it('Easy graduates immediately to Review', () => {
    const next = rate(newCard(NOW), 'easy', NOW);
    expect(next.state).toBe(State.Review);
    expect(next.reps).toBe(1);
    expect(next.due).toBeGreaterThan(NOW + 24 * 60 * 60_000);
  });

  it('two Goods graduate the card to Review', () => {
    const step1 = rate(newCard(NOW), 'good', NOW);
    const step2 = rate(step1, 'good', NOW);
    expect(step2.state).toBe(State.Review);
    expect(step2.reps).toBe(2);
    expect(step2.due).toBeGreaterThan(NOW + 24 * 60 * 60_000);
  });
});

describe('fsrs-scheduler: review/relearning ratings', () => {
  function graduatedCard(): FsrsCard {
    return rate(rate(newCard(NOW), 'good', NOW), 'good', NOW);
  }

  it('Again on a review card enters Relearning and damages memory state', () => {
    const review = graduatedCard();
    const next = rate(review, 'again', NOW + 5 * 86_400_000);
    expect(next.state).toBe(State.Relearning);
    expect(next.lapses).toBe(1);
    expectDueIn(next, NOW + 5 * 86_400_000, 9 * 60_000, 12 * 60_000);
    expect(next.stability).toBeLessThan(review.stability);
    expect(next.difficulty).toBeGreaterThan(review.difficulty);
  });

  it('Good on a review card extends the interval and increments reps', () => {
    const review = graduatedCard();
    const next = rate(review, 'good', NOW + 2 * 86_400_000);
    expect(next.state).toBe(State.Review);
    expect(next.reps).toBe(review.reps + 1);
    expect(next.due).toBeGreaterThan(review.due);
  });

  it('late reviews reschedule without resetting', () => {
    const review = graduatedCard();
    const late = rate(review, 'good', NOW + 30 * 86_400_000);
    expect(late.state).toBe(State.Review);
    expect(late.reps).toBe(review.reps + 1);
    expect(late.due).toBeGreaterThan(NOW + 60 * 86_400_000);
  });

  it('Good exits Relearning back to Review', () => {
    const review = graduatedCard();
    const relearning = rate(review, 'again', NOW + 5 * 86_400_000);
    const next = rate(relearning, 'good', NOW + 5 * 86_400_000 + 10 * 60_000);
    expect(next.state).toBe(State.Review);
    expect(next.lapses).toBe(1);
  });
});

describe('fsrs-scheduler: serialization', () => {
  it('round-trips through JSON without losing scheduling state', () => {
    const card = rate(rate(newCard(NOW), 'good', NOW), 'good', NOW);
    const restored = deserializeSrsCard(JSON.parse(JSON.stringify(card)));
    expect(restored).toEqual(card);

    const direct = rate(restored, 'good', NOW + 2 * 86_400_000);
    const indirect = rate(deserializeSrsCard(JSON.parse(JSON.stringify(card))), 'good', NOW + 2 * 86_400_000);
    expect(direct).toEqual(indirect);
  });

  it('fills missing optional fields on a partial FSRS card', () => {
    const partial = { state: State.Review, due: NOW + 86_400_000, stability: 12 };
    const card = normalizeFsrsCard(partial);
    expect(card.difficulty).toBe(5);
    expect(card.elapsed_days).toBe(0);
    expect(card.learning_steps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.lastReview).toBeGreaterThan(0);
    expect(card.createdAt).toBeGreaterThan(0);
  });
});

describe('fsrs-scheduler: legacy migration', () => {
  it('maps an unreviewed legacy card to state new and preserves due', () => {
    const legacy = {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: NOW,
      lastReview: NOW,
      createdAt: NOW - 86_400_000,
    };
    const card = normalizeFsrsCard(legacy);
    expect(card.state).toBe(State.New);
    expect(card.due).toBe(NOW);
    expect(card.createdAt).toBe(NOW - 86_400_000);
    expect(card.stability).toBe(1);
  });

  it('maps a graduated legacy card to review without resetting due', () => {
    const due = NOW + 6 * 86_400_000;
    const legacy = {
      ease: 2.7,
      interval: 6,
      repetitions: 2,
      nextReview: due,
      lastReview: NOW,
      createdAt: NOW - 30 * 86_400_000,
    };
    const card = normalizeFsrsCard(legacy);
    expect(card.state).toBe(State.Review);
    expect(card.due).toBe(due);
    expect(card.stability).toBe(6);
    expect(card.difficulty).toBe(5);
    expect(card.reps).toBe(2);
    expect(card.ease).toBe(2.7);
  });

  it('migrates a full legacy store and drops the legacy settings', () => {
    const store = {
      settings: { dailyNewLimit: 7 },
      cards: {
        ja: {
          'word-1': { ease: 2.5, interval: 0, repetitions: 0, nextReview: NOW, lastReview: NOW, createdAt: NOW },
          'word-2': { ease: 2.6, interval: 4, repetitions: 1, nextReview: NOW + 4 * 86_400_000, lastReview: NOW, createdAt: NOW - 86_400_000 },
          'word-3': { state: State.Learning, due: NOW + 60_000, stability: 1.3, difficulty: 4, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 1, lapses: 0, last_review: NOW, lastReview: NOW, createdAt: NOW },
        },
      },
    };
    const migrated = migrateSrsStore(store);
    expect(migrated.v).toBe(2);
    expect(migrated).not.toHaveProperty('settings');
    const ja = migrated.cards.ja!;
    expect(ja['word-1']!.state).toBe(State.New);
    expect(ja['word-2']!.state).toBe(State.Review);
    expect(ja['word-2']!.due).toBe(NOW + 4 * 86_400_000);
    expect(ja['word-3']!.state).toBe(State.Learning);
  });
});

describe('fsrs-scheduler: deck budgeting', () => {
  const savedWords = [
    { id: 'old', date: NOW - 3 * 86_400_000 },
    { id: 'mid', date: NOW - 2 * 86_400_000 },
    { id: 'new', date: NOW - 86_400_000 },
  ];

  it('creates the newest cards first up to today\'s budget', () => {
    const plan = planNewDeck(savedWords, {}, 2, NOW, 0);
    expect(plan.toCreate).toEqual(['new', 'mid']);
    expect(plan.toRemove).toEqual([]);

    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      mid: rate(newCard(NOW), 'good', NOW),
    };
    // The two cards above already consumed today's budget of 2 — no refill.
    const next = planNewDeck(savedWords, cards, 2, NOW, 0);
    expect(next.toCreate).toEqual([]);
    expect(next.toRemove).toEqual([]);
  });

  it('resets the daily budget on the next local day', () => {
    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      mid: rate(newCard(NOW), 'good', NOW),
    };
    // +48h is guaranteed to cross a local day boundary in any timezone.
    const nextDay = NOW + 2 * 86_400_000;
    const next = planNewDeck(savedWords, cards, 2, nextDay, 0);
    expect(next.toCreate).toEqual(['old']);
    expect(next.toRemove).toEqual([]);
  });

  it('removes blue cards pushed out of the newest window', () => {
    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      mid: newCard(NOW),
      old: newCard(NOW),
    };
    const plan = planNewDeck(savedWords, cards, 2, NOW, 0);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toRemove).toEqual(['old']);
  });

  it('keeps cards outside the window available when the limit is raised again', () => {
    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      mid: newCard(NOW),
      old: newCard(NOW),
    };
    expect(getActiveNewCardIds(savedWords, cards, 2)).toEqual(['new', 'mid']);
    expect(getActiveNewCardIds(savedWords, cards, 3)).toEqual(['new', 'mid', 'old']);
  });

  it('never lets cardless saved words occupy active-window slots', () => {
    // 40 words have NEW cards; 40 NEWER saved words have no card yet (their
    // daily budget was exhausted, so no card was created for them). The active
    // window must still select the 40 real blue cards — otherwise the review
    // queue would be empty while the header still counts 40 new cards.
    const newerWords = Array.from({ length: 40 }, (_, i) => ({
      id: `cardless-${i}`,
      date: NOW + (i + 1) * 1000,
    }));
    const cardedWords = Array.from({ length: 40 }, (_, i) => ({
      id: `carded-${i}`,
      date: NOW - (40 - i) * 1000,
    }));
    const cards: Record<string, FsrsCard> = {};
    for (let i = 0; i < 40; i++) cards[`carded-${i}`] = newCard(NOW);

    const active = getActiveNewCardIds([...newerWords, ...cardedWords], cards, 40);
    expect(active).toHaveLength(40);
    for (const id of active) {
      expect(cards[id]?.state).toBe(State.New);
    }
    expect(active.some((id) => id.startsWith('cardless-'))).toBe(false);
  });

  it('does not soft-deactivate blue cards displaced by cardless words', () => {
    const carded = Array.from({ length: 40 }, (_, i) => ({
      id: `carded-${i}`,
      date: NOW - (40 - i) * 1000,
    }));
    const cards: Record<string, FsrsCard> = {};
    for (let i = 0; i < 40; i++) cards[`carded-${i}`] = newCard(NOW);
    const plan = planNewDeck(carded, cards, 40, NOW, 0);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toRemove).toEqual([]);
  });

  it('counts the remaining daily new-card budget', () => {
    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      mid: rate(newCard(NOW), 'good', NOW),
    };
    expect(remainingNewCardsToday(savedWords, cards, 2, NOW, 0)).toBe(0);
    expect(remainingNewCardsToday(savedWords, {}, 2, NOW, 0)).toBe(2);

    // Older unrated cards still in the blue deck count against today's budget.
    const older = { ...newCard(NOW - 86_400_000), createdAt: NOW - 86_400_000 };
    expect(remainingNewCardsToday(savedWords, { old: older }, 2, NOW, 0)).toBe(1);
  });

  it('does not free a blue slot when a pre-existing new card is rated', () => {
    // Two blue cards minted YESTERDAY fill today's budget of 2. Rating one
    // today must not open a slot for a replacement card (SPEC-066: the blue
    // count counts down and does not refill until the next local day).
    const saved = [
      { id: 'a', date: NOW - 86_400_000 },
      { id: 'b', date: NOW - 86_400_000 },
      { id: 'c', date: NOW - 86_400_000 }, // cardless — the refill candidate
    ];
    const cards: Record<string, FsrsCard> = {
      a: { ...newCard(NOW - 86_400_000), createdAt: NOW - 86_400_000 },
      b: { ...newCard(NOW - 86_400_000), createdAt: NOW - 86_400_000 },
    };
    expect(remainingNewCardsToday(saved, cards, 2, NOW, 0)).toBe(0);

    // User rates 'a' today (its first rating — it was still new at day start).
    const cardA = cards.a!;
    const ratedA = rate(cardA, 'good', NOW);
    expect(ratedA.createdAt).toBe(NOW - 86_400_000);
    const afterCards = { ...cards, a: ratedA };
    expect(remainingNewCardsToday(saved, afterCards, 2, NOW, 0)).toBe(0);
    // planNewDeck must not mint 'c' as a replacement.
    expect(planNewDeck(saved, afterCards, 2, NOW, 0).toCreate).toEqual([]);

    // A SECOND rating today (e.g. graduating a learning step) must also keep
    // the slot occupied — the budget never frees up during the local day.
    const ratedA2 = rate(ratedA, 'good', NOW + 10 * 60_000);
    const afterCards2 = { ...cards, a: ratedA2 };
    expect(remainingNewCardsToday(saved, afterCards2, 2, NOW, 0)).toBe(0);
    expect(planNewDeck(saved, afterCards2, 2, NOW, 0).toCreate).toEqual([]);

    // The slot DOES free up on the next local day: 'a' was rated yesterday
    // (before tomorrow's day start), so only the still-new 'b' keeps a slot
    // and the cardless 'c' becomes mintable again.
    const tomorrow = NOW + 86_400_000;
    expect(remainingNewCardsToday(saved, afterCards2, 2, tomorrow, 0)).toBe(1);
    expect(planNewDeck(saved, afterCards2, 2, tomorrow, 0).toCreate).toEqual(['c']);
  });
});

describe('fsrs-scheduler: due helpers', () => {
  it('orders due cards oldest-first and skips future cards', () => {
    const cards: Record<string, FsrsCard> = {
      future: { ...newCard(NOW), due: NOW + 86_400_000, state: State.Review },
      overdue: { ...newCard(NOW), due: NOW - 86_400_000, state: State.Review },
      soon: { ...newCard(NOW), due: NOW - 60_000, state: State.Learning },
    };
    expect(getDueCards(cards, NOW)).toEqual(['overdue', 'soon']);
    expect(countDueCards(cards, NOW)).toBe(2);
  });

  it('maps state numbers to human labels', () => {
    expect(getCardState({ ...newCard(NOW), state: State.New })).toBe('new');
    expect(getCardState({ ...newCard(NOW), state: State.Learning })).toBe('learning');
    expect(getCardState({ ...newCard(NOW), state: State.Review })).toBe('review');
    expect(getCardState({ ...newCard(NOW), state: State.Relearning })).toBe('relearning');
  });
});

describe('fsrs-scheduler: deck counts & due labels', () => {
  it('counts blue/red/green with Anki due-today semantics', () => {
    const savedWords = [
      { id: 'new' },
      { id: 'learning' }, // due now
      { id: 'learningFuture' }, // step not due yet
      { id: 'review' }, // due now
      { id: 'reviewFuture' }, // scheduled for later
      { id: 'relearning' }, // due now
      { id: 'missing' },
    ];
    const cards: Record<string, FsrsCard> = {
      new: newCard(NOW),
      learning: { ...newCard(NOW), state: State.Learning },
      learningFuture: {
        ...newCard(NOW),
        state: State.Learning,
        due: NOW + 10 * 60_000,
      },
      review: { ...newCard(NOW), state: State.Review },
      reviewFuture: {
        ...newCard(NOW),
        state: State.Review,
        due: NOW + 86_400_000,
      },
      relearning: { ...newCard(NOW), state: State.Relearning },
    };
    expect(countDeckStates(savedWords, cards, { now: NOW })).toEqual({
      newCount: 1,
      againCount: 2,
      reviewCount: 1,
    });
    expect(countDeckStates([], {}, { now: NOW })).toEqual({
      newCount: 0,
      againCount: 0,
      reviewCount: 0,
    });
  });

  it('caps the blue count at the daily new-card limit', () => {
    const savedWords = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ];
    const cards: Record<string, FsrsCard> = {
      a: newCard(NOW),
      b: newCard(NOW),
      c: newCard(NOW),
    };
    expect(
      countDeckStates(savedWords, cards, { dailyNewLimit: 2, now: NOW }),
    ).toEqual({ newCount: 2, againCount: 0, reviewCount: 0 });
  });

  it('formats due labels for minutes, hours, and days', () => {
    expect(srsDueLabel({ ...newCard(NOW), due: NOW - 1000 }, NOW)).toBe('0m');
    expect(srsDueLabel({ ...newCard(NOW), due: NOW + 60_000 }, NOW)).toBe('1m');
    expect(srsDueLabel({ ...newCard(NOW), due: NOW + 10 * 60_000 }, NOW)).toBe('10m');
    expect(srsDueLabel({ ...newCard(NOW), due: NOW + 6 * 60 * 60_000 }, NOW)).toBe('6h');
    expect(srsDueLabel({ ...newCard(NOW), due: NOW + 3 * 86_400_000 }, NOW)).toBe('3d');
  });
});

describe('fsrs-scheduler: rating metadata', () => {
  it('generates unique rating ids containing user and word', () => {
    const a = newRatingId('u1', 'w1', NOW);
    const b = newRatingId('u1', 'w1', NOW);
    expect(a).toMatch(new RegExp(`^u1:w1:${NOW}:`));
    expect(a).not.toBe(b);
    expect(newRatingId(undefined, 'w2', NOW)).toMatch(new RegExp(`^anon:w2:${NOW}:`));
  });

  it('preserves rating metadata through normalization', () => {
    const card = rate(newCard(NOW), 'good', NOW);
    card.ratingId = 'u1:w1:1:abc';
    card.rating = 'good';
    card.voidRatingId = 'u1:w1:0:old';
    const normalized = normalizeFsrsCard(JSON.parse(JSON.stringify(card)));
    expect(normalized.ratingId).toBe('u1:w1:1:abc');
    expect(normalized.rating).toBe('good');
    expect(normalized.voidRatingId).toBe('u1:w1:0:old');
  });
});

describe('fsrs-scheduler: store & deck edge cases', () => {
  it('migrates a store without legacy settings', () => {
    const migrated = migrateSrsStore({ cards: { ja: {} } });
    expect(migrated.v).toBe(2);
    expect(migrated).not.toHaveProperty('settings');
  });

  it('handles zero and negative deck limits', () => {
    const saved = [{ id: 'a', date: NOW }, { id: 'b', date: NOW - 1000 }];
    expect(planNewDeck(saved, {}, 0, NOW, 0)).toEqual({ toCreate: [], toRemove: [] });
    expect(planNewDeck(saved, {}, -5, NOW, 0)).toEqual({ toCreate: [], toRemove: [] });
  });
});

describe('fsrs-scheduler: LWW merge', () => {
  it('normalizes both sides and lets the newer lastReview win', () => {
    const legacy = {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: NOW,
      lastReview: NOW - 1000,
      createdAt: NOW - 86_400_000,
    };
    const rated = rate(newCard(NOW), 'good', NOW);
    const merged = mergeSrsCards(
      { w1: legacy, w2: rated },
      { w1: rated, w3: legacy },
    );
    // w1: cloud (rated) is newer than the legacy local card → cloud wins, normalized.
    expect(merged['w1']!.state).toBe(rated.state);
    expect(merged['w1']!.v).toBe(2);
    // w2: local-only card stays normalized.
    expect(merged['w2']!.state).toBe(rated.state);
    // w3: cloud legacy card is normalized on entry.
    expect(merged['w3']!.state).toBe(State.New);
    expect(merged['w3']!.due).toBe(NOW);
  });

  it('keeps the local card when it is newer', () => {
    const local = rate(newCard(NOW), 'good', NOW);
    const olderCloud: FsrsCard = { ...newCard(NOW - 1000), lastReview: NOW - 5000, createdAt: NOW - 1000 };
    const merged = mergeSrsCards({ w: local }, { w: olderCloud });
    expect(merged['w']!.lastReview).toBe(NOW);
    expect(merged['w']!.state).toBe(State.Learning);
  });

  it('lets a reviewed cloud card beat a newer local new card', () => {
    const localNew = { ...newCard(NOW), lastReview: NOW + 1000 };
    const cloudReviewed = rate(newCard(NOW - 5000), 'good', NOW - 5000);
    const merged = mergeSrsCards({ w: localNew }, { w: cloudReviewed });
    expect(merged['w']!.state).toBe(cloudReviewed.state);
    expect(merged['w']!.reps).toBe(1);
  });

  it('keeps a reviewed local card over a newer stale cloud new card', () => {
    const localReviewed = rate(newCard(NOW - 5000), 'good', NOW - 5000);
    const cloudNew = { ...newCard(NOW), lastReview: NOW + 1000 };
    const merged = mergeSrsCards({ w: localReviewed }, { w: cloudNew });
    expect(merged['w']!.state).toBe(localReviewed.state);
    expect(merged['w']!.reps).toBe(1);
  });
});

describe('fsrs-scheduler: reconcile cards to server (SPEC-066)', () => {
  const serverCard = rate(newCard(NOW - 5000), 'good', NOW - 5000);

  it('drops a local-only card that is neither on the server nor protected', () => {
    // 'phantom' is local-only, not on the server, and has no pending op.
    const local = { a: serverCard, phantom: newCard(NOW - 86_400_000) };
    const cleaned = reconcileCardsToServer(local, { a: serverCard }, () => false);
    expect(Object.keys(cleaned)).toEqual(['a']);
  });

  it('keeps a card that is on the server even without a pending op', () => {
    const cleaned = reconcileCardsToServer(
      { a: serverCard },
      { a: serverCard },
      () => false,
    );
    expect(cleaned['a']).toBe(serverCard);
  });

  it('keeps a local-only card backed by unsynced local work (a pending op)', () => {
    const phantom = newCard(NOW - 86_400_000);
    const cleaned = reconcileCardsToServer(
      { phantom },
      {}, // server does not have it
      (id) => id === 'phantom',
    );
    expect(cleaned['phantom']).toBe(phantom);
  });

  it('returns the record unchanged when the server deck for the language is not loaded', () => {
    const local = { a: serverCard, phantom: newCard(NOW - 86_400_000) };
    const cleaned = reconcileCardsToServer(local, undefined, () => true);
    expect(cleaned).toBe(local); // no drop before hydration finishes
  });
});
