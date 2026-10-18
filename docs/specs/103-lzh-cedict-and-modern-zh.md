# SPEC-103: Literary Chinese (lzh) — CEDICT Definitions, HSK Levels, and Modern Chinese Translation

## Metadata
- **Spec ID**: SPEC-103
- **Feature**: Literary Chinese dictionary + L1=zh translation behavior
- **Status**: complete
- **Created**: 2026-10-18
- **ROADMAP Phase**: Cross-cutting — dictionary (Phase 4) + translation (Phase 4)
- **See also**:
  - [SPEC-006: Translation](./006-translation.md)
  - [SPEC-021: Unifying Translation Display](./021-unifying-translation-display.md)
  - [ARCH-004: Python Dictionary Database Schema](../arch/004-python-dictionary-db-schema.md)
  - [ARCH-007: Next.js Dictionary Architecture](../arch/007-nextjs-dictionary-architecture.md)
  - [ADR-0006: Consolidated Lexical Data Types](../adr/0006-consolidated-lexical-data-types.md)

---

## Overview

Literary Chinese (`lzh`, 文言文) is written in Han characters and read aloud
with modern Mandarin sound values. Before this spec it fell through the
dictionary catch-all to Wiktionary, so it had no curated CEDICT definitions,
no pinyin from CEDICT, and no HSK difficulty levels. Translating `lzh` into
Chinese (`l1 = zh`) could also produce classical-style Chinese, because the
prompt merely named the pair "Literary Chinese → Chinese".

This spec makes `lzh` a first-class CEDICT L2 for dictionary purposes while
keeping `lzh` as a distinct learning language (tokenization, content, and
language selection are unchanged). It also requires `lzh → zh` translations to
use **modern Standard Chinese** (现代汉语/白话文), not Classical Chinese.

---

## Dictionary Behavior

| Surface | Behavior for `lzh` |
|---|---|
| `POST /dictionary/lookup` | Queries the `cedict` table (same loader as `zh`) |
| `GET /dictionary/entry` | `dict=cedict` + CEDICT entry ID; returns CEDICT metadata |
| `GET /dictionary/download` | Exports the `cedict` table under `l2=lzh` |
| `GET /dictionary/download/languages` | Lists `lzh` with the CEDICT entry/frequency counts |
| Definition language | English reference definitions; translated to L1 via the existing localization path |
| Difficulty | CEDICT `level` column (`hsk_2025` / `hsk_2010`); frequency-derived CEFR when no HSK level exists |

### Client parity

- `primaryScale('lzh')` returns `hsk_2010` and `shouldShowLevel()` applies the
  Chinese rule (show only HSK scales), matching `zh`.
- Pinyin is displayed from the CEDICT `pronunciation` field; ruby/reading and
  simplified/traditional surface matching treat `lzh` like `zh`.
- Mobile offline downloads parse CEDICT's `alternate` (traditional) column for
  `lzh`, so traditional-script literary text can use the offline dictionary for
  segmentation and lookup.

### Cache invalidation

`_DICT_EXPORT_VERSION` was bumped to `6-lzh-cedict`. The export cache key
contains `l2` but not the selected table, so without the bump a previously
cached `lzh` Wiktionary export would keep being served.

---

## Translation Behavior (`l1 = zh`, `l2 = lzh`)

All translation surfaces — video subtitles, reader, text action menu, page
metadata, review context, and dictionary definitions — must render the target
text in **modern Standard Chinese**:

- Write modern Chinese vocabulary and grammar (现代汉语/白话文).
- Do **not** write Classical/Literary Chinese (文言文) or imitate the source's
  classical style.
- Convert classical particles and compressed syntax into their modern
  equivalents.
- Preserve all information; do not summarize or add commentary.
- Honor an explicit script subtag on `l1` (`zh-Hant` → Traditional,
  `zh-Hans` → Simplified). Without a subtag, keep the source's script.

Dictionary definition localization and the LLM dictionary fallback carry the
same rule, so a word's definitions are modern Chinese rather than a classical
gloss.

### Why this is not "same-language modernization"

`lzh` and `zh` are different base subtags, so `is_same_language()` is false.
The existing same-language modernization path is intentionally unchanged; the
lzh→zh pair gets its own prompt branch. It does share the larger output-token
budget, because classical compression expands when rendered as modern prose.

### Cache

The translation cache key for this pair includes a salt
(`lzh-to-modern-zh-v1`). Translations cached before the prompt change were
classical-style and must not be reused; other language pairs keep their
existing cache keys.

---

## Implementation

| Area | File |
|---|---|
| Loader selection + offline export | `zerotohero-python-server/utils_dictionary.py` |
| Lookup/download routes + definition prompts | `zerotohero-python-server/routes/dictionary.py` |
| Translation prompt + budget + cache salt | `zerotohero-python-server/app_translator_chatgpt.py` |
| Level scale + visibility | `packages/shared/src/levels.ts` |
| Pinyin/reading/script matching | `packages/utils/src/pronunciation.ts` |
| Mobile offline alternate parsing | `apps/mobile/lib/dictionary-download.ts` |

## Verification

- `zerotohero-python-server/test_dictionary.py` — `get_loader('lzh')` returns
  a `CedictLoader` and `愛` resolves to a CEDICT entry with HSK levels.
- `zerotohero-python-server/test_lzh_modern_zh.py` — prompt contains the
  modern-Chinese rules, the expanded budget is larger, and definition
  localization includes the rule.
- `packages/shared/src/levels.test.ts` — `lzh` uses HSK scales like `zh`.
- `packages/utils/src/pronunciation.test.ts` — pinyin/reading and
  simplified/traditional matching include `lzh`.

## Open Questions

- Should other Han varieties (e.g. `nan`, `hak`, `wuu`) eventually share
  CEDICT definitions? Not in this spec — only `lzh` was requested.
- CEDICT coverage for rare classical vocabulary is incomplete. Those words
  continue to use the existing LLM fallback, now with the modern-Chinese
  definition rule.
