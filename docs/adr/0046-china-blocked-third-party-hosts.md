# ADR-0046 — The web app loads no third-party host that mainland China blocks

**Status:** Accepted (2026-09-15)
**See also:**
- [ADR-0011: Shared design tokens](../adr/0011-shared-design-tokens.md) — the font stack this builds on
- [ADR-0024: Use Bing image search](../adr/0024-use-bing-image-search.md) — the earlier "stop depending on Google scraping" decision
- [SPEC-080: Web `lang` attribute and glyph rendering](../specs/080-web-lang-attribute-glyph-rendering.md) — why the CJK stacks are OS font names
- [SPEC-094: External search](../specs/094-external-search.md) — the panel whose sources this ADR re-points
- [SPEC-072: Channels directory and subscriptions](../specs/072-channels-directory-and-subscriptions.md) — the existing `/channel-thumbnail` server-side polyfill

---

## Context

Language Player is used from mainland China, where large parts of the public
internet — every `google.com` and `youtube.com` host in particular — are
unreachable. Nothing in the repository had ever recorded that as a constraint,
so no audit existed and the question "does `apps/web` depend on a blocked host?"
had no answer.

An audit was run over `apps/web/src`, `apps/web/public`, `apps/web/next.config.js`
and the shared packages the app consumes, plus the built client chunks under
`.next/static/chunks` as a cross-check.

**What was verified safe already (do not re-litigate these):**

| Surface | Why it is already fine |
|---|---|
| Fonts | `apps/web/src/app/layout.tsx` uses `next/font/local` with four vendored Inter TTFs (`src/app/fonts/`), so neither the build nor the browser touches Google Fonts. There is no `@font-face`, no `@import url(...)` and no font `<link>` anywhere in the app. |
| CJK type | `globals.css` names OS fonts only (`PingFang SC`, `Hiragino Sans`, `Microsoft YaHei`, …). Nothing is downloaded, so nothing can be blocked. |
| Third-party scripts | None. No `<Script>`/`next/script` usage, no Analytics, no GTM, no Sentry, no reCAPTCHA, no CDN (jsDelivr/unpkg), no Google OAuth (`apps/web/src/auth.ts` is Credentials-only). |
| PDF worker | Bundled locally (`pdf-book.ts` resolves `pdfjs-dist/build/pdf.worker.min.mjs` through `import.meta.url`). |
| Stripe | `@stripe/stripe-js` is a declared dependency but is never imported; checkout is a plain redirect, so `js.stripe.com` is never loaded client-side. |
| Page text | Reader/article text is fetched through the Flask `/proxy`, so it is already relayed by our own server. |

**What was actually broken.** Every remaining dependency on a blocked host was
either a YouTube media host or a Google surface, and each one failed *silently*
— which is why this went unnoticed:

1. `<head>` carried `preconnect`/`dns-prefetch` hints for `www.youtube.com` and
   `i.ytimg.com`. From China these only open a handshake that can never finish.
2. Every video thumbnail (`youtubeThumbnail`, 9 call sites) and the watch page's
   `og:image` pointed at `img.youtube.com` — so with `l2=zh` (the natural
   pairing for a Chinese learner) *every* thumbnail in Explore, playlists, TV
   shows, watch history and liked videos was a broken image, and WeChat/Weibo
   link previews were blank.
3. Channel-avatar fallbacks used `https://www.youtube.com/favicon.ico`, so the
   fallback failed in exactly the environment it exists for.
4. The popup dictionary's External Search panel offered **Google Images** and
   **Google Ngrams** links (both dead from China) and drew its favicons from
   `www.google.com/s2/favicons`, so that panel rendered a column of blank icons.
5. Wiktionary pronunciation audio came from `commons.wikimedia.org`; all
   Wikimedia projects have been blocked in mainland China since 2019.

## Decision

**Our own origin is the only origin the browser may need on a first-party path.
A third-party host is acceptable when it is reachable from China; when it is
not, reach it through our own server, or stop using it.**

Concretely, in four rules:

1. **No `preconnect`/`dns-prefetch` to a blocked host.** The hints were removed
   rather than kept for the sake of visitors who *can* reach YouTube: a hint that
   cannot complete is worse than no hint.
2. **Blocked media is relayed same-origin through `/api/asset-proxy`.** The route
   (`apps/web/src/app/api/asset-proxy/[...target]/route.ts`) is addressed **by
   path** — `/api/asset-proxy/<host>/<path…>`, e.g.
   `/api/asset-proxy/img.youtube.com/vi/<videoId>/mqdefault.jpg` — and
   **validates the host against a hard allowlist**, fetches it server-side and
   streams the body back with the upstream content type and a long
   `cache-control`. It is deliberately not a general-purpose proxy: an open
   fetcher is an SSRF hole, so the allowlist (`img.youtube.com`, `i.ytimg.com`,
   `commons.wikimedia.org`, `upload.wikimedia.org`) grows only with a caller that
   needs it. `lib/asset-proxy.ts` owns both halves of the addressing scheme
   (`assetProxyUrl` for callers, `parseAssetProxyTarget` for the route) so the two
   ends cannot drift apart.
   - The asset identity is in the path and **not** in a query string — the
     original `?u=<absolute URL>` form collapsed in production, see the
     amendment below.
   - `youtubeThumbnail()` returns the relative proxy path, so `<img>` markup and
     layout are untouched at every call site.
   - `og:image` prefixes it with the site URL, because a crawler never resolves a
     relative URL against our origin.
   - `wiktionaryAudioUrl()` wraps `Special:FilePath` in the proxy; the proxy
     follows the redirect to `upload.wikimedia.org` server-side.
3. **A failed third-party asset gets a first-party fallback, not another
   third-party one.** The channel-avatar fallback is now
   `public/img/channel-placeholder.svg` — previously a YouTube favicon that
   could not load where the primary avatar could not load either.
   `faviconUrl()` in `packages/shared/src/external-search.ts` (and the local
   duplicates in the two web-reader screens) now asks the site itself via
   `https://<domain>/favicon.ico` instead of Google's `s2/favicons` service. A
   site without a root favicon shows no icon, which is what both apps already do
   on error.
4. **A blocked link is replaced if a reachable equivalent exists, and removed if
   it does not.** Google Images became Bing Images
   (`external.bing_images`), which is reachable from China and from everywhere
   else. Google Ngrams was removed outright — there is no comparable corpus —
   and its `NGRAM_CORPUS` table with it. Both removed keys
   (`external.google_images`, `external.usage_trends`) were deleted from
   `translations.csv` and the locale JSONs re-synced, rather than left as dead
   rows.

### Known remaining blockers (deliberate, not oversights)

These are *documented* rather than fixed, because each is a product or backend
decision rather than a client-side change:

| Blocker | Why it is still there | What fixing it needs |
|---|---|---|
| **The YouTube player itself** — `youtube-player.tsx` loads `https://www.youtube.com/iframe_api` and embeds `youtube.com/embed/…`; the streams come from `googlevideo.com` | The core media experience cannot be proxied client-side: the iframe, the API script and the video bytes are all on blocked hosts, and the player is licensed content served by YouTube | A decision about owning playback — a server-side stream/HLS proxy (legal + bandwidth + ToS) or a different source of video. Not a client patch. |
| `youtube.com/watch?v=…` links (`youtubeWatchUrl`, channel links) | They are *outbound* links to a blocked site; nothing on the page depends on them loading | Product decision: keep them for users who can reach YouTube, or route through an in-app player |
| `play.google.com` / `chromewebstore.google.com` CTAs on the landing page | Store links are only meaningful to users who can reach them; the stores themselves are not where Chinese users install apps | Product decision about a China distribution channel |
| `policies.google.com/privacy` in the legal text (`packages/docs`, all 18 locales) | It is a reference in the privacy policy, not a loaded resource | Self-host a copy of the referenced policy text |
| Reader article images keep their original hosts (`html-to-markdown.ts` `resolveImgSrc`) | Arbitrary third-party hosts; `upload.wikimedia.org` and Wikimedia article images are blocked, other hosts vary | An image proxy that accepts arbitrary hosts (needs the SSRF design this ADR deliberately avoided), or rewriting known-blocked hosts to a proxy |
| Live TV `logo`/HLS URLs are data-driven per channel (iptv-org) | Cannot be allowlisted statically; some channels are geo-blocked regardless | A per-channel proxy, or dropping the Chinese-blocked channels from the source list |
| Legacy Classic rewrite (`v2.languageplayer.io`) | `zerotohero-nuxt` loads Noto Serif SC from `fonts.gstatic.com` (194 refs, reference-only repo) | Vendoring those woff2 files locally — only matters if the legacy site is still served |

### The relay only works because our server is not in China

`/api/asset-proxy` fetches upstream from **our** server. That is the whole point:
from China the learner's browser cannot reach `img.youtube.com`, but Netlify
(US) can, so the browser asks our origin and we ask YouTube.

The consequence to keep in mind: **on a machine inside China, the relay cannot
work either** — the request only moves from a blocked browser to a blocked
server. Verified on 2026-09-15 from the development machine:

```
$ nslookup img.youtube.com      → 69.171.235.22       (a Facebook-owned range)
$ nslookup www.google.com       → 31.13.92.37         (likewise)
$ curl https://img.youtube.com/…  → TLS Client Hello, then stalls
```

That is DNS interception, not a small network. So in local development over such
a network, thumbnails still fail — now with a `502` from our own route instead of
a browser-level connection error — and the fix only becomes visible once the
route runs somewhere with real egress (Netlify, or any dev machine outside
China). Verified against a running dev server: the route is reachable and
enforces its allowlist (`403` for a host that is not allowlisted, `400` for a
malformed target or a stray query string), and the upstream fetch returned `502`.

### Amendment — 2026-09-16: the relay addresses its target by path, not by query

The first version of the relay took its target as `?u=<absolute URL>`. That
silently broke every thumbnail in the app in production, because **Netlify keys
the cached response on the path alone**:

| Request to `/api/asset-proxy`                  | Result               |
| ---------------------------------------------- | -------------------- |
| `?u=…/vi/dQw4w9WgXcQ/mqdefault.jpg`            | 200, 23,512 B        |
| `?u=…/vi/9bZkp7q19f0/mqdefault.jpg`            | 200, same 23,512 B   |
| `?u=…/vi/AAAAAAAAAAA/mqdefault.jpg` (bogus id) | 200, same 23,512 B   |
| no `u` at all (expected `400 Missing u`)       | 200, same 23,512 B   |
| `?u=https://evil.example.com/x.jpg` (403)      | 200, same 23,512 B   |

Every one of those answered `Netlify Durable; hit` with the same `age`
(~75,158 s) — one stored object, ~21 hours old, matching the deploy of this ADR.
Adding `&cachebust=1` changed nothing, and a path that had never been cached
answered `age: 1`. So the app served the first thumbnail ever fetched through the
route (a Thai video, poignantly) for every video in every language until the
entry expired — and because the cache answered before the handler ran, the host
allowlist was never consulted for those requests.

Two things to carry forward:

- **A cacheable function response must not depend on anything outside its own
  path.** Netlify's docs say query parameters are normally part of the key for
  serverless functions, and `Netlify-Vary: query` exists to force the issue;
  neither held here for this route under the Next runtime. The path is the one
  part that observably did.
- **A cache hit skips the handler, so guards inside the handler are not controls
  on cached responses.** A response must not be made cacheable unless its URL
  alone fully determines it.

## Consequences

### Positive

- Thumbnails, avatars, pronunciation audio, the external-search panel and link
  previews now work from mainland China, because the bytes are fetched by a
  server that is not behind the same block — see "the relay only works because
  our server is not in China" above. Nowhere else got slower: on a network that
  can reach YouTube, the only change is that the bytes arrive through our domain
  (server-cached, so often faster and one less handshake).
- The constraint is now written down with the file:line evidence for each
  surface, so "does this depend on a blocked host?" is answerable without
  re-running the audit.
- The proxy is allowlisted, size-capped and host-validated, and refuses anything
  that is not an `https` URL on a known host.

### Negative

- Thumbnail bytes now flow through our serverless function. They are cached for
  a week at the CDN edge, but a cold cache costs Netlify bandwidth that the
  browser used to spend directly.
- `faviconUrl` returns nothing for sites without a root `/favicon.ico`, so some
  external-search rows lose their icon where Google's service used to supply
  one. The reachable-and-blank cases swapped: icons are now worst where
  third-party favicon scraping was least standardised, and correct in China.
- Google Ngrams, a genuinely useful ngram/usage-trend source, no longer appears
  in the external-search panel for any user.
- `/api/asset-proxy` is a public, unauthenticated endpoint. It can only reach
  four allowlisted hostnames, but it is still a small amplification surface and
  should keep its size cap.

### Neutral

- `apps/mobile` inherits the shared changes (`faviconUrl`, the external-search
  link set) but not the web proxy, so mobile thumbnails and audio still go
  direct. Mobile thumbnails are the same blocked hosts on a network where that
  matters, and its reader has an offline path; a mobile-equivalent relay belongs
  to a separate decision.
- The audit distinguished "own host" from "blocked host" deliberately:
  `server.chinesezerotohero.com` (textbook media) and the Flask API are ours, and
  their reachability from China was **not** tested here.
