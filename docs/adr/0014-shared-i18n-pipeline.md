# ADR-0014: Shared i18n Pipeline — Single Source of Truth

**Date**: 2026-07-23
**Status**: accepted
**Supersedes**: [ADR-0009](./0009-go-i18n-migration-react-intl.md) (implementation complete; this ADR documents the ongoing pipeline)
**See also**: [ADR-0010](./0010-port-web-to-mobile-fresh-start.md), [ADR-0011](./0011-shared-design-tokens.md)

## Context

ADR-0009 migrated the GO mobile app from `i18n-js` to `react-intl`, aligning both apps on ICU MessageFormat `{key}` syntax and a shared locale directory. Since then, we've discovered that the sync script (`sync-translations.mjs`) defaulted its output to `apps/web/messages/` — a directory that no app actually imports from. Both `apps/web` and `apps/mobile-v2` read from `packages/shared/locales/`. This ADR documents the corrected pipeline and the full workflow for managing translations.

## Single Source of Truth

```
translations.csv                    ← The one and only source
        │
        ▼
sync-translations.mjs csv-to-json   ← One command, no flags needed
        │
        ▼
packages/shared/locales/*.json      ← 31 nested locale JSONs
        │
   ┌────┴────┐
   ▼         ▼
apps/web   apps/mobile-v2           ← Both apps import from here
```

### Why a single CSV?

| Benefit | Detail |
|---|---|
| **No drift** | A string added in one app is immediately available in the other. Zero per-app translation copies. |
| **One edit surface** | Adding a new key touches one CSV row. The script regenerates all 31 locale JSONs. |
| **Flat diff** | CSV diffs in PRs are readable — one line per key, not nested JSON restructuring noise. |
| **Tooling** | Scripts for adding keys, finding dead keys, validating ICU syntax, batch translating, and document key resolution all operate on the CSV. |

## The Pipeline

### Output directory: `packages/shared/locales/`

The sync script writes nested locale JSONs to `packages/shared/locales/` by default. This is the single directory both apps import from:

| App | Library | Import mechanism |
|---|---|---|
| **Web** (`apps/web`) | `next-intl` (ICU MessageFormat) | `apps/web/src/i18n.ts` — `import from '../../../../packages/shared/locales/${locale}.json'` |
| **Mobile-v2** (`apps/mobile-v2`) | `react-intl` (ICU MessageFormat) | `IntlProvider.tsx` — static `import from '@langplayer/shared/locales/${locale}.json'` |
| **Legacy mobile** (`apps/mobile`) | `react-intl` | `load-messages.ts` — `require('../../../../packages/shared/locales/${locale}.json')` |

The deprecated `apps/web/messages/` directory is no longer used and should not be relied upon.

### JSON format: Nested

Both apps use nested JSON (`{ "action": { "cancel": "Cancel" } }`). `next-intl` resolves dot-paths natively. `react-intl` expects flat keys, so `mobile-v2` bridges this with a `resolveNested()` helper in its `useT()` hook (see ADR-0009 § Architecture).

### Commands

```bash
# CSV → 31 locale JSONs (writes to packages/shared/locales/ by default)
node scripts/sync-translations.mjs csv-to-json

# Override output directory (rarely needed)
node scripts/sync-translations.mjs csv-to-json --out some/other/dir

# 31 locale JSONs → CSV (reads from packages/shared/locales/ by default)
node scripts/sync-translations.mjs json-to-csv
```

### Adding a new translation key

Per `AGENTS.md` i18n workflow:

1. **Create a JSON payload file** with the key + English text + all 31 locale translations (all-or-nothing — the script rejects partial data):

```json
{
  "key": "msg.my_new_key",
  "en": "English text here",
  "zh-Hans": "...",
  "...": "all 31 locales required"
}
```

2. **Add the key to the CSV:**

```bash
node scripts/add-translation-key.mjs path/to/payload.json
```

3. **Regenerate locale JSONs:**

```bash
node scripts/sync-translations.mjs csv-to-json
```

4. **For docs** that use `{$key}` syntax, regenerate doc translations:

```bash
node scripts/translate-doc.mjs apps/web/content/docs/<path>.md
```

### Other scripts

| Script | Purpose |
|---|---|
| `add-translation-key.mjs` | Safely insert/update a single row in the CSV with all 31 locales |
| `sync-translations.mjs` | Bidirectional CSV ↔ JSON sync |
| `audit-translations.mjs` | Check CSV for missing/empty cells |
| `batch-translate.mjs` | Machine-translate empty cells for a specific locale (skips ICU) |
| `find-dead-keys.mjs` | Detect keys unused in both apps before deletion |
| `validate-icu.mjs` | Validate ICU MessageFormat syntax in all locale values |
| `translate-icu.mjs` | Reference for manual ICU plural translations |
| `translate-doc.mjs` | Resolve `{$key}` in doc markdown, machine-translate body |
| `resolve-doc-keys.mjs` | Resolve `{$key}` in doc markdown without translation |

## The `useT()` Hook

Both platforms expose an identical hook signature:

```tsx
const t = useT();
<p>{t('action.cancel')}</p>
<p>{t('msg.saved_count', { count: 5 })}</p>
```

| Platform | Implementation | Library |
|---|---|---|
| **Web** | `apps/web/src/hooks/use-t.ts` | Wraps `useTranslations()` from `next-intl` |
| **Mobile-v2** | `apps/mobile-v2/hooks/use-t.ts` | `resolveNested()` bridge over `useIntl()` from `react-intl` |

Components never know which i18n library is underneath. The hook handles:
- Dot-path resolution (`action.cancel` → nested object traversal)
- Simple `{key}` placeholder replacement (direct string substitution for non-ICU strings, avoiding `react-intl`'s flat-key validation)
- Complex ICU formatting (`{n, plural, ...}`, `{gender, select, ...}`) via `intl.formatMessage()`
- Fallback to the key name itself if the message is not found (fail-visible in dev)

## ICU MessageFormat

Both libraries support the ICU MessageFormat standard:

**Pluralization:**
```json
"msg.saved_count": "{count, plural, =0 {No words saved} one {# word saved} other {# words saved}}"
```

**Selection:**
```json
"msg.welcome": "{gender, select, male {Welcome back, sir} female {Welcome back, ma'am} other {Welcome back}}"
```

**Rich formatting:**
```json
"msg.progress": "You've watched {hours, number} hours — {pct, number, percent} of your goal"
```

ICU keywords (`one`, `other`, `plural`, `select`, `#`) must **never** be translated — they are part of the ICU syntax, not user-facing text.

## Key Naming Conventions

| Prefix | Category | Example |
|---|---|---|
| `action.*` | Button/action labels | `action.cancel`, `action.search` |
| `msg.*` | Informational/status messages | `msg.loading`, `msg.no_results` |
| `error.*` | Error messages | `error.general`, `error.login` |
| `title.*` | Page/section titles | `title.dictionary`, `title.settings` |
| `label.*` | Form/UI labels | `label.show_translation`, `label.email` |
| `nav.*` | Navigation items | `nav.media`, `nav.explore` |
| `lang.*` | Language names | `lang.zh`, `lang.ja` |
| `level.*` | Proficiency levels | `level.exam_cefr`, `level.exam_hsk` |

## Supported Locales (31)

`en`, `zh-Hans`, `zh-Hant`, `af`, `ar`, `ca`, `de`, `el`, `es`, `fi`, `fr`, `ga`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt`, `ro`, `ru`, `sr`, `sv`, `sw`, `th`, `tr`, `vi`

Priority order for discovery: `en`, `zh-Hans`, `zh-Hant`, then alphabetical.

## Consequences

- **Single output directory**: `sync-translations.mjs` now defaults to `packages/shared/locales/`. The old `apps/web/messages/` directory is vestigial. No `--out` flag needed for normal workflow.
- **All apps consume from one place**: Adding a translation key and running `csv-to-json` makes it available to web, mobile-v2, and legacy mobile simultaneously.
- **No per-app translation copies**: Eliminates the risk of one app having stale translations.
- **The pipeline is the documentation**: The scripts themselves are the source of truth for the workflow. This ADR captures the "why" and the architecture; the scripts capture the "how."
