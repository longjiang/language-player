# AI Explanation Follow-ups

## Summary

The DeepSeek explanation card (dictionary popup and dictionary entry page) gets four follow-up buttons: **Inflection**, **Morphemes**, **Etymology**, and **Syntax**. Each streams a new explanation focused on that aspect of the looked-up word.

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

## i18n

New keys:

- Labels: `action.inflection`, `action.morphemes`, `action.etymology`, `action.syntax`
- Prompts: `prompt.followup_inflection`, `prompt.followup_inflection_context`, `prompt.followup_inflection_context_form`, `prompt.followup_morphemes`, `prompt.followup_morphemes_context`, `prompt.followup_etymology`, `prompt.followup_syntax`, `prompt.followup_syntax_context`

All keys are translated in all 31 locales via `translations.csv`.
