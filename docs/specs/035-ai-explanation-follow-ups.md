# AI Explanation Follow-ups

## Summary

The DeepSeek explanation card (dictionary popup and dictionary entry page) gets five follow-up buttons: **Inflection**, **Morphemes**, **Etymology**, **Syntax**, and **Synonyms**. Each streams a new explanation focused on that aspect of the looked-up word.

## Behavior

- Each assistant reply has icon-only regenerate and copy buttons beneath it. They stay visible while a reply is streaming but are disabled until it finishes.
- Follow-up buttons are styled as rounded boxes with a sharp bottom-right corner and stay pinned at the bottom of the card.
- Once a follow-up button is pressed, it disappears from the list for the rest of the conversation (each follow-up can be used once per transcript).
- The card renders as a chat transcript. The initial explanation appears as the first assistant bubble on the left.
- Clicking a follow-up appends a user chat bubble on the right (labelled with the button, e.g. "Inflection"), then streams the DeepSeek reply into a new assistant bubble below it.
- Regenerate re-runs that reply's prompt in place (cache bypassed); copy copies that reply's text.
- Follow-up prompts reuse the same backtick formatting instruction as the main prompt, so L2 words and examples stay tokenized and clickable.
- When there is a context sentence, it is included in the prompt; the dictionary entry page (no context) uses the generic variants.

## Prompts

- **Inflection** — explain what the lemma (dictionary form) is, how the word is inflecting in the given context (including the inflected form when known), and the meaning of the inflected form.
- **Morphemes** — explain whether the word can be broken down into semantic parts (morphemes), and note any literal interpretations of the word.
- **Etymology** — give the etymology of the word.
- **Syntax** — explain whether the word is functioning as a syntactic element in the given context, and explain what the syntactical structure is (e.g. sentence structure, part of a phrase, a certain grammatical phenomenon, etc).
- **Synonyms** — list synonyms of the word and, for each synonym: give the head word (dictionary form) and its pronunciation; contrast it with the word in meaning and in use; and give example sentences illustrating the difference. When a context sentence is available, the synonyms are listed *for the word as used in that sentence* (the word's sense there), so the contrasts are tailored to the actual usage the user is looking at.

## Sample prompts

Synonyms is the only follow-up that asks for several items per entry (head word, pronunciation, contrast, examples), so its prompts are the longest. Both variants end up followed by the shared backtick-formatting instruction (`prompt.explain_ticks`) appended in code.

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

## i18n

New keys:

- Labels: `action.inflection`, `action.morphemes`, `action.etymology`, `action.syntax`, `action.synonyms`
- Prompts: `prompt.followup_inflection`, `prompt.followup_inflection_context`, `prompt.followup_inflection_context_form`, `prompt.followup_morphemes`, `prompt.followup_morphemes_context`, `prompt.followup_etymology`, `prompt.followup_syntax`, `prompt.followup_syntax_context`, `prompt.followup_synonyms`, `prompt.followup_synonyms_context`

All keys are translated in all 18 locales via `translations.csv` (header order: en, zh-Hans, zh-Hant, ar, de, es, fr, id, it, ja, ko, nl, pl, pt, ru, th, tr, vi), then regenerated to `packages/shared/locales/*.json` with:

```bash
node scripts/add-translation-key.mjs payload.json   # one payload per key
node scripts/sync-translations.mjs csv-to-json
```

## Implementation plan

### 1. Translations

- Add `action.synonyms` (button label, e.g. "Synonyms"), `prompt.followup_synonyms`, and `prompt.followup_synonyms_context` to `translations.csv` via `scripts/add-translation-key.mjs` — one payload per key, all 18 locales, translations supplied from multilingual knowledge (no external translation APIs).
- Regenerate locale JSONs: `node scripts/sync-translations.mjs csv-to-json`.

### 2. Web — `apps/web/src/components/ai-explanation.tsx`

- Extend the union: `type FollowUpKind = 'inflection' | 'morphemes' | 'etymology' | 'syntax' | 'synonyms';`
- Append to `FOLLOW_UPS`: `{ kind: 'synonyms', labelKey: 'action.synonyms' }` (5th button).
- In `buildFollowUpPrompt`, add a `kind === 'synonyms'` branch (and make `syntax` an explicit branch):
  - with a clean context sentence → `t('prompt.followup_synonyms_context', { ...wordParams, context: cleanContext })`
  - otherwise → `t('prompt.followup_synonyms', wordParams)`
- No UI changes: the button row, used-once-per-transcript logic, regenerate/copy, and the appended `prompt.explain_ticks` suffix are all reused as-is.

### 3. Mobile — `apps/mobile/components/dictionary/AiExplanation.tsx`

- Identical changes to web: extend `FollowUpKind`, append the `FOLLOW_UPS` entry, add the synonyms branch to `buildFollowUpPrompt` (same context/non-context split), and update the header doc comment listing the follow-up kinds.

### 4. Docs

- Update `docs/specs/059-web-release-qa-checklist.md` AI Explain line to include synonyms.

### 5. Verification

- `npx turbo typecheck` from the repo root (safe with dev servers running). No production builds unless explicitly requested.
