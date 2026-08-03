# Phrasal Lemmatization Endpoint

## Metadata
- **Spec ID**: SPEC-036
- **Feature**: Phrasal lemmatization Flask endpoint
- **Status**: in-progress
- **Created**: 2026-08-03
- **ROADMAP Phase**: Backend NLP

## Overview

The existing lemmatizers return token-level lemmas (e.g. `make`, `up`,
`mind`), which is not enough when the meaningful unit is a phrase or
collocation (e.g. "made up his mind" → "to make up one's mind"). This
endpoint asks the DeepSeek LLM to extract the canonical forms of the main
words and phrases from a snippet, returning them as an array.

## Behavior

- `GET /lemmatize-phrasal?text=made%20up%20his%20mind&lang=en`
- `POST /lemmatize-phrasal` with `{ "text": "...", "lang": "en" }`
- `text` is required; missing it returns `400` with
  `{ "error": "Missing required field: text" }`.
- `lang` is optional. When omitted, the prompt simply has no language line
  (no `lang=` suffix is appended).
- Response: `{ "phrases": ["to make up one's mind"] }`
- The response is parsed as a JSON array (tolerating ``` fences and stray
  prose), with a line-based fallback.

## Prompt

The model receives exactly:

```text
You are a smart dictionary. We will give you a snippet of text in a given language code, and you will extract the canonical form of the main words or phrases. Return the canonical words or phrases as an array and nothing else. E.g. ("he's gotten used to lying (lang=en)" -> ["to get used to doing", "to lie"])

<text>
lang=<code>
```

When `lang` is not provided, the `lang=<code>` line is omitted.

## Implementation

- `zerotohero-python-server/app_phrasal_lemmatizer.py` — prompt builder,
  LLM call (via `app_chatgpt.ask_with_cache`), array parsing.
- `zerotohero-python-server/routes/text_routes.py` — `POST/GET
  /lemmatize-phrasal` route.

## Open Questions

- Whether web/mobile should surface phrase-level lemmas in the dictionary or
  transcript UI, and where the results should be cached on the client.
