# ADR-0011: Shared Design Tokens — CSS Custom Properties (Web + Mobile)

**Date**: 2026-07-22 (proposed), revised 2026-07-23
**Status**: accepted (revised)
**Supersedes**: Original Option A proposal — see [Revision History](#revision-history)
**See also**: [ADR-0003 (no shared UI)](./0003-no-shared-ui.md), [ADR-0010 (port web to mobile)](./0010-port-web-to-mobile-fresh-start.md)

## Context

The web and mobile apps initially defined their design tokens independently:

| | Web (Next.js + Tailwind) | Mobile (original GO app) |
|---|---|---|
| **Color format** | HSL: `228 74% 59%` | Hex: `#7d2fba` |
| **Color structure** | Semantic: `--primary`, `--background`, `--foreground`, `--muted`, `--border` | Raw scales: `Swatches.primary[400]`, `Swatches.neutral[200]` |
| **Dark mode** | `.dark` class overrides HSL variables | ❌ Not supported |
| **Typography** | Tailwind defaults (rem-based) | `Typography.fontSize.small: 16` (px) |
| **Spacing** | Tailwind 4px grid (0.5rem units) | Ad-hoc in StyleSheet |
| **Border radius** | `--radius: 0.75rem` | Hardcoded per-component |

This created several problems:

1. **Visual drift** — Colors drifted apart over time because there was no single source of truth.
2. **No dark mode on mobile** — Without semantic tokens, adding dark mode required touching every component.
3. **Inconsistent spacing/typography** — No shared measurement system.
4. **Duplicated effort** — When the color palette changed, both apps had to be updated manually.

## Options Considered

### Option A: Share raw values only (define in `packages/shared/tokens.ts`, import on both sides)

Web imports HSL values → generates CSS custom properties + Tailwind config. Mobile imports the same values → uses in `StyleSheet.create()` with an `hslToHex()` converter.

- **Pros**: Single source of truth. No new dependencies. Follows ADR-0003 (tokens are data, not UI).
- **Cons**: Mobile uses hex (RN doesn't support HSL natively), so a thin conversion layer is needed. Doesn't give mobile Tailwind-like utility classes — still raw `StyleSheet`.

### Option B: Use NativeWind (Tailwind for React Native)

- **Pros**: Same utility classes as web (`className="bg-primary text-primary-foreground"`). Dark mode via `.dark` class.
- **Cons**: Build complexity (Metro plugin, Babel plugin). Not all Tailwind utilities work (no `hover:`, `focus:`, CSS grid).

### Option C: Use Tamagui

- **Pros**: Full design system with shared tokens, theming, animations.
- **Cons**: Heavy (~100 KB+). Steep learning curve. Violates ADR-0003.

## Decision (Original — Superseded)

~~**Option A: Share raw design tokens in `packages/shared/tokens.ts`.**~~

~~Mobile would import values via `hslToHex()` into `StyleSheet.create()`.~~

## Decision (Revised — Current)

**Both platforms use the same mechanism: CSS custom properties with `hsl(var(--xxx))` references.**

The mobile-v2 app adopted **NativeWind** (Option B) for its Tailwind utility class support, but the initial implementation used hardcoded HSL values in `tailwind.config.js` (dark-only). This meant the light/dark theme toggle had no visual effect — the Tailwind config had only dark colors, and no mechanism existed to swap them at runtime.

The final architecture bridges the gap:

| Layer | Web (`apps/web/`) | Mobile (`apps/mobile-v2/`) | Mechanism |
|---|---|---|---|
| **Token source** | `packages/shared/src/tokens.ts` | Same file | `lightSemantic` + `darkSemantic` |
| **CSS variables** | `globals.css` `:root` / `.dark` blocks | `global.css` `@layer base { :root / .dark:root }` | CSS custom properties with raw HSL channels |
| **Tailwind config** | `hsl(var(--xxx))` | `hsl(var(--xxx) / <alpha-value>)` | Runtime `var()` resolution |
| **Theme toggle** | `next-themes` adds `.dark` to `<html>` | NativeWind `useColorScheme().setColorScheme()` | Adds/removes virtual `.dark` class |

Both platforms now resolve colors identically at runtime:
- When theme is **light** → `var(--background)` resolves to `0 0% 100%` (from `:root`)
- When theme is **dark** → `var(--background)` resolves to `230 30% 8%` (from `.dark:root`)

The build script `scripts/build-tokens.mts` generates both `global.css` and `tailwind.config.js` from the shared tokens, ensuring the two files never drift apart.

**Why CSS custom properties work in NativeWind:** Contrary to initial assumptions, NativeWind v4.2+ DOES support runtime `var()` resolution. CSS custom properties defined in `@layer base { :root { ... } .dark:root { ... } }` are extracted at build time and resolved dynamically when `setColorScheme()` changes the active color scheme. This is confirmed by NativeWind's own test suite (`dark-mode.ios.tsx`).

### Why HSL as the canonical format?

1. **Human-editable** — `228 74% 59%` is easier to reason about than `#4c6ef5`.
2. **shadcn/ui native** — The web app already uses HSL.
3. **Single source of truth** — One HSL value generates CSS custom properties, Tailwind config, and (if needed) hex equivalents.

## Architecture

### Token Hierarchy

```
Design Tokens (packages/shared/src/tokens.ts)
├── Colors
│   ├── Raw scales (HSL)        e.g. blue[500] = '228 74% 59%'
│   ├── Semantic light tokens   e.g. background = '0 0% 100%'
│   └── Semantic dark tokens    e.g. background = '230 30% 8%'
├── Typography
│   ├── Font families           e.g. sans = 'Inter'
│   ├── Font sizes (rem)        e.g. sm = '0.875rem'
│   └── Font weights            e.g. normal = 400
├── Spacing (rem)               e.g. 2 = '0.5rem', 4 = '1rem'
└── Border radius (rem)         e.g. DEFAULT = '0.75rem'
```

### Build Pipeline

```
packages/shared/src/tokens.ts        ← canonical source
        │
        ▼
scripts/build-tokens.mts             ← generator
        │
        ├──▶ apps/web/src/app/globals.css        (hand-maintained, matches tokens)
        │    apps/web/tailwind.config.ts          (hand-maintained, hsl(var(--xxx)))
        │
        └──▶ apps/mobile-v2/global.css           (GENERATED — :root + .dark:root)
             apps/mobile-v2/tailwind.config.js    (GENERATED — hsl(var(--xxx) / <alpha-value>))
```

### CSS Custom Property Pattern (Both Platforms)

```css
/* global.css — shared pattern across web and mobile */
@layer base {
  :root {
    --background: 0 0% 100%;        /* light */
    --foreground: 222 47% 11%;
    --primary: 228 74% 59%;
    /* ... all 23 semantic colors */
  }

  .dark:root {                       /* .dark on web, .dark:root on mobile */
    --background: 230 30% 8%;       /* dark */
    --foreground: 0 0% 95%;
    --primary: 228 74% 65%;
    /* ... */
  }
}
```

```js
// tailwind.config — shared pattern
colors: {
  background: 'hsl(var(--background) / <alpha-value>)',
  foreground: 'hsl(var(--foreground) / <alpha-value>)',
  primary:    'hsl(var(--primary) / <alpha-value>)',
  // ...
}
```

### Theme Toggle Mechanism

| | Web | Mobile |
|---|---|---|
| **Toggle library** | `next-themes` | NativeWind `useColorScheme()` |
| **How it works** | Adds `.dark` class to `<html>` | Calls `setColorScheme('dark')` → internal context |
| **CSS resolution** | Browser resolves `var()` based on `.dark` presence | NativeWind runtime resolves `var()` from `.dark:root` block |
| **Persistence** | `next-themes` localStorage | `useSettings()` → SecureStore |

### Mobile-Specific: `build-tokens.mts`

The generator reads `lightSemantic` and `darkSemantic` from `packages/shared/src/tokens.ts` and writes two files:

1. **`apps/mobile-v2/global.css`** — `@tailwind` directives + `@layer base { :root { ... } .dark:root { ... } }` with all 23 semantic colors as CSS custom properties. Raw HSL channels only (no `hsl()` wrapper — the wrapper lives in the Tailwind config).

2. **`apps/mobile-v2/tailwind.config.js`** — NativeWind preset + `darkMode: 'class'` + colors referencing `hsl(var(--xxx) / <alpha-value>)`. The `<alpha-value>` placeholder preserves Tailwind opacity modifier support (`bg-primary/20`).

Run after updating tokens: `npx tsx scripts/build-tokens.mts`

### ThemeProvider (Mobile)

`contexts/ThemeContext.tsx` bridges settings → NativeWind:

```tsx
function ThemeProvider({ children }) {
  const { display, loaded } = useSettingsContext();
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    if (!loaded) return;
    if (display.theme === 'light') setColorScheme('light');
    else if (display.theme === 'dark') setColorScheme('dark');
    else setColorScheme('system');
  }, [display.theme, loaded]);
  // ...
}
```

No per-component `dark:` overrides needed — the CSS variable swap handles everything globally.

## What We Don't Share

Per ADR-0003, these remain platform-specific:

| Not Shared | Web | Mobile |
|---|---|---|
| Theme toggle mechanism | `next-themes` | NativeWind `useColorScheme` |
| CSS class application | Browser DOM `.dark` class | NativeWind virtual class |
| Component styles | `className="..."` | `className="..."` (NativeWind) |
| Animation tokens | Tailwind animation classes | `Animated` API values |
| Shadow/elevation | CSS `box-shadow` | Platform-specific shadow props |

## Revision History

### Original (2026-07-22) — proposed

Option A: Share raw tokens in `packages/shared/tokens.ts`. Mobile uses `hslToHex()` → `StyleSheet.create()`. Web uses CSS custom properties + Tailwind `hsl(var(--xxx))`.

### Revision 1 (2026-07-23) — accepted (revised)

The mobile-v2 team adopted **NativeWind** (Option B) for Tailwind utility class support on React Native. The initial implementation used hardcoded dark HSL values in `tailwind.config.js`, which meant the light/dark theme toggle had no visual effect.

After investigating NativeWind's runtime CSS variable support (confirmed in v4.2.6's test suite), the mobile approach was aligned with the web: CSS custom properties in `global.css` with `:root` / `.dark:root` blocks, referenced via `hsl(var(--xxx) / <alpha-value>)` in the Tailwind config.

Both platforms now use the same mechanism:
- Shared tokens in `packages/shared/src/tokens.ts`
- CSS custom properties for color definitions
- `hsl(var(--xxx))` references in Tailwind config
- Runtime `var()` resolution for light ↔ dark switching

## Consequences

- **Single source of truth**: `packages/shared/src/tokens.ts` → all colors, typography, spacing, border radius
- **Both platforms use CSS custom properties**: Light/dark mode works identically — toggle the `.dark` class (web) or call `setColorScheme()` (mobile), and all 23 semantic colors swap simultaneously
- **No per-component migration**: Unlike the original ADR-0011 plan (which called for `dark:` overrides on every component), the CSS variable approach swaps all colors globally
- **`build-tokens.mts`**: Run after token changes to regenerate `global.css` and `tailwind.config.js` for mobile
- **`hslToHex()` and `semanticColorsForMobile()`**: Retained in `packages/shared/src/tokens.ts` for potential non-NativeWind mobile usage (e.g., `theme-colors.ts` for lucide icon colors), but no longer the primary mobile theming mechanism
- **Opacity modifiers preserved**: `<alpha-value>` placeholder in config maintains `bg-primary/20` syntax support
