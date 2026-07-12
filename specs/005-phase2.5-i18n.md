# SPEC-005: Phase 2.5 — UI Internationalization (i18n)

## Metadata
- **Spec ID**: SPEC-005
- **Feature**: Multi-language UI translation for the Next.js web app
- **Status**: complete
- **Created**: 2026-07-12
- **ROADMAP Phase**: Phase 2.5 — UI Internationalization

## Overview

Replace all hardcoded English strings in the Next.js app with `next-intl` translations, supporting 31 UI languages matching GO's `SUPPORTED_L1S`. This is infrastructure work — every future phase will add new strings that need translation.

## Why GO's Approach, Not Classic's

| | Classic (117 locales) | GO (31 locales) |
|---|---|---|
| **Structure** | Flat — 2,296 English-phrase keys | Nested — 26 categories, 621 semantic keys |
| **Example key** | `" & Other Videos": " & Other Videos"` | `"action.cancel": "Cancel"` |
| **Maintainability** | ❌ Unworkable — adding a string touches 117 files | ✅ Add to `en.json`, translate others later |
| **Assessment** | Legacy tech debt | Clean, typed, scalable |

**Decision**: Port GO's 31-locale set with its nested structure. Classic's 89 extra locales are too large and use the inferior flat format — they can be re-translated from GO's 621-key English template later if needed.

## Supported UI Languages (31)

These match GO's `SUPPORTED_L1S` and are the languages users can select as their native language:

| Code | Name | Code | Name | Code | Name |
|------|------|------|------|------|------|
| `af` | Afrikaans | `fr` | French | `pt` | Portuguese |
| `ar` | Arabic | `ga` | Irish | `ro` | Romanian |
| `ca` | Catalan | `hi` | Hindi | `ru` | Russian |
| `de` | German | `hr` | Croatian | `sr` | Serbian |
| `el` | Greek | `hu` | Hungarian | `sv` | Swedish |
| `en` | English | `id` | Indonesian | `sw` | Swahili |
| `es` | Spanish | `it` | Italian | `th` | Thai |
| `fi` | Finnish | `ja` | Japanese | `tr` | Turkish |
| `ko` | Korean | `nl` | Dutch | `vi` | Vietnamese |
| `no` | Norwegian | `pl` | Polish | `zh-Hans` | Chinese (Simplified) |
| | | | | `zh-Hant` | Chinese (Traditional) |

**Total**: 31 locales. Source language: English (621 keys).

**Not included**: GO's 2 unnamed files (`Unnamed: 32.json`, `Unnamed: 33.json`) — appear to be duplicates/corrupted. Classic's 89 extra locales use flat-key format and are excluded.

## Translation Key Structure

GO uses 26 top-level categories. Here are the main ones we'll use:

| Category | Sample Keys | Used In |
|----------|------------|---------|
| `action` | `cancel`, `clear`, `copy`, `confirm_deletion`, `email_support`, `keep_account` | Buttons, CTAs |
| `msg` | `already_have_account`, `choose_action`, `copy_success`, `contact_support` | Informational text |
| `title` | `account`, `app_settings`, `choose_language`, `choose_your_plan` | Page titles, headings |
| `error` | `cannot_open_url`, `generic`, `failed_fetch_videos`, `occurred` | Error messages |
| `button` | (various button labels) | Button text |
| `placeholder` | (input placeholders) | Form fields |
| `setting` | (preference labels) | Settings page |
| `lang` | (all language names) | Language picker, labels |
| `level` | (proficiency levels) | Difficulty badges |
| `duration` | `seconds`, `minutes`, `hours` | Time formatting |
| `email` | (email-related) | Auth flow |
| `filter` | (filter options) | Explore page |
| `sort` | (sort options) | Video listings |
| `subscription` | (plan names, features) | Pro/upgrade flow |
| `feature` | (feature names) | Landing page, tooltips |

## Implementation Plan

### Step 1: Configure next-intl

**`apps/web/src/i18n.ts`** — request-scoped config:
```ts
import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_L1S } from '@langplayer/shared';

export default getRequestConfig(async ({ locale }) => {
  // Validate locale
  const validLocale = SUPPORTED_L1S.includes(locale as any) ? locale : 'en';
  return {
    locale: validLocale,
    messages: (await import(`../messages/${validLocale}.json`)).default,
  };
});
```

**`apps/web/next.config.js`** — add plugin:
```js
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin();
module.exports = withNextIntl({...});
```

**`apps/web/src/middleware.ts`** — add locale from L1 cookie/URL:
```ts
// Current middleware sets l1/l2 cookies.
// next-intl reads locale from cookie: NEXT_LOCALE
// We set NEXT_LOCALE = l1 (fallback to 'en')
```

### Step 2: Copy Translation Files

```bash
cp language-player-3/assets/localizations/{en,zh-Hans,zh-Hant,ja,ko,...}.json apps/web/messages/
# Skip Unnamed: 32.json and Unnamed: 33.json
```

31 files → `apps/web/messages/*.json`

### Step 3: Create Typed Hook

**`apps/web/src/hooks/use-t.ts`**:
```ts
import { useTranslations } from 'next-intl';
// Type-safe wrapper — keys autocomplete from en.json
export function useT() {
  return useTranslations();
}
```

### Step 4: Update Root Layout

Add `NextIntlClientProvider` wrapping the app (similar to how `SessionProvider` wraps it).

### Step 5: Replace Hardcoded Strings

**Phase 1 files** (high-priority, visible every session):
| File | ~Strings |
|------|----------|
| `components/layout/header.tsx` | ~5 |
| `components/layout/language-switcher.tsx` | ~2 |
| `components/layout/user-menu.tsx` | ~4 |
| `app/login/page.tsx` | ~8 |
| `app/register/page.tsx` | ~12 |
| `app/forgot-password/page.tsx` | ~5 |
| `app/language-select/page.tsx` | ~6 |
| `app/[l1]/[l2]/page.tsx` (dashboard) | ~8 |

**Phase 2 files** (secondary):
| File | ~Strings |
|------|----------|
| `app/page.tsx` (landing) | ~10 |
| `app/[l1]/[l2]/explore/page.tsx` | ~6 |
| `components/video/subtitle-display.tsx` | ~4 |
| `components/video/video-meta.tsx` | ~2 |

**Total**: ~70 strings across 12 files.

### Step 6: Add Missing Keys

GO's 621 keys cover most of our needs. We may need to add ~10-15 new keys for strings that don't exist in GO (e.g., "Forgot password?", "Continue", "Load More"). These get added to `en.json` first — other locales get the English fallback until translated.

## Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/src/i18n.ts` | NEW | next-intl request config |
| `apps/web/messages/en.json` | NEW | Copy from GO (621 keys) |
| `apps/web/messages/{30 more}.json` | NEW | Copy from GO |
| `apps/web/src/hooks/use-t.ts` | NEW | Typed translation hook |
| `apps/web/src/middleware.ts` | MODIFY | Set NEXT_LOCALE cookie from L1 |
| `apps/web/next.config.js` | MODIFY | Add next-intl plugin |
| `apps/web/src/app/layout.tsx` | MODIFY | Add NextIntlClientProvider |
| 12 page/component files | MODIFY | Replace English strings with t() |

## Dependencies

- `next-intl` — already installed (v3.22.0)
- No new dependencies needed

## Risks & Mitigations

- **Risk**: `next-intl` plugin may conflict with Turborepo caching
  - **Mitigation**: Test with `npx turbo build` immediately after setup
- **Risk**: L1 cookie may not match a valid locale
  - **Mitigation**: Fallback to `en` in `i18n.ts` config
- **Risk**: Some GO keys may use different naming than our UI
  - **Mitigation**: Add new keys to `en.json` as needed; fallback to English for missing translations

## Verification

- [ ] `npx turbo build` passes
- [ ] English UI shows English text (no regressions)
- [ ] Switch L1 to Japanese → header/nav changes to Japanese
- [ ] Switch L1 to Spanish → auth forms show Spanish labels
- [ ] Unknown L1 falls back to English gracefully
