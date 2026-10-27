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
  locale; `[l1]/[l2]/layout.tsx` then sets `revalidate`.
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

### Phase 1 — CDN-level relays (config only, no behavior change)

`netlify.toml`, before the `/*` legacy rule:

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

`proxy.ts`: add `api/` and `og/` to the matcher exclusion list ([proxy.ts:267](../../apps/web/src/proxy.ts#L267)).
Those paths already early-return from `proxy()`, so this is pure edge-invocation
saving, not a behavior change.

### Phase 2 — cacheable app shell (the main fix)

1. `src/i18n.ts`: take `locale` from next-intl's `getRequestConfig({requestLocale})`
   instead of `cookies()`/`headers()`; delete the header-based `resolveTimeZone()`
   and use the existing `DEFAULT_TIME_ZONE` (Netlify sets neither
   `x-vercel-ip-timezone` nor `x-timezone`, so the fallback is already what every
   render gets — verify during implementation).
2. `[l1]/[l2]/layout.tsx`: `setRequestLocale(params.l1)` (next-intl 4.13.5
   exports it) so the locale is resolved from the segment, then
   `export const revalidate = 3600`.
3. Root layout: stop calling `getLocale()/getMessages()/getTimeZone()`. The intl
   provider moves to `[l1]/[l2]/layout.tsx` (locale known from params) and to a
   small provider layout for the non-language routes (login, register, docs,
   landing, …). `PublicHeader` moves with the public provider because it uses
   `useT()`.
4. Confirm `<html lang>` and `data-ui-lang` still match the URL for all 18 L1s
   (the locale switcher's `switchLocale()` path must keep working).

Expected effect: one render per `(l1, l2, route)` per hour instead of one per
request; prefetch and navigation are then served from the CDN edge.

### Phase 3 — cacheable read-only API responses

Add to `videos/[videoId]`, `videos/[videoId]/subtitles`, `videos/subscribed`,
`channels`, `channels/[channelId]` (and `recommend` only if it can be keyed):

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
Netlify-Vary: query=l2,level,page,page_size,clean_generated,channelIds
```

Per D4, never add `Cache-Control` without the matching `Netlify-Vary`.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| `output: 'export'` | No middleware, no route handlers, no NextAuth |
| `prefetch={false}` on video cards | Trades navigation latency for invocations; Phase 2 makes prefetch free |
| Downgrade the add-on now | Blocked mid-cycle while usage exceeds 125k, and it re-upgrades on the next threshold crossing |
| Migrating to credit-based plans | 20 credits/GB on 32 GB+ of bandwidth vs 1 TB included (D5) |
| Deleting the idle sites | `cheapbooze`, `czh-*`, `language-player-nitro`, 2 unnamed sites and `zerotohero-nuxt` have zero function usage — housekeeping, not savings |

## Phases

| Phase | Work | Expected invocations |
|---|---|---|
| 1 | 3 rewrites + matcher | every thumbnail and glyph-font call leaves the function |
| 2 | cacheable shell (D2/D3) | page renders, prefetches and navigations → ~1/pair/route/hour |
| 3 | API cache headers (D4) | repeat video/subtitle/channel reads → CDN |

## Verification

Measurement is totals-only — there is no per-route API. Use both:

```bash
# per-site metered usage (current cycle)
curl -s -H "Authorization: Bearer $NF_TOKEN" \
  "https://api.netlify.com/api/v1/sites/796f983a-ac9c-42e4-a066-5605d8b73e5c/usage"
```

and **Project → Functions → Metrics** in the dashboard. Checks per phase:

1. Phase 1: a thumbnail URL returns the image with **no** function invocation
   (`/sites/{id}/usage` unchanged after a burst of thumbnail fetches); the
   `lp_legacy` proxy and `/api/python/*` still work (SPEC-071 § 12 checklist).
2. Phase 2: the HTML for `/en/ja/explore` returns a **cacheable** response
   (`age > 0` / `cache-status: hit` on the second request) and `<html lang>`
   matches the URL for en/de/zh-Hans/ja; a second identical request adds no
   invocation.
3. Phase 3: `/api/videos/<id>?l2=ja` and `?l2=zh` return different payloads with
   `cache-status: hit` on repeats (guards D4).
4. Cycle close: `403,611 → < 125,000` would return the site to Level 0; anything
   lower than 2M keeps it at $25 flat.

## Acceptance criteria

- [ ] No thumbnail or glyph-font request invokes a function.
- [ ] A repeat page request for the same `(l1, l2, route)` within the revalidate
      window is served from the CDN (no function invocation).
- [ ] `<html lang>`/UI language still follow the URL; the language switcher still
      retranslates without a reload.
- [ ] Cached API responses vary on every query parameter that changes the payload.
- [ ] `language-player` drops below 125k/cycle, or — if traffic makes that
      impossible — stays well clear of the 2M threshold and the $19/500k ladder.
- [ ] `npx turbo typecheck` and `npm run build:check -w apps/web` pass.

## Files

- `netlify.toml` — Phase 1 rewrites
- `apps/web/src/proxy.ts` — matcher exclusions
- `apps/web/src/i18n.ts` — `requestLocale`, no request-time APIs
- `apps/web/src/app/layout.tsx` — drop locale resolution, move the provider
- `apps/web/src/app/[l1]/[l2]/layout.tsx` — `setRequestLocale`, `revalidate`
- `apps/web/src/app/api/{videos,channels}/**/route.ts` — Phase 3 headers
- `apps/web/src/components/layout/public-header.tsx` — moves with the public provider

## Risks

- **Shared cache entry leaks user state.** Safe today (no server-rendered user
  data); breaks the moment someone server-renders a session-scoped value under
  `[l1]/[l2]`. Mitigate with a comment in the layout and a review rule (D3).
- **Locale/provider restructure regresses i18n.** The root layout currently owns
  `<html lang>` and the message provider; moving them can flash English or
  hydrate mismatched. Verify all 18 L1s plus the switcher.
- **Wrong cache key on API routes** (D4) silently serves the wrong language.
- **Prefetch burst on deploy.** After Phase 2, a deploy invalidates cached shells
  and the first wave of prefetches re-renders them once. Expected, bounded.
- **`revalidate` interacts with `notFound()`** on invalid pairs; confirm 404s are
  not cached.

## Documentation to update

- ARCH-029 § 2 — add the metered-add-on economics (125k → Level 1 $25 → 2M →
  $19/500k) and the "measure with `/sites/{id}/usage`" recipe. It documents the
  deploy surface but says nothing about what it costs.
- ADR-0051 (number to be assigned) — the cacheable-shell decision (D2/D3), to be
  written if Phase 2 is approved; it is an architectural decision (rendering
  model + where locale is resolved), not just a spec detail.

## Open Questions

- **Q1**: Does `revalidate` alone (no `generateStaticParams`) give on-demand ISR
  for `[l1]/[l2]` routes in this Next 16 version, or must the layouts also export
  `generateStaticParams`? Verify on the first Phase 2 build before committing to
  the shape.
- **Q2**: Should the 9 `loading.tsx` boundaries stay once pages are cached? They
  keep prefetch enabled, which is now free — recommend keeping them.
- **Q3**: Is the residual, post-Phase-3 count likely to clear 125k? If traffic
  makes Level 0 unreachable, the target is the 2M ceiling, not $0.
