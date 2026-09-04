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
  | { kind: 'prompt'; labelKey: string; promptKey: string }
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
