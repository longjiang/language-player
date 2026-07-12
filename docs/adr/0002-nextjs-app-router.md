# ADR-0002: Next.js App Router (not Pages Router)

**Date**: 2026-07-12
**Status**: accepted

## Context
The new web app (`apps/web`) replaces the Nuxt 2 Classic app. We need to choose between Next.js App Router (introduced in Next.js 13, stable in 14) and the older Pages Router.

## Options Considered

### Option A: App Router (current choice)
- **Pros**: React Server Components (better perf), nested layouts, streaming, `loading.tsx`/`error.tsx` conventions, better SEO with Metadata API, future-proof (Next.js is investing here)
- **Cons**: Newer paradigm, some libraries still catching up, Server Components have restrictions (no hooks, no browser APIs)

### Option B: Pages Router
- **Pros**: Familiar, all libraries support it, simpler mental model, closer to Nuxt 2's approach
- **Cons**: No React Server Components, less performant, legacy path

## Decision
**Option A: App Router**

Rationale: This is a greenfield rewrite, so there's no migration cost. The metadata API and nested layouts align well with our L1/L2 language routing pattern. Server Components will reduce JS bundle size for content-heavy pages like Explore.

## Consequences
- All pages use `'use client'` directive when they need interactivity (most will)
- Server Components used for static/metadata-heavy pages only initially
- `next-themes` and other client-side libraries must be wrapped in Client Components
- Middleware runs on Edge runtime (limited Node APIs)
