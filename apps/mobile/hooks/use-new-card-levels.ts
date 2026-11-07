/**
 * Resolves the dictionary difficulty level (1 = most frequent … 7 = rarest) of
 * the saved words that are candidates for today's new-card deck, so the review
 * tab can select and serve the most frequent words first (SPEC-066
 * "Level-first new-card ordering").
 *
 * Mobile resolves levels from more sources than web, cheapest first:
 *
 *  1. the saved word's own `canonicalEntry` (enrichment already stored it);
 *  2. the shared dictionary cache (entries looked up by another surface);
 *  3. the offline dictionary, by entry id (id-based, so it also covers saved
 *     words whose first form is inflected);
 *  4. one batched `/dictionary/lookup-batch` for whatever is left — skipped
 *     entirely in Offline Mode.
 *
 * The pool is capped (`NEW_CARD_LEVEL_LOOKUP_LIMIT`) so a large backlog can
 * never turn a review-tab load into hundreds of lookups; words outside the
 * pool are unclassified and sort after the classified ones.
 *
 * `ready` gates the page's auto-init loop: minting today's cards before levels
 * land would spend the daily budget on the wrong words. A failed or timed-out
 * lookup still marks the deck ready, falling back to newest-saved-first.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGS_WITH_WORD_FREQ, decomposeWordId, isSameEntryId } from '@langplayer/shared';
import {
  baseCode,
  enqueueLookupWords,
  entryDifficultyLevel,
  fsrs,
  getCachedEntries,
  getCachedEntryById,
  lowestEntryLevel,
  type NewCardLevels,
  type SrsFields,
} from '@langplayer/utils';
import type { DictionaryEntry } from '@langplayer/shared';
import type { SavedWordMeta } from '@/contexts/SavedWordsContext';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getOfflineEntryById } from '@/lib/dictionary-db';
import { isOfflineModeEnabled } from '@/lib/offline-mode';
import { srsLogger } from '@/lib/logger';

const { log, logwarn } = srsLogger;

/** How long the deck waits for the batch lookup before falling back. */
const LEVEL_LOOKUP_TIMEOUT_MS = 3000;

/** True when the language's dictionary carries frequency-derived levels. */
export function languageHasWordLevels(l2Code: string): boolean {
  return (LANGS_WITH_WORD_FREQ as readonly string[]).includes(baseCode(l2Code));
}

/** The saved word's own enriched entry, when it is the exact same entry. */
function canonicalLevel(sw: SavedWordMeta, baseL2: string): { known: true; level: number | null } | null {
  const canonical = sw.canonicalEntry;
  if (canonical && isSameEntryId(sw.id, canonical.id, baseL2)) {
    return { known: true, level: entryDifficultyLevel(canonical) };
  }
  return null;
}

/** Entries for one saved word from the shared cache (id, then head). */
function cachedEntriesForWord(l2Code: string, sw: SavedWordMeta): DictionaryEntry[] | null {
  const byId = getCachedEntryById(l2Code, sw.id);
  if (byId) return [byId];
  const forms = [...(sw.forms ?? []), sw.context?.form, sw.head].filter(
    (f): f is string => typeof f === 'string' && !!f,
  );
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
  savedWords: SavedWordMeta[],
  cards: Record<string, SrsFields> | undefined,
  options: { offlineDictionaryAvailable?: boolean | null } = {},
): NewCardLevelsState {
  const { offlineDictionaryAvailable = false } = options;
  // `null` = the (local, fast) availability check is still in flight. Levels
  // are not resolved until it settles so the offline dictionary is genuinely
  // tried before the network, per SPEC-066.
  const offlineAvailabilityKnown = offlineDictionaryAvailable !== null;
  const hasLevels = languageHasWordLevels(l2Code);
  const baseL2 = baseCode(l2Code);
  const candidates = useMemo(
    () => (hasLevels ? fsrs.getNewCardLevelCandidates(savedWords, cards ?? {}) : []),
    [hasLevels, savedWords, cards],
  );
  const candidateKey = useMemo(() => candidates.map((c) => c.id).join('|'), [candidates]);
  const [state, setState] = useState<NewCardLevelsState>(() => ({ levels: {}, ready: !hasLevels }));
  /** Levels already resolved this app session (including misses ≡ null). */
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
    const pending: SavedWordMeta[] = [];

    for (const sw of candidates) {
      const canonical = canonicalLevel(sw, baseL2);
      if (canonical) {
        known[sw.id] = canonical.level;
        resolvedRef.current.set(sw.id, canonical.level);
        continue;
      }
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
        sameLevels(prev.levels, next) && prev.ready ? prev : { levels: next, ready: true },
      );
    };

    if (pending.length === 0) {
      apply({});
      return;
    }

    // Block card minting until this candidate set has levels (or the lookup
    // gives up), so today's budget is spent on the most frequent words.
    setState((prev) => (prev.ready ? { levels: prev.levels, ready: false } : prev));

    if (!offlineAvailabilityKnown) return;

    void (async () => {
      const resolved: NewCardLevels = {};
      let fromOffline = 0;

      // 1. Offline dictionary by entry id — local SQLite, covers inflected
      // forms the head-keyed batch lookup would miss. Called first per the
      // SPEC; a language with no downloaded dictionary returns null fast.
      const remaining: SavedWordMeta[] = [];
      if (offlineDictionaryAvailable) {
        for (const sw of pending) {
          const scopedId = decomposeWordId(sw.id, baseL2)?.id ?? sw.id;
          let offline: DictionaryEntry | null = null;
          try {
            offline = await getOfflineEntryById(baseL2, scopedId);
          } catch {
            offline = null;
          }
          if (cancelled) return;
          if (offline) {
            resolved[sw.id] = entryDifficultyLevel(offline);
            fromOffline++;
          } else {
            remaining.push(sw);
          }
        }
      } else {
        remaining.push(...pending);
      }

      // 2. Network batch lookup for what the offline dictionary could not
      // resolve. Skipped entirely in Offline Mode (the gate forbids it).
      let lookedUp = 0;
      if (remaining.length > 0 && !isOfflineModeEnabled()) {
        lookedUp = remaining.length;
        const words = remaining.map((sw) => {
          const contextForm = sw.context?.form;
          return {
            text:
              (sw.forms ?? []).find((f) => !!f) ||
              (typeof contextForm === 'string' ? contextForm : '') ||
              sw.head ||
              sw.id,
            l2Code,
          };
        });
        try {
          await withTimeout(enqueueLookupWords(words, PYTHON_API_URL), LEVEL_LOOKUP_TIMEOUT_MS);
        } catch (err) {
          // non-info-level: the batch lookup failed — the stack identifies
          // which request broke; the deck still falls back to newest-saved-first.
          logwarn('[srs] new-card level lookup failed — newest-saved fallback', {
            l2: l2Code,
            requested: remaining.length,
          }, err);
        }
        if (cancelled) return;
        for (const sw of remaining) {
          const entries = cachedEntriesForWord(l2Code, sw);
          resolved[sw.id] = entries ? lowestEntryLevel(entries) : null;
        }
      } else if (!cancelled) {
        // Offline mode: whatever the offline dictionary could not resolve is
        // unclassified for this session.
        for (const sw of remaining) resolved[sw.id] = null;
      }

      if (cancelled) return;
      const leveled = Object.values(resolved).filter((v) => typeof v === 'number').length;
      log('[srs] new-card levels resolved', {
        l2: l2Code,
        candidates: candidates.length,
        cached: candidates.length - pending.length,
        fromOffline,
        network: lookedUp,
        leveled,
        unclassified: pending.length - leveled,
        offlineMode: isOfflineModeEnabled(),
      });
      apply(resolved);
    })();

    return () => {
      cancelled = true;
    };
    // `candidateKey` captures the candidate set; the arrays themselves are
    // re-created on every store update and must not re-trigger the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLevels, l2Code, baseL2, offlineDictionaryAvailable, candidateKey]);

  return state;
}
