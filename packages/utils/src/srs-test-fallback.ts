/**
 * Programmatic SRS test questions — the offline fallback (SPEC-066
 * § "Offline test generation").
 *
 * Choose mode normally asks the LLM for a question and 3 confounders. When that
 * call fails (Offline Mode, no network, a failing endpoint) the learner would
 * otherwise have to skip every test on a new card, so the review flow builds a
 * question from data the device already has:
 *
 * - **Pronunciation**: the correct answer is the headword's kana reading (the
 *   app owns it); the confounders are readings of other dictionary words that
 *   share a kanji with the headword, topped up with deterministic kana
 *   variants of the correct reading.
 * - **Definition**: the correct answer is the word's own first definition; the
 *   confounders are the first definitions of the most similar saved words.
 *
 * Everything here is pure: the apps gather the raw material (offline
 * dictionary, saved words, entry cache) and pass it in. The same validity rules
 * as the LLM path apply (`isObviousPronunciationWrong`,
 * `validateSrsDefinitionChoices`, distinct choices), so a fallback question is
 * never easier to game than a generated one. A question that cannot be built
 * fairly returns `null` and the caller keeps its normal error UI.
 */

import {
  buildPronunciationQuestionText,
  isObviousPronunciationWrong,
  normalizeTestChoice,
  stringSimilarity,
  validateSrsDefinitionChoices,
  type SrsTestQuestion,
  type TestQuestionKind,
} from './srs-test-mode';

/** Hiragana + the long-vowel mark — the only characters a ja reading may use. */
const HIRAGANA_ONLY = /^[\u3040-\u309fー]+$/;

export interface SrsFallbackInput {
  kind: TestQuestionKind;
  /** The question target: the lemma for pronunciation, the surface form for definition. */
  word: string;
  l1Code: string;
  l2Code: string;
  /** The correct answer: the headword's reading, or the word's first definition. */
  correctAnswer: string;
  /**
   * Definition confounders, best-first (the caller's similarity order), with
   * the target word's own definition already excluded.
   */
  definitionCandidates?: string[];
  /** Pronunciation confounders, best-first (readings of kanji-sharing words). */
  readingCandidates?: string[];
  /**
   * Localized question text for a definition question (app-owned via `useT()`).
   * A definition question is never built without it.
   */
  definitionQuestionText?: string;
}

/** Three confounders is the target; two is the floor (a 3-option question). */
const TARGET_CONFOUNDERS = 3;
const MIN_CONFOUNDERS = 2;

function baseL2(l2Code: string): string {
  return (l2Code.split('-')[0] ?? '').toLowerCase();
}

/** Dedupe helper keyed by the same normalization the validator uses. */
function pushUnique(out: string[], seen: Set<string>, raw: string): void {
  const value = raw.trim();
  if (!value) return;
  const key = normalizeTestChoice(value);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(value);
}

/**
 * Deterministic near-miss readings of a correct kana reading: voicing/devoicing
 * of each mora and 促音 (small っ) insertion. These are the variants that stay
 * *outside* the correct reading — appended long vowels would contain it and are
 * rejected by `isObviousPronunciationWrong`.
 */
export function japaneseReadingVariants(correct: string): string[] {
  // ち↔ぢ and つ↔づ are deliberately absent: outside rendaku they read as
  // misspellings rather than plausible readings, so they make poor confounders.
  const VOICE: Record<string, string> = {
    か: 'が', が: 'か', き: 'ぎ', ぎ: 'き', く: 'ぐ', ぐ: 'く', け: 'げ', げ: 'け', こ: 'ご', ご: 'こ',
    さ: 'ざ', ざ: 'さ', し: 'じ', じ: 'し', す: 'ず', ず: 'す', せ: 'ぜ', ぜ: 'せ', そ: 'ぞ', ぞ: 'そ',
    た: 'だ', だ: 'た', て: 'で', で: 'て', と: 'ど', ど: 'と',
    は: 'ば', ば: 'は', ひ: 'び', び: 'ひ', ふ: 'ぶ', ぶ: 'ふ', へ: 'べ', べ: 'へ', ほ: 'ぼ', ぼ: 'ほ',
  };
  const out: string[] = [];
  const seen = new Set<string>();
  const chars = [...correct];

  // 促音 insertion after the first mora first (いちばん → いっちばん): the most
  // plausible misreading of the three kinds of variant.
  if (chars.length >= 2) {
    pushUnique(out, seen, [chars[0]!, 'っ', ...chars.slice(1)].join(''));
  }

  // Then voicing/devoicing, one mora at a time (いちばん → いちはん).
  chars.forEach((char, index) => {
    const voiced = VOICE[char];
    if (!voiced) return;
    const variant = [...chars.slice(0, index), voiced, ...chars.slice(index + 1)].join('');
    pushUnique(out, seen, variant);
  });

  return out;
}

function pronunciationFallback(input: SrsFallbackInput): SrsTestQuestion | null {
  const correct = input.correctAnswer.trim();
  if (!correct) return null;
  if (baseL2(input.l2Code) === 'ja' && !HIRAGANA_ONLY.test(correct)) return null;

  const seen = new Set<string>([normalizeTestChoice(correct)]);
  const confounders: string[] = [];
  const accept = (raw: string) => {
    const value = raw.replace(/\s+/g, '').trim();
    if (!value) return;
    if (baseL2(input.l2Code) === 'ja' && !HIRAGANA_ONLY.test(value)) return;
    if (isObviousPronunciationWrong(value, correct)) return;
    pushUnique(confounders, seen, value);
  };

  for (const candidate of input.readingCandidates ?? []) accept(candidate);
  if (confounders.length < TARGET_CONFOUNDERS && baseL2(input.l2Code) === 'ja') {
    for (const variant of japaneseReadingVariants(correct)) accept(variant);
  }

  if (confounders.length < TARGET_CONFOUNDERS) return null;
  return {
    kind: 'pronunciation',
    prompt: buildPronunciationQuestionText(input.word, input.l1Code),
    correctAnswer: correct,
    choices: [correct, ...confounders.slice(0, TARGET_CONFOUNDERS)],
  };
}

function definitionFallback(input: SrsFallbackInput): SrsTestQuestion | null {
  const correct = input.correctAnswer.trim();
  const questionText = input.definitionQuestionText?.trim();
  if (!correct || !questionText) return null;

  const seen = new Set<string>([normalizeTestChoice(correct)]);
  const pool: string[] = [];
  for (const candidate of input.definitionCandidates ?? []) {
    const value = candidate.trim();
    if (!value) continue;
    if (value.includes('{word}')) continue;
    pushUnique(pool, seen, value);
  }
  if (pool.length < MIN_CONFOUNDERS) return null;

  const correctLength = correct.length;
  // Two orderings, tried in turn: confounders of comparable length (keeps the
  // answer-length guard satisfied while preferring the most similar words), then
  // the longest ones (when every candidate is much shorter than the answer,
  // long options are the only way to avoid a length cue).
  const orderings = [
    [...pool].sort((a, b) => Math.abs(a.length - correctLength) - Math.abs(b.length - correctLength)),
    [...pool].sort((a, b) => b.length - a.length),
  ];

  for (const ordering of orderings) {
    for (const size of [TARGET_CONFOUNDERS, MIN_CONFOUNDERS]) {
      if (ordering.length < size) continue;
      const confounders = ordering.slice(0, size);
      const question: SrsTestQuestion = {
        kind: 'definition',
        prompt: questionText.replace('{word}', input.word),
        correctAnswer: correct,
        choices: [correct, ...confounders],
      };
      if (!validateSrsDefinitionChoices(question)) return question;
    }
  }
  return null;
}

/**
 * Build a fallback question, or `null` when the available material cannot make
 * a fair one (the caller keeps its normal error UI).
 */
export function buildFallbackTestQuestion(input: SrsFallbackInput): SrsTestQuestion | null {
  return input.kind === 'pronunciation'
    ? pronunciationFallback(input)
    : definitionFallback(input);
}

/**
 * Rank saved words by how confusable they are with the target: shared
 * characters first (a word that shares a kanji is the best distractor for a
 * definition question), then overall string similarity. Pure, so the apps can
 * rank their whole saved-word list without touching the dictionary.
 */
export function rankSimilarWords<T extends { id: string; form: string }>(
  target: string,
  candidates: readonly T[],
  limit = 12,
): T[] {
  const targetChars = new Set([...target.trim()]);
  const scored = candidates
    .filter((candidate) => candidate.id && candidate.form?.trim())
    .map((candidate) => {
      const shared = [...new Set([...candidate.form.trim()])]
        .filter((char) => targetChars.has(char)).length;
      return {
        candidate,
        shared,
        similarity: stringSimilarity(target, candidate.form),
        lengthDelta: Math.abs(candidate.form.trim().length - target.trim().length),
      };
    })
    .sort((a, b) =>
      b.shared - a.shared
      || b.similarity - a.similarity
      || a.lengthDelta - b.lengthDelta
      || a.candidate.id.localeCompare(b.candidate.id),
    );
  return scored.slice(0, limit).map((entry) => entry.candidate);
}
