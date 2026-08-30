/**
 * Shared LLM prompt builders for web + mobile (no divergence).
 *
 * The `prompt.*` template strings are centralized as i18n keys (shared
 * `translations.csv` → `packages/shared/locales/*`); the only thing that used
 * to diverge between the two apps was the *assembly* code around them. These
 * builders own that assembly so web and mobile produce identical prompts.
 *
 * Builders take the raw (un-substituted) template strings — call
 * `t('prompt.explain_word')` WITHOUT `values` to get the raw `{placeholder}`
 * text — plus the params, and return the fully-assembled prompt.
 */

/** Replace `{name}` placeholders with their values. */
function fillTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

/** Languages whose non-inflecting nature is stated to the model. */
const NON_INFLECTING_L2 = new Set(['zh', 'vi', 'th', 'lo', 'km']);

/** Base L2 code (e.g. 'zh' from 'zh-Hans'), lowercased. */
function baseL2Code(l2Code: string): string {
  return (l2Code.split('-')[0] ?? '').toLowerCase();
}

export interface WordExplainPromptInput {
  /** Raw template strings (call `t(key)` WITHOUT values). */
  templates: {
    /** `prompt.explain_word_context_form` */
    contextForm: string;
    /** `prompt.explain_word_context` */
    context: string;
    /** `prompt.explain_word` */
    plain: string;
    /** `prompt.explain_morphology` */
    morphology: string;
    /** `prompt.explain_ticks` */
    ticks: string;
  };
  /** L2 name in the L1 language (e.g. "Japanese"). */
  l2Name: string;
  /** The headword being explained. */
  word: string;
  /** Inflected form as it appears in the context (optional). */
  contextForm?: string;
  /** The context sentence (optional). */
  context?: string;
  /** L2 code, used only for the morphology append decision. */
  l2Code: string;
}

/**
 * Assemble the "Let DeepSeek Explain" word prompt (SPEC-035). Behaves the same
 * on web + mobile: strip trailing punctuation from the context, pick the
 * context-form/context/plain template, append the morphology instruction for
 * non-inflecting L2s, and append the backtick-formatting instruction.
 */
export function buildWordExplainPrompt(input: WordExplainPromptInput): string {
  // Strip trailing punctuation from context to avoid doubled periods.
  const cleanContext = input.context?.trim().replace(/[.。！!？?…]+$/, '');
  const hasContextForm = !!cleanContext && !!input.contextForm && input.contextForm !== input.word;
  const values: Record<string, string> = {
    l2Name: input.l2Name,
    word: input.word,
    context: cleanContext ?? '',
    contextForm: hasContextForm ? (input.contextForm as string) : '',
  };

  let prompt: string;
  if (hasContextForm) {
    prompt = fillTemplate(input.templates.contextForm, values);
  } else if (cleanContext) {
    prompt = fillTemplate(input.templates.context, values);
  } else {
    prompt = fillTemplate(input.templates.plain, values);
  }

  // Morphology: mobile + chrome append it for non-inflecting L2s; web did not.
  // Unified here so all clients agree.
  if (input.templates.morphology && !NON_INFLECTING_L2.has(baseL2Code(input.l2Code))) {
    prompt += ' ' + input.templates.morphology;
  }

  const ticks = fillTemplate(input.templates.ticks, values);
  return `${prompt}\n\n${ticks}`;
}

export interface ExplainBlockPromptInput {
  /** Raw template strings (call `t(key)` WITHOUT values). */
  templates: {
    /** `prompt.explain_block_header` */
    header: string;
    /** `prompt.explain_block_item1` */
    item1: string;
    /** `prompt.explain_block_item2` */
    item2: string;
    /** `prompt.explain_ticks` */
    ticks: string;
    /** `prompt.explain_context_label` */
    contextLabel: string;
    /** `prompt.explain_text_label` */
    textLabel: string;
  };
  /** L2 code (used in the header). */
  l2Code: string;
  /** L1 name (used in item1). */
  l1Name: string;
  /** L2 name (used in the ticks instruction). */
  l2Name: string;
  /** Optional context sentence (shown under the Context label). */
  context?: string;
  /** The selected text being explained. */
  text: string;
}

/**
 * Assemble the reader "explain selected text" prompt. Includes the backtick
 * formatting item (item 3) so the AI output renders as interactive tokenized
 * text on both apps — previously web included it but mobile did not.
 */
export function buildExplainBlockPrompt(input: ExplainBlockPromptInput): string {
  const values: Record<string, string> = {
    l2Code: input.l2Code,
    l1Name: input.l1Name,
    l2Name: input.l2Name,
  };
  const header = fillTemplate(input.templates.header, values);
  const item1 = fillTemplate(input.templates.item1, values);
  const item2 = fillTemplate(input.templates.item2, values);
  const item3 = fillTemplate(input.templates.ticks, values);
  const textLabel = fillTemplate(input.templates.textLabel, values);

  const lines = [header, `1. ${item1}`, `2. ${item2}`, `3. ${item3}`];
  if (input.context) {
    lines.push('', `${fillTemplate(input.templates.contextLabel, values)}: ${input.context}`);
  }
  lines.push('', `${textLabel}: ${input.text}`);
  return lines.join('\n');
}
