'use client';

/**
 * Resolves the dictionary difficulty level (1 = most frequent … 7 = rarest) of
 * the saved words that are candidates for today's new-card deck, so the review
 * page can select and serve the most frequent words first (SPEC-066
 * "Level-first new-card ordering").
 *
 * Saved words don't store a level — `SavedLexicalItemRecord` is only
 * id/forms/date/instances — so it is derived from the dictionary:
 *
 *  1. the shared dictionary cache (entries already looked up by another
 *     surface, matched by entry id then by head);
 *  2. one batched `/dictionary/lookup-batch` for the remaining candidates.
 *
 * The lookup pool is capped (`NEW_CARD_LEVEL_LOOKUP_LIMIT`) so a large backlog
 * can never turn a review-page load into dozens of requests; words outside the
 * pool are unclassified and sort after the classified ones.
 *
 * `ready` gates the page's auto-init loop: minting today's cards before levels
 * land would spend the daily budget on the wrong words. A failed or timed-out
 * lookup still marks the deck ready, falling back to newest-saved-first.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGS_WITH_WORD_FREQ, isSameEntryId, type SavedLexicalItemRecord } from '@langplayer/shared';
import {
  baseCode,
  enqueueLookupWords,
  fsrs,
  getCachedEntries,
  getCachedEntryById,
  lowestEntryLevel,
  type NewCardLevels,
  type SrsFields,
} from '@langplayer/utils';
import { PYTHON_API_URL } from '@/lib/api-url';
import { log, logwarn } from '@/lib/logger';

/** How long the deck waits for the batch lookup before falling back. */
const LEVEL_LOOKUP_TIMEOUT_MS = 3000;

/** True when the language's dictionary carries frequency-derived levels. */
export function languageHasWordLevels(l2Code: string): boolean {
  return (LANGS_WITH_WORD_FREQ as readonly string[]).includes(baseCode(l2Code));
}

/**
 * Dictionary entries for one saved word, from the shared cache. Prefers an
 * exact entry-id match; a single-entry head hit is also accepted. Returns null
 * when nothing usable is cached yet.
 */
function cachedEntriesForWord(l2Code: string, sw: SavedLexicalItemRecord) {
  const byId = getCachedEntryById(l2Code, sw.id);
  if (byId) return [byId];
  const forms = [...(sw.forms ?? []), sw.context?.form].filter((f): f is string => !!f);
  for (const form of forms) {
    const entries = getCachedEntries(l2Code, form);
    if (!entries || entries.length === 0) continue;
    const exact = entries.find((e) => isSameEntryId(sw.id, e.id, l2Code));
    if (exact) return [exact];
    if (entries.length === 1) return entries;
  }
  return null;
}

function sameLevels(a: NewCardLevels, b: NewCardLevels): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface NewCardLevelsState {
  /** wordId → 1–7 level; an explicit null (or a missing key) = unclassified. */
  levels: NewCardLevels;
  /** True once the current candidate set has been resolved (or skipped). */
  ready: boolean;
}

export function useNewCardLevels(
  l2Code: string,
  savedWords: SavedLexicalItemRecord[],
  cards: Record<string, SrsFields> | undefined,
): NewCardLevelsState {
  const hasLevels = languageHasWordLevels(l2Code);
  const candidates = useMemo(
    () => (hasLevels ? fsrs.getNewCardLevelCandidates(savedWords, cards ?? {}) : []),
    [hasLevels, savedWords, cards],
  );
  const candidateKey = useMemo(() => candidates.map((c) => c.id).join('|'), [candidates]);
  const [state, setState] = useState<NewCardLevelsState>(() => ({ levels: {}, ready: !hasLevels }));
  /** Levels already resolved this page session (including misses ≡ null). */
  const resolvedRef = useRef<Map<string, number | null>>(new Map());
  const lastL2Ref = useRef(l2Code);

  useEffect(() => {
    if (lastL2Ref.current !== l2Code) {
      lastL2Ref.current = l2Code;
      resolvedRef.current.clear();
    }

    if (!hasLevels) {
      setState((prev) =>
        prev.ready && Object.keys(prev.levels).length === 0 ? prev : { levels: {}, ready: true },
      );
      return;
    }

    let cancelled = false;
    const known: NewCardLevels = {};
    const pending: SavedLexicalItemRecord[] = [];

    for (const sw of candidates) {
      const entries = cachedEntriesForWord(l2Code, sw);
      if (entries) {
        const level = lowestEntryLevel(entries);
        known[sw.id] = level;
        resolvedRef.current.set(sw.id, level);
      } else if (resolvedRef.current.has(sw.id)) {
        known[sw.id] = resolvedRef.current.get(sw.id) ?? null;
      } else {
        pending.push(sw);
      }
    }

    const apply = (resolved: NewCardLevels) => {
      const next: NewCardLevels = { ...known, ...resolved };
      for (const [id, level] of Object.entries(next)) {
        resolvedRef.current.set(id, level ?? null);
      }
      setState((prev) =>
        sameLevels(prev.levels, next) && prev.ready
          ? prev
          : { levels: next, ready: true },
      );
    };

    if (pending.length === 0) {
      apply({});
      return;
    }

    // Block card minting until this candidate set has levels (or the lookup
    // gives up), so today's budget is spent on the most frequent words.
    setState((prev) => (prev.ready ? { levels: prev.levels, ready: false } : prev));

    void (async () => {
      const words = pending.map((sw) => ({
        text: (sw.forms ?? []).find((f) => !!f) || sw.context?.form || sw.id,
        l2Code,
      }));
      try {
        await withTimeout(enqueueLookupWords(words, PYTHON_API_URL), LEVEL_LOOKUP_TIMEOUT_MS);
      } catch (err) {
        // non-info-level: the batch lookup failed — the stack identifies which
        // request broke; the deck still falls back to newest-saved-first.
        logwarn('[SRS] new-card level lookup failed — newest-saved fallback', {
          l2: l2Code,
          requested: pending.length,
        }, err);
      }
      if (cancelled) return;

      const resolved: NewCardLevels = {};
      let leveled = 0;
      for (const sw of pending) {
        const entries = cachedEntriesForWord(l2Code, sw);
        const level = entries ? lowestEntryLevel(entries) : null;
        resolved[sw.id] = level;
        if (typeof level === 'number') leveled++;
      }
      log('[SRS] new-card levels resolved', {
        l2: l2Code,
        candidates: candidates.length,
        lookedUp: pending.length,
        leveled,
        unclassified: pending.length - leveled,
        cached: candidates.length - pending.length,
      });
      apply(resolved);
    })();

    return () => {
      cancelled = true;
    };
    // `candidateKey` captures the candidate set; the arrays themselves are
    // re-created on every store update and must not re-trigger the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLevels, l2Code, candidateKey]);

  return state;
}
