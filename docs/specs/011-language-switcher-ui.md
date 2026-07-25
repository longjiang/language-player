# SPEC-011: Language Switcher UI

## Metadata
- **Spec ID**: SPEC-011
- **Feature**: Language Switcher UI
- **Status**: draft
- **Created**: 2026-07-24
- **Supersedes**: `docs/specs/archive/011-language-switcher-ui.md` (2026-07-24)
- **Scope**: Next.js (web) only — see SPEC-001 for mobile

## Overview

Users change their language pair via a modal triggered from the header. The header shows only L2 (the learning language) to keep it minimal. Tapping it opens a modal containing the same dual-column language picker used on the onboarding page. On confirmation, the redirect target depends on whether the current page is content-specific or language-universal.

---

## Design

### 1. Header Trigger

**Location:** Header bar, between search icon and user menu (replaces current L1 ↔ L2 control).

**Resting state:**
```
[ L2 Name ▼ ]
```

- Shows only the L2 name (e.g., "中文", "Japanese", "Chinois" — localized in L1)
- `text-foreground`, semibold, small font — same styling as current L2 button
- No L1 label, no swap button
- Opens the language picker modal on click/tap

### 2. Shared Component: `LanguagePicker`

**File:** `apps/web/src/components/language-picker.tsx` (new — extracted from the onboarding page)

Reusable dual-column language selector. Used by both the onboarding page and the modal.

**Props:**
```ts
interface LanguagePickerProps {
  /** Initial L1 code. Defaults to 'en' on the onboarding page. */
  initialL1?: string;
  /** Initial L2 code (pre-selects it in the list). */
  initialL2?: string;
  /** Called when user clicks confirm with valid L1 + L2. */
  onConfirm: (l1: string, l2: string) => void;
  /** Called when user dismisses the picker (modal close / cancel). */
  onDismiss?: () => void;
  /** Show a title above the columns. Default true for onboarding, false for modal. */
  showTitle?: boolean;
}
```

**Layout (same as current onboarding page):**
- Optional title + subtitle at top
- Two side-by-side cards (stacked on mobile):
  - **Left card** (L1, "I speak…") — globe icon, primary accent
  - **Right card** (L2, "I'm learning…") — book icon, warm accent
- Confirm button at bottom (disabled until both selected)
- Chinese (zh) L2: "Traditional / Simplified" toggle appears below L2 card

**Each card:**
- Search input with magnifying glass
- Scrollable list (max-h-64), popular + all languages sections
- Language item: native script name + uppercase code
- Selected item: filled background

**Differences from current onboarding page:**
- Pre-selects `initialL1` and `initialL2` when provided (so the modal reflects current selection)
- `onDismiss` prop for modal close behavior (not relevant for onboarding)

### 3. Modal: Language Change Dialog

**File:** `apps/web/src/components/layout/language-switcher.tsx` (rewritten)

A modal dialog triggered from the header L2 button.

**Behavior:**
- Opens on click of the header L2 button
- Contains `<LanguagePicker>` with `initialL1={l1.code}` and `initialL2={l2.code}` pre-selected
- Has a "Cancel" / dismiss action (closes modal, no change)
- Has a "Confirm" action → calls `onConfirm`

**onConfirm logic:**
```
function handleConfirm(newL1: string, newL2: string) {
  const target = pickRedirectTarget(currentPath);
  setLanguagePair(newL1, newL2, target);
  closeModal();
}
```

### 4. Redirect Logic

After confirming a language change, the redirect target depends on the current page:

#### Universal pages → same page with new L1/L2
These pages are language-agnostic lists or settings — redirecting to the same page is safe and expected:

| Route pattern | Page |
|---|---|
| `/explore` | Explore feed |
| `/live-tv` | Live TV list |
| `/tv-shows` | TV shows list |
| `/music` | Music list |
| `/watch-history` | Watch history |
| `/dictionary` | Dictionary hub |
| `/saved-words` | Saved words list |
| `/review` | Review queue |
| `/settings` | Settings |
| `/profile` | Profile |
| `/search` | Search |
| `/docs/...` | Help documentation |

#### Content pages → redirect to `/explore`
These pages are tied to a specific piece of content (video, dictionary entry, file). Changing language while viewing specific content doesn't make sense — the user would expect to browse in the new language, not land on a 404 or stale content:

| Route pattern | Page |
|---|---|
| `/watch/[videoId]` | Specific video |
| `/dictionary/entry/[dictId]/[entryId]` | Dictionary entry |
| `/epub` | EPUB reader |
| `/reader` | Notes reader |
| `/web-reader` | Web reader |
| `/local-media` | Local media viewer |

#### Onboarding page → `/explore`
| Route | Page |
|---|---|
| `/language-select` | First-time onboarding |

Redirects to `/${l1}/${l2}/explore` (unchanged from current behavior).

### 5. State Management Changes

**`LanguageProvider` — `setLanguagePair` signature change:**
```ts
// Before:
setLanguagePair: (l1: string, l2: string) => void;
// After:
setLanguagePair: (l1: string, l2: string, targetPath?: string) => void;
```

When `targetPath` is provided, navigates to `/${newL1}/${newL2}/${targetPath}`. When omitted, navigates to `/${newL1}/${newL2}` (root of language pair, which middleware redirects to `/language-select` or `/explore`).

**`pickRedirectTarget(pathname: string): string`** — new utility function:
```ts
// Returns the path suffix to preserve, or null to redirect to explore
function pickRedirectTarget(pathname: string): string | null {
  const UNIVERSAL_PATTERNS = [
    /^\/[^/]+\/[^/]+\/explore$/,
    /^\/[^/]+\/[^/]+\/live-tv$/,
    /^\/[^/]+\/[^/]+\/tv-shows$/,
    /^\/[^/]+\/[^/]+\/music$/,
    /^\/[^/]+\/[^/]+\/watch-history$/,
    /^\/[^/]+\/[^/]+\/dictionary$/,
    /^\/[^/]+\/[^/]+\/saved-words$/,
    /^\/[^/]+\/[^/]+\/review$/,
    /^\/[^/]+\/[^/]+\/settings$/,
    /^\/[^/]+\/[^/]+\/profile$/,
    /^\/[^/]+\/[^/]+\/search$/,
    /^\/[^/]+\/[^/]+\/docs/,
  ];
  const isUniversal = UNIVERSAL_PATTERNS.some(p => p.test(pathname));
  if (isUniversal) {
    // Extract the page slug after L1/L2
    return pathname.replace(/^\/[^/]+\/[^/]+\//, '');
  }
  return null; // content page → explore
}
```

### 6. Component Tree

```
Header
├── Logo
├── NavDropdown (×3: Media, Reading, Vocab)
├── Search button
├── LanguageSwitcher          ← L2-only trigger button + modal
│   └── <Modal>
│       └── <LanguagePicker>  ← shared component
│           ├── L1 column (cards, search, list)
│           ├── L2 column (cards, search, list)
│           └── Confirm button
└── UserMenu

/language-select page
└── <LanguagePicker>          ← same shared component
    ├── L1 column
    ├── L2 column
    ├── Continue button
    └── Header (title + subtitle, showTitle=true)
```

### 7. Files Changed / Created

| File | Action |
|---|---|
| `apps/web/src/components/language-picker.tsx` | **New** — shared component extracted from onboarding page |
| `apps/web/src/app/language-select/page.tsx` | **Refactor** — use `<LanguagePicker>` |
| `apps/web/src/components/layout/language-switcher.tsx` | **Rewrite** — L2-only trigger + modal |
| `apps/web/src/components/layout/header.tsx` | **Update** — remove old L1/L2/swap layout, use new `LanguageSwitcher` |
| `apps/web/src/providers/language-provider.tsx` | **Update** — `setLanguagePair` accepts optional `targetPath` |
| `apps/web/src/lib/language-data.ts` | **New** — `pickRedirectTarget()` utility |

### 8. User Stories

- As a user, I want to see only my learning language (L2) in the header so the UI stays clean.
- As a user, I want to change both L1 and L2 in one place without navigating away from my current page context.
- As a user browsing Explore or Settings, I want the page to stay on the same view after switching languages.
- As a user watching a video, I want to be taken to Explore (not the video) after switching languages, since the video's subtitles might not exist in my new language.

## States

### Loading / Empty / Error
- Language lists are static constants — no loading or error states needed
- Modal open/close is client-side, instantaneous

### Edge Cases
- **Same L1/L2 selected**: Confirm button is disabled (no-op)
- **Modal dismissed**: No cookies changed, no navigation
- **L1 changed on a universal page**: Page reloads with new L1 → i18n switches, same page content
- **L2 changed on a universal page**: Page reloads with new L2 → lists re-fetch for new language
- **RTL L1 selected**: Modal content should reflow for RTL
- **Search with no results**: Empty list — no "no results" message shown (same as current)

## Dependencies
- `@langplayer/shared` — `SUPPORTED_L1S`, `SUPPORTED_L2S`
- `apps/web/src/lib/language-data.ts` — `POPULAR_LANGUAGES`, `languageName()`, `getLanguageMeta()`
- `apps/web/src/providers/language-provider.tsx` — updated `setLanguagePair`
- `apps/web/src/middleware.ts` — cookie setting (unchanged)

## Related Specs
- **SPEC-001** — Language selection & routing
- **Archive**: `docs/specs/archive/011-language-switcher-ui.md` — previous design (L1 + L2 + swap in header, inline dropdowns)
