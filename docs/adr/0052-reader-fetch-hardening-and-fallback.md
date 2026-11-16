# ADR-0052 — The reader fetches pages through a hardened `/proxy` with a reader-service fallback

**Status:** Accepted (2026-11-16)
**See also:**
- [SPEC-087: Paginated Reader](../specs/087-paginated-reader.md) — §2 defines the shared fetch → markdown pipeline this ADR hardens
- [SPEC-031: Web Reader Reading Suggestions](../specs/031-reading-suggestions.md) — the curated-link verification rule that named the old `LanguagePlayer/1.0` UA
- [ADR-0046: The web app loads no third-party host that mainland China blocks](0046-china-blocked-third-party-hosts.md) — "an open fetcher is an SSRF hole"
- `zerotohero-python-server/utils_reader_fetch.py` — the implementation

---

## Context

The Web Reader loads any URL through Flask `GET /proxy`. Until this change the
endpoint was a bare `requests.get(url, headers={'User-Agent':
'LanguagePlayer/1.0'})`, and the clients ran the raw response through
`htmlToMarkdown`. That produced two user-visible failures and one security
hole.

**1. Production showed `HTTP 403`.** From the production host,
`https://pythonvps.zerotohero.ca/proxy?url=<Baidu Baike>` answered `403
{"error":"Upstream returned HTTP 403"}`. The web reader rendered
`e.message` verbatim (`apps/web/src/app/[l1]/[l2]/web-reader/page.tsx`), so the
user saw the protocol string instead of an explanation.

**2. Localhost failed silently.** Baidu answered the same URL with HTTP **200**
and its "Paris" anti-bot page: a real `<title>百度百科</title>` and a body with
no article text. `extractTitle()` returned the title, `htmlToMarkdown()`
returned `""`, so the reader set the title and showed an empty pane — no error,
no content. This is the general shape of a JavaScript challenge/interstitial
page, not a Baidu quirk: Zhihu answered 403, Medium answered a Cloudflare
"Just a moment…" page, and any page that returns a shell with no text reproduced
the blank reader.

**3. `/proxy` was an open fetcher.** It accepted any URL, including `file://`
and private/loopback hosts. ADR-0046 already states that an open fetcher is an
SSRF hole; the asset proxy was deliberately allowlisted for that reason, while
this endpoint was not.

Measurements taken on 2026-11-16 from a residential IP:

| Request | Result |
|---|---|
| `requests` + `LanguagePlayer/1.0` → Baidu Baike | 403, or 200 challenge page |
| `requests` + full Chrome headers + `Referer` + `Sec-Fetch-*` → Baidu Baike | **200, full article** (960 KB HTML) |
| Same, from the production host | 403 (IP reputation, not only headers) |
| `r.jina.ai/<url>` → Baidu Baike | 200, clean markdown (56 KB) |
| Headless Chromium on the same host → Baidu Baike | 403 "校验失败" (challenge still enforced) |

## Decision

**Harden the direct fetch; fail honestly; retry blocked pages through a
rendering reader service.**

1. **Validate every URL, including every redirect hop.** Only `http`/`https`,
   no embedded credentials, and every resolved address must be globally
   routable (`ipaddress.is_global`). `READER_ALLOW_PRIVATE_HOSTS=1` is a
   local-testing escape hatch only; the default is refuse. This closes the
   SSRF hole ADR-0046 identified.
2. **Send browser headers.** A current Chrome UA, `Accept`,
   `Accept-Language`, `Referer` (the target origin), and the
   `Sec-Fetch-*`/`Upgrade-Insecure-Requests` navigation headers. This alone
   turned Baidu from a challenge page into the full article on the residential
   test host, and fixed Medium and Reddit.
3. **Classify the response before handing it to the client.** A response is
   "blocked" when it is 401/403/429/451 or a known anti-bot page (Baidu
   `__PARIS_CHALLENGE_START__`/`百度安全验证`, Cloudflare `cf-mitigated`/"Just a
   moment…", DataDome, or a challenge `<title>` such as `安全验证` — the title
   signal only counts when the response is an error or the page has almost no
   visible text, so an article *about* captchas still reads). A blocked page is
   never returned as a 200 body.
4. **Retry blocked pages through Jina Reader** (`https://r.jina.ai/<url>`,
   configurable with `READER_FALLBACK_URL`, disabled with
   `READER_FALLBACK=0`). The service renders the page from its own network and
   returns markdown. Because the service can itself be blocked, its result is
   checked for a challenge title too; if it is blocked or empty, the reader
   gets the original `blocked` error rather than a challenge image.
5. **Markdown is signalled by the response content type.**
   `/proxy` returns `text/html` (direct) or `text/markdown; charset=utf-8`
   (fallback). `Content-Type` is CORS-safelisted, so no custom header needs
   exposing. `fetchReaderPage()` returns `{ text, format }`; both clients pass
   the result through the shared `readerPageMarkdown()`, which passes markdown
   through and runs the HTML converter otherwise.
6. **An unreadable page is an error, never a blank reader.** Empty markdown
   throws `ReaderFetchError(reason: 'empty')`. Failures are JSON
   `{error, reason, status}`; the clients map `blocked` to
   `msg.site_blocks_reading`, `empty` to `msg.page_has_no_readable_text`, and
   anything else to `msg.failed_to_load_url` (shared `readerErrorKey()`), always
   localized — never the raw `HTTP 403`.
7. **Cap the work.** 10 MB decompressed (`READER_MAX_BYTES`), 5 redirects,
   5 s connect / 20 s direct read, 10 s connect / 45 s fallback read.

## Consequences

**Positive**

- Baidu Baike reads end-to-end on the residential host without the fallback;
  the fallback covers the production IP-reputation case and other bot walls.
- The user sees a specific, translated message and never a blank pane or
  `HTTP 403`.
- `/proxy` no longer reaches private networks, and redirect hops are validated.
- One contract for web and mobile (`fetchReaderPage` → `readerPageMarkdown`).

**Negative / accepted**

- Blocked URLs are disclosed to a third party (Jina) and depend on its
  availability and rate limit (anonymously ~20 requests/minute). This is
  acceptable for public article URLs; it is not used for any authenticated or
  user-specific page. Set `READER_FALLBACK=0` to opt out.
- The service does not solve every wall: Zhihu blocks Jina too, and it cannot
  fix a login/paywall. Those pages now fail with an explanation.
- JavaScript-only SPAs that return a non-empty shell (nav text only) can still
  reach the client; the empty-content guard catches the fully blank case, not
  every partial shell.
- DNS is validated before each hop, but a rebinding race between validation and
  the socket connect is still theoretically possible; a fully pinned connection
  would need a custom transport.

**Rejected**

- *Browser headers only* — fixed Baidu on a residential IP but not the
  production 403, and does nothing for Cloudflare/DataDome.
- *Headless Chromium on the Flask host* — adds a ~300 MB browser to a shared
  host, and the measured result on this network was still the anti-bot
  challenge.
- *Client-side CORS proxy* — same network and SSRF problems, plus a third
  party in the browser.
- *Leaving `/proxy` open and only changing the UI* — leaves the SSRF hole and
  Baidu unreadable.

## Verification

- `test_reader_fetch.py` covers URL/private-host rejection, challenge
  detection (Baidu body, Cloudflare header, challenge title, bare 403, and the
  long-article false-positive guard), Jina-payload parsing, fallback/no-fallback
  paths, and the `/proxy` route contract (`text/markdown` on fallback, JSON
  reason on blocked).
- `packages/shared/src/markdown/fetch-page.test.ts` covers format detection,
  error `reason`/`status` propagation, the markdown pass-through, and the
  empty-page guard.
- Manual: load the Baidu Baike URL on localhost (direct, full article) and on
  production after deploy (fallback markdown, or a translated "site blocks
  automated reading" message if both fail).
