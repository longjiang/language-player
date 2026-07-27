# SPEC-022: Tokenizer Auto-Download UI

## Metadata
- **Spec ID**: SPEC-022
- **Feature**: Transparent auto-download of tokenizer/lemma packs as invisible sidecars to offline dictionary downloads
- **Status**: draft
- **Created**: 2026-07-27
- **See also**:
  - [SPEC-018: Mobile Local Tokenization & Lemmatization](../specs/018-local-tokenization-mobile.md) — the tokenization pipeline that consumes the downloaded packs
  - [SPEC-013: Mobile Offline Dictionary](../specs/013-mobile-offline-dictionary.md) — the dictionary download UX pattern this spec extends

---

## Overview

Tokenizers have **no dedicated UI**. They are downloaded automatically as a sidecar when the user downloads an offline dictionary (SPEC-013). The user only sees one download — the dictionary.

---

## What the User Sees

Nothing. The dictionary download UI is unchanged — the tokenizer is downloaded silently in the background as part of the same HTTP request or immediately after the dictionary asset completes. If the language has no downloadable tokenizer (Category E, or Phase 1 regex fallback), no download occurs.

---

## Tokenizer Lifecycle

| Event | Behavior |
|---|---|
| User downloads offline dictionary (SPEC-013) | Tokenizer/lemma pack downloads in parallel as an invisible sidecar |
| User deletes offline dictionary | Tokenizer is also deleted (no orphaned data) |
| Dictionary download fails | Tokenizer download is cancelled |
| Tokenizer download fails (but dict succeeds) | Dict works offline; tokenizer falls back to regex + surface-as-lemma |
| User switches to a new L2 with no dict | Phase 1 regex fallback applies (server remains primary) |

---

## Storage Accounting

Tokenizer storage is counted as part of the offline dictionary total in SPEC-013's storage summary. No separate line item.

---

## i18n Keys Required

**No new i18n keys.** The dictionary download row already uses `label.download_size` from SPEC-013. The combined "Dict X MB + Tokenizer Y MB" string is assembled programmatically from `TOKENIZER_CONFIG` in `packages/shared/src/constants.ts`.
