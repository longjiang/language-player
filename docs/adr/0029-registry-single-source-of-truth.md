# ADR-0029 — LEMMATIZER_REGISTRY is the Single Source of Truth for Lemmatizer Selection

**Date**: 2026-08-08
**Status**: Accepted (supersedes [ADR-0018](0018-tokenizer-prefer-simplemma-over-spacy.md))

## Context

ADR-0018 adopted the Nuxt Classic app's tokenizer ordering (dedicated >
LemmatizationList > Simplemma > spaCy > fallback) as server policy. That
ordering is about server cost and production precedent — it is not a claim
about data quality.

The offline lemma-table export (SPEC-018 Phase 2a) was built independently:
it served LemmatizationList TSV files for any language with a file on disk
(24 languages), without consulting the online registry. Two independent
sources of truth guarantee drift. Concretely:

- `bg` routes to Simplemma online but got the LemmatizationList TSV offline
  (`народен→народя`, `му→негов`, missing `Той`/`запитат`).
- `ru` and `el` needed bespoke generated tables (pymorphy2 / Simplemma) to
  restore parity.
- The registry itself already deviated from ADR-0018's stated order
  (`bg` → Simplemma despite an on-disk TSV), so the ADR was not an accurate
  description of the system.

## Decision

`LEMMATIZER_REGISTRY` in `zerotohero-python-server/lemmatize_unified.py` is
the **single source of truth** for per-language lemmatizer selection — for
both online lemmatization and offline lemma-table export.

1. `/lemmatization/export` derives its data source from the registry engine:
   - `lemmatize_lemmatization_lists` → LemmatizationList TSV files
   - `lemmatize_simple` → Simplemma package dictionaries (on demand; Greek
     keeps its committed frequency-ordered table)
   - `lemmatize_russian` → generated pymorphy2 table
   - every other engine (jieba, MeCab, Okt, Qalsadi, Hazm, Zeyrek,
     pyidaungsu, spaCy) and languages absent from the registry → **no offline
     table** (404), so the local chain honestly falls back to
     snowball/surface.
2. `TOKENIZER_CONFIG.hasLemmaTable` (`packages/shared/src/constants.ts`)
   mirrors registry exportability: `cy`/`fa`/`gd`/`hr`/`tr` no longer claim a
   table; `hy`/`id`/`ms`/`tl` now do.
3. A drift test
   (`test_lemmatize_export.py::test_export_source_matches_registry_engine`)
   fails CI if any registry entry's export source does not match its module.
4. Stored lemma tables carry a version stamp (`LEMMA_TABLE_VERSION`); bumping
   it invalidates existing tables so changes reach installed devices.

### Overrides

The registry is authoritative unless there is a **specific reason to
override** — primarily mobile-platform availability:

| Server engine | Mobile override | Reason |
|---|---|---|
| MeCab | kuromoji | RN-portable pure-JS engine |
| Okt | kuromoji-ko | RN-portable pure-JS engine |
| jieba | dictionary max-matching | no RN jieba runtime |

These overrides are client-side only, documented in ARCH-018 / SPEC-018, and
do not change the server registry.

## Consequences

- Registry changes propagate to offline exports automatically; there is no
  second list to keep in sync.
- ADR-0018's preference order remains valid as server-cost guidance, but
  registry entries take precedence when they differ (e.g. `bg` → Simplemma
  despite an on-disk TSV).
- Adding a new language to the registry requires an export source or an
  explicit "no table" outcome; the drift test enforces it.
- TSV files for languages not routed to LemmatizationList (`bg`, `ast`, …)
  are no longer served by the export endpoint; the legacy `utils_nlp` video
  path still uses them.

## References

- [ADR-0018](0018-tokenizer-prefer-simplemma-over-spacy.md) (superseded)
- [ARCH-016](../arch/016-server-tokenization.md)
- [ARCH-018](../arch/018-local-tokenization-strategy.md)
- [SPEC-018](../specs/018-local-tokenization-mobile.md)
- `zerotohero-python-server/lemmatize_unified.py`
- `zerotohero-python-server/lemmatize_export.py`
