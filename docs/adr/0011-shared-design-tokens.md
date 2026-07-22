# ADR-0011: Shared Design Tokens — CSS Variables (Web) + StyleSheet Values (Mobile)

**Date**: 2026-07-22
**Status**: proposed
**See also**: [ADR-0003 (no shared UI)](./0003-no-shared-ui.md), [ADR-0010 (port web to mobile)](./0010-port-web-to-mobile-fresh-start.md)

## Context

The web and mobile apps currently define their design tokens independently:

| | Web (Next.js + Tailwind) | Mobile (GO app) |
|---|---|---|
| **Color format** | HSL: `228 74% 59%` | Hex: `#7d2fba` |
| **Color structure** | Semantic: `--primary`, `--background`, `--foreground`, `--muted`, `--border` | Raw scales: `Swatches.primary[400]`, `Swatches.neutral[200]` |
| **Dark mode** | `.dark` class overrides HSL variables | ❌ Not supported |
| **Typography** | Tailwind defaults (rem-based) | `Typography.fontSize.small: 16` (px) |
| **Spacing** | Tailwind 4px grid (0.5rem units) | Ad-hoc in StyleSheet |
| **Border radius** | `--radius: 0.75rem` | Hardcoded per-component |

This creates several problems:

1. **Visual drift** — Colors drift apart over time because there's no single source of truth. The web app's `--primary` maps to `hsl(228, 74%, 59%)` (indigo), the GO app's `Swatches.primary[500]` is `#7d2fba` (purple). These are different colors.

2. **No dark mode on mobile** — Without semantic tokens (like `--background` vs `--surface`), adding dark mode requires touching every component. The web app gets it for free because components reference semantic tokens, not raw colors.

3. **Inconsistent spacing/typography** — The web app's spacing is systematic (Tailwind's 4/8/12/16/24/32/etc.); the mobile app is ad-hoc. A designer can't say "use spacing-4" and have it mean the same thing on both platforms.

4. **Duplicated effort** — When the color palette changes, both apps must be updated manually.

## Options Considered

### Option A: Share raw values only (define in `packages/shared/tokens.ts`, import on both sides)

Web imports HSL values → generates CSS custom properties + Tailwind config. Mobile imports the same values → uses in `StyleSheet.create()`. Mobile converts HSL → hex at build time (or at runtime via a 3-line helper).

- **Pros**: Single source of truth. No new dependencies. Works with existing Tailwind setup on web and `StyleSheet` on mobile. Follows ADR-0003 (tokens are data, not UI).
- **Cons**: Mobile uses hex (RN doesn't support HSL), so a thin conversion layer is needed. Doesn't give mobile Tailwind-like utility classes — still raw `StyleSheet`.

### Option B: Use NativeWind (Tailwind for React Native)

- **Pros**: Same utility classes as web (`className="bg-primary text-primary-foreground"`). Dark mode via `.dark` class. Theoretically write-once styles.
- **Cons**: Build complexity (Metro plugin, Babel plugin). Adds ~30 KB. Not all Tailwind utilities work (no `hover:`, `focus:`, CSS grid). Different rendering model — Tailwind classes map to `StyleSheet` under the hood, which can cause subtle differences. Goes against ADR-0003 by blurring the UI boundary.

### Option C: Use Tamagui

- **Pros**: Full design system with shared tokens, theming, animations. Write-once component styles.
- **Cons**: Heavy (~100 KB+). Steep learning curve. Locks both apps into Tamagui's component model. Violates ADR-0003.

## Decision

**Option A: Share raw design tokens in `packages/shared/tokens.ts`.**

Rationale: Design tokens are pure data — arrays of numbers and strings. Sharing them doesn't violate ADR-0003 (no shared UI) because there are no React components, no CSS classes, and no platform-specific code in the tokens file. Each platform consumes the tokens in its native way:

- **Web**: Generate CSS custom properties + Tailwind config at build time (or import and map at config load)
- **Mobile**: Import values directly into `StyleSheet.create()`, with a tiny HSL→hex helper for colors

This is the same pattern we already use for i18n (ADR-0009: share locale JSON, implement differently) and API types (share type definitions, implement client differently).

## Token Architecture

### Token Hierarchy

```
Design Tokens (packages/shared/src/tokens.ts)
├── Colors
│   ├── Raw scales (HSL)        e.g. blue[500] = '228 74% 59%'
│   ├── Semantic light tokens   e.g. background = '0 0% 100%'
│   └── Semantic dark tokens    e.g. background = '230 30% 8%'
├── Typography
│   ├── Font families           e.g. sans = 'Nunito'
│   ├── Font sizes (rem)        e.g. sm = '0.875rem'
│   └── Font weights            e.g. normal = 400
├── Spacing (rem)               e.g. 2 = '0.5rem', 4 = '1rem'
└── Border radius (rem)         e.g. DEFAULT = '0.75rem'
```

### File: `packages/shared/src/tokens.ts`

```typescript
// ── Color Scales (HSL channels, space-separated: "H S% L%") ──
// These are the raw palette. Components should use semantic tokens below.

export const colors = {
  blue: {
    50:  '214 100% 97%',
    100: '214 95% 93%',
    200: '214 90% 85%',
    300: '217 91% 75%',
    400: '224 82% 65%',
    500: '228 74% 59%',   // ← primary
    600: '232 65% 52%',
    700: '235 58% 46%',
    800: '237 52% 40%',
    900: '239 47% 34%',
  },
  warm: {
    50:  '30 100% 96%',
    100: '28 100% 90%',
    200: '27 100% 82%',
    300: '26 100% 74%',
    400: '25 100% 66%',
    500: '24 100% 62%',   // ← accent
    600: '22 88% 55%',
    700: '20 76% 48%',
    800: '18 68% 42%',
    900: '16 60% 36%',
  },
  neutral: {
    50:  '210 20% 98%',
    100: '210 17% 94%',
    200: '214 20% 85%',
    300: '215 14% 65%',
    400: '215 14% 46%',
    500: '222 47% 25%',
    600: '222 47% 18%',
    700: '222 47% 14%',
    800: '230 30% 10%',
    900: '230 30% 8%',
  },
  red:    { /* 50–900 scale */ },
  green:  { /* 50–900 scale */ },
  yellow: { /* 50–900 scale */ },
} as const;

// ── Semantic Tokens ────────────────────────
// Components use these, not raw scales. Enables dark mode via swapping.

export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export const lightSemantic: SemanticColors = {
  background:           colors.neutral[50],
  foreground:           colors.neutral[600],
  card:                 colors.neutral[50],
  cardForeground:       colors.neutral[600],
  popover:              colors.neutral[50],
  popoverForeground:    colors.neutral[600],
  primary:              colors.blue[500],
  primaryForeground:    '0 0% 100%',
  secondary:            colors.neutral[100],
  secondaryForeground:  colors.neutral[600],
  muted:                colors.neutral[100],
  mutedForeground:      colors.neutral[400],
  accent:               colors.warm[500],
  accentForeground:     '0 0% 100%',
  destructive:          '0 84% 60%',
  destructiveForeground:'0 0% 100%',
  border:               colors.neutral[200],
  input:                colors.neutral[200],
  ring:                 colors.blue[500],
};

export const darkSemantic: SemanticColors = {
  background:           colors.neutral[900],
  foreground:           colors.neutral[50],
  card:                 colors.neutral[800],
  cardForeground:       colors.neutral[50],
  popover:              colors.neutral[800],
  popoverForeground:    colors.neutral[50],
  primary:              colors.blue[400],
  primaryForeground:    colors.neutral[900],
  secondary:            colors.neutral[700],
  secondaryForeground:  colors.neutral[50],
  muted:                colors.neutral[700],
  mutedForeground:      colors.neutral[300],
  accent:               colors.warm[500],
  accentForeground:     colors.neutral[900],
  destructive:          '0 62% 50%',
  destructiveForeground:'0 0% 100%',
  border:               colors.neutral[700],
  input:                colors.neutral[700],
  ring:                 colors.blue[400],
};

// ── Typography ──────────────────────────────

export const typography = {
  fontFamily: {
    sans: 'Nunito',
    mono: 'JetBrains Mono',
  },
  fontSize: {
    xs:   '0.75rem',    // 12px
    sm:   '0.875rem',   // 14px
    base: '1rem',       // 16px
    lg:   '1.125rem',   // 18px
    xl:   '1.25rem',    // 20px
    '2xl':'1.5rem',     // 24px
    '3xl':'1.875rem',   // 30px
    '4xl':'2.25rem',    // 36px
    '5xl':'3rem',       // 48px
  },
  fontWeight: {
    normal: 400,
    bold:   800,
  },
  lineHeight: {
    tight:  1.25,
    normal: 1.5,
    relaxed:1.75,
  },
} as const;

// ── Spacing (4px grid) ──────────────────────

export const spacing = {
  0:  '0',
  0.5:'0.125rem',  // 2px
  1:  '0.25rem',   // 4px
  1.5:'0.375rem',  // 6px
  2:  '0.5rem',    // 8px
  2.5:'0.625rem',  // 10px
  3:  '0.75rem',   // 12px
  3.5:'0.875rem',  // 14px
  4:  '1rem',      // 16px
  5:  '1.25rem',   // 20px
  6:  '1.5rem',    // 24px
  7:  '1.75rem',   // 28px
  8:  '2rem',      // 32px
  9:  '2.25rem',   // 36px
  10: '2.5rem',    // 40px
  12: '3rem',      // 48px
  16: '4rem',      // 64px
} as const;

// ── Border Radius ───────────────────────────

export const borderRadius = {
  none: '0',
  sm:   '0.25rem',   // 4px
  DEFAULT: '0.75rem',// 12px
  md:   '0.75rem',   // 12px
  lg:   '1rem',      // 16px
  xl:   '1.5rem',    // 24px
  full: '9999px',
} as const;

// ── Platform Adapters ───────────────────────

/** Convert HSL channels ("H S% L%") → hex for React Native. */
export function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(' ').map((v) => parseFloat(v));
  const lightness = l / 100;
  const saturation = s / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const toHex = (n: number) =>
    Math.round(255 * n).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Build a StyleSheet-compatible color object from semantic tokens. */
export function semanticColorsForMobile(mode: 'light' | 'dark'): Record<keyof SemanticColors, string> {
  const source = mode === 'light' ? lightSemantic : darkSemantic;
  const result: Record<string, string> = {};
  for (const [key, hsl] of Object.entries(source)) {
    result[key] = hslToHex(hsl);
  }
  return result as Record<keyof SemanticColors, string>;
}

/** Convert rem string → px number for React Native. */
export function remToPx(rem: string): number {
  return parseFloat(rem) * 16;
}

/** Build a font size object for React Native (px values). */
export function fontSizeForMobile(): Record<keyof typeof typography.fontSize, number> {
  const result: Record<string, number> = {};
  for (const [key, rem] of Object.entries(typography.fontSize)) {
    result[key] = remToPx(rem);
  }
  return result as Record<keyof typeof typography.fontSize, number>;
}

/** Build a spacing object for React Native (px values). */
export function spacingForMobile(): Record<keyof typeof spacing, number> {
  const result: Record<string, number> = {};
  for (const [key, rem] of Object.entries(spacing)) {
    result[key] = remToPx(rem);
  }
  return result as Record<keyof typeof spacing, number>;
}
```

### Web Integration

The web app already uses shadcn/ui's CSS custom property pattern. The `globals.css` can source its values from the shared tokens (at build time or via a small generation script). In practice, the existing CSS variables already match the token structure — the only change is moving the HSL values into `packages/shared/tokens.ts` and importing them into `tailwind.config.ts`:

```typescript
// apps/web/tailwind.config.ts
import { colors, lightSemantic, darkSemantic, typography, spacing, borderRadius } from '@langplayer/shared/tokens';

const config: Config = {
  theme: {
    extend: {
      colors: {
        // Map semantic tokens to Tailwind color names
        background:       `hsl(${lightSemantic.background})`,
        foreground:       `hsl(${lightSemantic.foreground})`,
        primary: {
          DEFAULT:        `hsl(${lightSemantic.primary})`,
          foreground:     `hsl(${lightSemantic.primaryForeground})`,
        },
        // ... etc
      },
      fontSize: typography.fontSize,
      spacing: spacing,
      borderRadius: borderRadius,
    },
  },
};
```

A build script (`scripts/build-tokens.mjs`) can also regenerate `globals.css` `:root` and `.dark` blocks from the same tokens, ensuring the CSS custom properties never drift from the source of truth.

### Mobile Integration

The mobile app imports the token helpers directly:

```typescript
// apps/mobile-v2/constants/theme.ts
import {
  semanticColorsForMobile,
  fontSizeForMobile,
  spacingForMobile,
  typography,
  borderRadius,
} from '@langplayer/shared/tokens';

export const lightColors = semanticColorsForMobile('light');
export const darkColors = semanticColorsForMobile('dark');

export const fontSizes = fontSizeForMobile();
export const spaces = spacingForMobile();

// Use in StyleSheet:
//   backgroundColor: lightColors.background,
//   fontSize: fontSizes.sm,
//   padding: spaces[4],
```

Components never reference raw hex values — they always go through the semantic color objects. Dark mode becomes trivial: swap `lightColors` → `darkColors` in the theme context.

A `useThemeColors()` hook provides the correct set based on the current theme:

```typescript
function useThemeColors() {
  const { theme } = useSettings();
  const colorScheme = useColorScheme();
  const isDark = theme === 'dark' || (theme === 'system' && colorScheme === 'dark');
  return isDark ? darkColors : lightColors;
}
```

### Why HSL as the canonical format?

1. **Human-editable** — `228 74% 59%` is easier to reason about than `#4c6ef5`. Changing lightness creates a shade; changing saturation creates a tint.
2. **shadcn/ui native** — The web app already uses HSL. Keeping it means zero migration for the Tailwind side.
3. **Single source of truth** — One HSL value generates both the CSS custom property (web) and the hex equivalent (mobile via `hslToHex()`).
4. **Algorithmic scaling** — The 50–900 color scales can be derived by adjusting lightness/saturation, reducing the number of hand-picked hex values.

## What We Don't Share

Per ADR-0003, these remain platform-specific:

| Not Shared | Web | Mobile |
|---|---|---|
| CSS classes / utility names | Tailwind utilities (`bg-primary`, `text-sm`) | Not applicable |
| StyleSheet objects | Not applicable | `StyleSheet.create({ ... })` |
| Component styles | `className="..."` | `style={styles.container}` |
| Animation tokens | Tailwind animation classes | `Animated` API values |
| Shadow/elevation | CSS `box-shadow` | Platform-specific shadow props |

## Consequences

- **New file**: `packages/shared/src/tokens.ts` — single source of truth for all design tokens
- **Web changes**: `globals.css` and `tailwind.config.ts` source values from `@langplayer/shared/tokens` (or a `scripts/build-tokens.mjs` regenerates them). No visual change — the values are the same, just centralized.
- **Mobile changes**: Replace `constants/Swatches.ts` and `constants/Typography.ts` with imports from `@langplayer/shared/tokens`. Components use semantic color objects (`lightColors.background`) instead of raw hex (`Swatches.neutral[50]`).
- **Dark mode on mobile**: Trivial now — `useThemeColors()` returns the correct set. All components benefit instantly.
- **Designer handoff**: A designer can specify a change in one file (`tokens.ts`) and both platforms update. For example, "change primary from indigo to blue" is a one-line edit.
- **Rem→px conversion**: Mobile uses `remToPx()` (1rem = 16px baseline). This is conventional and matches the browser default. If a designer specifies 14px, the token is `0.875rem`.
- **No runtime cost**: The `hslToHex()` calls happen once at module import time, not on every render. The mobile color objects are static.
