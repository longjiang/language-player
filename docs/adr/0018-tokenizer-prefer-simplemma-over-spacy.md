# ADR-0018 — Tokenizer Selection: Prefer Simplemma/LemmatizationList Over spaCy

**Date**: 2026-07-26
**Status**: Accepted

## Context

The Python backend supports three general-purpose lemma tokenizers: **spaCy**, **Simplemma**, and **LemmatizationList**. spaCy provides the highest-quality lemmatization (full NLP pipeline with POS tagging, dependency parsing, and GPU acceleration), but at a significant performance cost. Simplemma is a lightweight dictionary-based lemmatizer. LemmatizationList uses pre-computed TSV lookup tables.

The Classic Nuxt app (`zerotohero-nuxt`) made an explicit decision years ago to avoid spaCy for most languages, commenting in `tokenizer-factory.js`:

> *"spaCy lemmatizer is generally very slow on the server and can lead to unrendered text. We avoid it if we can use SimplemmaTokenizer instead."*

Out of 19 languages that spaCy supports, the Nuxt app only uses spaCy for **one**: Spanish (`spa`). The other 18 are routed to Simplemma or LemmatizationList.

Additionally, the Nuxt app excludes three languages from Simplemma with documented reasons:

| Code | Language | Reason |
|---|---|---|
| `cym` | Welsh | Does not treat apostrophes correctly |
| `hin` | Hindi | Breaks too many words |
| `fra` | French | Not getting lemmas for verbs |

These exclusions cause French to fall through to LemmatizationList (which covers it), and Welsh/Hindi to fall through to spaCy or BaseTokenizer.

## Decision

We adopt the Nuxt Classic app's tokenizer ordering as our canonical preference. When multiple tokenizers are available for a language, the precedence is:

1. **Dedicated tokenizer** (jieba, MeCab, Okt, pymorphy2, Qalsadi, Hazm, Zeyrek, pyidaungsu) — always preferred
2. **LemmatizationList** — static lookup tables, zero runtime cost after loading
3. **Simplemma** — lightweight dictionary-based, covers 45+ languages
4. **spaCy** — full NLP pipeline, used only as a last resort
5. **BaseTokenizer** (regex split) — fallback when nothing else is available

**spaCy is treated as a fallback, not a primary tokenizer.**

### Simplemma Exclusions

The following languages are excluded from Simplemma and will fall through to the next available tokenizer in the chain:

| Code | Next Fallback | Notes |
|---|---|---|
| `cym` | LemmatizationList | Welsh apostrophe handling is broken in Simplemma |
| `hin` | spaCy or BaseTokenizer | Simplemma breaks too many Hindi words |
| `fra` | LemmatizationList | Simplemma fails to lemmatize French verbs |

### spaCy Is Still Available

spaCy models remain installed and loaded on the server. They are used when no higher-priority tokenizer is available for a language. This primarily affects **Croatian (`hrv`)** — the only language where spaCy is the sole available lemmatizer. If Croatian were ever added to Simplemma or LemmatizationList, spaCy would no longer be needed for it.

## Consequences

### Positive

- **Performance**: Avoiding spaCy's full NLP pipeline for 18 of 19 languages significantly reduces server CPU load and response latency. Simplemma and LemmatizationList are O(1) dictionary lookups vs. spaCy's multi-stage neural pipeline.
- **Consistency**: Server and client follow the same tokenizer rules. The Python server's `LEMMATIZER_REGISTRY` should eventually match Nuxt's `tokenizer-factory.js` dispatch order.
- **Simpler ops**: spaCy model packages are large (~10–50 MB each) and must be downloaded separately. Reducing spaCy usage simplifies deployment.

### Negative

- **Slightly lower lemma quality** for some languages. spaCy produces more accurate lemmas than Simplemma, especially for morphologically rich languages (Finnish, Polish, etc.). However, Nuxt has been running Simplemma in production for years without user complaints, so the practical quality difference is acceptable.
- **Croatian regression on Nuxt client**. Croatian has no Simplemma or LemmatizationList coverage, and Nuxt comments out spaCy for it. This means Croatian subtitle tokens have no lemmatization. This is a pre-existing issue dating to the original Nuxt tokenizer configuration, not introduced by this ADR.

## Status of Tokenizer Registry Alignment

Currently, the Python server's `LEMMATIZER_REGISTRY` (in `lemmatize_unified.py`) still routes spaCy languages directly to spaCy. The Nuxt client's `tokenizer-factory.js` routes them to Simplemma/LemmatizationList. This ADR codifies Nuxt's decision as correct, and the server registry should be updated to match (tracked separately).

## References

- `zerotohero-nuxt/static/js/tokenizers/tokenizer-factory.js` — Nuxt dispatch logic with spaCy avoidance comments
- `zerotohero-python-server/lemmatize_unified.py` — Python server dispatch (`LEMMATIZER_REGISTRY`)
- `docs/arch/016-server-tokenization.md` — Full server tokenization pipeline documentation
