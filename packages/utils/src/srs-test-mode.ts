/** Multiple-choice test scoring shared by web and mobile review screens. */
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

/** Languages whose native orthography does not reliably reveal pronunciation. */
export const DEEP_ORTHOGRAPHY_LANGUAGES = new Set([
  'zh', 'yue', 'ja', 'ko', 'ar', 'fa', 'he', 'hi', 'th', 'my', 'km', 'lo', 'ta', 'te', 'ml', 'bn',
]);

export function needsPronunciationTest(l2Code: string, word?: string): boolean {
  const base = (l2Code.split('-')[0] ?? '').toLowerCase();
  if (!DEEP_ORTHOGRAPHY_LANGUAGES.has(base)) return false;
  // Japanese kana-only words already reveal their reading; pronunciation testing
  // is useful when kanji create an orthography-to-reading ambiguity.
  if (base === 'ja' && word && !/[\u3400-\u4dbf\u4e00-\u9fff]/u.test(word)) return false;
  return true;
}

/** Normalize an answer for duplicate-choice detection without changing display text. */
export function normalizeTestChoice(choice: string): string {
  return choice.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
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
 * Build the model instruction for a contextual question. The model must return
 * strict JSON so both clients can render the same question and randomize only
 * the answer order locally.
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
  const context = input.contextSentence?.trim() || '(No context sentence is available.)';
  const target = input.kind === 'definition' ? 'meaning/definition' : 'pronunciation/reading';
  const taskRules = input.kind === 'definition'
    ? [
      'This is the DEFINITION question. Ask what the target word means in this specific sentence.',
      'All five answer-related fields must be meanings/definitions in the learner UI language. Do not ask for or return pronunciation, transliteration, kana, romaji, pinyin, or readings.',
    ]
    : [
      'This is the PRONUNCIATION question. Ask how the target word is pronounced/read, using the context only to identify the intended word and sense.',
      'For Japanese, correct_answer and every confounder MUST each be written only in hiragana characters U+3040–U+309F, plus the long-vowel mark ー and spaces. Convert katakana readings to hiragana before returning them. Never use romaji, Latin letters, kanji, katakana, definitions, translations, or explanations in Japanese pronunciation choices. For Chinese, use pinyin or the appropriate standard romanization. Do not return definitions, translations, or explanations.',
      'MIXED KANA/KANJI WORDS: when the target word mixes kana and kanji (e.g. 憑き物), the parts written in kana (e.g. き) are fixed — every confounder MUST keep those written-kana parts identical to the correct reading. Vary ONLY the reading of the kanji part(s), using real or plausible readings of those same kanji characters (e.g. for 憑き物 = つきもの: つきぶつ, つきもつ, つきもち), or real words that share the same written-kana part. Never change, drop, or reorder the written-kana part.',
      'Never form a confounder by appending, prepending, or deleting characters from the correct reading (e.g. for the correct つきもの, never つきものぬ, つきものだ, or もの). No confounder may contain the correct reading as a substring, and the correct reading may not contain a confounder as a substring.',
    ];
  return [
    'Generate one multiple-choice question for a language-learning SRS review card.',
    `Test the ${target} of the target word in the context sentence.`,
    ...taskRules,
    `Target word: ${input.word}`,
    `Context sentence: ${context}`,
    `Learner UI language (L1): ${input.l1Code}`,
    `Learning language (L2): ${input.l2Code}`,
    input.definition ? `Known correct definition: ${input.definition}` : '',
    input.pronunciation ? `Known correct pronunciation: ${input.pronunciation}` : '',
    input.kind === 'definition'
      ? 'Make the question explicitly refer to the sentence above, for example: “What does this word mean in the text shown above?”'
      : 'Make the question explicitly ask for the target word’s pronunciation/reading, for example: “How is this word pronounced in the text shown above?”',
    `Return JSON only with exactly these fields: kind, question, correct_answer, confounders. Set kind to exactly "${input.kind}".`,
    'question must be a natural question in L1. For definition questions, correct_answer must be one concise answer in L1; for pronunciation questions, correct_answer must be the standard L2 pronunciation only.',
    'confounders must contain exactly three plausible but incorrect answers of the same type and length as the correct answer.',
    input.kind === 'definition'
      ? 'There must be exactly one defensible answer for this exact sentence. Confounders must be clearly incompatible with the sentence, not synonyms, near-synonyms, paraphrases, broader or narrower versions, translations that could also fit, or alternate acceptable glosses of the target word. Do not use two answers that a native speaker could reasonably accept.'
      : 'There must be exactly one valid pronunciation for the target word in this sentence. Confounders must be readings of other words or deliberate near-misses, never alternate valid readings of the target word.',
    'Before returning JSON, evaluate every choice against the context sentence. If a confounder could also answer the question reasonably, discard it and generate a different one.',
    'Every confounder must be distinct from the correct_answer and from every other confounder after trimming, collapsing whitespace, and ignoring letter case. Never repeat, paraphrase only by formatting, or include the correct answer among the confounders.',
    'Before returning JSON, verify that correct_answer plus the three confounders are four unique strings and that only correct_answer fits the context.',
    'Do not include answer labels, markdown, commentary, or the target word in the answer choices.',
  ].filter(Boolean).join('\n');
}
