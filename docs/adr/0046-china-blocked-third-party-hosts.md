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
| **Supabase Auth (`*.supabase.co`)** — the credential check behind `POST /auth/login` | It is not browser-loaded, so this audit never saw it: the browser calls Flask, Flask calls GoTrue (ADR-0023). The block lands on the machine running Flask instead. See the 2026-09-25 amendment. | Nothing client-side. A proxy/VPN on the host running Flask, or a China-reachable identity provider |

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

### Amendment — 2026-09-20: our own apex domain is blocked, at DNS and at SNI

Everything above audits third-party hosts the app *loads*. It never asked whether
`languageplayer.io` — the origin the app is served from — is reachable from
mainland China. It is not. Verified on 2026-09-20 from the development machine,
and there are two independent layers, either of which alone is fatal.

**Layer 1 — DNS poisoning.** Every plaintext resolver reachable from that network
returned a forged address drawn from the GFW's known poison pool (Twitter,
Facebook and Dropbox ranges):

| Resolver | Answer for `languageplayer.io` |
|---|---|
| `223.5.5.5` / `223.6.6.6` (AliDNS) | `104.244.46.5` |
| `119.29.29.29` (DNSPod) | `108.160.167.158` |
| `180.76.76.76` (Baidu) | `108.160.163.112` |
| `1.2.4.8` (CNNIC) | `104.244.46.185` |
| `101.226.4.6` / `218.30.118.6` (360) | `199.59.149.239` / `103.252.115.221` |
| `117.50.10.10` | `98.159.108.58` |
| `180.184.1.1` | `31.13.87.9` |
| `8.8.8.8` / `1.1.1.1` / `208.67.222.222` | `50.117.117.42` / `199.59.149.236` / `157.240.17.41` |
| `114.114.114.114` | no answer |

Two of those are properties of the poisoning rather than anecdotes, and both are
cheap to re-check:

- **The answers move.** Six repeats against a single resolver alternated between
  `162.125.80.5` and `104.244.46.5`, while `example.com` was stable across the
  same repeats. A record that changes between identical queries is injection, not
  a zone file.
- **A genuinely absent name is not forged.** A random `<junk>.io` returned a clean
  NXDOMAIN with no wildcard, so the forgery is keyed to this name specifically.

China's own DoH endpoints do not escape it — `dns.alidns.com` answered
`104.244.46.5`, `doh.pub` `199.59.148.7`, `doh.360.cn` `103.252.115.221` —
because what gets injected is their *outbound recursion*, not the client hop.
Every foreign DoH/DoT endpoint tried (`1.1.1.1`, `dns.google`,
`cloudflare-dns.com`, `doh.opendns.com`, `dns.quad9.net`, `doh.dns.sb`,
`dns.adguard-dns.com`) was transport-blocked outright. There is no encrypted
resolver reachable from here to ask.

The real record, read from outside the GFW:

```
languageplayer.io.       A     75.2.60.5
languageplayer.io.       NS    dns1.iwantmyname.com. dns2.iwantmyname.com. dns3.iwantmyname.com.
www.languageplayer.io.   CNAME zerotohero-nuxt.netlify.app.
v2.languageplayer.io.    CNAME zerotohero-nuxt.netlify.app.
```

**Do not expect this to match `language-player.netlify.app`.** They are different
Netlify front doors, by design:

| Hostname | Resolves to | Which front door |
|---|---|---|
| `languageplayer.io` (apex) | `75.2.60.5` | the **shared** load balancer — the A record Netlify documents for apex domains |
| `language-player.netlify.app` | `52.74.6.109`, `13.215.239.219` | the **regional** ALB, chosen by GeoDNS; asked from an EU vantage the same name gave `35.157.26.135`, `63.176.8.218` |

So "it should resolve to the same IP" is not a test of anything: the apex LB and
the per-site GeoDNS ALB differ by design, and a `*.netlify.app` answer depends on
where you ask from.

**Layer 2 — the SNI is reset.** This is the layer that makes DNS work beside the
point: handed the correct address, the connection still dies. `TCP:443` was open
to all five candidate IPs, and the reset lands inside the TLS ClientHello:

| SNI sent to `52.74.6.109:443` | Result |
|---|---|
| `language-player.netlify.app` | TLSv1.3 handshake completes |
| `totally-unrelated-xyz.example.com` | TLSv1.3 handshake completes |
| `languageplayer.io` | `write:errno=54` — reset while sending ClientHello |
| `www.languageplayer.io` | `write:errno=54` |

The unrelated-SNI control is the load-bearing one: an unknown name handshakes
fine, so Netlify is not rejecting anything — the `RST` is injected on-path by a
filter matching the literal string `languageplayer.io`. Identical against
`75.2.60.5`.

**What this rules out.** A `hosts` entry, a different resolver, `dig @<ns>`, DoH
to a Chinese provider, `curl --resolve` — every one of those is a DNS-side or
address-side fix, and the connection dies at the ClientHello regardless. Both
`--resolve` attempts (the real `75.2.60.5` and the netlify.app ALB IP) returned
`http=000`. A proxy or VPN whose tunnel carries the TLS is the only client-side
fix; nothing in this repository can change it.

**The reachable name for this deploy is `https://language-player.netlify.app/`.**
Verified `200` from the same machine on the same network, serving the same
deployment (`<title>Language Player — Learn languages through video</title>`).
Use that for any manual check from mainland China — `languageplayer.io` will fail
for reasons that have nothing to do with the code under test.

Three things to carry forward:

- **Test reachability by connecting, not by comparing resolved addresses.** An
  address comparison is both a false positive (the apex/ALB split above looks
  like a mismatch while being perfectly correct) and a false negative (it cannot
  see the SNI layer at all).
- **Correct DNS is not evidence of reachability.** A name can resolve perfectly
  and still be unroutable; "it resolved fine" means nothing until a request
  completes. This ADR's own audit only ever confirmed surfaces by completing one.
- **Our own origin is not exempt from the constraint this document is about.**
  The ADR is written as though only *third-party* hosts are at risk. The apex is
  blocked at both layers, so any future China-facing check that starts from
  `https://languageplayer.io` starts from a broken URL.

### Amendment — 2026-09-25: Supabase Auth (`*.supabase.co`) is blocked

Every audit above covers hosts the *browser* loads, plus our own apex. None of
them covers `*.supabase.co`, which is where credentials are actually verified
(ADR-0023: Flask proxies GoTrue). It is blocked — and unlike the entries in the
table above, this one breaks **sign-in**, not a rendered asset.

Found by diagnosing an admin-console login that reported `Invalid email or
password. Please try again.` for a correct email and password. The chain:

1. Browser: `POST /api/auth/callback/credentials` returned
   `{"url":"http://localhost:3100/login?error=CredentialsSignin&code=credentials"}`.
   The code is `credentials`, **not** `admin_only` — so `authorize()` had
   already failed before it ever evaluated the admin claim.
2. Flask: the same credentials sent straight to `POST /auth/login` returned
   `502` with
   `Supabase Auth unreachable: ('Connection aborted.', ConnectionResetError(54, 'Connection reset by peer'))`.

**The address was not the problem.** Unlike `languageplayer.io` above, DNS here
is clean — `tfugoojrqybaoukgpqza.supabase.co` resolved to genuine Cloudflare
addresses (`104.18.38.10`, `172.64.149.246`), so the DNS-poisoning layer is
absent and only the SNI layer applies. The same SNI control as before, against a
single edge IP:

| SNI sent to `104.18.38.10:443` | Result |
|---|---|
| `api.supabase.com` | HTTP 404 — TLS handshake completes |
| `tfugoojrqybaoukgpqza.supabase.co` | ClientHello written, then `Recv failure: Connection reset by peer` |

One IP answering a different SNI rules out "Cloudflare is rejecting us": the
`RST` arrives mid-handshake, injected on-path by a filter matching the literal
hostname. `supabase.com` and `vercel.com` loaded from the same machine, while
`github.com` and `google.com` timed out on it — the ordinary signature of this
network, not of a Supabase outage.

**Limitation, stated so it is not over-read.** A second *real* `*.supabase.co`
project could not be used as a control (a random name simply returned NXDOMAIN),
so the evidence shows this host is filtered; that the whole wildcard is filtered
is inferred from the pattern rather than measured. The practical conclusion is
unaffected either way: this project's auth host is unreachable here.

**What this changes about the ADR's premise.** Supabase Auth looked immune to
this document for a structural reason — the browser never contacts it — but the
constraint is about *any host the request path must reach*, and the request path
here ends at GoTrue. The relay remedy above does not help: Flask either runs on
a host inside the block or it does not. **On a development machine in mainland
China, every login flow proxied through a local Flask needs a proxy or VPN whose
tunnel carries the TLS; no code change substitutes for one.** Whether the
*deployed* Flask and `python.zerotohero.ca` are themselves China-reachable was
not tested here — this ADR already lists "our own hosts" as untested, and that
still stands.

One durable fix did come out of this, on the client side: `authorize()` in both
`apps/admin` and `apps/web` used to map every non-OK Flask response to `null`,
so a `502` and a wrong password were indistinguishable to the user. They now
raise `auth_unreachable` for `5xx` and report an unreachable auth server, while
`4xx` (GoTrue's `400` for a bad password, `429` for rate limiting) still means
the credentials were rejected.

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
