/** Multiple-choice test scoring shared by web and mobile review screens. */
import { languageNameFromCode } from './language';
import { katakanaToHiragana } from './furigana';

export type TestQuestionKind = 'definition' | 'pronunciation';

export interface SrsTestQuestion {
  kind: TestQuestionKind;
  prompt: string;
  choices: string[];
  correctAnswer: string;
}

export interface SrsQuestionResponse {
  kind: string;
  question: string;
  correct_answer: string;
  confounders?: unknown[];
}

/**
 * Parse the JSON object returned by the SRS question prompt.
 *
 * Models occasionally wrap otherwise-valid JSON in a Markdown code fence even
 * though the prompt asks for JSON only. Accept both forms, including a fence
 * whose closing marker was omitted by a truncated response.
 */
export function parseSrsQuestionResponse(raw: unknown): SrsQuestionResponse {
  if (typeof raw !== 'string') {
    throw new Error('SRS test response was not text');
  }

  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)(?:\s*```)?$/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();
  const parsed: unknown = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SRS test response was not a JSON object');
  }
  return parsed as SrsQuestionResponse;
}

/** Score a response using the review-mode time bands. */
export function scoreTestAnswer(correct: boolean, elapsedMs: number): 1 | 2 | 3 | 4 {
  if (!correct) return 1;
  if (elapsedMs <= 5_000) return 4;
  if (elapsedMs <= 10_000) return 3;
  return 2;
}

/** Combine definition/pronunciation scores and map to an FSRS rating. */
export function testScoreToRating(score: number): 'again' | 'hard' | 'good' | 'easy' {
  const normalized = Math.max(1, Math.min(4, Math.floor(score)));
  return (['again', 'hard', 'good', 'easy'] as const)[normalized - 1]!;
}

/**
 * Grade a test result with the SPEC-066 marking rules:
 *
 * - each test scores 0 (wrong) or 1 (right);
 * - the total is scaled so a perfect score would be 2
 *   (`round(correctCount * 2 / numTests)`), so single- and multi-test cards
 *   share one 0–2 scale;
 * - a scaled score above 1 (i.e. 2, all tests correct) is time-adjusted:
 *   slower than 10s per test deducts a point, faster than 5s per test adds
 *   one;
 * - map points → again(0) / hard(1) / good(2) / easy(3).
 *
 * `correctCount` is the number of tests answered correctly; `totalTests` is
 * the number of tests shown (1 or 2); `totalMs` is the total time to complete
 * them.
 */
export function scoreTestResult(
  correctCount: number,
  totalTests: number,
  totalMs: number,
): 'again' | 'hard' | 'good' | 'easy' {
  const numTests = Math.max(1, totalTests);
  let points = Math.round((correctCount * 2) / numTests);
  if (points > 1) {
    if (totalMs > 10_000 * numTests) points -= 1;
    else if (totalMs < 5_000 * numTests) points += 1;
  }
  points = Math.max(0, Math.min(3, points));
  return (['again', 'hard', 'good', 'easy'] as const)[points]!;
}

/** Languages whose native orthography does not reliably reveal pronunciation. */
export const DEEP_ORTHOGRAPHY_LANGUAGES = new Set([
  'zh', 'yue', 'ja', 'ko', 'ar', 'fa', 'he', 'hi', 'th', 'my', 'km', 'lo', 'ta', 'te', 'ml', 'bn',
]);

/**
 * Should this card include a pronunciation test?
 *
 * `word` is the **surface form as it appears in the context sentence** (may
 * be inflected): for Japanese, a kana-only surface (e.g. しかるべき) already
 * reveals its reading in the context, so the test is suppressed even when
 * the lemma (然るべき) contains kanji — the learner reads the surface, not
 * the lemma. Other deep-orthography L2s always test pronunciation.
 */
export function needsPronunciationTest(l2Code: string, word?: string): boolean {
  const base = (l2Code.split('-')[0] ?? '').toLowerCase();
  if (!DEEP_ORTHOGRAPHY_LANGUAGES.has(base)) return false;
  // Japanese kana-only words already reveal their reading; pronunciation testing
  // is useful when kanji create an orthography-to-reading ambiguity.
  if (base === 'ja' && word && !/[\u3400-\u4dbf\u4e00-\u9fff]/u.test(word)) return false;
  return true;
}

/**
 * Ordered test kinds for a card, pronunciation before definition.
 *
 * The pronunciation (reading) question comes first so the learner recalls the
 * sound of the word before the meaning; the definition question follows, then
 * the card is rated. Cards whose L2/orthography does not reveal pronunciation
 * get a single definition test only.
 */
export function getTestKinds(l2Code: string, word?: string): TestQuestionKind[] {
  return needsPronunciationTest(l2Code, word)
    ? ['pronunciation', 'definition']
    : ['definition'];
}

/** Minimal saved-word shape the review pages pass to the form helpers below. */
export interface SrsWordFormInfo {
  head?: string;
  forms?: string[];
  context?: { form?: string };
  instances?: Array<{ form?: string }>;
}

/**
 * The surface form as it appears in the saved context sentence (may be
 * inflected, e.g. 押し切られ). Used for the Japanese pronunciation-test
 * presence check: the learner reads this exact form in the context.
 */
export function surfaceFormOf(word: SrsWordFormInfo | undefined, fallback: string): string {
  if (!word) return fallback;
  return (
    word.context?.form
    ?? word.instances?.[word.instances.length - 1]?.form
    ?? fallback
  );
}

/**
 * The lemma (dictionary/head form) of a saved word, e.g. 押し切る for a
 * saved surface 押し切られ. The pronunciation test targets the lemma, never
 * the surface form — the learner is asked to recall the canonical reading.
 */
export function lemmaFormOf(word: SrsWordFormInfo | undefined, fallback: string): string {
  if (!word) return fallback;
  const head = word.head;
  if (typeof head === 'string' && head && head !== '?') return head;
  const first = word.forms?.[0];
  return typeof first === 'string' && first && first !== '?' ? first : fallback;
}

/**
 * The word the pronunciation question must probe, together with a guard that
 * keeps the question and the correct answer about the SAME word.
 *
 * SPEC-066 (2026-09-02 fix): `lemmaFormOf` infers the lemma from
 * `forms[0]` when the saved record has no explicit head — but `forms[]` is
 * length-sorted at save time, so `forms[0]` can be an inflected or kana
 * variant (研ぎすまし / 見せつけ) rather than the lemma (研ぎ澄ます /
 * 見せつける). The correct answer, however, is always the ground-truth
 * reading of the RESOLVED DICTIONARY ENTRY (the true lemma) — producing the
 * mismatch where 「研ぎすまし」怎么读? is answered with とぎすます.
 *
 * The fix: when the resolved entry exists, ITS headword is the lemma — use
 * it for the question. The saved-record inference is only a fallback for
 * cards whose entry cannot be resolved (and matches the old behavior then).
 */
export function pronunciationTargetOf(
  word: SrsWordFormInfo | undefined,
  fallback: string,
  entry?: { head?: string | null } | null,
): string {
  const entryHead = typeof entry?.head === 'string' ? entry.head.trim() : '';
  if (entryHead && entryHead !== '?') return entryHead;
  return lemmaFormOf(word, fallback);
}

/** Normalize an answer for duplicate-choice detection without changing display text. */
export function normalizeTestChoice(choice: string): string {
  return choice.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

// ── Spell mode ────────────────────────────────────────────────────────────
//
// Spell mode asks the learner to type the exact surface/inflected form that is
// blanked in the context sentence. The base score is graded by string
// similarity (not a binary right/wrong), then the countdown timer always adds
// or deducts a point, then the result maps to the same four buttons as choose
// mode.
//
// The correct answer is derived from the context sentence itself using the same
// forms the context highlight matches (SPEC-066), so it is the exact text shown
// as the blank (e.g. たじろかせる) — never a reduced record form (たじろか).
// Matching is script-tolerant: Japanese folds hiragana ⇄ katakana, and Chinese
// (zh/yue) compares the simplified & traditional variants (built by the app via
// the same lazy OpenCC conversion the render layer uses).

/**
 * Normalized Levenshtein similarity in [0, 1] (1 = identical after
 * trim/case/whitespace normalization). Used to grade spell-mode answers.
 */
export function stringSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  const m = x.length;
  const n = y.length;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = new Array(n + 1).fill(0);
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return Math.max(0, Math.min(1, 1 - (prev[n] ?? 0) / Math.max(m, n)));
}

/** Hiragana (平仮名) → katakana (片仮名). Used for Japanese spell matching. */
export function hiraganaToKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** Hiragana/katakana variants of a Japanese string (original first, deduped). */
export function kanaVariants(text: string): string[] {
  return [...new Set([text, katakanaToHiragana(text), hiraganaToKatakana(text)])];
}

/**
 * Script variants of a string for script-tolerant comparison (original first,
 * deduped).
 *
 * - Japanese: hiragana ⇄ katakana (synchronous, trivial Unicode math).
 * - Chinese (zh/yue): simplified ⇄ traditional is app-side — the apps already
 *   lazily load OpenCC for the render layer, so they supplement with
 *   `toTraditional`/`toSimplified`; here we keep only the original.
 * - Everything else: unchanged.
 */
export function scriptVariants(text: string, l2Code: string): string[] {
  const base = (l2Code.split('-')[0] ?? '').toLowerCase();
  if (base === 'ja') return kanaVariants(text);
  return [text];
}

/**
 * The exact text that the context-sentence highlight blanks, derived with the
 * same logic as the highlight (SPEC-066): among the word's matchable forms
 * (saved forms, context/instance surface forms, head, the resolved entry's
 * head/alternate/kana/han_script variants) the longest form that actually
 * appears in the context wins — so `たじろかせる` beats `たじろか`. For Japanese
 * the context is folded to hiragana for matching but the returned text is the
 * exact substring as it appears in the sentence (so script matches the blank).
 * Falls back to `surfaceFormOf` when no form appears.
 */
export function spellBlankText(
  context: string,
  word: SrsWordFormInfo | undefined,
  fallback: string,
  entry: {
    head?: string | null;
    alternate?: string | null;
    phonetic_detail?: { kana?: string } | null;
    han_script?: {
      simplified?: string;
      traditional?: string;
      kanji?: string | null;
      hanja?: string | null;
      hangul?: string;
      han?: string;
      hantu?: string;
    } | null;
  } | null | undefined,
  l2Code: string,
): string {
  const base = (l2Code.split('-')[0] ?? '').toLowerCase();
  const fold = (s: string) => (base === 'ja' ? katakanaToHiragana(s) : s);
  const candidates = new Set<string>();
  if (word) {
    if (word.head) candidates.add(word.head);
    for (const f of word.forms ?? []) if (f) candidates.add(f);
    if (word.context?.form) candidates.add(word.context.form);
    for (const inst of word.instances ?? []) if (inst.form) candidates.add(inst.form);
  }
  if (entry) {
    if (entry.head) candidates.add(entry.head);
    if (entry.alternate) candidates.add(entry.alternate);
    if (entry.phonetic_detail?.kana) candidates.add(entry.phonetic_detail.kana);
    const hs = entry.han_script;
    if (hs) {
      if (hs.simplified) candidates.add(hs.simplified);
      if (hs.traditional) candidates.add(hs.traditional);
    }
  }
  candidates.add(fallback);
  candidates.add(surfaceFormOf(word, fallback));
  candidates.add(lemmaFormOf(word, fallback));
  candidates.add(pronunciationTargetOf(word, fallback, entry));

  const foldedContext = fold(context);
  let best = '';
  let bestLen = -1;
  for (const c of candidates) {
    if (!c) continue;
    const fc = fold(c);
    if (!fc) continue;
    const idx = foldedContext.indexOf(fc);
    if (idx === -1) continue;
    const len = base === 'ja' ? fc.length : c.length;
    if (len > bestLen) {
      best = base === 'ja' ? context.slice(idx, idx + fc.length) : c;
      bestLen = len;
    }
  }
  return best || surfaceFormOf(word, fallback);
}

/**
 * The best `stringSimilarity` across every variant pair — the script-tolerant
 * match score. Used both by `scoreSpellResult` and to decide whether a typed
 * answer counts as "correct".
 */
export function bestScriptSimilarity(
  answerVariants: string[],
  correctVariants: string[],
): number {
  let best = 0;
  for (const a of answerVariants) {
    for (const c of correctVariants) {
      const sim = stringSimilarity(a, c);
      if (sim > best) best = sim;
    }
  }
  return best;
}

/**
 * Spell-mode time allowance.
 *
 * SPEC-066 originally gave spell mode a budget of T = 10 s and the same
 * 5 s / 10 s time bands as choose mode. The allowance was doubled
 * (2026-09-xx) because typing the exact blanked surface/inflected form —
 * often through a CJK IME — is much slower than tapping a multiple-choice
 * option. Both the visible countdown AND the grading bands scale together so
 * the blue/green bar stays consistent with the fast/slow scoring: budget
 * 20 s, fast < 10 s → easy, slow > 20 s → hard.
 */
export const SPELL_TEST_TOTAL_MS = 20_000;
export const SPELL_TEST_FAST_MS = 10_000;

/**
 * Grade a spell-mode answer with the SPEC-066 spell rules (2026-09-06 tighten;
 * 2026-09-xx time allowance doubled):
 *
 * - `answerVariants` / `correctVariants` are the script-folded alternatives for
 *   the user's submission and the blanked word (see `scriptVariants`); the best
 *   `stringSimilarity` across all pairs sets the base score;
 * - base points map similarity to 0–2, then the countdown only moves a
 *   *correct* answer (matching choose mode, which only time-adjusts a perfect
 *   score) so the fast bonus can never rescue a wrong or typo'd answer:
 *   - ≥ 0.9 → 2 (correct — essentially exact, script-folded); fast
 *     (< `SPELL_TEST_FAST_MS`) → 3 (easy), slow (> `SPELL_TEST_TOTAL_MS`) →
 *     1 (hard), else → 2 (good);
 *   - 0.7–0.9 → 1 (close — a small typo), regardless of time → hard;
 *   - < 0.7 → 0 (wrong), regardless of time → again;
 * - map points → again(0) / hard(1) / good(2) / easy(3) — the same button
 *   mapping as choose mode.
 */
export function scoreSpellResult(
  answerVariants: string[],
  correctVariants: string[],
  totalMs: number,
): 'again' | 'hard' | 'good' | 'easy' {
  const best = bestScriptSimilarity(answerVariants, correctVariants);
  let points = best >= 0.9 ? 2 : best >= 0.7 ? 1 : 0;
  if (points === 2) {
    if (totalMs < SPELL_TEST_FAST_MS) points = 3;
    else if (totalMs > SPELL_TEST_TOTAL_MS) points = 1;
  }
  return (['again', 'hard', 'good', 'easy'] as const)[points]!;
}

/**
 * The muted first-character hint shown under the spell-mode input.
 *
 * - when the card's entry has a pronunciation (the L2 reading of the lemma),
 *   the hint is that reading's first character;
 * - otherwise it is the lemma's first character, but only when the lemma is
 *   longer than one character (a single-character lemma's first char IS the
 *   whole word and would give the answer away);
 * - returns null when no hint applies (no reading, single-character lemma).
 */
export function spellHintOf(
  word: SrsWordFormInfo | undefined,
  fallback: string,
  entry: {
    head?: string | null;
    pronunciation?: string;
    alternate?: string | null;
    phonetic_detail?: { kana?: string; pinyin?: string; romanization?: string; ipa?: string } | null;
  } | null | undefined,
  l2Code: string,
): string | null {
  const reading = pronunciationReadingOf(entry, l2Code);
  if (reading) return reading[0]!;
  const lemma = pronunciationTargetOf(word, fallback, entry);
  if (lemma.length > 1) return lemma[0]!;
  return null;
}

/**
 * The ground-truth reading of a word for a pronunciation question.
 *
 * For EDICT (Japanese) the `pronunciation` field is ROMAJI (e.g. "soru"), not
 * the kana reading the test needs — the reading lives in `alternate` / the
 * `phonetic_detail.kana`. For CEDICT (Chinese) `pronunciation` is the pinyin,
 * so we use that. For Japanese we never fall back to romaji: the test is
 * hiragana-only, so a romaji "correct answer" would be rejected and the whole
 * question would fail. A Japanese entry with no kana reading returns '' so the
 * caller skips the pronunciation test rather than generating a broken one.
 */
export function pronunciationReadingOf(entry: {
  alternate?: string | null;
  pronunciation?: string;
  phonetic_detail?: { kana?: string; pinyin?: string; romanization?: string; ipa?: string } | null;
} | null | undefined, l2Code: string): string {
  if (!entry) return '';
  const base = (l2Code.split('-')[0] ?? '').toLowerCase();
  if (base === 'ja') {
    const kana = entry.alternate ?? entry.phonetic_detail?.kana ?? '';
    return typeof kana === 'string' ? kana.trim() : '';
  }
  if (base === 'zh' || base === 'yue') {
    const pinyin = entry.phonetic_detail?.pinyin ?? entry.pronunciation ?? '';
    if (pinyin) return pinyin.trim();
  }
  return (entry.pronunciation ?? '').trim();
}

/**
 * True when a pronunciation confounder is an "obvious wrong": it contains the
 * correct reading as a substring with extra characters (e.g. つきものぬ or
 * つきものだ from つきもの) or is a truncated fragment of it (e.g. もの or
 * つきも). A learner can dismiss these instantly, so they make the test
 * useless. Duplicates are already filtered before this runs.
 */
export function isObviousPronunciationWrong(choice: string, correctAnswer: string): boolean {
  const a = normalizeTestChoice(choice);
  const b = normalizeTestChoice(correctAnswer);
  if (!a || !b || a === b) return false;
  return (a.includes(b) && a.length > b.length) || (b.includes(a) && b.length > a.length);
}

/**
 * Validate a generated pronunciation question against the obvious-wrong rule.
 * Returns a human-readable reason when invalid, null when OK.
 */
export function validateSrsPronunciationChoices(question: {
  correctAnswer: string;
  choices: string[];
}): string | null {
  for (const choice of question.choices) {
    if (choice === question.correctAnswer) continue;
    if (isObviousPronunciationWrong(choice, question.correctAnswer)) {
      return `confounder "${choice}" is an obvious wrong — it extends or truncates the correct reading "${question.correctAnswer}"`;
    }
  }
  return null;
}

/**
 * Validate a generated definition question against the answer-length leak
 * (SPEC-066 test mode). The LLM tends to return the correct answer as the
 * longest, most precisely-worded option, so a learner can pick the correct
 * answer by length alone. This is a conservative safety net on top of the
 * prompt's length-mixing directive: it rejects only the egregious case where
 * the correct answer is the *unique* longest option and is at least 1.5× the
 * length of the next-longest option — a very strong length cue. Legitimate
 * length variation passes. Returns a human-readable reason when invalid.
 */
export function validateSrsDefinitionChoices(question: {
  correctAnswer: string;
  choices: string[];
}): string | null {
  const correctLen = question.correctAnswer.trim().length;
  const lengths = question.choices.map((c) => c.trim().length);
  const sortedDesc = [...lengths].sort((a, b) => b - a);
  const max = sortedDesc[0] ?? 0;
  const isUniqueLongest = lengths.filter((l) => l === max).length === 1 && correctLen === max;
  const secondLongest = sortedDesc[1] ?? 0;
  if (isUniqueLongest && max >= 1.5 * secondLongest) {
    return `correct answer is the clearly longest option (${correctLen} chars vs next-longest ${secondLongest}) — answer length predicts it`;
  }
  return null;
}

/**
 * Localized prompt wording for the pronunciation question. The app composes the
 * question text deterministically (always the headword's reading) so the LLM is
 * never asked to phrase it — it only supplies distractors. Fallback is English.
 */
const PRONUNCIATION_QUESTION_I18N: Record<string, string> = {
  en: 'How is "{word}" pronounced?',
  // Keyed on the BASE L1 code (e.g. "zh"), matching `baseCode()` — the review
  // pages pass `baseCode(l1.code)` as the l1Code, so "zh-Hans"/"zh-Hant" both
  // arrive as "zh". Keep the full-script keys too as a safety net.
  zh: '「{word}」怎么读？',
  'zh-Hans': '「{word}」怎么读？',
  'zh-Hant': '「{word}」怎麼讀？',
  ja: '「{word}」はどう読みますか？',
  ko: '"{word}"은(는) 어떻게 읽나요?',
  es: '¿Cómo se pronuncia "{word}"?',
  fr: 'Comment prononce-t-on « {word} » ?',
  de: 'Wie wird "{word}" ausgesprochen?',
  it: 'Come si pronuncia "{word}"?',
  pt: 'Como se pronuncia "{word}"?',
  ru: 'Как произносится «{word}»?',
  ar: 'كيف تُنطق «{word}»؟',
  th: 'ออกเสียง "{word}" อย่างไร?',
  vi: 'Từ "{word}" phát âm thế nào?',
  id: 'Bagaimana cara membaca "{word}"?',
  nl: 'Hoe wordt "{word}" uitgesproken?',
  pl: 'Jak wymawia się "{word}"?',
  tr: '"{word}" nasıl okunur?',
};

/**
 * Deterministic, app-owned question text for a pronunciation test — always
 * probes the headword's reading, never a compound's components or the surface
 * form. This is what keeps the question predictable and on-spec.
 */
export function buildPronunciationQuestionText(word: string, l1Code: string): string {
  const base = (l1Code.split('-')[0] ?? '').toLowerCase();
  const template =
    PRONUNCIATION_QUESTION_I18N[l1Code]
    ?? PRONUNCIATION_QUESTION_I18N[base]
    ?? PRONUNCIATION_QUESTION_I18N.en
    ?? 'How is "{word}" pronounced?';
  return template.replace('{word}', word);
}

/**
 * Build the model instruction for a contextual question. The model must return
 * strict JSON so both clients can render the same question and randomize only
 * the answer order locally.
 *
 * Kept intentionally terse and language-specific: the opening names the L2 and
 * the answer notation is chosen from the L2 (hiragana for Japanese, pinyin for
 * Chinese), so a Japanese prompt never mentions Chinese rules and vice versa.
 * Each client-side rejection (bad JSON, wrong kind, blank question, non-hiragana,
 * duplicate choices, substring "obvious wrongs", derived forms) is prevented by
 * one short directive instead of defensive paragraphs.
 */
export function buildSrsQuestionPrompt(input: {
  word: string;
  contextSentence?: string;
  l1Code: string;
  l2Code: string;
  kind: TestQuestionKind;
  definition?: string;
  pronunciation?: string;
}): string {
  const context = input.contextSentence?.trim() || '(No context available.)';
  const baseL2 = (input.l2Code.split('-')[0] ?? '').toLowerCase();
  const langName = languageNameFromCode(baseL2);

  if (input.kind === 'definition') {
    return [
      `Write a multiple-choice quiz that tests the meaning of a ${langName} phrase.`,
      'Ask what the target word means in THIS sentence.',
      `correct_answer + 3 confounders: concise ${input.l1Code} definitions; all 4 distinct.`,
      'Confounders: plausible but clearly wrong for this sentence — never synonyms or other acceptable glosses.',
      // SPEC-066: answer length must never predict the answer. The model tends
      // to make the correct answer the longest, most precisely-worded option,
      // so the learner can cheat by picking the longest. Force every option to
      // be comparable in length and precision.
      'Length-mix the options: make each option comparable in length and precision — no single option may be noticeably longer, shorter, or more precisely worded than the rest, so answer length cannot reveal the correct one.',
      `Word: ${input.word}`,
      `Context: ${context}`,
      input.definition ? `Ground truth: ${input.definition}` : '',
      `Output valid JSON only, no markdown: {"kind":"definition","question":"<in ${input.l1Code}>","correct_answer":"...","confounders":["...","...","..."]}`,
    ].filter(Boolean).join('\n');
  }

  // Pronunciation — the answer notation is language-specific. When the app has
  // a ground-truth kana reading it is anchored to the LEMMA headword and the
  // model returns ONLY distractor readings (so the correct answer is never the
  // model's guess — homographs like 反る = そる vs かえる). When NO kana reading
  // is available (e.g. an LLM entry carrying only romaji), the model generates
  // BOTH the correct_answer and the confounders, still anchored to the lemma.
  // The question text is always composed by the app via
  // buildPronunciationQuestionText().
  const notation = baseL2 === 'ja'
    ? 'hiragana only (katakana→hiragana); no romaji/kanji'
    : baseL2 === 'zh' || baseL2 === 'yue'
      ? 'pinyin with tone marks; no Chinese characters'
      : `the standard ${input.l2Code} script`;
  const extraRule = baseL2 === 'ja'
    ? ' For mixed kana+kanji words, keep the written kana identical in every choice and vary only the kanji reading.'
    : '';
  const hasGroundTruth = Boolean(input.pronunciation);
  const answerInstruction = hasGroundTruth
    ? 'The correct_answer is given. Generate ONLY 3 confounder (wrong) readings — do NOT write a question, do NOT repeat the correct_answer.'
    : `correct_answer + 3 confounders: ${notation}; all 4 distinct.`;
  const countRule = hasGroundTruth
    ? `3 confounders: ${notation}; exactly 3 distinct, none equal to the correct_answer.`
    : `4 choices total: ${notation}; all distinct.`;
  const confounderRule = 'Confounders: plausible wrong readings or near-misses — never a valid reading of the target, never containing (or contained by) the correct_answer, and never derived/inflected forms of it.' + extraRule;
  const outputShape = hasGroundTruth
    ? `Output valid JSON only, no markdown: {"kind":"pronunciation","confounders":["...","...","..."]}`
    : `Output valid JSON only, no markdown: {"kind":"pronunciation","correct_answer":"...","confounders":["...","...","..."]}`;

  return [
    `Write a multiple-choice quiz that tests the pronunciation of the ${langName} headword "${input.word}" — the lemma, never the surface form or a sub-component of a compound.`,
    answerInstruction,
    countRule,
    confounderRule,
    `Word (lemma): ${input.word}`,
    `Context: ${context}`,
    hasGroundTruth ? `correct_answer (the headword's reading): ${input.pronunciation}` : '',
    outputShape,
  ].filter(Boolean).join('\n');
}
