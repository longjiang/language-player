# ADR-0051 — The `[l1]/[l2]` app shell is static; the request-time APIs live in the API routes

**Status:** Accepted (2026-10-27)
**See also:**
- [SPEC-108: Web Function Invocation Budget](../specs/108-web-function-invocation-budget.md) — the measurements, phases and verification behind this decision
- [SPEC-080: `lang` attribute rules for CJK glyphs](../specs/080-web-lang-attribute-glyph-rendering.md) — amended by D5 below
- [ADR-0046: The web app loads no third-party host that mainland China blocks](0046-china-blocked-third-party-hosts.md) — the same path-only cache-key trap, for assets instead of pages
- [ADR-0025: Next.js 16 + Turbopack upgrade](0025-nextjs-16-turbopack-upgrade.md) — `proxy.ts`, App Router conventions

---

## Context

Every route in `apps/web` was server-rendered on demand. Measured on 2026-10-27:

- `npm run build:check` classified **60 of 60 routes as `ƒ (Dynamic)`** — including `/`, `/login` and `/docs`, which render no user data at all.
- `/en/ja/explore` answered `cache-control: private, no-cache, no-store, must-revalidate`, so Netlify could never store it.
- The site crossed the legacy Pro plan's 125,000 included function invocations (403,611 in 11 days) and was auto-upgraded to Functions Level 1, adding **$25/month** to a $19 plan. Past 2M requests the add-on buys packs at **$19 per 500k**.

The cause was not a Netlify setting. It was one request-time API: next-intl's request config read the locale from `headers()`/`cookies()`, and a single such call opts its whole subtree out of prerendering — silently, with a green build.

The pages themselves need no function. Every route under `/[l1]/[l2]/` is a `'use client'` page that fetches its data after hydration; the server renders a shell that is identical for every visitor of the same URL.

## Decision

**Cache the shell, keep the functions for the API.**

1. **Locale comes from the URL segment, never the request.** `src/i18n.ts` takes it from next-intl's `requestLocale`; the layout owning the segment calls `setRequestLocale(l1)`. No `cookies()`/`headers()`/`searchParams` may appear anywhere under `[l1]/[l2]`.
2. **The layout opts in explicitly:** `generateStaticParams` (seeded with two pairs, as a build-time canary), `dynamicParams = true` (unknown pairs render on demand), `revalidate = false` (the shell changes only on deploy).
3. **The cache holds shell HTML only.** No user-scoped value is server-rendered under `[l1]/[l2]`. Any future one must not inherit this segment's `revalidate`.
4. **Public routes stay dynamic.** `(public)` — landing, auth, docs, language selection — reads `NEXT_LOCALE` and is dynamic on purpose: `/` varies by `Accept-Language` and must never be served from a shared cache.
5. **`<html lang>`, `data-ui-lang` and `dir` are written client-side, before paint**, by an inline script built from `SUPPORTED_L1S`. The root layout cannot read `[l1]` without a request-time API, and a static `lang` for 17 locales is the accepted cost. **This amends SPEC-080**, whose `<html lang={l1.code}>` no longer describes the code.
6. **Page responses carry no `Set-Cookie`.** `l1`/`l2`/`NEXT_LOCALE` are written by `LanguagePairCookies` after hydration; a cookie-setting response cannot be stored by a shared cache. The guest navigation counter is the one exception and stays server-enforced, so those few pages remain uncached.
7. **The global 404 is static English.** `app/not-found.tsx` is part of every route's tree, so a request-time API there makes the whole app dynamic. Localized 404s come from `[l1]/[l2]/not-found.tsx`.

## Consequences

**Positive**

- One render per `(pair, route)` per deploy instead of one per view, prefetch and navigation. Verified on a production build: `/en/ja/explore` → `x-nextjs-cache: HIT`, `s-maxage=31536000`; an unseeded pair → `MISS` then `HIT`.
- Prefetch stays on and becomes free, so navigation is faster than before, not slower.
- The same enforcement removed a live cache-key collision: `/api/videos/<id>?l2=ja` and `?l2=zh` now vary correctly (SPEC-108 Phase 3).

**Negative / accepted**

- Server HTML advertises `lang="en"` for the other 17 locales; the pre-paint script corrects `lang`, `dir` and `data-ui-lang` before the body parses. Crawlers that do not execute JS see `en`.
- A top-level unmatched URL gets an English 404.
- `generateStaticParams` seeds two pairs, so a request-time API creeping into the subtree **fails the build**. That is deliberate — the alternative failure mode is silent.
- Public ⇄ app navigation crosses route groups; nothing forces a full reload today, but the two subtrees have different rendering modes and should not be assumed interchangeable.

**Invariants to preserve** (breaking one costs money, not correctness — which is why this is an ADR)

1. No `cookies()`, `headers()`, `searchParams` or uncached `fetch()` under `[l1]/[l2]/`.
2. No session-scoped value server-rendered under `[l1]/[l2]/`.
3. `generateStaticParams`, `dynamicParams` and `revalidate = false` stay on the `[l1]/[l2]` layout.
4. `app/not-found.tsx` stays free of request-time APIs.
5. Any cached API response names its varying query params (`cachedJson` in `src/lib/api-cache.ts`).

## Alternatives considered

| Option | Why rejected |
|---|---|
| `output: 'export'` | Forbids middleware; kills the 10 route handlers and NextAuth |
| Keep dynamic rendering, add CDN cache headers | Next emits `no-store` for dynamic routes; a header rule cannot override it |
| Multiple root layouts (`app/(app)/[l1]/[l2]/layout.tsx`) | Would server-render the correct `lang` per locale, but moves ~55 directories, forces a full reload between app and public routes, and complicates `not-found`/route handlers. Revisit if `lang` in the server HTML ever matters |
| `dynamic = 'force-static'` instead of removing the cookie read | It survives `cookies()` by making them return empty — every visitor's locale would resolve to `en` |
| Cache `videos/recommend` too | Reads the session and is per-user; caching it would cross users |
| Move to credit-based pricing | 1 TB of bandwidth at 20 credits/GB against a 3,000-credit Pro tier costs more, not less |
