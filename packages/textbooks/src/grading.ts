/**
 * Answer normalisation and task grading (SPEC-095).
 *
 * Grading runs locally on submit — no server round-trip is needed to tell a
 * student whether they were right.
 *
 * Everything here is synchronous and pure so it can be unit-tested and shared
 * by both apps. Script equivalence (Chinese simplified ⇄ traditional,
 * Japanese kana) is deliberately NOT handled here: the apps already lazily
 * load OpenCC for the render layer, so they expand `accept[]` once per task
 * through `expandAcceptedVariants` and grading stays a plain comparison.
 */

import type { BlankResponse, BlankResult, BlankSpec, Task, TaskResult } from './types';

/** Full-width ASCII (U+FF01–U+FF5E) → half-width, plus ideographic space. */
function toHalfWidth(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/** Zero-width and BOM characters, which IMEs and copy-paste leave behind. */
const INVISIBLE_RE = /[\u200B-\u200D\uFEFF]/g;

/** Leading/trailing punctuation and whitespace, including CJK forms. */
const EDGE_PUNCT_RE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/**
 * Normalise a response or an expected answer for comparison.
 *
 * Trims, unifies width, removes invisibles and collapses internal whitespace.
 * Only *edge* punctuation is stripped — interior punctuation is meaningful
 * (e.g. `免费Wi-Fi`, `1,275`).
 */
export function normalizeAnswer(text: string): string {
  if (!text) return '';
  return toHalfWidth(text.normalize('NFC'))
    .replace(INVISIBLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_PUNCT_RE, '')
    .trim();
}

/** Every string that should count as correct for `blank`. */
export function acceptedAnswers(blank: BlankSpec): string[] {
  const all = [blank.answer, ...(blank.accept ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of all) {
    const normalized = normalizeAnswer(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

/**
 * Whether a blank counts toward the score.
 *
 * `given` is a worked example and `free` is ungraded prose (notes, free writing):
 * both are shown and recorded, neither is scored.
 */
export function isBlankScoreable(blank: BlankSpec): boolean {
  return blank.kind !== 'given' && blank.kind !== 'free';
}

/** Grade one blank. `given` blanks are always correct (they are pre-filled). */
export function isBlankCorrect(blank: BlankSpec, value: string | undefined): boolean {
  if (blank.kind === 'given') return true;
  // Free text has no correct answer, so it is never wrong.
  if (blank.kind === 'free') return (value ?? '').trim().length > 0;
  const normalized = normalizeAnswer(value ?? '');
  if (!normalized) return false;
  return acceptedAnswers(blank).includes(normalized);
}

/** Grade a whole task's responses. */
export function gradeTask(task: Task, responses: BlankResponse[] | Record<string, string>): TaskResult {
  const byId: Record<string, string> = Array.isArray(responses)
    ? Object.fromEntries(responses.map((r) => [r.blankId, r.value]))
    : responses;

  const blanks: BlankResult[] = [];
  let correctCount = 0;
  let scoreableCount = 0;

  for (const blank of Object.values(task.blanks ?? {})) {
    const correct = isBlankCorrect(blank, byId[blank.id]);
    const scoreable = isBlankScoreable(blank);
    if (scoreable) {
      scoreableCount += 1;
      if (correct) correctCount += 1;
    }
    blanks.push({ blankId: blank.id, correct, answer: blank.answer });
  }

  return {
    taskId: task.id,
    blanks,
    correctCount,
    scoreableCount,
    complete: scoreableCount > 0 && correctCount === scoreableCount,
  };
}

/**
 * Return a copy of `task` whose blanks also accept the supplied variants.
 *
 * Used by the apps to fold OpenCC script equivalence in once per task load
 * (e.g. `convert('车') === '車'`), so a student typing the other script is
 * marked correct without making grading asynchronous.
 *
 * @param convert — maps an answer to an alternate form; return the input to add nothing.
 */
export function expandAcceptedVariants(
  task: Task,
  convert: (answer: string) => string,
): Task;
export function expandAcceptedVariants(
  task: Task,
  convert: (answer: string) => string | Promise<string>,
): Promise<Task>;
export function expandAcceptedVariants(
  task: Task,
  convert: (answer: string) => string | Promise<string>,
): Task | Promise<Task> {
  const blanks = task.blanks;
  if (!blanks) return task;

  const entries = Object.entries(blanks);
  const results = entries.map(([, blank]) => convert(blank.answer));
  const isAsync = results.some((r) => typeof (r as Promise<string>)?.then === 'function');

  const apply = (variants: string[]): Task => {
    const next: Record<string, BlankSpec> = {};
    entries.forEach(([id, blank], i) => {
      const variant = variants[i];
      const accept = [...(blank.accept ?? [])];
      if (variant && variant !== blank.answer && !accept.includes(variant)) accept.push(variant);
      next[id] = accept.length === (blank.accept?.length ?? 0) ? blank : { ...blank, accept };
    });
    return { ...task, blanks: next };
  };

  if (!isAsync) return apply(results as string[]);
  return Promise.all(results as Promise<string>[]).then(apply);
}
