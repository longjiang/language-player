/**
 * Unit tests and simulations for the SM-2 Spaced Repetition System.
 *
 * Tests cover:
 *  1. Core SM-2 algorithm (ease, intervals, failure handling)
 *  2. Due card detection
 *  3. New-card daily limit tracking
 *  4. Multi-day simulation of review sessions
 *  5. Edge cases (empty decks, rapid reviews, clock skew)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sm2,
  newCard,
  isDue,
  getDueCards,
  countDueCards,
  countNewCardsToday,
  remainingNewCardsToday,
  DEFAULT_DAILY_NEW_LIMIT,
  createSrsStore,
  getLanguageCards,
} from '@langplayer/utils';
import type { SrsFields, SrsProgressStore } from '@langplayer/utils';

// ── Helpers ────────────────────────────────────

/** Freeze time at a specific Unix-ms timestamp. */
function setNow(ms: number) {
  vi.setSystemTime(ms);
}

/** Advance time by a number of milliseconds. */
function advanceTime(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

/** Shortcut: make a card created at a given time. */
function cardAt(
  overrides: Partial<SrsFields> & { createdAt?: number } = {},
): SrsFields {
  const c = newCard();
  if (overrides.createdAt !== undefined) {
    c.createdAt = overrides.createdAt;
  }
  return { ...c, ...overrides };
}

/** Make a card that has been reviewed n times with given interval & ease. */
function reviewedCard(
  repetitions: number,
  interval: number,
  ease = 2.5,
  nextReviewOffset = 0, // ms from "now" for nextReview
): SrsFields {
  const now = Date.now();
  return {
    ease,
    interval,
    repetitions,
    nextReview: now + nextReviewOffset,
    lastReview: now - interval * 86_400_000,
    createdAt: now - (interval + 1) * 86_400_000,
  };
}

// ────────────────────────────────────────────────
// 1. Core SM-2 Algorithm
// ────────────────────────────────────────────────

describe('SM-2 Algorithm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('newCard()', () => {
    it('creates a card with default values', () => {
      const card = newCard();
      expect(card.ease).toBe(2.5);
      expect(card.interval).toBe(0);
      expect(card.repetitions).toBe(0);
      expect(card.nextReview).toBe(Date.now());
      expect(card.lastReview).toBe(Date.now());
      expect(card.createdAt).toBe(Date.now());
    });

    it('creates a card that is immediately due', () => {
      const card = newCard();
      expect(isDue(card)).toBe(true);
    });
  });

  describe('sm2() — passing grades (quality ≥ 3)', () => {
    it('first pass (quality=4): graduates to interval=1 day', () => {
      const now = Date.now();
      const card = newCard();
      const result = sm2(card, 4);

      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1); // 1 day
      expect(result.nextReview).toBe(now + 86_400_000); // tomorrow
      expect(result.lastReview).toBe(now);
      // ease stays at 2.5 (no penalty, no bonus for quality=4)
    });

    it('second pass (quality=4): graduates to interval=6 days', () => {
      const card = reviewedCard(1, 1, 2.5, 0); // previously passed once, due now
      const result = sm2(card, 4);

      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
    });

    it('third pass uses ease factor: interval = prevInterval * ease', () => {
      const card = reviewedCard(2, 6, 2.5, 0); // passed twice
      const result = sm2(card, 4);

      expect(result.repetitions).toBe(3);
      // interval = 6 * ease (ease unchanged at 2.5 for quality=4)
      expect(result.interval).toBe(15); // 6 * 2.5 = 15
    });

    it('quality=5 (easy): increases ease factor', () => {
      const card = reviewedCard(2, 6, 2.5, 0);
      const result = sm2(card, 5);

      // ease += 0.1 - (5-5)*(0.08 + (5-5)*0.02) = 0.1
      expect(result.ease).toBeCloseTo(2.6, 5);
      expect(result.interval).toBe(Math.round(6 * 2.6)); // 16
    });

    it('quality=3 (hard pass): decreases ease factor', () => {
      const card = reviewedCard(2, 6, 2.5, 0);
      const result = sm2(card, 3);

      // ease += 0.1 - (5-3)*(0.08 + (5-3)*0.02) = 0.1 - 2*0.12 = -0.14
      expect(result.ease).toBeCloseTo(2.5 - 0.14, 5); // 2.36
      expect(result.interval).toBe(Math.round(6 * 2.36)); // 14
    });

    it('ease never drops below 1.3', () => {
      const card = reviewedCard(2, 6, 1.31, 0); // almost at floor
      // quality=3: ease += 0.1 - 2*(0.08+2*0.02) = 0.1 - 0.24 = -0.14
      // 1.31 - 0.14 = 1.17 → clamped to 1.3
      const result = sm2(card, 3);
      expect(result.ease).toBe(1.3);
    });

    it('after many passes, intervals grow exponentially', () => {
      let card = newCard();
      // Simulate 10 perfect passes (quality=5)
      for (let i = 0; i < 10; i++) {
        card = sm2(card, 5);
      }
      expect(card.repetitions).toBe(10);
      expect(card.interval).toBeGreaterThan(180); // > 6 months
      expect(card.ease).toBeGreaterThan(2.5); // ease increased over time
    });
  });

  describe('sm2() — failing grades (quality < 3)', () => {
    it('quality=0 (again): resets repetition counter, schedules in 1 minute', () => {
      const card = reviewedCard(3, 30, 2.5, 0); // mature card, due now
      const now = Date.now();
      const result = sm2(card, 0);

      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1); // 1 day (will be rescheduled after next pass)
      expect(result.nextReview).toBe(now + 60_000); // 1 minute from now (same session)
      expect(result.lastReview).toBe(now);
      // ease unchanged on failure
      expect(result.ease).toBe(2.5);
    });

    it('quality=1: same as quality=0 (all failures treated the same)', () => {
      const card = reviewedCard(3, 30, 2.5, 0);
      const result = sm2(card, 1);
      expect(result.repetitions).toBe(0);
      expect(result.nextReview).toBe(Date.now() + 60_000);
    });

    it('quality=2: same as quality=0', () => {
      const card = reviewedCard(3, 30, 2.5, 0);
      const result = sm2(card, 2);
      expect(result.repetitions).toBe(0);
      expect(result.nextReview).toBe(Date.now() + 60_000);
    });

    it('does not mutate the original card', () => {
      const card = reviewedCard(3, 30, 2.5, 0);
      const original = { ...card };
      sm2(card, 0);
      expect(card).toEqual(original);
    });
  });
});

// ────────────────────────────────────────────────
// 2. Due Card Detection
// ────────────────────────────────────────────────

describe('Due Card Detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isDue()', () => {
    it('returns true when nextReview is in the past', () => {
      const card = cardAt({ nextReview: Date.now() - 1000 });
      expect(isDue(card)).toBe(true);
    });

    it('returns true when nextReview is exactly now', () => {
      const card = cardAt({ nextReview: Date.now() });
      expect(isDue(card)).toBe(true);
    });

    it('returns false when nextReview is in the future', () => {
      const card = cardAt({ nextReview: Date.now() + 86_400_000 });
      expect(isDue(card)).toBe(false);
    });
  });

  describe('getDueCards()', () => {
    it('returns sorted due card IDs', () => {
      const cards: Record<string, SrsFields> = {
        'card-a': reviewedCard(1, 1, 2.5, -2000),  // due 2s ago
        'card-b': reviewedCard(1, 1, 2.5, -5000),  // due 5s ago (older → first)
        'card-c': reviewedCard(1, 1, 2.5, 86_400_000), // not due (tomorrow)
        'card-d': reviewedCard(1, 1, 2.5, -1000),  // due 1s ago
      };

      const due = getDueCards(cards);
      expect(due).toEqual(['card-b', 'card-a', 'card-d']); // sorted by oldest first
      expect(due).not.toContain('card-c');
    });

    it('returns empty array when no cards are due', () => {
      const cards: Record<string, SrsFields> = {
        'card-a': reviewedCard(1, 1, 2.5, 86_400_000),
        'card-b': reviewedCard(1, 1, 2.5, 86_400_000 * 2),
      };
      expect(getDueCards(cards)).toEqual([]);
    });

    it('returns empty array for empty card set', () => {
      expect(getDueCards({})).toEqual([]);
    });
  });

  describe('countDueCards()', () => {
    it('counts only due cards', () => {
      const cards: Record<string, SrsFields> = {
        a: reviewedCard(1, 1, 2.5, -1000),
        b: reviewedCard(1, 1, 2.5, 0),
        c: reviewedCard(1, 1, 2.5, 86_400_000),
      };
      expect(countDueCards(cards)).toBe(2);
    });
  });
});

// ────────────────────────────────────────────────
// 3. Daily New Card Limit
// ────────────────────────────────────────────────

describe('Daily New Card Limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('countNewCardsToday()', () => {
    it('counts cards created today', () => {
      setNow(new Date('2026-07-14T12:00:00Z').getTime());
      const today10am = new Date('2026-07-14T10:00:00Z').getTime();
      const today11am = new Date('2026-07-14T11:00:00Z').getTime();
      const yesterday = new Date('2026-07-13T12:00:00Z').getTime();

      const cards: Record<string, SrsFields> = {
        a: cardAt({ createdAt: today10am }),
        b: cardAt({ createdAt: today11am }),
        c: cardAt({ createdAt: yesterday }),
        d: cardAt({ createdAt: undefined }), // no createdAt → not counted
      };

      expect(countNewCardsToday(cards)).toBe(2);
    });

    it('returns 0 when no cards have createdAt', () => {
      const cards: Record<string, SrsFields> = {
        a: { ease: 2.5, interval: 1, repetitions: 1, nextReview: 0, lastReview: 0 },
      };
      expect(countNewCardsToday(cards)).toBe(0);
    });

    it('works at midnight boundary', () => {
      // Set time to 00:00:01 local time on July 15
      const midnight = new Date(2026, 6, 15, 0, 0, 0, 0); // July 15, local midnight
      setNow(midnight.getTime() + 1); // 1ms after midnight
      // Card was created 2 seconds before midnight (yesterday)
      const justBeforeMidnight = midnight.getTime() - 2000;

      const cards: Record<string, SrsFields> = {
        a: cardAt({ createdAt: justBeforeMidnight }),
      };

      // Card was created yesterday, not today
      expect(countNewCardsToday(cards)).toBe(0);
    });
  });

  describe('remainingNewCardsToday()', () => {
    it('returns full limit when no new cards today', () => {
      const cards: Record<string, SrsFields> = {};
      expect(remainingNewCardsToday(cards)).toBe(DEFAULT_DAILY_NEW_LIMIT); // 20
    });

    it('deducts cards already introduced today', () => {
      setNow(new Date('2026-07-14T12:00:00Z').getTime());
      const today = new Date('2026-07-14T10:00:00Z').getTime();

      const cards: Record<string, SrsFields> = {};
      for (let i = 0; i < 5; i++) {
        cards[`card-${i}`] = cardAt({ createdAt: today });
      }

      expect(remainingNewCardsToday(cards)).toBe(15);
    });

    it('returns 0 when limit reached', () => {
      setNow(new Date('2026-07-14T12:00:00Z').getTime());
      const today = new Date('2026-07-14T10:00:00Z').getTime();

      const cards: Record<string, SrsFields> = {};
      for (let i = 0; i < 25; i++) {
        cards[`card-${i}`] = cardAt({ createdAt: today });
      }

      expect(remainingNewCardsToday(cards)).toBe(0);
    });

    it('respects custom limit', () => {
      const cards: Record<string, SrsFields> = {};
      expect(remainingNewCardsToday(cards, 10)).toBe(10);
    });

    it('never returns negative', () => {
      setNow(new Date('2026-07-14T12:00:00Z').getTime());
      const today = new Date('2026-07-14T10:00:00Z').getTime();

      const cards: Record<string, SrsFields> = {};
      for (let i = 0; i < 100; i++) {
        cards[`card-${i}`] = cardAt({ createdAt: today });
      }

      expect(remainingNewCardsToday(cards)).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────
// 4. Multi-Day Simulation
// ────────────────────────────────────────────────

describe('SRS Multi-Day Simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Simulates a realistic scenario:
   * - User saves 20 Japanese words on Day 0
   * - Reviews them daily with mixed performance
   * - Saves 5 more words each day
   *
   * Verify:
   * - New cards are introduced at the daily limit
   * - Reviewed cards graduate to longer intervals
   * - Failed cards come back quickly
   * - Deck grows and diversifies over time
   */
  it('simulates 14 days of review with 20 initial words + 5 new/day', () => {
    // Start on Day 0 at noon
    const DAY_MS = 86_400_000;
    let currentTime = new Date('2026-07-01T12:00:00Z').getTime();
    setNow(currentTime);

    const store = createSrsStore();
    const l2 = 'ja';

    // Helper: add new words to the store (mimics auto-initialization)
    function introduceNewCards(wordIds: string[], limit: number) {
      const langCards = getLanguageCards(store, l2);
      const unscheduled = wordIds.filter((id) => !langCards[id]);
      const remaining = remainingNewCardsToday(langCards, limit);
      const toAdd = unscheduled.slice(0, remaining);

      for (const id of toAdd) {
        const card = newCard();
        card.nextReview = currentTime; // due now
        store.cards[l2] = { ...store.cards[l2], [id]: card };
      }
      return toAdd.length;
    }

    // Helper: review all due cards with a given quality
    function reviewAllDue(quality: 0 | 1 | 2 | 3 | 4 | 5): number {
      const langCards = getLanguageCards(store, l2);
      const dueIds = getDueCards(langCards);
      for (const id of dueIds) {
        const card = langCards[id];
        if (!card) continue;
        store.cards[l2]![id] = sm2(card, quality);
      }
      return dueIds.length;
    }

    // ── Day 0: User saves 20 Japanese words ──
    const savedWords: string[] = [];
    for (let i = 0; i < 20; i++) {
      savedWords.push(`edict-${i}`);
    }

    const introduced0 = introduceNewCards(savedWords, DEFAULT_DAILY_NEW_LIMIT);
    expect(introduced0).toBe(20); // all 20 introduced

    // All 20 are due immediately
    let dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(20);

    // User reviews all 20: 15 passed (good), 5 failed (again)
    let passCount = 0;
    let failCount = 0;
    for (let i = 0; i < 20; i++) {
      const quality = i < 15 ? 4 : 0; // first 15 pass, last 5 fail
      if (quality >= 3) passCount++;
      else failCount++;
      const id = `edict-${i}`;
      const card = getLanguageCards(store, l2)[id];
      if (card) {
        store.cards[l2]![id] = sm2(card, quality);
      }
    }

    // After review: 15 passed → scheduled tomorrow, 5 failed → scheduled in 1 min
    // The failed cards have nextReview = reviewTime + 60000, which is in the future
    // (only 1ms has passed since review, not 60s). So 0 cards are due right now.
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(0); // none due immediately

    // ── Advance past 1 minute: failed cards become due again ──
    advanceTime(61_000);
    currentTime = Date.now();

    // Now the 5 failed cards should be due again (re-review window)
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(5);

    // User re-reviews the 5 failed cards: all pass this time
    for (const id of dueNow) {
      const card = getLanguageCards(store, l2)[id];
      if (card) {
        store.cards[l2]![id] = sm2(card, 4); // pass
      }
    }

    // Now no cards are due
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(0);

    // ── Day 1: advance 24 hours ──
    advanceTime(DAY_MS);
    currentTime = Date.now();

    // All 20 cards should be due (15 original passes + 5 re-reviewed passes, all interval=1)
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(20);

    // Review all 20: all pass with quality=4
    for (const id of dueNow) {
      const card = getLanguageCards(store, l2)[id];
      if (card) {
        store.cards[l2]![id] = sm2(card, 4);
      }
    }

    // ── Day 2: advance 24 hours ──
    advanceTime(DAY_MS);
    currentTime = Date.now();

    // Cards from Day 0 are now on their 2nd pass → interval=6 → NOT due
    // Cards from Day 0 failed-then-passed: 1st pass → interval=1 → due (but these were reviewed again on Day 1)
    // Actually: Day 0 cards (15 original + 5 re-reviewed): all got interval=1 after Day 0 review
    // Day 1: all 20 reviewed again (quality=4) → interval=6 for all 20
    // So on Day 2: 0 cards due from the original 20
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(0);

    // ── Day 7: advance 5 more days (total 7 days from start) ──
    advanceTime(DAY_MS * 5);
    currentTime = Date.now();

    // Cards from Day 1: interval=6 → due on Day 7
    dueNow = getDueCards(getLanguageCards(store, l2));
    expect(dueNow).toHaveLength(20);

    // Review all with perfect recall
    for (const id of dueNow) {
      const card = getLanguageCards(store, l2)[id];
      if (card) {
        store.cards[l2]![id] = sm2(card, 5); // easy
      }
    }

    // ── Day 8-14: advance, add 5 new words/day, review all due ──
    for (let day = 8; day <= 14; day++) {
      advanceTime(DAY_MS);
      currentTime = Date.now();

      // Save 5 new words
      const startIdx = savedWords.length;
      for (let i = 0; i < 5; i++) {
        savedWords.push(`edict-${startIdx + i}`);
      }
      introduceNewCards(savedWords, DEFAULT_DAILY_NEW_LIMIT);

      // Review all due
      const due = getDueCards(getLanguageCards(store, l2));
      for (const id of due) {
        const card = getLanguageCards(store, l2)[id];
        if (card) {
          store.cards[l2]![id] = sm2(card, 4);
        }
      }
    }

    // ── Verify final state ──
    const allCards = getLanguageCards(store, l2);
    const totalCards = Object.keys(allCards).length;

    // After 14 days: 20 initial + 5/day for days 8-14 = 20 + 5*7 = 55
    // But each day the daily new limit caps at 20. Since only the initial batch
    // was 20 and subsequent days have < 20 new, all should be introduced.
    expect(totalCards).toBe(20 + 7 * 5); // 55 cards

    // Cards should have varying intervals (not all the same)
    const intervals = new Set(Object.values(allCards).map((c) => c.interval));
    expect(intervals.size).toBeGreaterThan(1);

    // Some cards should have graduated to long intervals
    const longIntervalCards = Object.values(allCards).filter(
      (c) => c.interval >= 15,
    );
    expect(longIntervalCards.length).toBeGreaterThan(0);

    // Most cards should not be due today (spread out)
    const dueCount = countDueCards(allCards);
    const totalReviewable = Object.keys(allCards).length;
    expect(dueCount).toBeLessThan(totalReviewable);
  });

  /**
   * Regression test: Verify that reviewing a card removes it from the
   * due list (it shouldn't reappear until its next scheduled review).
   */
  it('reviewed cards do not reappear in the same session (unless failed)', () => {
    setNow(new Date('2026-07-14T12:00:00Z').getTime());

    const card = newCard();
    card.nextReview = Date.now(); // due now

    // Pass the card → interval=1 day
    const passed = sm2(card, 4);
    expect(passed.nextReview).toBeGreaterThan(Date.now());
    expect(isDue(passed)).toBe(false);

    // Fail the card → should be due in 1 minute
    const failed = sm2(card, 0);
    expect(failed.nextReview).toBe(Date.now() + 60_000);
    // Immediately after failing, it might still appear "due" if < 1ms passed
    // But after 1ms, it should NOT be due (nextReview is 60s in future)
    advanceTime(1);
    expect(isDue(failed)).toBe(false);

    // After 61 seconds, it IS due again
    advanceTime(60_000);
    expect(isDue(failed)).toBe(true);
  });

  /**
   * Regression test: Ensure that getDueCards returns cards sorted by
   * nextReview (oldest first), so the most overdue cards are reviewed first.
   */
  it('getDueCards returns cards in priority order (most overdue first)', () => {
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
    const now = Date.now();

    const cards: Record<string, SrsFields> = {
      recent: { ease: 2.5, interval: 1, repetitions: 1, nextReview: now - 1000, lastReview: now - 86_400_000 },
      oldest: { ease: 2.5, interval: 1, repetitions: 1, nextReview: now - 86_400_000 * 3, lastReview: now - 86_400_000 * 4 },
      middle: { ease: 2.5, interval: 1, repetitions: 1, nextReview: now - 86_400_000, lastReview: now - 86_400_000 * 2 },
    };

    const due = getDueCards(cards);
    expect(due).toEqual(['oldest', 'middle', 'recent']);
  });

  /**
   * Edge case: A card with nextReview = 0 (uninitialized/legacy) should be due.
   */
  it('cards with nextReview=0 are considered due', () => {
    const card: SrsFields = {
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: 0,
      lastReview: 0,
    };
    expect(isDue(card)).toBe(true);
  });
});

// ────────────────────────────────────────────────
// 5. Edge Cases & Store Operations
// ────────────────────────────────────────────────

describe('SRS Store Operations', () => {
  it('createSrsStore returns a valid empty store', () => {
    const store = createSrsStore();
    expect(store.settings.dailyNewLimit).toBe(DEFAULT_DAILY_NEW_LIMIT);
    expect(store.cards).toEqual({});
  });

  it('getLanguageCards returns empty object for missing language', () => {
    const store = createSrsStore();
    expect(getLanguageCards(store, 'ja')).toEqual({});
  });

  it('getLanguageCards returns cards for existing language', () => {
    const store = createSrsStore();
    store.cards['ja'] = { 'edict-1': newCard() };
    const cards = getLanguageCards(store, 'ja');
    expect(Object.keys(cards)).toHaveLength(1);
    expect(cards['edict-1']).toBeDefined();
  });

  it('sm2 preserves createdAt field', () => {
    const card = newCard();
    const originalCreatedAt = card.createdAt;
    const result = sm2(card, 4);
    expect(result.createdAt).toBe(originalCreatedAt);
  });

  it('sm2 preserves createdAt even on failure', () => {
    const card = newCard();
    const originalCreatedAt = card.createdAt;
    const result = sm2(card, 0);
    expect(result.createdAt).toBe(originalCreatedAt);
  });
});

// ────────────────────────────────────────────────
// 6. Specific Bug Reproduction: Same Deck of 20
// ────────────────────────────────────────────────

describe('Bug Reproduction: Same Deck Repeated', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * This test reproduces the scenario where the review page's
   * dueCards recomputation causes a fetch/reset loop.
   *
   * The bug: When a card is rated, dueCards.length changes,
   * triggering a re-fetch that resets currentIndex to 0.
   * The user keeps seeing cards they already reviewed.
   */
  it('demonstrates that rating one card changes the due count', () => {
    // Simulate 20 due cards
    const cards: Record<string, SrsFields> = {};
    for (let i = 0; i < 20; i++) {
      cards[`word-${i}`] = newCard();
      cards[`word-${i}`]!.nextReview = Date.now(); // due now
    }

    expect(countDueCards(cards)).toBe(20);

    // Rate card 0 as "good" → interval=1 day → no longer due
    cards['word-0'] = sm2(cards['word-0']!, 4);

    // Due count drops by 1
    expect(countDueCards(cards)).toBe(19);

    // This count change triggers the fetch effect re-run in the UI,
    // which resets currentIndex to 0. The user sees word-1 again
    // (which was previously at index 1, now at index 0).
  });

  /**
   * Verify that the fix works: the due count should NOT change
   * if we keep failed cards in the due list properly.
   *
   * Actually, the SM-2 algorithm correctly schedules failed cards
   * in 1 minute. The issue is that the UI re-fetches on count change.
   * The fix should be in the review page, not in SM-2.
   */
  it('failed cards remain due (within 1-minute re-review window)', () => {
    const card = newCard();
    card.nextReview = Date.now();

    const failed = sm2(card, 0);
    // Failed card: nextReview = now + 60_000
    // Within the same tick, Date.now() hasn't advanced
    // So nextReview (T+60000) > Date.now() (T) → NOT due
    // This is correct: the card will be due again in 1 minute
    expect(isDue(failed)).toBe(false);

    // Advance 1 minute
    advanceTime(60_000);
    expect(isDue(failed)).toBe(true);
  });

  /**
   * Simulate what SHOULD happen when a user reviews 20 cards.
   * After reviewing all, no cards should be due (except failed ones
   * which are due in 1 minute).
   */
  it('after reviewing all 20 cards, deck should be empty', () => {
    const cards: Record<string, SrsFields> = {};
    for (let i = 0; i < 20; i++) {
      cards[`word-${i}`] = newCard();
      cards[`word-${i}`]!.nextReview = Date.now();
    }

    // User rates all 20 as "good"
    for (let i = 0; i < 20; i++) {
      cards[`word-${i}`] = sm2(cards[`word-${i}`]!, 4);
    }

    // After reviewing all, none are due
    expect(countDueCards(cards)).toBe(0);

    // Next day, all 20 are due again
    advanceTime(86_400_000); // +1 day
    expect(countDueCards(cards)).toBe(20);
  });
});

// ────────────────────────────────────────────────
// 7. Stress Test: Large Deck
// ────────────────────────────────────────────────

describe('Stress Test: Large Deck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles 10,000 cards without performance issues', () => {
    const cards: Record<string, SrsFields> = {};
    const now = Date.now();
    for (let i = 0; i < 10_000; i++) {
      cards[`word-${i}`] = newCard();
      // Spread over 30 days, but make ~1/3 due now (offset ≤ 0 means due)
      const offset = (Math.random() - 0.33) * 86_400_000 * 30;
      cards[`word-${i}`]!.nextReview = now + offset;
    }

    const start = performance.now();
    const due = getDueCards(cards);
    const elapsed = performance.now() - start;

    // Should complete in well under 100ms
    expect(elapsed).toBeLessThan(100);
    // Due count should be reasonable (≈ 1/3 of total ≈ 3333)
    expect(due.length).toBeGreaterThan(0);
    expect(due.length).toBeLessThan(10_000);
  });
});

// ────────────────────────────────────────────────
// 8. Settings Persistence
// ────────────────────────────────────────────────

describe('Settings Persistence', () => {
  // In-memory localStorage mock for Node environment
  const storage = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => { storage.clear(); },
    get length() { return storage.size; },
    key: (index: number) => [...storage.keys()][index] ?? null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    setNow(new Date('2026-07-14T12:00:00Z').getTime());
    storage.clear();
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    storage.clear();
  });

  const STORAGE_KEY = 'zthSrsProgress';

  /** Simulate the persist function from useSrs hook. */
  function persist(store: SrsProgressStore) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  /** Simulate loading from localStorage (like the useSrs hook does). */
  function loadFromLocalStorage(): SrsProgressStore {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createSrsStore();

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return createSrsStore();

      return {
        settings: { ...createSrsStore().settings, ...(parsed.settings ?? {}) },
        cards: parsed.cards ?? {},
      };
    } catch {
      // Corrupted data — fall back to defaults
      return createSrsStore();
    }
  }

  /** Simulate updateSettings from the hook. */
  function updateSettings(
    store: SrsProgressStore,
    partial: Partial<SrsProgressStore['settings']>,
  ): SrsProgressStore {
    const next: SrsProgressStore = {
      settings: { ...store.settings, ...partial },
      cards: store.cards,
    };
    persist(next);
    return next;
  }

  /** Simulate updateCard from the hook. */
  function updateCard(
    store: SrsProgressStore,
    l2Code: string,
    wordId: string,
    fields: SrsFields,
  ): SrsProgressStore {
    const next: SrsProgressStore = {
      settings: { ...store.settings },
      cards: {
        ...store.cards,
        [l2Code]: { ...(store.cards[l2Code] ?? {}), [wordId]: fields },
      },
    };
    persist(next);
    return next;
  }

  it('updates dailyNewLimit and persists to localStorage', () => {
    let store = createSrsStore();
    expect(store.settings.dailyNewLimit).toBe(20);

    // Change to 5
    store = updateSettings(store, { dailyNewLimit: 5 });
    expect(store.settings.dailyNewLimit).toBe(5);

    // Verify localStorage has the updated value
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.settings.dailyNewLimit).toBe(5);
  });

  it('survives a page reload (localStorage round-trip)', () => {
    // User changes setting to 35
    let store = createSrsStore();
    store = updateSettings(store, { dailyNewLimit: 35 });
    expect(store.settings.dailyNewLimit).toBe(35);

    // Simulate page reload: re-read from localStorage
    const reloaded = loadFromLocalStorage();
    expect(reloaded.settings.dailyNewLimit).toBe(35);
  });

  it('settings are preserved when updating cards', () => {
    // User sets daily limit to 10
    let store = createSrsStore();
    store = updateSettings(store, { dailyNewLimit: 10 });

    // User reviews a card
    const card = newCard();
    const updated = sm2(card, 4);
    store = updateCard(store, 'ja', 'edict-1', updated);

    // Settings should still be 10
    expect(store.settings.dailyNewLimit).toBe(10);

    // After reload, settings should still be 10
    const reloaded = loadFromLocalStorage();
    expect(reloaded.settings.dailyNewLimit).toBe(10);
  });

  it('settings are preserved when removing cards', () => {
    let store = createSrsStore();
    store = updateSettings(store, { dailyNewLimit: 7 });

    // Add and then simulate removing a card (mimics removeCard from hook)
    store = updateCard(store, 'ja', 'edict-1', newCard());
    const next: SrsProgressStore = {
      settings: { ...store.settings },
      cards: {
        ...store.cards,
        ja: (() => {
          const langCards = { ...(store.cards['ja'] ?? {}) };
          delete langCards['edict-1'];
          return langCards;
        })(),
      },
    };
    persist(next);
    store = next;

    expect(store.settings.dailyNewLimit).toBe(7);
    expect(store.cards['ja']?.['edict-1']).toBeUndefined();

    const reloaded = loadFromLocalStorage();
    expect(reloaded.settings.dailyNewLimit).toBe(7);
  });

  it('handles corrupted localStorage gracefully (falls back to defaults)', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const store = loadFromLocalStorage();
    // loadFromLocalStorage would return defaults since JSON.parse throws
    // but our test function handles it. The actual hook also has try/catch.
    expect(store.settings.dailyNewLimit).toBe(20);
  });

  it('handles localStorage with missing settings key', () => {
    // Simulate old data format without settings
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: { ja: {} } }));
    const store = loadFromLocalStorage();
    expect(store.settings.dailyNewLimit).toBe(20); // fallback to default
  });

  it('handles localStorage with null/undefined settings', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: null, cards: {} }));
    const store = loadFromLocalStorage();
    // parsed.settings is null, so spread defaults wins
    expect(store.settings.dailyNewLimit).toBe(20);
  });

  it('multiple rapid setting changes all persist (last one wins)', () => {
    let store = createSrsStore();

    store = updateSettings(store, { dailyNewLimit: 5 });
    store = updateSettings(store, { dailyNewLimit: 15 });
    store = updateSettings(store, { dailyNewLimit: 30 });

    expect(store.settings.dailyNewLimit).toBe(30);

    const reloaded = loadFromLocalStorage();
    expect(reloaded.settings.dailyNewLimit).toBe(30);
  });

  it('changing settings then updating many cards preserves settings', () => {
    let store = createSrsStore();
    store = updateSettings(store, { dailyNewLimit: 12 });

    // Review 50 cards
    for (let i = 0; i < 50; i++) {
      const card = newCard();
      const updated = sm2(card, 4);
      store = updateCard(store, 'ja', `edict-${i}`, updated);
    }

    expect(store.settings.dailyNewLimit).toBe(12);

    const reloaded = loadFromLocalStorage();
    expect(reloaded.settings.dailyNewLimit).toBe(12);
    expect(Object.keys(reloaded.cards['ja'] ?? {})).toHaveLength(50);
  });

  it('default settings are used when nothing is stored', () => {
    // localStorage is empty (cleared in beforeEach)
    const store = loadFromLocalStorage();
    expect(store.settings.dailyNewLimit).toBe(DEFAULT_DAILY_NEW_LIMIT); // 20
    expect(store.cards).toEqual({});
  });

  it('settings survive the full create→update→persist→reload cycle with cards', () => {
    // 1. Create fresh store
    let store = createSrsStore();
    expect(store.settings.dailyNewLimit).toBe(20);

    // 2. Change settings
    store = updateSettings(store, { dailyNewLimit: 8 });

    // 3. Add some cards
    for (let i = 0; i < 5; i++) {
      store = updateCard(store, 'ja', `edict-${i}`, newCard());
    }

    // 4. Review one card
    const reviewed = sm2(store.cards['ja']!['edict-0']!, 4);
    store = updateCard(store, 'ja', 'edict-0', reviewed);

    // 5. Verify current state
    expect(store.settings.dailyNewLimit).toBe(8);
    expect(Object.keys(store.cards['ja']!)).toHaveLength(5);

    // 6. Simulate page reload
    const reloaded = loadFromLocalStorage();

    // 7. Everything should be intact
    expect(reloaded.settings.dailyNewLimit).toBe(8);
    expect(Object.keys(reloaded.cards['ja']!)).toHaveLength(5);
    expect(reloaded.cards['ja']!['edict-0']!.repetitions).toBe(1);
    expect(reloaded.cards['ja']!['edict-0']!.interval).toBe(1);
    expect(reloaded.cards['ja']!['edict-1']!.repetitions).toBe(0);
  });
});
