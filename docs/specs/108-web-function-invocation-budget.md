# SPEC-108: Web Function Invocation Budget — Cut Netlify Serverless Usage

## Metadata

- **Spec ID**: SPEC-108
- **Feature**: Reduce `apps/web` Netlify serverless-function invocations from
  ~1.1M per billing cycle to below the legacy Pro plan's included 125k, by
  removing avoidable function calls (CDN-level proxies, a cacheable app shell,
  cacheable read-only API responses)
- **Status**: draft
- **Created**: 2026-10-27
- **ROADMAP Phase**: Cross-cutting (deployment & infrastructure)
- **See also**:
  - [ARCH-029 — Production Deployment Runbook](../arch/029-production-deployment-runbook.md) — the Netlify sites, `netlify.toml`, deploy and verify
  - [ADR-0046 — China-blocked third-party hosts](../adr/0046-china-blocked-third-party-hosts.md) — why thumbnails and audio are relayed same-origin (constrains Phase 1)
  - [SPEC-071 — Classic Route Redirect Adapter](071-classic-route-redirect-adapter.md) — the `lp_legacy` cookie proxy in `netlify.toml`
  - [SPEC-059 — Web Release QA Checklist](059-web-release-qa-checklist.md) — the `/api/python/*` rewrite this spec's Phase 1 mirrors
  - [SPEC-104 — Rare Han Glyph Subsets](104-rare-han-glyph-subsets.md) — the `/api/glyph-font` proxy
  - [ADR-0025 — Next.js 16 upgrade](../adr/0025-nextjs-16-turbopack-upgrade.md) — `proxy.ts` (formerly `middleware.ts`)

## Overview

The `language-player` Netlify site (`apps/web`, `languageplayer.io`) bills
**$25/month** for the legacy Pro **Functions** project add-on. It is not an
edge-function charge and it is not a per-project fee: the site crossed the
included **125,000 serverless invocations/month** and Netlify automatically
upgraded the site to **Functions Level 1** ($25, 2M requests + 1,000 runtime
hours). Every bill since 2026-09-16 has been **$44** ($19 Pro + $25 add-on);
before that it was $19.

The add-on is a metered level, not a one-off: it stays at Level 1 at the start of
each cycle, and past 2M requests it buys add-on packs at **$19 per 500k
requests**. So the cost is not a fixed $25 — it grows with the invocation count.
This spec removes the invocations that are pure overhead, which both returns the
site toward Level 0 and builds headroom against the $19/500k ladder.

**The invocations are avoidable because the pages render no user data.** Every
route under `/[l1]/[l2]/` is a `'use client'` page that fetches its data after
hydration; the server renders a shell. That shell is identical for every user of
a given `(l1, l2, route)` and depends only on the URL — yet today it is rendered
by the function on every request and never cached.

## Measured baseline (2026-10-27)

Billing period **2026-10-16 → 2026-11-15** (11 days elapsed), from
`GET /api/v1/sites/{site_id}/usage`:

| Project | Function invocations | Runtime | Add-on level |
|---|---|---|---|
| **language-player** (`languageplayer.io`) | **403,611 / 125,000** | 122,776 / 360,000 s | **Level 1 → $25/mo** |
| language-player-admin | 713 / 125,000 | 397 s | Level 0 → $0 |
| cheapbooze | 0 / 125,000 | 0 s | Level 0 → $0 |
| the other 6 sites | — | — | no functions |

403,611 in 11 days ≈ **36.7k/day ≈ 1.1M per cycle** — 8.8× the Level 0
allowance. Edge functions are a separate metric and currently **not** a cost:
team usage was 1,001,065 of 2,000,000 included (the 50% notice fired
2026-10-07).

Live-site evidence for the causes below (all reproduced with `curl -D-`):

| Observation | Value | Consequence |
|---|---|---|
| `GET https://languageplayer.io/en/ja/explore` | `cache-control: private,no-cache,no-store,must-revalidate`, `cache-status: "Netlify Durable"; fwd=bypass` | The HTML is never cached; every page request invokes the function |
| `GET /api/asset-proxy/img.youtube.com/vi/<id>/mqdefault.jpg` ×2 | first `uri-miss; stored`, second `hit; ttl=604798` | 1 invocation per **unique** thumbnail, then cached 7 days |
| `GET /de/ja/explore`, `/zh-Hans/ja/explore`, `/ja/zh/explore` | `<html lang="de|zh-Hans|ja">` | The locale already follows the URL; it is deterministic per URL |
| `GET /api/v1/deploys/{id}/edge_functions` | 1 entry per Next.js site (`___netlify-edge-handler-node-middleware`); 0 on the other 7 | No hand-written edge functions; the "4 edge functions" reading of the bill is wrong |

## Where the invocations come from

| # | Mechanism | Cost | Evidence |
|---|---|---|---|
| 1 | **Dynamic page renders.** All 50 routes under `/[l1]/[l2]/` are dynamic: there is **no `generateStaticParams` anywhere** in `apps/web/src/app`, and [src/i18n.ts:20-48](../../apps/web/src/i18n.ts#L20-L48) calls `headers()` *and* `cookies()` ([:31](../../apps/web/src/i18n.ts#L31)) via next-intl's request config, which the root layout awaits at [layout.tsx:108](../../apps/web/src/app/layout.tsx#L108). A request-time API forces dynamic rendering for the whole route. | 1 per page view | `no-store` on the HTML |
| 2 | **Prefetch of dynamic routes.** Per the Next 16 docs shipped with the installed framework (`node_modules/next/dist/docs/01-app/02-guides/prefetching.md`): *"a dynamic route is skipped unless it has a `loading.js` boundary"*. Nine routes have `loading.tsx` (explore, watch, search, dictionary, review, saved-words, reader, live-tv, watch-history), so every `<Link>` entering the viewport **is** prefetched. The explore grid renders 12 cards (`pageSize = 12`, [use-videos.ts:46](../../apps/web/src/hooks/use-videos.ts#L46)) plus infinite scroll. | up to 1 per visible card, before any click | docs + `loading.tsx` files |
| 3 | **Client navigations.** Dynamic routes have no client cache; each transition fetches a fresh RSC payload. | 1 per navigation | docs: "Client Cache TTL Off" |
| 4 | **Thumbnails through the function.** `youtubeThumbnail()` returns `/api/asset-proxy/...` ([video-service.ts:253](../../apps/web/src/lib/video-service.ts#L253)); used in 9 files, rendered per card by [video-card.tsx:115](../../apps/web/src/components/video/video-card.tsx#L115). | 1 per unique thumbnail | durable cache after first hit |
| 5 | **Per-request data routes.** A watch page = 1 `/api/videos/[id]` ([watch page:162](<../../apps/web/src/app/[l1]/[l2]/watch/[videoId]/page.tsx#L162>)) + 1 `/subtitles`; explore = 1 `/recommend` per 12 cards and per filter change; rare-Han pages = 2 `/api/glyph-font` calls; `/api/auth/session` once per full load. | 2-4 per page view | route handlers |

Mechanisms 1–3 and 4 are the multipliers that make 36k/day possible without
36k humans: one explore view can cost a dozen invocations before a click.

## Platform mechanics (how one invocation happens)

Netlify runs the app through the OpenNext adapter. What that means for cost, per
[Netlify: Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/):

- **One serverless function** (`___netlify-server-handler`) serves SSR, ISR
  regeneration, PPR, every route handler and every server action. There is no
  per-route function to inspect — the bill counts requests to this one function.
- **Middleware runs as an edge function** — a separate, separately metered
  product (2M invocations included). It does not itself invoke the serverless
  function, but a page request passing through it usually then does.
- **Static pages are not free forever**: they are "stored in Next.js route cache,
  and fetched from the route cache by a function invocation when first accessed
  after a deploy", then served from the edge. A deploy therefore costs one
  invocation per cache entry that someone actually visits — not one per visitor.
- **ISR pages** re-invoke the function once per revalidate window per visited
  route, and are edge-served in between.
- **Function, edge-function and proxy responses are not cached by default**
  ([Netlify: Caching overview](https://docs.netlify.com/build/caching/caching-overview/));
  a response is only stored when it carries `Cache-Control`/`Netlify-CDN-Cache-Control`.
  Netlify would otherwise key on the full query string, but the adapter's own
  `Netlify-Vary` narrows the key to `__nextDataReq|_rsc` (D4) — which is why an
  application param like `?l2=` must be re-declared to be part of the key.
- **Cacheable responses from the Next runtime use the durable cache**
  automatically (runtime ≥ 5.5): one edge node generates, every other edge node
  reuses instead of re-invoking.

A request costs an invocation when, and only when, the edge cache cannot answer
it: a dynamic page render, an RSC payload for a navigation or prefetch, a
route-handler call, or a cache miss/revalidation of a static page. Those are
exactly the requests Phases 1–3 remove or cache.

## Why not a fully static site

`output: 'export'` is not available: it forbids middleware, and `apps/web`
relies on [proxy.ts](../../apps/web/src/proxy.ts) for redirects, `NEXT_LOCALE`,
guest gating and the SPEC-071 Classic adapter, plus 10 route handlers including
NextAuth, plus the 3 (soon 6) `netlify.toml` redirect rules.

The pages, however, need no function at all. This spec keeps functions for the
app surface (auth, relays, data aggregation, OG images) and makes the **page
shell** static/cacheable.

## Decisions

- **D1 — Thumbnail and glyph-font relays move to the CDN.** A `netlify.toml`
  rewrite proxying an external origin invokes no function; this is the same
  mechanism the committed `/api/python/*` and `/api/directus/*` rules already
  use. The route handlers stay for the cases a rewrite cannot express
  (Wiktionary audio, whose `Special:FilePath` redirects off-host).
- **D2 — The app shell becomes cacheable (ISR), not read request-time APIs.**
  Locale must come from the URL segment (`setRequestLocale` + `requestLocale`)
  rather than `cookies()`/`headers()`; the root layout must stop resolving
  locale; `[l1]/[l2]/layout.tsx` then exports `generateStaticParams` (to leave
  the dynamic path), `dynamicParams = true`, and `revalidate = false`.
- **D3 — Cache only shell HTML, never user data.** No user-specific value is
  server-rendered today, so a shared cache entry is safe. Any future
  server-rendered user data must not inherit the segment's `revalidate`.
- **D4 — Cached API responses must name their varying query params.** The Next
  plugin's `netlify-vary` currently keys routes on `__nextDataReq|_rsc` plus
  headers only — the same path-only cache-key bug ADR-0046 documented for
  asset-proxy. Caching `/api/videos/...` without `Netlify-Vary: query=l2,…`
  would serve Japanese data to Chinese learners.
- **D5 — Do not migrate the team to credit-based pricing.** At 32 GB of
  bandwidth and 1 TB included on legacy Pro, the credit model (20 credits/GB,
  3,000 credits on Pro) would cost far more.

## Design

Each phase is independently shippable and independently measurable, ordered by
savings ÷ risk: Phase 1 cannot change rendered output, Phase 2 changes the
rendering model, Phase 3 changes cache keys, Phase 4 records the outcome.

### Phase 1 — CDN-level relays

**Goal**: no thumbnail or glyph-font request reaches the function.

**Changes**

1. `netlify.toml` — three rules inserted **before** the `/*` legacy rule (rules
   evaluate top-down, and that one is a catch-all gated on the `lp_legacy`
   cookie):

   ```toml
   [[redirects]]
     from = "/api/asset-proxy/img.youtube.com/*"
     to = "https://img.youtube.com/:splat"
     status = 200
     force = true

   [[redirects]]
     from = "/api/asset-proxy/i.ytimg.com/*"
     to = "https://i.ytimg.com/:splat"
     status = 200
     force = true

   [[redirects]]
     from = "/api/glyph-font/*"
     to = "https://pythonvps.zerotohero.ca/glyph-font/:splat"
     status = 200
     force = true
   ```

2. [proxy.ts:267](../../apps/web/src/proxy.ts#L267) — widen the matcher
   exclusion:

   ```ts
   matcher: ['/((?!api/|og/|_next/static|_next/image|favicon.ico).*)'],
   ```

   `proxy()` already early-returns for `/api/...` and `/og/...`
   ([proxy.ts:63-79](../../apps/web/src/proxy.ts#L63-L79)), so today the edge
   function runs only to stamp a `NEXT_LOCALE` cookie on responses that never
   read it.

3. **Optional, dashboard-only — drop crawler traffic at the edge.** If the
   request shape shows many requests per session (crawlers, AI scrapers), a
   Netlify Firewall traffic rule or the User Agent Blocker extension removes
   those requests before they reach the function. ⚠️ Verify Googlebot and Bingbot
   stay allowed (SEO), and confirm the premise first: measure requests vs.
   sessions before adding a rule.

**Why it is safe**: the rewrites are same-origin proxies resolved at Netlify's
edge, exactly like the committed `/api/python/*` and `/api/directus/*` rules
([netlify.toml:9-19](../../netlify.toml#L9-L19)). The asset-proxy handler stays for
Wiktionary audio, whose `Special:FilePath` 302s to `upload.wikimedia.org` and
therefore needs the host allowlist and error handling.

**Acceptance**

- `curl -sI .../api/asset-proxy/img.youtube.com/vi/<id>/mqdefault.jpg` → 200,
  `content-type: image/jpeg`
- `/sites/{id}/usage` does not move after fetching 20 distinct thumbnails
- `lp_legacy` proxy, `/api/python/*` and a `/api/glyph-font/manifest` call still
  work (SPEC-071 § 12 checklist)

**Rollback**: revert the three `netlify.toml` rules. No app code changes.

### Phase 2 — cacheable app shell

**Goal**: the HTML for `(l1, l2, route)` is generated once per deploy and then
served from the CDN edge — no invocation per view, prefetch or navigation.

**Prerequisite (blocking)**: no request-time API in the render path.
[src/i18n.ts](../../apps/web/src/i18n.ts) calls `headers()` and `cookies()`,
which Next treats as a signal to render the route at request time, no matter
what `revalidate` says.

**Changes** (in order):

1. `src/i18n.ts` — take the locale from
   `getRequestConfig({ requestLocale })`; delete the header/cookie reads in
   `resolveLocale()` and the header read in `resolveTimeZone()`; keep
   `DEFAULT_TIME_ZONE`.
2. `[l1]/[l2]/layout.tsx` — `await setRequestLocale(params.l1)` (next-intl
   4.13.5 exports it), render `<LocaleProvider>` with that locale's messages, and
   export:
   - `generateStaticParams` returning `[]` (every pair generated on demand) or a
     seeded subset. **This export is what takes the route off the dynamic path** —
     see Q1.
   - `dynamicParams = true` (the default; documenting the on-demand generation)
   - `revalidate = false` — the shell changes only on deploy. A 3600s revalidate
     would re-invoke the function up to 24×/day per visited pair, which can keep
     the site above 125k by itself.
3. `src/app/layout.tsx` — drop `getLocale()/getMessages()/getTimeZone()` and the
   `<LocaleProvider>` wrapper; keep `<html>` and the providers that need no
   messages.
4. New `src/app/(public)/layout.tsx` — a route group (no URL change) providing
   locale/messages for `login`, `register`, `forgot-password`,
   `password-reset`, `language-select`, `auth/*`, `docs/*`, `go-pro-*` and the
   landing page. These may keep the cookie read: they are low-traffic and their
   dynamic rendering costs nothing measurable. `PublicHeader` moves here because
   it calls `useT()`.
5. `<html lang>` / `data-ui-lang` — the app shell now renders inside
   `[l1]/[l2]`, so the attribute must be set there (or by a small client sync
   component, following `ThemeSync`). Verify for all 18 L1s.
6. Keep the 9 `loading.tsx` boundaries: prefetch becomes free once the target is
   cached, and the boundaries are what enable prefetch at all.
7. Verify Netlify will store a page response that sets cookies. Every
   `[l1]/[l2]` page response currently carries three `set-cookie` headers (`l1`,
   `l2`, `NEXT_LOCALE`) from the middleware. If the CDN refuses to cache them,
   stop stamping `l1`/`l2` on page responses and read the pair from the URL
   instead — the cookies are only needed by the `/` redirect,
   `/language-select`, and the Classic adapter's default pair.

**Expected effect**: one invocation per `(pair, route)` per deploy plus one per
newly visited pair, instead of one per view / prefetch / navigation.

**Acceptance**

- Second request for `/en/ja/explore` → `cache-status: … hit`, `age > 0`, and
  `/sites/{id}/usage` flat
- `<html lang>` matches the URL for en, de, zh-Hans and ja; the switcher still
  retranslates without a reload
- an authenticated page still renders (nothing user-scoped was server-rendered)
- an invalid pair still 404s, and the 404 is not cached

**Rollback**: drop `revalidate`/`generateStaticParams` and restore the root
provider — the route returns to per-request rendering with no data-model change.

**Risk**: highest of the four. The i18n restructure is the only part that can
ship a user-visible regression.

### Phase 3 — cacheable read-only API responses

**Goal**: repeat reads of the same video / subtitles / channel payload hit the
CDN instead of the function.

**Changes**: add two headers to `videos/[videoId]/route.ts`,
`videos/[videoId]/subtitles/route.ts`, `videos/subscribed/route.ts`,
`channels/route.ts` and `channels/[channelId]/route.ts`:

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
Netlify-Vary: query=l2,clean_generated,page,page_size,channelIds
```

`videos/recommend` is **excluded**: it calls `auth()` and varies by user id, so
its response is not shareable. That is also why recommendation traffic stays a
floor cost under any design.

**Why `Netlify-Vary` is mandatory**: the adapter's own `netlify-vary` lists only
`__nextDataReq|_rsc` plus request headers (observed on the live response) — the
same path-only keying that made ADR-0046 serve one image for every thumbnail.
Without the header, `?l2=ja` and `?l2=zh` share a cache entry.

**Acceptance**

- `?l2=ja` and `?l2=zh` return different payloads, each `cache-status: hit` on
  repeat
- a second load of the same watch page costs 0 invocations

**Rollback**: delete the two headers. No schema or API change.

### Phase 4 — documentation and decision record

**Changes**

- `docs/arch/029-production-deployment-runbook.md` § 2 and § 11 — record the
  metered-add-on ladder (125k → Level 1 $25 → 2M → $19/500k), the
  `/sites/{id}/usage` recipe, and that page-level cost is a property of the
  rendering model, not a Netlify setting.
- New ADR (0051) — the cacheable-shell decision: locale from the URL segment,
  `revalidate = false`, shell-only caching, and the rule that no session-scoped
  value may be server-rendered under `[l1]/[l2]`.
- This spec — status → complete, with measured before/after numbers.

**Acceptance**: ARCH-029's numbers match `/sites/{id}/usage` at cycle close.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| `output: 'export'` | Forbids middleware; kills route handlers and NextAuth |
| `prefetch={false}` on video cards | Trades navigation latency for invocations; Phase 2 makes prefetch free |
| Downgrading the add-on now | Blocked mid-cycle while usage exceeds 125k, and it re-upgrades at the next threshold crossing |
| Migrating to credit-based plans | 20 credits/GB across 32 GB+ of bandwidth, against 1 TB included (D5) |
| Deleting the idle sites | `cheapbooze`, `czh-*`, `language-player-nitro`, the 2 auto-named sites and `zerotohero-nuxt` have zero function usage — housekeeping, not savings |

## Phase summary

| Phase | Work | Ship risk | Expected invocations |
|---|---|---|---|
| 1 | 3 `netlify.toml` rewrites + matcher (+ optional firewall rule) | none (config) | every thumbnail and glyph-font call leaves the function |
| 2 | cacheable shell: `requestLocale`, `generateStaticParams`, `revalidate = false`, root-layout/provider restructure | medium (i18n) | page renders, prefetches and navigations → ~1 per pair/route per deploy |
| 3 | API cache headers + `Netlify-Vary` | low (cache key) | repeat video/subtitle/channel reads → CDN |
| 4 | ARCH-029 + ADR-0051 + close-out | none (docs) | — |

## Verification

Measurement is totals-only — there is no per-route API on the Netlify side. Use
both sources:

```bash
# per-site metered usage (current cycle)
curl -s -H "Authorization: Bearer $NF_TOKEN" \
  "https://api.netlify.com/api/v1/sites/796f983a-ac9c-42e4-a066-5605d8b73e5c/usage"
```

and **Project → Functions → Metrics** in the dashboard. Checks per phase, all
against the live site:

| Phase | Check | Pass condition |
|---|---|---|
| 1 | `curl -sI` a thumbnail and a `/api/glyph-font/manifest` URL | 200 + correct `content-type`; `/sites/{id}/usage` flat after 20 distinct thumbnails |
| 1 | SPEC-071 § 12 checklist | `lp_legacy` proxy and `/api/python/*` unchanged |
| 2 | second request for `/en/ja/explore` | `cache-status: … hit`, `age > 0`, usage flat |
| 2 | `curl` `/de/ja/explore`, `/zh-Hans/ja/explore` | `<html lang>` / `data-ui-lang` match the URL |
| 2 | an invalid pair, e.g. `/xx/yy/explore` | 404, and the 404 is not publicly cacheable |
| 3 | `/api/videos/<id>?l2=ja` vs `?l2=zh`, twice each | different payloads, both `hit` on repeat |
| close | `/sites/{id}/usage` at cycle end | < 125,000 → Level 0; < 2,000,000 → stays at $25 flat |

## Acceptance criteria

**Phase 1**
- [ ] No thumbnail or glyph-font request invokes a function.
- [ ] `lp_legacy`, `/api/python/*` and `/api/glyph-font` behave as before.

**Phase 2**
- [ ] A repeat page request for the same `(l1, l2, route)` is edge-served with no
      function invocation.
- [ ] `<html lang>`/UI language follow the URL; the switcher retranslates without
      a reload.
- [ ] Authenticated pages still render; 404s are not cached.

**Phase 3**
- [ ] Cached API responses vary on every query parameter that changes the payload.
- [ ] A second load of the same watch page costs 0 invocations.

**Phase 4**
- [ ] ARCH-029 records the add-on ladder and the measurement recipe; ADR-0051 is
      accepted; this spec is closed with measured numbers.

**Outcome**
- [ ] `language-player` drops below 125k/cycle, or — if traffic makes that
      impossible — stays well clear of the 2M threshold and the $19/500k ladder.
- [ ] `npx turbo typecheck` and `npm run build:check -w apps/web` pass.

## Files

| Phase | Files |
|---|---|
| 1 | [netlify.toml](../../netlify.toml), [apps/web/src/proxy.ts](../../apps/web/src/proxy.ts) |
| 2 | [apps/web/src/i18n.ts](../../apps/web/src/i18n.ts), [apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx), [apps/web/src/app/[l1]/[l2]/layout.tsx](<../../apps/web/src/app/[l1]/[l2]/layout.tsx>), new `apps/web/src/app/(public)/layout.tsx`, [public-header.tsx](../../apps/web/src/components/layout/public-header.tsx) |
| 3 | `apps/web/src/app/api/videos/**/route.ts`, `apps/web/src/app/api/channels/**/route.ts` |
| 4 | [docs/arch/029-production-deployment-runbook.md](../arch/029-production-deployment-runbook.md), new `docs/adr/0051-*.md`, this spec |

## Risks

- **Shared cache entry leaks user state.** Safe today (no server-rendered user
  data); breaks the moment someone server-renders a session-scoped value under
  `[l1]/[l2]`. Mitigate with a comment in the layout and a review rule (D3).
- **Locale/provider restructure regresses i18n.** The root layout currently owns
  `<html lang>` and the message provider; moving them can flash English or
  hydrate mismatched. Verify all 18 L1s plus the switcher.
- **Wrong cache key on API routes** (D4) silently serves the wrong language.
- **Middleware `Set-Cookie` may defeat page caching.** Page responses stamp
  `l1`, `l2` and `NEXT_LOCALE`. If the CDN stores them anyway, fine; if not,
  Phase 2 step 7 is mandatory, not optional.
- **Prefetch burst on deploy.** After Phase 2, a deploy invalidates cached shells
  and the first wave of prefetches re-renders them once. Expected, bounded.
- **`revalidate` interacts with `notFound()`** on invalid pairs; confirm 404s are
  not cached.

## Open Questions

- **Q1 (answered from the docs; confirm at build)**: `revalidate` alone is not
  enough. The framework's `generate-static-params` reference states that without
  a `generateStaticParams` export the route "will be dynamically rendered", while
  `dynamicParams = true` is what lets unknown `(l1, l2)` pairs generate at
  request time. Phase 2 therefore ships `generateStaticParams` returning `[]`
  (or a seeded subset) and confirms on the first `build:check` that
  `/en/ja/explore` comes back cacheable. If it does not, the fallback is
  `dynamic = 'force-static'` on the segment layout.
- **Q2**: Should the 9 `loading.tsx` boundaries stay once pages are cached? They
  keep prefetch enabled, which is now free — recommend keeping them.
- **Q3**: Is the residual, post-Phase-3 count likely to clear 125k? If traffic
  makes Level 0 unreachable, the target is the 2M ceiling, not $0.
