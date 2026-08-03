# Phrase Extraction Endpoint

## Metadata
- **Spec ID**: SPEC-036
- **Feature**: Phrase extraction Flask endpoint (pronunciation + canonical forms)
- **Status**: in-progress
- **Created**: 2026-08-03
- **ROADMAP Phase**: Backend NLP

## Overview

The existing lemmatizers return token-level lemmas (e.g. `make`, `up`,
`mind`), which is not enough when the meaningful unit is a phrase or
collocation (e.g. "made up his mind" → "to make up one's mind"). This
endpoint asks the DeepSeek LLM to give the pronunciation of a snippet and
extract the canonical forms of its main words and phrases, returning a JSON
object.

## Behavior

- `GET /extract-phrases?text=made%20up%20his%20mind&lang=en`
- `POST /extract-phrases` with `{ "text": "...", "lang": "en" }`
- `text` is required; missing it returns `400` with
  `{ "error": "Missing required field: text" }`.
- `lang` is optional. When omitted, the prompt simply has no language line
  (no `lang=` suffix is appended).
- Response: `{ "pronunciation": "meɪd ʌp hɪz maɪnd", "phrases": ["to make up one's mind"] }`
- The response is parsed as a JSON object (tolerating ``` fences and stray
  prose). If the object cannot be parsed, pronunciation is `null` and phrases
  fall back to line-based extraction.

## Prompt

The model receives exactly:

```text
You are a smart dictionary. We will give you a snippet of text in a given language code, and you will give the pronunciation of the text, then extract the canonical form of the main words or phrases. Return the result as json and nothing else. E.g. ("he's gotten used to lying (lang=en)" -> {"pronunciation": "hiz ˈɡɑt̬n̩ ˈjust tə ˈlaɪɪŋ", "phrases": ["to get used to doing", "to lie"]})

<text>
lang=<code>
```

When `lang` is not provided, the `lang=<code>` line is omitted.

## Implementation

- `zerotohero-python-server/app_phrasal_lemmatizer.py` — prompt builder,
  LLM call (via `app_chatgpt.ask_with_cache`), JSON parsing.
- `zerotohero-python-server/routes/text_routes.py` — `POST/GET
  /extract-phrases` route.

## Open Questions

- Whether web/mobile should surface phrase-level lemmas in the dictionary or
  transcript UI, and where the results should be cached on the client.

## Web Integration (SPEC-033)

The web text-selection dictionary popup calls this endpoint with the selected
text (`lang` = base L2 code), runs each returned canonical phrase through the
standard `/dictionary/lookup`, and renders a "Phrases" section of entry cards.
The LLM `pronunciation` is shown next to the popup header. See
[SPEC-033](033-selection-actions.md).
