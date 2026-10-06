import { describe, it, expect } from 'vitest';
import { reconcileLocalSrsCards, srsReconcileKey } from './srs-reconcile';
import type { SrsFields } from '@langplayer/shared';

/** Minimal SrsFields stand-in — the reconcile only moves cards around. */
function card(id: string): SrsFields {
  return { id, due: 0, reps: 5 } as unknown as SrsFields;
}

describe('reconcileLocalSrsCards (SPEC-066 mobile pull-merge reconcile)', () => {
  it('keeps cards the authoritative server deck contains', () => {
    const { cards, dropped } = reconcileLocalSrsCards('ja', {
      localCards: { a: card('a'), b: card('b') },
      serverCards: { a: {} },
      outboxKeys: new Set<string>(),
      confirmedKeys: new Set<string>(),
    });
    expect(Object.keys(cards)).toEqual(['a']);
    expect(dropped).toEqual(['b']);
  });

  it('keeps a card with unsynced local work (pending/error outbox op)', () => {
    const { cards } = reconcileLocalSrsCards('ja', {
      localCards: { a: card('a') },
      serverCards: {},
      outboxKeys: new Set([srsReconcileKey('ja', 'a')]),
      confirmedKeys: new Set<string>(),
    });
    expect(Object.keys(cards)).toEqual(['a']);
  });

  it('keeps a card the server confirmed this session even though the hydration snapshot predates it', () => {
    // The regression: the review page mints a new card, its push is acked (outbox
    // row gone) and echoed back through the pull, while `serverCards` is the
    // snapshot captured at hydration. Dropping it here made the deck churn on
    // every sync action.
    const { cards, dropped } = reconcileLocalSrsCards('ja', {
      localCards: { minted: card('minted') },
      serverCards: {},
      outboxKeys: new Set<string>(),
      confirmedKeys: new Set([srsReconcileKey('ja', 'minted')]),
    });
    expect(Object.keys(cards)).toEqual(['minted']);
    expect(dropped).toEqual([]);
  });

  it('scopes keep-decisions per language (a key for another l2 does not protect)', () => {
    const { cards, dropped } = reconcileLocalSrsCards('ja', {
      localCards: { a: card('a') },
      serverCards: {},
      outboxKeys: new Set([srsReconcileKey('zh', 'a')]),
      confirmedKeys: new Set([srsReconcileKey('zh', 'a')]),
    });
    expect(Object.keys(cards)).toEqual([]);
    expect(dropped).toEqual(['a']);
  });

  it('leaves the cards untouched while the language deck has not loaded', () => {
    const local = { a: card('a') };
    expect(reconcileLocalSrsCards('ja', {
      localCards: local,
      serverCards: undefined,
      outboxKeys: new Set<string>(),
      confirmedKeys: new Set<string>(),
    })).toEqual({ cards: local, dropped: [] });
    expect(reconcileLocalSrsCards('ja', {
      localCards: local,
      serverCards: null,
      outboxKeys: new Set<string>(),
      confirmedKeys: new Set<string>(),
    })).toEqual({ cards: local, dropped: [] });
  });
});
