# ADR 0009: GO App i18n Migration — i18n-js → react-intl (ICU MessageFormat)

> **Status:** Phase 1 complete — `react-intl` installed & wired. Phases 2–4 pending.
> **Date:** 2026-07-21
> **Replaces:** `i18n-js` library in `language-player-3/contexts/LanguageContext.tsx`
> **See also:**
> - `translations.csv` — Monorepo source of truth for all locale strings
> - `scripts/sync-translations.mjs` — CSV → JSON pipeline
> - `apps/web/src/hooks/use-t.ts` — Next.js `useT()` hook wrapping `next-intl`
> - `docs/translation-keys-reference.md` — Translation key reference

---

## Context

The GO app currently uses `i18n-js` for internationalization (see `contexts/LanguageContext.tsx`). The Next.js web app uses `next-intl` (ICU MessageFormat). This creates a **syntax split** in the monorepo:

| | GO App | Next.js App |
|---|---|---|
| **Library** | `i18n-js` | `next-intl` |
| **Placeholder** | `{{key}}` or `%{key}` | `{key}` |
| **Standard** | Mustache-style (proprietary) | ICU MessageFormat |
| **Pluralization** | Not supported | `{n, plural, one {...} other {...}}` |
| **CSV source** | `lp3-trans-*.csv` (separate) | `translations.csv` (shared) |

This split has real costs:

1. **Two CSV sources of truth** — The GO app maintains its own `data/translations/lp3-trans-*.csv` files. When a new locale is added or a string is changed, both CSVs must be updated. This has already drifted for some keys.
2. **No pluralization** — `i18n-js` has no ICU plural support. Strings like `"{count} words saved"` must be handled with imperative code rather than a single ICU key.
3. **Non-standard syntax** — `{{ }}` is specific to `i18n-js`. Every other i18n library in the React ecosystem (`react-intl`, `next-intl`, `i18next`, `formatjs`) uses `{ }`.
4. **No shared translation pipeline** — The `scripts/sync-translations.mjs` CSV → JSON pipeline targets `next-intl`'s format. The GO app can't use it.

---

## Decision

**Replace `i18n-js` with `react-intl` (FormatJS) in the GO app.** This aligns both apps on ICU MessageFormat `{key}` syntax and allows the GO app to consume translations from the shared `translations.csv`.

### Why `react-intl` over alternatives

| Library | Pros | Cons |
|---|---|---|
| **react-intl** (FormatJS) | React Native support built in (v6+); full ICU; rich formatting (dates, numbers, plurals, select); mature ecosystem | Heavier bundle (~45 KB gzipped) |
| `i18next` | Popular; React Native support via `react-i18next` | ICU support requires plugin; different key format |
| `next-intl` | What web app uses | Next.js only; no React Native support |
| Keep `i18n-js` | No migration effort | No ICU; separate CSV; drift risk |

`react-intl` is the right choice because:
- It's maintained by the same team as `formatjs` (the ICU MessageFormat polyfill), ensuring correctness
- React Native support is built in (v6+)
- It supports all ICU features out of the box — no plugins, no config
- The bundle size is acceptable for a React Native app (~45 KB added vs. `i18n-js`'s ~5 KB, but eliminates the need for custom plural logic)

### What Changes

| Before (`i18n-js`) | After (`react-intl`) |
|---|---|
| `i18n.t('action.cancel')` | `intl.formatMessage({ id: 'action.cancel' })` |
| `i18n.t('msg.saved_count', { count: 5 })` with `{{count}}` | `intl.formatMessage({ id: 'msg.saved_count' }, { count: 5 })` with `{count}` |
| `i18n.locale = l1Lang.code` | `<IntlProvider locale={l1Lang.code}>` |
| `const { t } = useLanguage()` | `const intl = useIntl()` |
| Separate `lp3-trans-*.csv` → `assets/localizations/*.json` | Shared `translations.csv` → `assets/localizations/*.json` (built by `sync-translations.mjs`) |
| `{{name}}` placeholders | `{name}` placeholders |
| No plural, no select | Full ICU: `{n, plural, one {...} other {...}}`, `{gender, select, ...}` |

### ICU Features Unlocked

These are the capabilities the GO app gains that `i18n-js` can't do:

**Pluralization** (one key, all languages):
```json
"msg.saved_count": "{count, plural, =0 {No words saved} one {# word saved} other {# words saved}}"
```

**Gender/selection**:
```json
"msg.welcome": "{gender, select, male {Welcome back, sir} female {Welcome back, ma'am} other {Welcome back}}"
```

**Rich formatting** (numbers, dates):
```json
"msg.progress": "You've watched {hours, number} hours — {pct, number, percent} of your goal"
```

**Rich text messages** (React elements in translations):
```tsx
<FormattedMessage
  id="msg.contact_support"
  values={{
    link: (chunks) => <Link to="/support">{chunks}</Link>
  }}
/>
```

---

## Architecture

### Provider Setup

Replace the current `LanguageContext.tsx` approach with a standard `react-intl` setup:

```tsx
// contexts/IntlProvider.tsx
import React, { ReactNode, useMemo } from 'react';
import { IntlProvider } from 'react-intl';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadLocaleMessages } from '@/src/i18n/load-messages';

export const IntlProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { l1Lang } = useLanguage();
  const locale = l1Lang?.code ?? 'en';

  // Dynamically require the locale's messages
  const messages = useMemo(() => loadLocaleMessages(locale), [locale]);

  return (
    <IntlProvider locale={locale} messages={messages} defaultLocale="en">
      {children}
    </IntlProvider>
  );
};
```

```tsx
// src/i18n/load-messages.ts
export function loadLocaleMessages(locale: string): Record<string, string> {
  switch (locale) {
    case 'zh-Hans': return require('@/assets/localizations/zh-Hans.json');
    case 'zh-Hant': return require('@/assets/localizations/zh-Hant.json');
    case 'fr': return require('@/assets/localizations/fr.json');
    // ... all 31 locales
    default: return require('@/assets/localizations/en.json');
  }
}
```

### Usage in Components

```tsx
// Before (i18n-js)
const { t } = useLanguage();
<ThemedText>{t('action.cancel')}</ThemedText>

// After (react-intl)
import { useIntl, FormattedMessage } from 'react-intl';

const intl = useIntl();
// Simple string:
<ThemedText>{intl.formatMessage({ id: 'action.cancel' })}</ThemedText>
// With values:
<ThemedText>{intl.formatMessage({ id: 'msg.saved_count' }, { count: 5 })}</ThemedText>
// Declarative (preferred when no complex logic):
<FormattedMessage id="action.cancel" />
```

### Hook Wrapper (Optional)

To reduce migration friction, keep a familiar `useT()` hook signature:

```tsx
// hooks/use-t.ts
import { useIntl } from 'react-intl';

export function useT() {
  const intl = useIntl();
  return (id: string, values?: Record<string, any>) =>
    intl.formatMessage({ id }, values);
}
```

This makes the migration a mechanical find-and-replace:
- `t('key')` → `t('key')` (no change to call sites)
- Only the implementation (`useLanguage().t` → `useT()`) changes

---

## Migration Path

### Phase 1: Add `react-intl`, Keep `i18n-js` Running

1. Install `react-intl`:
   ```bash
   cd language-player-3 && npm install react-intl
   ```
2. Add `IntlProviderWrapper` around the app root (wraps existing `LanguageProvider`)
3. Create `hooks/use-t.ts` as a wrapper around `useIntl().formatMessage`
4. Verify both work side by side — `useT()` and `useLanguage().t` coexist

### Phase 2: Migrate Translation Source

1. Generate GO-compatible locale JSONs from the shared `translations.csv`:
   - The CSV already has 31 locale columns matching the GO app's locale list
   - `sync-translations.mjs` already produces `{key: value}` JSON — slightly adjust to produce flat format if needed
   - Or: add a `--format=flat` flag to `sync-translations.mjs` that outputs `{ "action.cancel": "Cancel", ... }` instead of `{ "action": { "cancel": "Cancel" } }`
2. Replace `assets/localizations/*.json` with the generated JSONs
3. Delete `data/translations/lp3-trans-*.csv` — no longer needed

### Phase 3: Mechanical Migration

1. Replace all `const { t } = useLanguage()` with `const t = useT()`
2. Replace `{{key}}` with `{key}` in all translation JSONs (the `sync-translations.mjs` output already uses `{key}`)
3. Convert imperative plural logic to ICU plural keys:
   - `t('msg.words', { count }) + (count === 1 ? ' word' : ' words')` → `t('msg.word_count', { count })` with ICU key
4. Remove `i18n-js` from `LanguageContext.tsx`

### Phase 4: Clean Up

1. Remove `i18n-js` dependency:
   ```bash
   cd language-player-3 && npm uninstall i18n-js
   ```
2. Remove `i18n` from `LanguageContext.tsx` — the context no longer needs to expose `t` or `i18n`
3. TypeScript: add type safety for translation keys (extract from CSV → generate `.d.ts`)

---

## Files to Touch

| Current File | Change |
|---|---|
| `contexts/LanguageContext.tsx` | Remove `I18n` instance; no longer expose `t` / `i18n` |
| `hooks/use-t.ts` | **New** — `useT()` wrapper around `useIntl()` |
| `src/i18n/load-messages.ts` | **New** — dynamic locale message loader |
| `App.tsx` (or root layout) | Wrap with `<IntlProviderWrapper>` |
| `assets/localizations/*.json` | Regenerate from `translations.csv` (flat format, `{key}` syntax) |
| `data/translations/lp3-trans-*.csv` | Delete — no longer needed |
| All components using `useLanguage().t` | Replace with `useT()` |
| All JSON keys with `{{key}}` | Replace with `{key}` (done automatically by CSV→JSON) |

---

## Consequences

### Positive
- **Single source of truth** — Both apps consume translations from `translations.csv`
- **ICU MessageFormat** — Pluralization, gender selection, number/date formatting out of the box
- **Ecosystem alignment** — `react-intl` is the standard for React i18n; community tooling, IDE plugins (i18n Ally), and linters work
- **Eliminates translation drift** — No more separate CSVs getting out of sync
- **Type-safe translations** — Can generate TypeScript types from the CSV for autocomplete on keys
- **Rich text messages** — `<FormattedMessage>` supports React elements in translations (links, bold, etc.)

### Negative
- **Bundle size increase** — `react-intl` adds ~45 KB gzipped (vs. `i18n-js`'s ~5 KB). Acceptable trade-off for ICU support and shared pipeline.
- **Migration effort** — ~100–200 files touch `useLanguage().t`. Mitigated by keeping the same call signature via `useT()` wrapper — mechanical find-and-replace.
- **JSON format shift** — `react-intl` expects flat `{ "key": "value" }` JSON, not the nested `{ "action": { "cancel": "Cancel" } }` format that `i18n-js` uses. The `sync-translations.mjs` script must be updated to output flat format (or a separate output mode added).
- **ICU syntax learning curve** — Developers must learn ICU MessageFormat syntax (`{count, plural, ...}`). This is already required for the web app, so it's a one-time investment across the team.
