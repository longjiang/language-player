# SPEC-063: UI Translation Locale Trim (31 → 18)

## Metadata

- **Spec ID**: SPEC-063
- **Feature**: Remove 13 low-usage UI locales across web, mobile, Chrome extension, and the shared i18n pipeline
- **Status**: draft
- **Created**: 2026-08-10
- **ROADMAP Phase**: Cross-cutting (i18n & product)
- **See also**:
  - [ADR-0033 — UI Translation Locale Support List](../adr/0033-ui-translation-locale-support.md)
  - [ARCH-023 — L1 / Interface Language Usage Analysis](../arch/023-l1-interface-language-analysis.md)
  - [ARCH-009 — Shared i18n Pipeline](../arch/009-shared-i18n-pipeline.md)
  - [ARCH-008 — Documentation i18n Pipeline](../arch/008-docs-i18n-pipeline.md)
  - [ADR-0030 — Data-Driven Popular Target-Language (L2) List](../adr/0030-popular-l2-list-usage-data.md)

---

## Overview

This spec implements ADR-0033: reduce the supported UI locale set from 31 to
18 by removing `af`, `ca`, `el`, `fi`, `ga`, `hi`, `hr`, `hu`, `no`, `ro`,
`sr`, `sv`, and `sw`.

The remaining 18 locales stay fully supported:

```
en, zh-Hans, zh-Hant, ar, de, es, fr, id, it,
ja, ko, nl, pl, pt, ru, th, tr, vi
```

No backend database migration is required. The change is limited to shared
locale constants, generated translation artifacts, app locale maps, and
fallback handling for users who previously saved one of the removed locales.

---

## Definitions

| Term | Meaning |
|---|---|
| `REMOVED_LOCALES` | `af`, `ca`, `el`, `fi`, `ga`, `hi`, `hr`, `hu`, `no`, `ro`, `sr`, `sv`, `sw` |
| `KEPT_LOCALES` | The 18 locales listed above |
| Deprecated L1 | A stored/URL locale that used to be supported but is now in `REMOVED_LOCALES` |

---

## Implementation Plan

### Phase 1 — Shared source of truth

#### 1.1 `packages/shared/src/constants.ts`

Remove the 13 removed locales from `SUPPORTED_L1S`:

```ts
export const SUPPORTED_L1S = [
  'en', 'zh-Hans', 'zh-Hant', 'ar', 'de', 'es', 'fr', 'id', 'it',
  'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'th', 'tr', 'vi',
] as const;
```

This automatically trims the language pickers in web and mobile, the web
middleware/i18n resolver, mobile's `LanguageContext`, and the Chrome
extension's bundled `SUPPORTED_L1S` via `popup-options.js`.

#### 1.2 `packages/shared/locales/`

Delete the 13 locale JSONs:

```text
packages/shared/locales/af.json
packages/shared/locales/ca.json
packages/shared/locales/el.json
packages/shared/locales/fi.json
packages/shared/locales/ga.json
packages/shared/locales/hi.json
packages/shared/locales/hr.json
packages/shared/locales/hu.json
packages/shared/locales/no.json
packages/shared/locales/ro.json
packages/shared/locales/sr.json
packages/shared/locales/sv.json
packages/shared/locales/sw.json
```

#### 1.3 `translations.csv`

Remove the 13 corresponding CSV columns. Recommended workflow:

```bash
# After deleting the locale JSONs, rewrite the CSV from the remaining 18 JSONs
node scripts/sync-translations.mjs json-to-csv

# Regenerate the 18 JSONs from the trimmed CSV and verify consistency
node scripts/sync-translations.mjs csv-to-json
```

Verify:

- `packages/shared/locales/` contains exactly 18 JSONs.
- `translations.csv` header is `key,en,zh-Hans,zh-Hant,ar,de,es,fr,id,it,ja,ko,nl,pl,pt,ru,th,tr,vi`.
- `node scripts/audit-translations.mjs` reports no structural issues.

#### 1.4 Pipeline docs/comments

- Update `docs/arch/009-shared-i18n-pipeline.md` "Supported Locales (31)" → 18.
- Update `docs/arch/008-docs-i18n-pipeline.md` references to 31 locales.
- Update comments in `scripts/add-translation-key.mjs`, `scripts/translate-doc.mjs`, `scripts/translate-docs.mjs`, and `scripts/resolve-doc-keys.mjs` from 31 to 18 (the scripts themselves derive locales from the CSV header and need no logic change).

### Phase 2 — Web (`apps/web`)

#### 2.1 Automatic picker/route behavior

No component changes are required for the language picker:
`apps/web/src/components/language-picker.tsx`, `apps/web/src/i18n.ts`,
`apps/web/src/providers/locale-provider.tsx`, and
`apps/web/src/lib/last-language-pair.ts` all consume `SUPPORTED_L1S`.

#### 2.2 Middleware fallback for deprecated L1 URLs and cookies

`apps/web/src/proxy.ts` currently rewrites any invalid `/[l1]/[l2]` pair to
`/_not-found`. Add a small deprecated-L1 redirect so old bookmarks and stale
cookies don't 404:

```ts
const DEPRECATED_L1_FALLBACK: Record<string, string> = {
  af: 'en', ca: 'en', el: 'en', fi: 'en', ga: 'en',
  hi: 'en', hr: 'en', hu: 'en', no: 'en', ro: 'en',
  sr: 'en', sv: 'en', sw: 'en',
};
```

Behavior:

- If `l1` is in `DEPRECATED_L1_FALLBACK` and `l2` is valid, return a
  `NextResponse.redirect` to `/${fallback}/${l2}${remainingPath}` (preserve
  query string). Set the `l1`/`l2`/`NEXT_LOCALE` cookies to the new values.
- If a stored `l1` cookie or `NEXT_LOCALE` cookie contains a removed locale,
  clear it or replace it with `en` instead of leaving it stale.
- Keep the existing `_not-found` rewrite for genuinely invalid pairs.

#### 2.3 Docs locale data

Delete the 13 docs translation JSONs:

```text
packages/docs/i18n/af.json
packages/docs/i18n/ca.json
packages/docs/i18n/el.json
packages/docs/i18n/fi.json
packages/docs/i18n/ga.json
packages/docs/i18n/hi.json
packages/docs/i18n/hr.json
packages/docs/i18n/hu.json
packages/docs/i18n/no.json
packages/docs/i18n/ro.json
packages/docs/i18n/sr.json
packages/docs/i18n/sv.json
packages/docs/i18n/sw.json
```

Then rebuild the mobile-embedded docs data:

```bash
node scripts/build-docs-data.cjs
```

Verify `packages/shared/src/docs.ts` has exactly 18 keys in
`DOCS_BY_LOCALE`.

### Phase 3 — Mobile (`apps/mobile`)

#### 3.1 Static locale map

`apps/mobile/contexts/IntlProvider.tsx` statically imports all 31 locales.
Remove:

- The 13 `import ... from '@langplayer/shared/locales/{code}.json'` statements.
- The 13 entries from the `localeMessages` object.
- Update the "31 supported locales" comment to 18.

#### 3.2 Intl plural polyfills

`apps/mobile/lib/intl-polyfills.ts` imports plural-rule locale data for every
supported locale. Remove the 13 imports:

```text
@formatjs/intl-pluralrules/locale-data/af
@formatjs/intl-pluralrules/locale-data/ca
@formatjs/intl-pluralrules/locale-data/el
@formatjs/intl-pluralrules/locale-data/fi
@formatjs/intl-pluralrules/locale-data/ga
@formatjs/intl-pluralrules/locale-data/hi
@formatjs/intl-pluralrules/locale-data/hr
@formatjs/intl-pluralrules/locale-data/hu
@formatjs/intl-pluralrules/locale-data/no
@formatjs/intl-pluralrules/locale-data/ro
@formatjs/intl-pluralrules/locale-data/sr
@formatjs/intl-pluralrules/locale-data/sv
@formatjs/intl-pluralrules/locale-data/sw
```

#### 3.3 Stored L1 migration

`apps/mobile/contexts/LanguageContext.tsx` already ignores stored L1 codes not
in `SUPPORTED_L1S`, but it still sets `hasStoredPair = true` when a deprecated
L1 is paired with a stored L2. Add a small migration:

- If `storedL1` is not in `SUPPORTED_L1S`, remove `L1_STORAGE_KEY` (or replace
  it with `en`), keep `l1Code` as `en`, and do not set `hasStoredPair` for the
  deprecated pair.
- If `storedL1` is valid, behavior is unchanged.

The language picker needs no change because it consumes `SUPPORTED_L1S`.

### Phase 4 — Chrome extension (`apps/chrome-extension`)

#### 4.1 `_locales/`

Delete the 13 locale directories:

```text
apps/chrome-extension/_locales/af
apps/chrome-extension/_locales/ca
apps/chrome-extension/_locales/el
apps/chrome-extension/_locales/fi
apps/chrome-extension/_locales/ga
apps/chrome-extension/_locales/hi
apps/chrome-extension/_locales/hr
apps/chrome-extension/_locales/hu
apps/chrome-extension/_locales/no
apps/chrome-extension/_locales/ro
apps/chrome-extension/_locales/sr
apps/chrome-extension/_locales/sv
apps/chrome-extension/_locales/sw
```

#### 4.2 `scripts/generate-locales.js`

- Remove the 13 entries from `CSV_TO_CHROME`.
- Remove the 13 locale keys from every `MANUAL[key]` translation map.
- Update comments from "all 31" to 18.

#### 4.3 `scripts/generate-lang-names.js`

Remove the 13 entries from `COLUMN_TO_CHROME`, then regenerate:

```bash
node apps/chrome-extension/scripts/generate-lang-names.js
```

#### 4.4 Runtime locale maps

- `apps/chrome-extension/src/i18n.js` — remove the 13 entries from
  `CSV_TO_CHROME`.
- `apps/chrome-extension/src/content-entry.js` — remove the 13 entries from
  `CSV_TO_CHROME_LOCALE` and the 13 codes from `UI_LANGUAGES`.

#### 4.5 Popup

`apps/chrome-extension/src/popup.js` uses the bundled `SUPPORTED_L1S` via
`popup-options.js` and its `POPULAR_L1` list already contains none of the
removed locales, so no functional change is required. Optionally clear a stale
`chrome.storage.local.l1Language` when it is no longer in `SUPPORTED_L1S`.

#### 4.6 Rebuild

```bash
node apps/chrome-extension/scripts/generate-locales.js
node apps/chrome-extension/scripts/generate-lang-names.js
node apps/chrome-extension/build.mjs
```

Then refresh the extension in `chrome://extensions` and verify the removed
languages no longer appear in the popup language picker.

### Phase 5 — Verification

Run from the repo root:

```bash
# 1. Translation pipeline sanity
node scripts/audit-translations.mjs
node scripts/sync-translations.mjs csv-to-json
node scripts/build-docs-data.cjs

# 2. Chrome extension artifacts
node apps/chrome-extension/scripts/generate-locales.js
node apps/chrome-extension/scripts/generate-lang-names.js
node apps/chrome-extension/build.mjs

# 3. Type checks (local binaries, never bare npx tsc from repo root)
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/mobile && ./node_modules/.bin/tsc --noEmit
```

Static checks:

```bash
# Removed locales must not appear in supported L1 lists or runtime maps
rg -n 'SUPPORTED_L1S|UI_LANGUAGES|CSV_TO_CHROME|localeMessages' packages/shared/src apps/mobile/contexts apps/chrome-extension/src
rg -n "['\"]af['\"]|['\"]ca['\"]|['\"]el['\"]|['\"]fi['\"]|['\"]ga['\"]|['\"]hi['\"]|['\"]hr['\"]|['\"]hu['\"]|['\"]no['\"]|['\"]ro['\"]|['\"]sr['\"]|['\"]sv['\"]|['\"]sw['\"]" apps/web/src apps/mobile/contexts apps/chrome-extension/src
```

Manual QA:

- Web: `/language-select` shows exactly 18 L1 options; `/af/zh/explore`
  redirects to `/en/zh/explore`; an old `l1=af` cookie falls back to English.
- Mobile: language picker shows 18 L1 options; a device with `lp_l1=af`
  launches in English and clears the stale key.
- Chrome extension: popup shows 18 L1 options; an existing saved `af` L1 is
  ignored and the extension renders in English.
- Docs: `/en/zh/docs`, `/ru/zh/docs`, and `/ar/zh/docs` render; removed
  locales are unreachable.

---

## Files Touched

| Area | Files |
|---|---|
| Shared constants | `packages/shared/src/constants.ts` |
| Shared locale data | `packages/shared/locales/{13 removed}.json` deleted |
| Translation source | `translations.csv` (13 columns removed) |
| Docs data | `packages/docs/i18n/{13 removed}.json` deleted; `packages/shared/src/docs.ts` regenerated |
| Web | `apps/web/src/proxy.ts` (deprecated-L1 redirect + cookie cleanup) |
| Mobile | `apps/mobile/contexts/IntlProvider.tsx`, `apps/mobile/lib/intl-polyfills.ts`, `apps/mobile/contexts/LanguageContext.tsx` |
| Chrome extension | `_locales/{13 removed}/`, `scripts/generate-locales.js`, `scripts/generate-lang-names.js`, `src/i18n.js`, `src/content-entry.js`, `dist/lang-names.json` regenerated |
| Docs | `docs/arch/008-docs-i18n-pipeline.md`, `docs/arch/009-shared-i18n-pipeline.md`, script comments |

---

## Rollout Notes

- The monorepo packages are workspace-linked, so the shared constant change
  propagates to web/mobile/extension at build time.
- Existing users with removed L1s fall back to English; no user data is lost.
- Old bookmarks with removed L1 paths are 301-redirected to English paths.
- The Chrome extension is versioned separately; existing installed versions
  keep their old `_locales` until the new version ships, which is safe because
  the extension still falls back to `chrome.i18n` defaults.
- Removed locale data remains recoverable from git history if a locale needs
  to be re-enabled.

---

## Open Questions

- Should any removed locale map to a "closest" language instead of English
  (e.g., `ca` → `es`)? Initial implementation uses English for all.
- Should `lang.*` language-name lookup tables
  (`apps/web/src/lib/language-names-i18n.ts`) be pruned of removed locale
  keys? They are not user-facing when the locale is unsupported, so this is
  optional cleanup.
