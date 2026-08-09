# ADR-0030: Data-Driven Popular Target-Language (L2) List

**Date**: 2026-08-09
**Status**: accepted
**See also**: [ARCH-021](../arch/021-language-study-activity-analysis.md),
[ADR-0017](0017-unified-language-picker.md),
[ADR-0028](0028-consolidate-arb-into-ar.md)

## Context

Web and mobile show a "Popular" section at the top of the language picker. Until
now that list lived in a single hardcoded constant (`POPULAR_LANGUAGES` in
`packages/shared/src/language-data.ts`) that was passed to **both** the L1
(native language) and L2 (target language) columns of the picker.

[ARCH-021](../arch/021-language-study-activity-analysis.md) analyzed
`user_watch_history` (rolling 30 days, July 2026, annual, and all-time since
Oct 2023) and showed the L2 side of the list was stale:

- `pl` and `sv` had only 2 watch events each in the last 30 days.
- `pt` had zero recent events (988 all-time).
- `vi` (29 events), `ru` (28), `ar` (24), and `tr` (16) were ranked below
  languages with less recent activity.
- `yue` (Cantonese, 805 all-time / 14 recent) and `he` (833 all-time) were
  missing entirely.

The list also conflated two different concepts: `zh-Hans` / `zh-Hant` are
**L1** interface locales, while `zh` is the **L2** target-language code. The
usage data is exclusively L2, so a single shared list could not be reordered
for L2 without also changing the L1 column (and dropping `pl`/`sv` from the
popular L1 section, where they are legitimate common native languages).

## Decision

1. **Split the shared constant by column:**
   - `POPULAR_L1S` — L1 list, unchanged composition/order from the legacy list
     (minus `zh`, which is not a valid L1).
   - `POPULAR_L2S` — L2 list, ordered by observed study activity (ARCH-021):

     ```ts
     ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es',
      'vi', 'ru', 'ar', 'tr', 'it', 'hi', 'yue', 'th', 'id', 'nl', 'he', 'pt']
     ```

   - `POPULAR_LANGUAGES` is kept as a legacy union for backward compatibility.
2. **Extend `useLanguagePicker`** with `popularL1s` / `popularL2s` options that
   default to `popularLanguages`, so existing consumers keep working.
3. **Web and mobile pickers pass per-column lists** (`POPULAR_L1S` for L1,
   `POPULAR_L2S` for L2).
4. **Mobile offline-dictionaries screen** uses `POPULAR_L2S` (it is an
   L2-target screen).
5. **Remove the web duplicate** (`apps/web/src/lib/language-data.ts` no longer
   defines its own `POPULAR_LANGUAGES`; it imports from `@langplayer/shared`).

## Consequences

### Positive

- The L2 "Popular" section now reflects actual learner activity: Chinese,
  Japanese, English, Korean, French, and German first, with Vietnamese,
  Russian, Arabic, and Turkish promoted; Cantonese and Hebrew added; Polish
  and Swedish demoted out of the shortlist.
- The L1 column is untouched — `pl`/`sv` remain popular native-language
  options and `zh-Hans`/`zh-Hant` stay in place.
- One source of truth in `@langplayer/shared`; the web duplicate is gone.

### Trade-offs / Follow-ups

- The list is still static and will drift again. A future change should derive
  it from the analytics (a small endpoint or a quarterly-regenerated constant).
- `POPULAR_LANGUAGES` remains as a legacy alias; consumers should migrate to
  the per-column lists.
- The mobile offline-dictionaries screen still uses a local alias
  (`const POPULAR_LANGUAGES = POPULAR_L2S`) for minimal diff; it can be
  renamed to use `POPULAR_L2S` directly in a cleanup pass.
