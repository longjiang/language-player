/**
 * Offline SRS test generation — the mobile half (SPEC-066 § "Offline test
 * generation").
 *
 * The shared builder (`buildFallbackTestQuestion` in `@langplayer/utils`) is
 * pure and knows nothing about where confounders come from. This module gathers
 * that raw material from what the device already has — the offline dictionary,
 * the in-memory entry cache, and the user's saved words — and hands it over.
 *
 * Nothing here touches the network, so it works in Offline Mode, on a dead
 * Wi-Fi, and when the backend is down.
 */

import type { DictionaryEntry } from '@langplayer/shared';
import {
  buildFallbackTestQuestion,
  pronunciationReadingOf,
  rankSimilarWords,
  stringSimilarity,
  type SrsFallbackInput,
  type SrsTestGenerationInput,
  type SrsTestQuestion,
} from '@langplayer/utils';
import { log } from '@/lib/logger';
import { getOfflineEntryById, lookupEntriesSharingChar } from '@/lib/dictionary-db';
import { getCachedEntryById } from '@langplayer/utils';

/** A saved word, as the review page knows it offline. */
export interface FallbackSavedWord {
  id: string;
  /** Display/surface form used for similarity ranking. */
  form: string;
}

export interface SrsFallbackSources {
  /** The current card's word id, excluded from the confounder pool. */
  targetWordId: string;
  /** All saved words for the L2 (the definition-confounder pool). */
  savedWords: readonly FallbackSavedWord[];
  /** The localized definition-question text (`review.test_definition_prompt`). */
  definitionQuestionText: string;
  /**
   * Entry lookup for a saved word. Defaults to the offline chain (in-memory
   * cache, then the offline dictionary) — injectable for tests.
   */
  resolveEntry?: (wordId: string) => Promise<DictionaryEntry | null>;
}

/** Definitions tried per card, and the pool handed to the builder. */
const MAX_CANDIDATE_WORDS = 12;
const MAX_DEFINITION_CANDIDATES = 6;
/** Head-char scans are bounded; the first characters usually supply enough. */
const MAX_SCANNED_CHARS = 3;
const ENTRIES_PER_CHAR = 60;

/** Cached per `${l2}:${headword}` so a retry/regenerate is instant. */
const readingPoolCache = new Map<string, string[]>();

/** Kanji characters of a Japanese headword (kana and Latin are skipped). */
function kanjiCharsOf(headword: string): string[] {
  return [...new Set([...headword])].filter((char) => /[\u4e00-\u9fff々]/.test(char));
}

/**
 * Readings of dictionary words that share a kanji with `headword`, best-first.
 *
 * A word that shares more characters — and is otherwise more similar — comes
 * first, so the most confusable readings reach the builder first. The correct
 * reading and the headword's own entries are excluded here; the builder drops
 * duplicates and "obvious wrongs" again.
 */
async function collectReadingCandidates(
  l2Code: string,
  headword: string,
  correct: string,
): Promise<string[]> {
  const cacheKey = `${l2Code}:${headword}:${correct}`;
  const cached = readingPoolCache.get(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  const chars = kanjiCharsOf(headword).slice(0, MAX_SCANNED_CHARS);
  const byReading = new Map<string, { reading: string; head: string; shared: number }>();
  for (const char of chars) {
    // Each scan is a full table pass, so stop as soon as the pool is rich
    // enough to fill three confounders with room to spare.
    if (byReading.size >= ENTRIES_PER_CHAR) break;
    const entries = await lookupEntriesSharingChar(l2Code, char, ENTRIES_PER_CHAR);
    for (const entry of entries) {
      const head = (entry.head ?? '').trim();
      if (!head || head === headword) continue;
      const reading = pronunciationReadingOf(entry, l2Code).replace(/\s+/g, '');
      if (!reading || reading === correct) continue;
      const shared = [...new Set([...head])].filter((c) => headword.includes(c)).length;
      const existing = byReading.get(reading);
      if (!existing || shared > existing.shared) {
        byReading.set(reading, { reading, head, shared });
      }
    }
  }

  const ranked = [...byReading.values()]
    .sort((a, b) =>
      b.shared - a.shared
      || stringSimilarity(headword, b.head) - stringSimilarity(headword, a.head),
    )
    .map((entry) => entry.reading);

  log('[srs-test] fallback reading pool', {
    l2: l2Code,
    headword,
    chars: chars.length,
    readings: ranked.length,
    // Each character scan is a full table pass, so this is worth watching.
    ms: Date.now() - startedAt,
  });
  readingPoolCache.set(cacheKey, ranked);
  return ranked;
}

/** First definitions of the most similar saved words (target excluded). */
async function collectDefinitionCandidates(
  sources: SrsFallbackSources,
  targetWord: string,
  l2Code: string,
): Promise<string[]> {
  const startedAt = Date.now();
  const pool = sources.savedWords
    .filter((word) => word.id !== sources.targetWordId)
    .map((word) => ({ id: word.id, form: word.form }));
  const ranked = rankSimilarWords(targetWord, pool, MAX_CANDIDATE_WORDS);

  const resolveEntry = sources.resolveEntry
    ?? ((wordId: string) => resolveSavedWordEntry(l2Code, wordId));
  const definitions: string[] = [];
  const seen = new Set<string>();
  for (const word of ranked) {
    const entry = await resolveEntry(word.id);
    const definition = (entry?.definitions?.[0] ?? '').trim();
    if (!definition) continue;
    const key = definition.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    definitions.push(definition);
    if (definitions.length >= MAX_DEFINITION_CANDIDATES) break;
  }
  log('[srs-test] fallback definition pool', {
    target: targetWord,
    candidates: ranked.length,
    definitions: definitions.length,
    ms: Date.now() - startedAt,
  });
  return definitions;
}

/**
 * Build the per-request fallback for the card currently under test. Returns a
 * function the review page hands to `SrsTestManager.requestTest`, or null when
 * the card has no offline material to work with.
 */
export function createSrsTestFallback(
  sources: SrsFallbackSources,
): (input: SrsTestGenerationInput) => Promise<SrsTestQuestion | null> {
  return async (input: SrsTestGenerationInput) => {
    const common = {
      kind: input.kind,
      word: input.wordForm,
      l1Code: input.l1Code,
      l2Code: input.l2Code,
    };

    if (input.kind === 'pronunciation') {
      // Without a ground-truth reading the app cannot know the answer offline
      // (the LLM-hybrid case), so there is nothing to build.
      const correct = (input.pronunciation ?? '').trim();
      if (!correct) return null;
      const readingCandidates = await collectReadingCandidates(
        input.l2Code,
        input.wordForm,
        correct,
      );
      const built = buildFallbackTestQuestion({
        ...common,
        correctAnswer: correct,
        readingCandidates,
      } satisfies SrsFallbackInput);
      log('[srs-test] fallback pronunciation', { word: input.wordForm, built: Boolean(built) });
      return built;
    }

    const correct = (input.definition ?? '').trim();
    if (!correct) return null;
    const definitionCandidates = await collectDefinitionCandidates(
      sources,
      input.wordForm,
      input.l2Code,
    );
    const built = buildFallbackTestQuestion({
      ...common,
      correctAnswer: correct,
      definitionCandidates,
      definitionQuestionText: sources.definitionQuestionText,
    } satisfies SrsFallbackInput);
    log('[srs-test] fallback definition', {
      word: input.wordForm,
      candidates: definitionCandidates.length,
      built: Boolean(built),
    });
    return built;
  };
}

/**
 * Resolve a saved word's entry without the network: the in-memory ID cache
 * first (populated by earlier lookups this session), then the offline
 * dictionary.
 */
export async function resolveSavedWordEntry(
  l2Code: string,
  wordId: string,
): Promise<DictionaryEntry | null> {
  const cached = getCachedEntryById(l2Code, wordId);
  if (cached) return cached;
  try {
    return await getOfflineEntryById(l2Code, wordId);
  } catch {
    return null;
  }
}
