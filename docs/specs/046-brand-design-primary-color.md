# SPEC-046 — Brand Design: Primary Color, Play Button Logo & Typography

## Metadata

- **Spec ID**: SPEC-046
- **Feature**: Brand design system definition (color, logo, typography)
- **Status**: draft
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 10: Brand & Design Polish

## Overview

This spec documents the **Language Player** brand identity so colors, the logo, and
typography are used consistently across `apps/web`, `apps/mobile`, and `packages/shared`.

It also proposes changing the **primary brand color** on `apps/web` and `apps/mobile` from the
current indigo/blue to a **purple** palette. This is the same purple already used by the
Classic Nuxt app and the legacy GO mobile app's `Swatches.primary` — bringing all four
frontends onto one brand color.

### Decision being proposed

| | Current | Proposed |
|---|---|---|
| **Light primary** | indigo `228 74% 59%` (`#4968e4`) | **purple `#69279c`** (`274 60% 38%`) |
| **Dark primary** | indigo `228 74% 65%` (`#647ee8`) | **purple `#7d2fba`** (`274 60% 46%`) |

These values come directly from the legacy `Swatches.primary` scale:

```
primary: {
  400: '#9250c5',
  500: '#7d2fba',   // dark-mode primary
  600: '#69279c',   // light-mode primary
  700: '#55207e',
}
```

## 1. Brand Color

### 1.1 Primary color

The brand primary is a **purple**. It is the single most recognizable color in the product —
used for buttons, links, active states, highlights, the play-button logo accent, and focus rings.

| Mode | Hex | HSL (canonical token form) |
|---|---|---|
| **Light** | `#69279c` | `274 60% 38%` |
| **Dark** | `#7d2fba` | `274 60% 46%` |

> `#69279c` and `#7d2fba` are intended for adoption as the `primary` value in both
> `packages/shared/src/tokens.ts` (light + dark semantic), which then flows automatically
> into `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`, and (via
> `scripts/build-tokens.mts`) `apps/mobile/global.css` + `apps/mobile/tailwind.config.js`.
> Implement only after this spec is accepted (see [Implementation](#implementation)).

The `hslToHex()`-style helpers are **not** needed in the canonical source — the tokens live
as raw HSL channels, and the build already produces the hex where required.

### 1.2 Supporting semantic colors (unchanged)

The rest of the semantic palette stays as defined in ADR-0011 and `packages/shared/src/tokens.ts`:

- `background` / `foreground`
- `card` / `cardForeground`
- `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`
- `border`, `input`, `ring`

The `ring` color should follow the primary (so focus rings match the brand purple).

### 1.3 Web `brand-*` scale

`apps/web` (landing page, OG image) also uses a `brand-{50..900}` scale. Today it is an
indigo ramp (`brand-500: #5c7cfa`, `brand-600: #4c6ef5`) hand-defined in
`apps/web/tailwind.config.ts`. When the primary changes, the `brand-*` scale should be
regenerated around the same purple hue so `bg-brand-600`, `text-brand-700`,
`from-brand-500 to-warm-500` gradients, and the badge/feature chips stay on-brand.

A proposed purple `brand-*` ramp (near-hue 274):

```ts
brand: {
  50: '#f6edfa',
  100: '#ecdbf5',
  200: '#d9b7eb',
  300: '#c493e0',
  400: '#a06ad0',
  500: '#7d2fba', // matches dark primary
  600: '#69279c', // matches light primary
  700: '#55207e',
  800: '#411861',
  900: '#2d1143',
}
```

## 2. Play Button Logo

The Language Player logo is a **play button** glyph — a right-pointing triangle — and it
appears in both the wordmark (alongside the "Language Player" text) and the standalone
brand mark.

### 2.1 Where it lives

| Platform | Asset |
|---|---|
| **Web** | `apps/web/public/img/logo.png` — rendered via `apps/web/src/components/ui/logo.tsx` (`<Image src="/img/logo.png" />`) |
| **Web OG image** | `apps/web/src/app/og/route.tsx` loads `img/logo.png` as data-URI |
| **Mobile** | `apps/mobile/assets/logo.png` (standalone glyph), `apps/mobile/assets/icon.png` (app icon), `apps/mobile/assets/splash-icon.png` (splash) |
| **Classic (Nuxt)** | reference-only — `apps/mobile-go-legacy/assets/images/language-player-logo.svg` |

### 2.2 Appearance

The glyph is a **solid white play triangle**. On the web it sits on a transparent/light
background in the header; on colored surfaces (app icon, splash, dark nav) it is white or
uses the primary purple as background.

Guidelines:
- **Do not** rotate, skew, or add a shadow to the triangle.
- **Do not** replace it with a generic "play" icon from a different icon set — the logo
  triangle is the brand mark.
- Minimum clear space: roughly the height of the glyph on all sides.
- Preferred placement: upper-**left** of any header/nav; the triangle points **right**
  (forward), reinforcing "start learning / press play."
- On the landing page hero, the play glyph semantics pair with the CTA label
  `action.start_watching` (e.g. a `Play` icon next to "Start watching").

### 2.3 Do / Don't

- ✅ White play triangle on brand purple, neutral, or photo background
- ✅ Purple play triangle on white/light backgrounds
- ❌ Orange, red, or green play triangles (keep the brand purple family)
- ❌ Recolored to `warm`/`yellow` (reserved for accents, see `warm-*`)

## 3. Typography — Inter

Both apps use the **Inter** typeface for all UI text.

| Weight | File (web) | File (mobile) |
|---|---|---|
| 400 Regular | `apps/web/src/app/fonts/Inter_400Regular.ttf` | `apps/mobile/assets/fonts/Inter_400Regular.ttf` |
| 500 Medium | `apps/web/src/app/fonts/Inter_500Medium.ttf` | `apps/mobile/assets/fonts/Inter_500Medium.ttf` |
| 600 SemiBold | `apps/web/src/app/fonts/Inter_600SemiBold.ttf` | `apps/mobile/assets/fonts/Inter_600SemiBold.ttf` |
| 700 Bold | `apps/web/src/app/fonts/Inter_700Bold.ttf` | `apps/mobile/assets/fonts/Inter_700Bold.ttf` |

### 3.1 How it's loaded

- **Web** — `apps/web/src/app/layout.tsx` uses `next/font/local` to load the vendored TTFs
  (the same TTFs are vendored in the app dir and in `apps/mobile/assets/fonts/`). Inter is
  applied via the `--font-inter` variable + `font-sans` on `<body>`.
- **Mobile** — the same TTF files are bundled in `apps/mobile/assets/fonts/` (see
  `LICENSE_FONT` for the SIL Open Font License).

### 3.2 Usage rules

- The type scale and spacing come from the shared tokens (see ADR-0011); only the family
  (Inter) is brand-specific here.
- Weights: 400 for body, 500/600 for emphasis and labels, 700 for headings and strong
  call-to-action text.
- Never substitute a system font as a permanent replacement — Inter is part of the brand.
  (Fallback stacks are fine since `next/font/local` and Expo bundling both ship the TTFs.)

## 4. Applying Brand Tokens (Code)

Per ADR-0011 and AGENTS.md, never hardcode hex colors in components. Use the semantic
Tailwind/NativeWind classes:

```tsx
className="bg-primary text-primary-foreground"  // primary buttons
className="text-primary"                         // links / active
className="ring-primary"                         // focus rings
```

For React Native props that take a raw color (e.g. `placeholderTextColor`, lucide icon
`color`), import from `@/lib/theme-colors`, which derives hexes from
`packages/shared/tokens.ts` — never inline a hex literal.

## 5. Implementation

> ⚠️ The color change in this section is **proposed** and gated on acceptance of this spec.
> The primary-color swap is the intended change; the exact `brand-*` ramp and secondary
> `accent` adjustments should be visually reviewed before committing.

When approved:

1. Update `packages/shared/src/tokens.ts` — set
   - `lightSemantic.primary = '274 60% 38%'` (was `colors.blue[500]`)
   - `darkSemantic.primary = '274 60% 46%'` (was `'228 74% 65%'`)
   - align `ring` to the new primary
2. Regenerate mobile CSS + config: `npx tsx scripts/build-tokens.mts`
3. Web `globals.css` / `tailwind.config.ts`: apply the same `--primary` overrides and
   rebuild the `brand-{50..900}` ramp around hue 274.
4. Confirm the play-button logo (`apps/web/public/img/logo.png`,
   `apps/mobile/assets/logo.png` / `icon.png` / `splash-icon.png`) is on-brand; adjust any
   background to the new purple if it was tinted indigo.
5. Type-check and build-check (`npx turbo typecheck`, `npm run build:check -w apps/web`).

## 6. Verification

- `--primary` in both `apps/web/src/app/globals.css` and `apps/mobile/global.css` shows
  `274 60% 38%` (light) and `274 60% 46%` (dark).
- Primary buttons, links, focus rings, and the landing hero CTA render purple in both
  light and dark modes.
- Play-button logo renders correctly in web header, mobile header, splash, and app icon.
- Inter 400/500/600/700 load on web (no FOUT after hydration) and mobile.

## 7. Risks / Open Questions

- **Accent contrast**: `#69279c` with white text (`primary-foreground`) is within WCAG AA
  contrast for large text; verify small-text buttons. If needed, darken the 600 step.
- **`brand-*` ramp**: the purple ramp above is proposed, not yet tuned for all
  light/dark combinations — review highlights/borders on both themes.
- **Legacy parity**: `Swatches.primary` in the legacy GO app used `400/500/600/700`; we
  adopt `500` (dark) and `600` (light) as the canonical primary pair. Confirm no legacy
  screen relied on a different step.
- **Do not** change the logo shape — only its color context.
