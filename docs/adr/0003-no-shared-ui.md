# ADR-0003: Do Not Share UI Components Between Web and Mobile

**Date**: 2026-07-12
**Status**: accepted

## Context
We have a web app (Next.js/React DOM) and a mobile app (React Native/Expo). The temptation is to share UI components between them for DRY code. Several libraries (Tamagui, Solito, React Native Web) promise this.

## Options Considered

### Option A: Share logic, separate UI (current choice)
- **Pros**: Clean separation, each platform uses its native primitives, no cross-platform UI bugs, faster development per platform, no dependency on cross-platform UI libraries
- **Cons**: Some code duplication in UI layer, two implementations of similar-looking components

### Option B: Tamagui / React Native Web
- **Pros**: Write once, render on both platforms, unified design system
- **Cons**: Significant setup complexity, subtle rendering differences, limited to Tamagui's component set, hard to integrate with shadcn/ui on web, performance overhead on mobile

### Option C: Expo Web
- **Pros**: Use the existing GO app for web too
- **Cons**: Expo Web is not production-grade for SEO-heavy content sites, no SSR, poor Lighthouse scores, limited web-specific features

## Decision
**Option A: Share logic, separate UI**

Rationale: The UI requirements differ significantly between platforms. Web needs SEO, responsive layouts, keyboard navigation, and accessibility patterns that don't map to mobile. Mobile needs touch gestures, native feel, safe areas, and platform-specific navigation. The shared surface area (types, API client, utilities, hooks) is already substantial — sharing UI adds complexity without proportional benefit.

## Consequences
- `packages/*` contains NO JSX/TSX rendering code — only types, functions, and API calls
- Web uses shadcn/ui + Tailwind; Mobile uses its existing `Themed*` component library
- Design tokens (colors, typography, spacing) are documented but implemented independently per platform
- Shared design can be ensured through visual review, not shared code
