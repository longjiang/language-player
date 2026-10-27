# SPEC-108: Web Function Invocation Budget — Cut Netlify Serverless Usage

## Metadata

- **Spec ID**: SPEC-108
- **Feature**: Reduce `apps/web` Netlify serverless-function invocations from
  ~1.1M per billing cycle to below the legacy Pro plan's included 125k, by
  removing avoidable function calls (CDN-level proxies, a cacheable app shell,
  cacheable read-only API responses)
- **Status**: in progress
- **Created**: 2026-10-27
- **ROADMAP Phase**: Cross-cutting (deployment & infrastructure)
- **See also**:
  - [ARCH-029 — Production Deployment Runbook](../arch/029-production-deployment-runbook.md) — the Netlify sites, `netlify.toml`, deploy and verify
  - [ADR-0046 — China-blocked third-party hosts](../adr/0046-china-blocked-third-party-hosts.md) — why thumbnails and audio are relayed same-origin (constrains Phase 1)
  - [SPEC-071 — Classic Route Redirect Adapter](071-classic-route-redirect-adapter.md) — the `lp_legacy` cookie proxy in `netlify.toml`
  - [SPEC-059 — Web Release QA Checklist](059-web-release-qa-checklist.md) — the `/api/python/*` rewrite this spec's Phase 1 mirrors
  - [SPEC-104 — Rare Han Glyph Subsets](104-rare-han-glyph-subsets.md) — the `/api/glyph-font` proxy
  - [ADR-0025 — Next.js 16 upgrade](../adr/0025-nextjs-16-turbopack-upgrade.md) — `proxy.ts` (formerly `middleware.ts`)
  - [ADR-0051 — The `[l1]/[l2]` app shell is static](../adr/0051-cacheable-app-shell.md) — the architectural decision Phase 2 implements

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

  **Considered and rejected — proxying thumbnails through Flask.** Flask is
  already the app's data origin, already relays images
  (`/channel-thumbnail`), and sits outside China, so it would satisfy ADR-0046
  just as well. It loses on every other axis: the bytes move off Netlify's
  included 1 TB onto the VPS's shared bandwidth; every uncached thumbnail
  becomes a trans-Pacific round trip with no PoP cache in front of it; a Flask
  outage would blank every thumbnail in the app; and it needs a route, a byte
  cache and rate limiting where the rewrite needs four lines of TOML. The one
  thing Flask can do that a rewrite cannot is set its own cache headers — see
  the cache-window note under Phase 1.
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
- **D6 — Keep the nine `loading.tsx` boundaries.** A boundary's second job is
  that it makes a *dynamic* route prefetchable, which is why today each visible
  video card costs an invocation before anyone clicks. That cost belongs to the
  route being dynamic, not to the file: once Phase 2 caches the page, a prefetch
  is a CDN hit and the boundary is free — while still being the instant-feedback
  path for a cold cache (the first visit after a deploy). Removing them would buy
  a saving Phase 2 already delivers and pay for it in permanent latency.
  Re-examine only a route that turns out to stay dynamic after Phase 2.
- **D7 — Target headroom under the 2M ceiling, not Level 0.** What survives
  Phases 1–3 is exactly the part that cannot be shared: `/api/auth/session`
  (once per full page load) and `/api/videos/recommend` (per-user, ≈1.5× per
  explore view) — call it **2.5 invocations per page load**. Against the 125k
  line:

  | Full page loads/day | Invocations/month | Level 0 ($0)? |
  |---|---|---|
  | 1,000 | ~75,000 | yes |
  | **1,650** | **~125,000** | **break-even** |
  | 2,000 | ~150,000 | no — still $25 flat |
  | 5,000 | ~375,000 | no — still $25 flat |

  So Level 0 is a traffic ceiling (~1,600 page loads/day), not an engineering
  target. Reaching $0 at real traffic would mean deleting a per-user call —
  dropping recommend's personalisation (a product cost) or moving session out of
  the render path (an auth refactor) — and neither is worth $25/month. Measure
  the real volume after Phase 2; revisit when the count approaches 2M, where the
  $19/500k ladder starts to bite.

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

**Post-change behaviour** (what the app does differently afterwards):

- **Thumbnails** keep their URLs — `/api/asset-proxy/img.youtube.com/vi/<id>/mqdefault.jpg` —
  so `assetProxyUrl()` and every `<img>` are untouched; only the responder
  changes. The cache window, however, becomes `img.youtube.com`'s own
  `public, max-age=7200` + `etag` instead of our
  `max-age=86400, s-maxage=604800, immutable`: two hours in the browser instead
  of one day. A proxy rule cannot set response headers, so this is the price of
  removing the function; a Flask relay is the fallback if the shorter window
  turns out to matter.
- **Rare glyphs** need no app change. `rare-glyph-provider.tsx` still calls
  `/api/glyph-font/manifest?cps=…&style=…` and then
  `/api/glyph-font/<hash>.woff2`, builds a `FontFace` from the bytes and adds it
  to `document.fonts`. The rewrite serves both from Flask's existing
  `/glyph-font/*` endpoints, still same-origin. Caching comes from Flask's own
  headers: subsets are immutable with an `ETag` (one year), the manifest is
  `max-age=3600` with no `ETag` — so manifest freshness relaxes from five
  minutes (today's `revalidate: 300`) to at most an hour. Path validation moves
  to Flask, whose `glyph_font_file` already rejects anything that is not
  `[0-9a-f]{16}` plus a known extension. If Flask is unreachable, glyphs fall
  back to the chip, exactly as they do today.

### Phase 2 — cacheable app shell

**Goal**: the HTML for `(l1, l2, route)` is generated once per deploy and then
served from the CDN edge — no invocation per view, prefetch or navigation.

**Prerequisite (blocking)**: no request-time API in the render path.
[src/i18n.ts](../../apps/web/src/i18n.ts) calls `headers()` and `cookies()`,
which Next treats as a signal to render the route at request time. Measured, not
assumed (Q1): with `generateStaticParams`, `dynamicParams` and
`revalidate = false` all present, a single `await cookies()` in the layout
still produces a ƒ route and a green build.

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
7. Make the page response cookie-free. Every `[l1]/[l2]` response currently
   carries three `set-cookie` headers from the middleware — `l1`, `l2` and
   `NEXT_LOCALE` ([proxy.ts:216-218](../../apps/web/src/proxy.ts#L216-L218)) —
   and a shared cache is generally unwilling to store a response that sets a
   cookie: one stored copy would hand the same cookie to every visitor, and for
   a session cookie that is a leak. The write therefore moved to the client: a small effect in the `[l1]/[l2]` layout writes the same three cookies
   after hydration, the way
   [locale-provider.tsx:75](../../apps/web/src/providers/locale-provider.tsx#L75)
   and [capacitor-redirect.tsx:44](../../apps/web/src/components/layout/capacitor-redirect.tsx#L44)
   already do. `/`, `/language-select` and the auth redirects keep setting them
   server-side — those responses are not cached.

   **Not in scope**: `lp_aff`, the affiliate attribution cookie. It is
   consent-gated and written by `POST /api/affiliate/consent` ([SPEC-102 §
   Cookie consent](102-affiliates-and-coupons.md#cookie-consent)), so it never
   rides on a page response.

**Implementation notes (2026-10-27, as shipped)** — four things only surfaced by
building it:

- **`app/not-found.tsx` must not read the request.** It is part of the tree of
  *every* route, so a single `cookies()` call there kept all 60 routes dynamic
  even with the `[l1]/[l2]` exports correct and no error in the build. The global
  404 is now static English (with `setRequestLocale('en')`, because next-intl
  otherwise falls back to `headers()`); localized 404s come from
  `[l1]/[l2]/not-found.tsx`, which has the app provider above it.
- **Pages that call `useSearchParams()` need a Suspense boundary above them** or
  prerendering bails out ("should be wrapped in a suspense boundary"). One
  boundary around `{children}` in the `[l1]/[l2]` layout covers every route that
  lacks its own `loading.tsx`; routes that have one keep the closer boundary.
- **`<html lang>` / `data-ui-lang` / `dir` are written by an inline pre-paint
  script** built from `SUPPORTED_L1S` and `location.pathname`, because the root
  layout has no access to `l1` without a request read. Nothing flashes — the
  script runs before the body parses — but the server HTML advertises `lang="en"`
  for the other 17 locales. **SPEC-080's `<html lang={l1.code}>` no longer
  describes this**; see the note added there.
- **Two pairs are seeded in `generateStaticParams`** (`en/ja`, `en/zh`) as a
  build-time canary: if a request-time API ever creeps into the subtree, the
  build fails instead of silently going dynamic.

Verified on the built output (`next build` + `next start`, 2026-10-27):
`/en/ja/explore` → `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000`, no
`set-cookie`; an unseeded pair (`/de/fr/explore`) → `MISS` then `HIT`; `/login`
still `no-store` (dynamic, correct — it varies by `Accept-Language`/cookie).

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

**Implementation notes (2026-10-27, as shipped)**: the two headers are set by a
shared helper, `src/lib/api-cache.ts` `cachedJson(body, { vary })`, so no route
can ship `Cache-Control` without a matching vary list. The collision this guards
against was **live**: `/api/videos/Qgzv_LBictg?l2=ja` and `?l2=zh` returned
byte-identical payloads with `Cache-Status: Netlify Durable; hit` on the second
(measured 2026-10-27) — that route had `Cache-Control` since before this spec and
no `Netlify-Vary`, so one language's captions were served for the other. Error
paths stay uncached: only the success return of each handler goes through
`cachedJson`, so a Flask 502 is never stored for an hour.

### Phase 4 — documentation and decision record

**Changes**

- `docs/arch/029-production-deployment-runbook.md` § 2 and § 11 — record the
  metered-add-on ladder (125k → Level 1 $25 → 2M → $19/500k), the
  `/sites/{id}/usage` recipe, and that page-level cost is a property of the
  rendering model, not a Netlify setting.
- [ADR-0051](../adr/0051-cacheable-app-shell.md) — the cacheable-shell decision:
  locale from the URL segment, `revalidate = false`, shell-only caching, and the
  five invariants that keep it true.
- This spec — status → complete, with measured before/after numbers.

**Acceptance**: ARCH-029's numbers match `/sites/{id}/usage` at cycle close.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| `output: 'export'` | Forbids middleware; kills route handlers and NextAuth |
| `prefetch={false}` on video cards | Trades navigation latency for invocations; Phase 2 makes prefetch free |
| Downgrading the add-on now | Blocked mid-cycle while usage exceeds 125k, and it re-upgrades at the next threshold crossing |
| Flask proxy for thumbnails | Satisfies ADR-0046 equally, but moves traffic onto VPS bandwidth, adds a trans-Pacific hop, couples thumbnails to Flask uptime, and cannot be expressed in fewer lines than the rewrite (D1) |
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

## Outcome (2026-10-27)

| Phase | Commit | What shipped |
|---|---|---|
| 1 | `920c0e4b` | Three CDN rewrites (thumbnails, glyph fonts); middleware no longer runs on `/api/*` or `/og` |
| 2 | `ffb8303f` | `[l1]/[l2]` shell is static: `requestLocale` + `generateStaticParams` + `revalidate = false`; `(public)` route group; cookie-free page responses; static global 404 |
| 3 | `a2da66e1` | Read-only API responses keyed on their real query params (`cachedJson`), fixing a live `?l2=` cache collision |
| 4 | this commit | ADR-0051, ARCH-029 § 2.2/§ 2.6, this outcome |

Verified locally on a production build (Phase 2):

- `/en/ja/explore` → `x-nextjs-cache: HIT`, `Cache-Control: s-maxage=31536000`,
  **no `set-cookie`**
- `/de/fr/explore` (unseeded pair) → `MISS` on first request, `HIT` after
- `/login` → `private, no-cache, no-store` (dynamic on purpose — it varies by
  `Accept-Language`/cookie)
- `/garbage` → 404, from the now-static global not-found

**Deploy verification (2026-10-27, deploy `6ae06c03` @ `4a88930d`)**

| Check | Result |
|---|---|
| `/en/ja/explore`, twice | `"Netlify Durable"; hit; ttl=31535895`, `"Next.js"; hit` — **Q4 answered: the page response is stored.** No `set-cookie` on any page. |
| `/de/fr/explore` (never visited) | `fwd=uri-miss; stored` → `hit; ttl=31535998` — on-demand generation is cached, as designed |
| Thumbnail `/api/asset-proxy/img.youtube.com/vi/<id>/mqdefault.jpg` | 200 `image/jpeg`, `cache-control: public,max-age=7200` (YouTube's own headers, so the proxy served it, not the function) |
| `/api/videos/<id>?l2=ja` vs `?l2=zh` | `Netlify-Vary: query=__nextDataReq\|_rsc\|l2`; `fwd=stale` vs `fwd=vary-miss` — **payloads now differ** (the live collision is gone) |
| Guest gating | `/en/ja/about` still sets `guest-nav-count=1` — server-enforced as intended |
| Classic adapter | `/en/ja/books` → 307 `https://v2.languageplayer.io/en/ja/books` |
| Invalid pair / login | `/xx/yy/explore` → 404, `/login` → 200 |

**Phase 1 partial rollback — the glyph-font rewrite.** `/api/glyph-font/manifest`
answers **429** with `copper-block-reason: Global blocklist` and
`retry-after: 300`: Netlify's firewall blocklists the literal path segment
`manifest` before the request reaches Flask, so the proxy can never work for that
endpoint. The immutable files (`/api/glyph-font/<hash>.woff2`) proxy fine
(200 `font/woff2`), but splitting the prefix is not expressible in a redirect
rule, so the whole glyph rewrite is reverted and the Next handler stays. The cost
is negligible: the manifest is one call per rare-glyph batch per session, and the
font bytes are browser-cached for a year. `/api/python/*` is unaffected — other
paths through the same origin return 200.

**Still pending, and why this spec stays `in progress`:**

- **Cycle close (2026-11-15)** — `/sites/{id}/usage` against the 403,611
  baseline. At 2026-10-27 09:23 UTC the cycle stood at 405,382 invocations
  (403,611 of which predate the deploy, and the deploy itself re-warmed the
  cache), so the next full cycle is the first honest number. Then this section
  gets it and the status moves to `complete`.

## Open Questions

_None open._

### Resolved

- **Q1 — closed 2026-10-27 by an isolated probe** (Next 16.3.0, webpack
  pipeline: a throwaway app, three builds, no repo changes). Results:

  | Probe route | Segment config | Build symbol |
  |---|---|---|
  | `/[a]/[b]` + child page, no exports | — | **○ Static** |
  | `/[a]/[b]` + child, no control flow | `generateStaticParams → []`, `dynamicParams`, `revalidate = false` | **● SSG** (children inherit it) |
  | same, with `await cookies()` in the layout, one real param | as above | **ƒ Dynamic** |
  | `forced/[d]`, `cookies()` in layout | `dynamic = 'force-static'` | **○ Static** |

  Conclusions: (a) `revalidate` alone is not enough — `generateStaticParams` is
  the opt-in, and an empty array is legal; (b) one export on the `[l1]/[l2]`
  layout covers every child page, so the 50 pages need no per-page export;
  (c) **but a request-time API anywhere in the tree silently flips the whole
  subtree back to ƒ with a green build** — which is why Phase 2 step 1 is a hard
  prerequisite, not an optimization; (d) `dynamic = 'force-static'` does survive
  `cookies()`, but only by making it return empty, which would resolve every
  visitor's locale to `en` — not a shortcut here.
- **Q2** — resolved by **D6**: keep the boundaries.
- **Q4** — resolved 2026-10-27 on the deployed site: the `[l1]/[l2]` page
  response is stored (`Netlify Durable; hit`, ttl ≈ 1 year). Phase 2 step 7 was
  implemented rather than merely verified — pages carry no `Set-Cookie` at all —
  so the question is moot for this subtree, and the guest counter remains the
  documented exception.
- **Q3** — resolved by **D7**: target headroom, not Level 0.
