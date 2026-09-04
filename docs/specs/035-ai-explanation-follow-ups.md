# AI Explanation Follow-ups

## Summary

The DeepSeek explanation card (dictionary popup and dictionary entry page) is a
multi-turn chat: after the initial explanation it lets the user type **any**
follow-up message (a free-form text input) and offers a configurable set of
one-tap preset follow-up buttons — **Inflection**, **Morphemes**,
**Etymology**, **Syntax**, and **Synonyms** — plus the **Examples from Videos**
flow. Each preset streams a new explanation focused on that aspect of the
looked-up word.

## Behavior

- Each assistant reply has icon-only regenerate and copy buttons beneath it. They stay visible while a reply is streaming but are disabled until it finishes.
- Follow-up buttons are styled as rounded boxes with a sharp bottom-right corner and stay pinned at the bottom of the card.
- Once a follow-up button is pressed, it disappears from the list for the rest of the conversation (each follow-up can be used once per transcript).
- The card renders as a chat transcript. The initial explanation appears as the first assistant bubble on the left.
- Clicking a follow-up appends a user chat bubble on the right (labelled with the button, e.g. "Inflection"), then streams the DeepSeek reply into a new assistant bubble below it.
- **Free-form follow-up (multi-turn):** a text input at the bottom of the card lets the user type anything. Submitting appends a user bubble with the typed text and streams the reply. Follow-up turns (free-form and preset) send the prior conversation to the backend so the model keeps the word/context grounding; the initial explanation is a single-turn request.
- Regenerate re-runs that reply's prompt in place (cache bypassed); copy copies that reply's text.
- Preset prompts reuse the same backtick formatting instruction as the main prompt, so L2 words and examples stay tokenized and clickable.
- When there is a context sentence, it is included in the prompt; the dictionary entry page (no context) uses the generic variants.

### Configurable presets (`followUpPresets` prop)

Preset buttons are now a prop, not hardcoded. `AiExplanation` takes
`followUpPresets?: AiFollowUpPreset[]` (default `[]` — no preset buttons, only
the free-form chat). A preset is:

- `{ kind: 'prompt', labelKey, promptKey }` — a one-tap button that streams a
  prompt built from `promptKey` (resolved with `{ l1Name, l2Name, word,
  context, contextForm }` plus the shared backtick instruction).
- `{ kind: 'examples', labelKey }` — the "Examples from Videos" subs-search
  flow (a special, non-streaming fetch + LLM analysis).

`@langplayer/utils` exports `AiFollowUpPreset`, `DEFAULT_AI_FOLLOW_UPS` (the
dictionary preset set: the five word-aspect presets plus Examples from Videos),
and `presetKey()` (for used-once-per-transcript tracking). The dictionary popup
and detail tab pass `DEFAULT_AI_FOLLOW_UPS` to keep their historical buttons;
a future AI-chat surface can pass a different set or `[]`.

### Multi-turn endpoint

`POST /chatgpt/stream` now accepts `{ prompt, messages }` in addition to the
single-turn `{ prompt }`. `messages` is the prior conversation
(`[{ role, content }]`); the server streams `[...messages, { role: 'user',
content: prompt }]`. With no `messages` it keeps the single-turn path
(cache key `md5(prompt)`), so the initial explanation still hits existing
caches. The client hook `useStreamingExplanation` exposes this via
`stream(prompt, { messages })`.

## Prompts

- **Inflection** — explain what the lemma (dictionary form) is, how the word is inflecting in the given context (including the inflected form when known), and the meaning of the inflected form.
- **Morphemes** — explain whether the word can be broken down into semantic parts (morphemes), and note any literal interpretations of the word.
- **Etymology** — give the etymology of the word.
- **Syntax** — explain whether the word is functioning as a syntactic element in the given context, and explain what the syntactical structure is (e.g. sentence structure, part of a phrase, a certain grammatical phenomenon, etc).
- **Synonyms** — list synonyms of the word and, for each synonym: give the head word (dictionary form) and its pronunciation; contrast it with the word in meaning and in use; and give example sentences illustrating the difference. When a context sentence is available, the synonyms are listed *for the word as used in that sentence* (the word's sense there), so the contrasts are tailored to the actual usage the user is looking at.

## Sample prompts

Synonyms is the only follow-up that asks for several items per entry (head word, pronunciation, contrast, examples), so its prompts are the longest. Both variants end up followed by the shared backtick-formatting instruction (`prompt.explain_ticks`) appended in code.

**Shared assembly (2026-08-30):** the word-explain prompt for the dictionary
entry ("Let DeepSeek Explain") and the reader "explain selected text" prompt are
now assembled by shared builders in `@langplayer/utils` —
`buildWordExplainPrompt` and `buildExplainBlockPrompt` — consumed by both
`apps/web` and `apps/mobile`, so the two apps can never diverge again
(previously web/mobile each assembled the `prompt.*` templates in their own
code, and web vs mobile disagreed on the morphology instruction and the
explain-block backtick item). The `prompt.*` template strings remain centralized
i18n keys; the builders only own the assembly (context punctuation cleaning,
template selection, morphology/non-inflecting append for `zh/vi/th/lo/km`,
backtick instruction).

### Template — base (no context; dictionary entry page)

> Please list synonyms of the {l2Name} word "{word}". For each synonym, give the head word and its pronunciation, explain how it contrasts with "{word}" in meaning and in use, and provide example sentences illustrating the difference.

### Template — context variant (dictionary popup, sentence known)

> Please list synonyms of the {l2Name} word "{word}" in "{context}". For each synonym, give the head word and its pronunciation, explain how it contrasts with "{word}" in meaning and in use, and provide example sentences illustrating the difference.

### Fully resolved example (en, word = `run`, context = "She runs a company")

> Please list synonyms of the English word "run" in "She runs a company". For each synonym, give the head word and its pronunciation, explain how it contrasts with "run" in meaning and in use, and provide example sentences illustrating the difference.

Expected shape of the reply (markdown, with backticked L2 strings per `prompt.explain_ticks`):

```markdown
Here are synonyms of `run` as used in "She runs a company" (meaning: to manage, to be in charge of):

**`manage`** — /ˈmænɪdʒ/
- *Contrast*: `manage` emphasises running something smoothly and efficiently; `run` is more informal and broader (can also mean "operate" or "organise").
- *Example*: `She manages a team of twenty.`

**`lead`** — /liːd/
- *Contrast*: `lead` focuses on being in charge of people and direction; `run` is neutral about whether people are involved.
- *Example*: `He leads the marketing department.`
```

## Examples from Videos (AI usage-pattern grouping)

The **Examples from Videos** follow-up (`title.examples_from_videos`) is built on
the subs-search **Sort by AI** grouping (SPEC-081). Instead of a flat list of
picked examples, DeepSeek analyzes the subtitle-search hits and returns the
*single usage pattern* of the word — the one that best matches how the word is
used in the context sentence (when one is available), or the most
representative usage when the lookup has no context (dictionary entry page).

### Behavior

- The follow-up searches subtitles with `/subs-search` for every known form of
  the word (head + script variants + inflections; falls back to head +
  inflected surface form), up to `AI_EXAMPLES_LIMIT = 50` results.
- The first 50 results are serialized as a CSV payload (each video contributes
  the matched line ± 1 context line, matched line starred) and sent to
  `POST /chatgpt` together with the localized prose and — when present — the
  context sentence.
- The LLM replies with strict JSON:
  `{"heading": "<meaning in L1>", "pattern": "<syntax pattern in L2>", "examples": [{"video_id": <id>, "explanation": "<L1 text>"}]}`
  — one pattern, and up to `AI_EXAMPLES_MAX = 3` example results that follow it.
- The chat bubble renders a sort-by-AI-style pattern header (L1 heading on top,
  L2 syntax pattern beneath) followed by the example chips, each chip keeping
  its own per-result explanation of the word's usage in that video.
- Parsing (`parseAiExamplesResponse`) tolerates markdown fences, trailing
  garbage, and duplicate ids; a malformed reply (missing heading, no usable
  examples) shows the existing `msg.ai_examples_failed` error.

### Sample prompt task block (English, appended after the CSV payload)

> The {l2Name} word "{term}" is used in this sentence: "{context}". Identify
> the usage pattern of "{term}" in that sentence, then pick videos above whose
> matched lines follow that same pattern. Reply with ONLY strict JSON … with
> "heading" in {l1Name}, "pattern" in {l2Name}, and up to 3 "examples".

## i18n

New keys:

- Labels: `action.inflection`, `action.morphemes`, `action.etymology`, `action.syntax`, `action.synonyms`
- Prompts: `prompt.followup_inflection`, `prompt.followup_inflection_context`, `prompt.followup_inflection_context_form`, `prompt.followup_morphemes`, `prompt.followup_morphemes_context`, `prompt.followup_etymology`, `prompt.followup_syntax`, `prompt.followup_syntax_context`, `prompt.followup_synonyms`, `prompt.followup_synonyms_context`
- Free-form input: `placeholder.ask_follow_up` (input placeholder), `action.send` (send button label)

All keys are translated in all 18 locales via `translations.csv` (header order: en, zh-Hans, zh-Hant, ar, de, es, fr, id, it, ja, ko, nl, pl, pt, ru, th, tr, vi), then regenerated to `packages/shared/locales/*.json` with:

```bash
node scripts/add-translation-key.mjs payload.json   # one payload per key
node scripts/sync-translations.mjs csv-to-json
```

## Implementation plan

### 1. Translations

- Add `placeholder.ask_follow_up` and `action.send` to `translations.csv` via `scripts/add-translation-key.mjs` — one payload per key, all 18 locales, translations supplied from multilingual knowledge (no external translation APIs).
- Regenerate locale JSONs: `node scripts/sync-translations.mjs csv-to-json`.

### 2. Shared config — `@langplayer/utils`

- Add `AiFollowUpPreset` (discriminated union: `{ kind: 'prompt', labelKey, promptKey }` | `{ kind: 'examples', labelKey }`), `DEFAULT_AI_FOLLOW_UPS` (the dictionary preset set), and `presetKey()` in a shared module, exported from the utils index.

### 3. Backend — `/chatgpt/stream`

- Accept `{ prompt, messages }`; stream `[...messages, { role: 'user', content: prompt }]`. Keep the single-turn path (no `messages`) for the initial explanation (cache key `md5(prompt)`). Add `ask_stream_messages` / `ask_stream_messages_with_cache` to `app_chatgpt`.

### 4. api-client — `useStreamingExplanation`

- Extend `stream(prompt, options)` to forward an optional `messages` list to the endpoint.

### 5. Web — `apps/web/src/components/ai-explanation.tsx`

- Add the `followUpPresets` prop (default `[]`) and drive the preset buttons from it (replacing the hardcoded `FOLLOW_UPS`).
- Replace the per-kind `buildFollowUpPrompt` variant machinery with a single `buildPresetPrompt` that resolves `promptKey` with `{ l1Name, l2Name, word, context, contextForm }` + the ticks instruction (context is carried by the multi-turn history).
- Add a free-form text input + send button; send the typed message as a new user turn with `stream(text, { messages: buildHistory() })`, where `buildHistory()` reconstructs prior turns from each completed assistant reply's `.prompt`/`.text`.
- Update the dictionary popup and detail tab to pass `followUpPresets={DEFAULT_AI_FOLLOW_UPS}` (preserving their historical buttons) and to satisfy the new multi-turn behavior.

### 6. Mobile — `apps/mobile/components/dictionary/AiExplanation.tsx`

- Mirror the web changes: `followUpPresets` prop, `buildPresetPrompt`, `buildHistory`, a `TextInput` + send button, and update the dictionary popup/detail tab callers to pass `DEFAULT_AI_FOLLOW_UPS`.

### 7. Docs

- Update `docs/specs/059-web-release-qa-checklist.md` AI Explain line (include the free-form input + configurable presets).

### 8. Verification

- `npx turbo typecheck` from the repo root (safe with dev servers running). No production builds unless explicitly requested.
