/** Multiple-choice test scoring shared by web and mobile review screens. */
export type TestQuestionKind = 'definition' | 'pronunciation';

export interface SrsTestQuestion {
  kind: TestQuestionKind;
  prompt: string;
  choices: string[];
  correctAnswer: string;
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

export function needsPronunciationTest(l2Code: string): boolean {
  return DEEP_ORTHOGRAPHY_LANGUAGES.has((l2Code.split('-')[0] ?? '').toLowerCase());
}

/** Normalize an answer for duplicate-choice detection without changing display text. */
export function normalizeTestChoice(choice: string): string {
  return choice.trim().replace(/\\s+/g, ' ').toLocaleLowerCase();
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
      'correct_answer and every confounder must be pronunciation readings in the standard L2 notation (for Japanese, kana; for Chinese, pinyin or the appropriate standard romanization). Do not return definitions, translations, or explanations.',
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
    'Return JSON only with exactly these fields: question, correct_answer, confounders.',
    'question must be a natural question in L1. For definition questions, correct_answer must be one concise answer in L1; for pronunciation questions, correct_answer must be the standard L2 pronunciation only.',
    'confounders must contain exactly three plausible but incorrect answers of the same type and length as the correct answer.',
    'Every confounder must be distinct from the correct_answer and from every other confounder after trimming, collapsing whitespace, and ignoring letter case. Never repeat, paraphrase only by formatting, or include the correct answer among the confounders.',
    'Before returning JSON, verify that correct_answer plus the three confounders are four unique strings.',
    'Do not include answer labels, markdown, commentary, or the target word in the answer choices.',
  ].filter(Boolean).join('\n');
}
