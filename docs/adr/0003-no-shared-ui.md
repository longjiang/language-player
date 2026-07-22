# ADR-0003: Do Not Share UI Components Between Web and Mobile

**Date**: 2026-07-12
**Status**: accepted
**Amended**: 2026-07-22 — refined to allow shared design tokens (ADR-0011) and shared styling syntax (NativeWind/Tailwind). Components remain separate per platform.
**See also**: [ADR-0010 (port web to mobile)](./0010-port-web-to-mobile-fresh-start.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md)

## Context
We have a web app (Next.js/React DOM) and a mobile app (React Native/Expo). The temptation is to share UI components between them for DRY code. Several libraries (Tamagui, Solito, React Native Web) promise this.

## Options Considered

### Option A: Share logic + design tokens + styling syntax, separate components (amended choice)
- **Pros**: Clean separation, each platform uses its native primitives, no cross-platform UI bugs. Shared design tokens (ADR-0011) prevent visual drift — colors, spacing, typography are a single source of truth. Shared Tailwind syntax (NativeWind on mobile) means one mental model for styling. No dependency on cross-platform UI libraries.
- **Cons**: Some code duplication in UI layer, two implementations of similar-looking components. Build complexity for NativeWind (Metro + Babel plugins — one-time setup).

### Option B: Tamagui / React Native Web
- **Pros**: Write once, render on both platforms, unified design system
- **Cons**: Significant setup complexity, subtle rendering differences, limited to Tamagui's component set, hard to integrate with shadcn/ui on web, performance overhead on mobile

### Option C: Expo Web
- **Pros**: Use the existing GO app for web too
- **Cons**: Expo Web is not production-grade for SEO-heavy content sites, no SSR, poor Lighthouse scores, limited web-specific features

## Decision
**Option A: Share logic + design tokens + styling syntax, separate components**

Rationale: The UI requirements differ fundamentally between platforms. Web needs SEO, responsive layouts, keyboard navigation, and accessibility patterns that don't map to mobile. Mobile needs touch gestures, native feel, safe areas, and platform-specific navigation. However, this doesn't mean everything in the UI layer must diverge:

- **Design tokens** (ADR-0011) — colors, typography, spacing, border radius — are pure data. Sharing them in `packages/shared/tokens.ts` gives both platforms a single source of truth. No more visual drift from independently maintained color palettes.
- **Styling syntax** — both platforms use Tailwind. The web app already uses it; NativeWind compiles the same `className` strings to React Native `StyleSheet` objects at build time. This means a developer styles both platforms with the same mental model (`className="bg-primary text-sm px-4"`).
- **Components** — still separate per platform. A `<div>` is not a `<View>`, `onClick` is not `onPress`, `hover:` doesn't exist on mobile. Component `.tsx` files live in `apps/web/src/components/` and `apps/mobile-v2/components/` respectively.

## Consequences

**Shared across platforms:**
- `packages/shared/src/tokens.ts` — design tokens (colors, typography, spacing, border radius). Single source of truth per ADR-0011.
- `tailwind.config.ts` (shared or generated from tokens) — both web and mobile Tailwind configs derive from the same token values.
- Tailwind class names — `className="bg-primary text-sm px-4"` means the same thing on both platforms.

**Separate per platform:**
- Component `.tsx` files — `apps/web/src/components/` (React DOM) and `apps/mobile-v2/components/` (React Native). Zero component sharing.
- `packages/*` contains NO JSX/TSX rendering code — only types, functions, API calls, and now design token values.
- Web uses shadcn/ui component primitives; Mobile uses NativeWind-compatible primitives (`View`, `Text`, `Pressable` styled via `className`).
- Animation tokens, shadow/elevation, and platform-specific style properties remain per-platform. Only the subset of Tailwind that NativeWind supports is available on mobile (~90% — no `hover:`, `focus:`, CSS grid, arbitrary selectors).
- Visual consistency is ensured by shared tokens and shared class names, not shared component code.
