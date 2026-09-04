/**
 * Configurable follow-up presets for the AI explanation chat.
 *
 * The "Let DeepSeek Explain" card (`AiExplanation`) renders a free-form chat
 * input plus an optional set of one-tap preset buttons. Presets are supplied
 * via a prop so different surfaces (dictionary popup, dictionary detail tab, a
 * future reader/AI-chat) can preload their own buttons. With no presets the
 * card shows only the free-form input (plus the initial auto/reveal
 * explanation of the word or phrase).
 *
 * A preset is either:
 * - `kind: 'prompt'` — a one-tap button that streams a prompt built from
 *   `promptKey` (resolved with `{ l1Name, l2Name, word, context, contextForm }`
 *   plus the shared backtick instruction).
 * - `kind: 'examples'` — the "Examples from Videos" subs-search flow (a
 *   special, non-streaming fetch + LLM analysis).
 *
 * The two apps share this config so web and mobile present identical presets.
 */

export type AiFollowUpPreset =
  | { kind: 'prompt'; labelKey: string; promptKey: string; contentKey?: keyof ReaderAiContent }
  | { kind: 'examples'; labelKey: string };

/** The preset set historically shown in the dictionary popup and detail tab. */
export const DEFAULT_AI_FOLLOW_UPS: AiFollowUpPreset[] = [
  { kind: 'prompt', labelKey: 'action.inflection', promptKey: 'prompt.followup_inflection' },
  { kind: 'prompt', labelKey: 'action.morphemes', promptKey: 'prompt.followup_morphemes' },
  { kind: 'prompt', labelKey: 'action.etymology', promptKey: 'prompt.followup_etymology' },
  { kind: 'prompt', labelKey: 'action.syntax', promptKey: 'prompt.followup_syntax' },
  { kind: 'prompt', labelKey: 'action.synonyms', promptKey: 'prompt.followup_synonyms' },
  { kind: 'examples', labelKey: 'title.examples_from_videos' },
];

/** Stable identity for a preset — used to track "used once per transcript". */
export function presetKey(preset: AiFollowUpPreset): string {
  return preset.kind === 'prompt'
    ? `prompt:${preset.promptKey}`
    : `examples:${preset.labelKey}`;
}

// ── Reader "Ask AI" summary presets ─────────────────────────────────────────
// The reader toolbar "Ask AI" chat auto-summarizes the current page on open and
// preloads summary follow-up buttons scoped to the reading surface. Each preset
// injects a named block of the reader's content (via `contentKey`) into the
// shared `prompt.summarize` template.

/** Named content blocks a reader can hand to the Ask-AI chat. */
export interface ReaderAiContent {
  /** The full currently-loaded text (notes / web / image readers). */
  text: string;
  /** The current visible page's text (all readers). */
  page: string;
  /** The current chapter's text (EPUB readers only). */
  chapter: string | null;
  /** Chapters 1..current concatenated (EPUB readers only). */
  bookUpToChapter: string | null;
}

/** Preset set for the notes / web / image readers. */
export const READER_ASK_AI_TEXT_PRESETS: AiFollowUpPreset[] = [
  { kind: 'prompt', labelKey: 'action.summarize_this_text', promptKey: 'prompt.summarize', contentKey: 'text' },
  { kind: 'prompt', labelKey: 'action.summarize_this_page', promptKey: 'prompt.summarize', contentKey: 'page' },
];

/** Preset set for the EPUB reader. */
export const READER_ASK_AI_EPUB_PRESETS: AiFollowUpPreset[] = [
  { kind: 'prompt', labelKey: 'action.summarize_this_page', promptKey: 'prompt.summarize', contentKey: 'page' },
  { kind: 'prompt', labelKey: 'action.summarize_this_chapter', promptKey: 'prompt.summarize', contentKey: 'chapter' },
  { kind: 'prompt', labelKey: 'action.summarize_book_up_to_chapter', promptKey: 'prompt.summarize', contentKey: 'bookUpToChapter' },
];

/** Auto-triggered on open: summarize the current page. */
export const READER_ASK_AI_INITIAL_PRESET: AiFollowUpPreset & { kind: 'prompt' } = {
  kind: 'prompt',
  labelKey: 'action.summarize_this_page',
  promptKey: 'prompt.summarize',
  contentKey: 'page',
};

/** Cap on content sent to the model in one summary prompt (chars). */
export const READER_ASK_AI_CONTENT_MAX = 12000;

/** Truncate long reader content so a summary prompt stays within budget. */
export function truncateReaderAiContent(text: string | null | undefined): string {
  if (!text) return '';
  return text.length > READER_ASK_AI_CONTENT_MAX
    ? `${text.slice(0, READER_ASK_AI_CONTENT_MAX)}…`
    : text;
}
