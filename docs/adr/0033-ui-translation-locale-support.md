# ADR-0033: UI Translation Locale Support List

**Date**: 2026-08-10
**Status**: accepted
**See also**:
- [ARCH-023 — L1 / Interface Language Usage Analysis](../arch/023-l1-interface-language-analysis.md)
- [ARCH-021 — Language Study Activity Analysis](../arch/021-language-study-activity-analysis.md)
- [ADR-0030 — Data-Driven Popular Target-Language (L2) List](0030-popular-l2-list-usage-data.md)
- `packages/shared/src/constants.ts` — `SUPPORTED_L1S`

## Context

Language Player currently supports 31 UI locales in `SUPPORTED_L1S`:
`en`, `zh-Hans`, `zh-Hant`, `af`, `ar`, `ca`, `de`, `el`, `es`, `fi`, `fr`,
`ga`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt`,
`ro`, `ru`, `sr`, `sv`, `sw`, `th`, `tr`, `vi`.

Maintaining full translation + QA coverage for all 31 is expensive, and
several locales have negligible current usage. ARCH-023 collected the first
evidence-based picture of L1 usage from:

- `user_settings.settings_classic.l2Settings[l2].l1` — cumulative per-user
  L1 evidence (58,031 entries, 39,594 users).
- `user_watch_history` — event-attributed L1 activity (rolling 30 days,
  calendar July 2026, 2026 YTD, all-time).
- Google Analytics — URL page-path views per L1 and GA browser-language
  `totalUsers` (2026-08-03 → 2026-08-10).
- MailerLite — probed, but it stores no L1 data and was excluded.

## Evidence thresholds

The decision uses two primary activity metrics plus two reach signals:

- **Activity**: 2026 YTD watch events and distinct watch users attributed to
  each L1 via settings.
- **Reach**: GA browser-language `totalUsers` and cumulative settings users.
- **Core keep threshold**: at least 50 YTD watch events **and** at least 10
  YTD distinct watch users.

Chinese (`zh-Hans` / `zh-Hant`) is a special case: the underlying data only
records `zh`, so the two script variants cannot be ranked separately. Both
are kept unless the product owner decides otherwise.

## Decision

1. **Continue full support for 18 core UI locales:**

   ```
   en, zh-Hans, zh-Hant, ru, vi, es, ar, fr, de, pt, tr, id, it, ja, ko, th, pl, nl
   ```

   These account for nearly all attributable watch events, GA page views, and
   GA browser-language users.

2. **Remove (13):** `af`, `ca`, `el`, `fi`, `ga`, `hi`, `hr`, `hu`, `no`,
   `ro`, `sr`, `sv`, `sw`.

   This includes the five locales that were originally proposed as a
   watchlist (`el`, `ro`, `hu`, `sv`, `hi`). None clears the core keep
   threshold. `hi` has the strongest secondary signal (486 cumulative
   settings users) but only 3 YTD watch users and 0 GA browser-language
   users, so its reach is legacy rather than current. `sw` has 58 YTD watch
   events but from a single user, so it is not a translation audience.

3. **Fallback for removed locales:** users whose browser/UI language is no
   longer supported fall back to English (or the closest supported locale) in
   the language picker and UI strings.

4. **Revisit quarterly** using the ARCH-023 evidence pipeline; the exact cut
   must be confirmed by the product owner before locale files or translation
   keys are removed.

## Supporting data

Full per-locale metrics are in ARCH-023 → "Evidence Summary — Current UI
Locale Support". Key numbers:

| Verdict | Locales | YTD events / users range |
|---|---|---|
| Core | `en`, `zh-Hans`, `zh-Hant`, `ru`, `vi`, `es`, `ar`, `fr`, `de`, `pt`, `tr`, `id`, `it`, `ja`, `ko`, `th`, `pl`, `nl` | 51 / 12 up to 17,295 / 2,318 |
| Remove | `af`, `ca`, `el`, `fi`, `ga`, `hi`, `hr`, `hu`, `no`, `ro`, `sr`, `sv`, `sw` | 0 / 0 up to 58 / 1; `hi` has 486 legacy settings users |

## Consequences

### Positive

- Translation and QA effort concentrates on locales with real current usage.
- The UI locale list becomes evidence-driven instead of legacy-driven.
- The language picker gets shorter and easier to use for the majority of
  users.
- Removing the former watchlist avoids spending any effort on locales with
  small or legacy-only reach.

### Negative / Trade-offs

- Users in removed locales lose a native UI and fall back to English (or
  closest locale), which may increase friction or churn for those users.
- `hi` has meaningful legacy settings reach (486 users); removing it could
  affect dormant-but-large Hindi-speaking accounts if they return.
- The 2026 YTD and GA windows are snapshots; a quarterly revisit is required
  to avoid cutting a locale that rebounds.

## Alternatives considered

- **Keep all 31**: preserves reach but keeps the translation/QA burden that
  motivated this decision.
- **Keep 23 with a watchlist** (`el`, `ro`, `hu`, `sv`, `hi`): preserves
  translations for small but real locales; rejected because none of them
  approaches the core activity threshold and `hi` is mostly legacy reach.
- **Cut to 18 immediately (chosen)**: removes all 13 sub-threshold locales in
  one release and avoids maintaining a watchlist that still costs
  translation/QA surface area.

## Follow-ups

- After product confirmation, remove the deprecated locales from
  `SUPPORTED_L1S`, locale files, and translation-key generation.
- Persist L1 in `SettingsV2` / the row API so web/mobile users are covered by
  future analyses (currently only Classic settings store L1).
- Add an `l1` user-scoped custom dimension in GA or a BigQuery export so
  unique-user-per-L1 can be measured directly from app-selected L1.
- Re-run the ARCH-023 evidence query quarterly and update this ADR if the
  core/remove split changes.
