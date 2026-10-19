# Video Lemmatization Cache

## Metadata

- **Arch ID**: ARCH-034
- **Feature**: The whole-video lemmatization cache — server storage, two-tier offload, key rebinding, and the client in-memory token cache
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-10-16
- **Last Updated**: 2026-10-16
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)
- **Scope**: Flask backend (`zerotohero-python-server/`), Next.js Web, React Native Mobile. Classic and the archived GO app are reference only.
- **See also**:
  - [SPEC-061 — Supabase Video Lemmatization + Cache ID Rebinding](../specs/061-video-lemmatization-supabase-cache.md) — the migration this doc describes as-built
  - [SPEC-037 — Two-Tier Remote Cache with Cold Offload](../specs/037-two-tier-remote-cache-offload.md)
  - [SPEC-091 — Subtitle HTML-Entity Decoding](../specs/091-subtitle-html-entity-decoding.md)
  - [ARCH-016 — Server Tokenization Pipeline](016-server-tokenization.md)
  - [ARCH-017 — Tokenization Batch Lookup Pipeline](017-tokenization-batch-lookup-pipeline.md)
  - [ARCH-010 — Video Loading Pipeline](010-video-loading-pipeline.md)
  - [SPEC-019 — Mobile Tokenization & Batch Lookup Completion](../specs/019-mobile-tokenization-batch-lookup-completion.md) — tracks the open mobile video-cache wiring item
  - [ADR-0021 — Video Content Migration](<../adr/0021-migrate-video-content-to-supabase.md>)

---

## Overview

The video lemmatization cache is a **whole-video** cache: one request for a
video returns the lemmatized tokens for **every** subtitle line in it, keyed by
the MD5 of each line's text. It exists so the watch page never fires hundreds
of per-line lemmatization calls while a learner reads along — a 300-line
transcript resolves in a single HTTP request.

The key architectural insight is that there are **two levels of caching with
different keys**, and conflating them is the main source of confusion:

| Level | Key | Where |
|---|---|---|
| **Whole video** | `(iso639-3, video_id)` | Server disk + remote host |
| **Per subtitle line** | `md5(line_text)` | *Inside* the whole-video entry, and again in the client's in-memory `TokenCache` |

The outer key is the **video**; the inner keys are the **lines**. The server
entry's value is the raw per-lemmatizer output for each line
(`{md5: <raw>}`). The response the client receives is that same map with each
value normalized into the unified `{tokens: [...]}` schema.

This cache is deliberately **separate** from the per-text `lemmatization`
bucket, which serves `POST /lemmatize-normalized` and
`/lemmatize-normalized/batch`. The whole-video cache is never consulted by
those endpoints, and vice versa.

---

## Context

Three things shaped the current design, and each left a visible mark:

1. **The tokenizer engine has no version component in the cache key.** A
   whole-video entry written by an older engine keeps being served, because
   it is keyed only by `(lang, video_id)`. SPEC-061 addressed this with a
   per-language `v2/` namespace rather than a purge, so only languages whose
   output format actually changed pay a rebuild cost.
2. **The video IDs were consolidated during the Supabase migration**
   (SPEC-038/039, ADR-0021) into `new_id = prefix * 10^10 + old_id`. The
   existing cache was keyed by the *old* Directus IDs. Rather than rename
   hundreds of thousands of cache files across two unsynchronized stores,
   SPEC-061 translates IDs **at lookup time**, so old entries are reused
   verbatim.
3. **Subtitle text was being hashed inconsistently.** Clients hashed decoded
   text while the server hashed the raw CSV text, so keys never matched.
   SPEC-091 moved HTML-entity decoding to the Flask layer *before* md5 keying,
   making the server and client hash the same string.

The cache is also the reason the earlier `GET /lemmatize-video` endpoint still
exists: it is the raw, un-normalized variant that the disk-cache layer and the
archived GO app use.

---

## Data Flow

```
                    ┌──────────────────────────────────────────┐
  watch page        │  web: useVideoTokenCache(video.id, l2)   │
  (web / mobile)    │  mobile: useVideoTokenCache(videoId, l2) │
                    └───────────────────┬──────────────────────┘
                                        │  GET /lemmatize-video-normalized
                                        │       ?video_id & lang
                                        ▼
                    ┌──────────────────────────────────────────┐
                    │  routes/text_routes.py                    │
                    │  app_directus.get_and_lemmatize_...       │
                    └───────────────────┬──────────────────────┘
                                        │
                     ┌──────────────────┴───────────────────┐
                     ▼                                      ▼
      ┌───────────────────────────┐        ┌──────────────────────────────┐
      │ Supabase youtube_videos   │        │ cache_video_id(video_id)     │
      │ get_video_by_id(          │        │  consolidated -> old Directus│
      │   include_subs=True)      │        └──────────────┬───────────────┘
      └─────────────┬─────────────┘                       │
                    │ subs_l2 (CSV)                       │ cache key
                    ▼                                     ▼
      ┌───────────────────────────────────────────────────────────────────┐
      │ lemmatize_video(video, l2_code, cache_id)                         │
      │   key = {iso639-3}/{old_id}   (+ v2/ prefix for kor, lzh)         │
      │                                                                   │
      │   remote_cache.get_json('lemmatized_subs', key)                   │
      │        ├── local  cache/lemmatized_subs/...   (hit -> return)     │
      │        └── remote load-flask-cache.php        (hit -> return,     │
      │                                                NO copy-back)     │
      │   on miss: decode entities -> md5(line) -> lemmatize each line    │
      │            -> save locally only                                   │
      └───────────────────────────────┬───────────────────────────────────┘
                                      │  { md5: raw lemmatizer output }
                                      ▼
      ┌───────────────────────────────────────────────────────────────────┐
      │ normalize_by_lang(raw, l2, text=original_line)                    │
      │   -> { md5: { tokens: LemmatizedToken[] } }  (spaces recovered)   │
      └───────────────────────────────┬───────────────────────────────────┘
                                      ▼
                    ┌──────────────────────────────────────────┐
                    │  client TokenCache (in-memory, md5-keyed)│
                    │  TokenizedText: cache.get(lineText)      │
                    │    hit  -> render                        │
                    │    miss -> enqueueLemmatize -> /batch    │
                    └──────────────────────────────────────────┘
```

### Flow Steps

1. **Fetch the video + subs from Supabase** — `app_directus._fetch_video_with_subs()`
   calls `utils_content.get_video_by_id(conn, video_id, l2_code, include_subs=True)`.
   `resolve_video_id()` remaps legacy IDs (`< 10^10`) and passes consolidated
   IDs through.
2. **Translate the cache key** — `cache_video_id(video_id)` maps a consolidated
   ID back to its old Directus ID so pre-migration cache entries still hit.
3. **Read the cache** — `utils_cache.load_from_lemmatized_subs_cache()` →
   `remote_cache.get_json('lemmatized_subs', key)`: local disk first, then the
   shared host. Remote failures and non-UTF-8 entries are treated as misses.
4. **On miss, lemmatize every line** — decode HTML entities, `md5(decoded_line)`
   as the key, run the language lemmatizer, assemble the hash table.
5. **Write locally only** — `save_to_lemmatized_subs_cache()` writes to local
   disk. The offload job is the only component that writes to the shared host
   outside the request path.
6. **Normalize** — `/lemmatize-video-normalized` runs each raw line through
   `lemmatize_unified.normalize_by_lang(..., text=original_line)`, which
   recovers spaces so the output matches `/lemmatize-normalized`.
7. **Populate the client cache** — the response fills a client-side
   `TokenCache`; `TokenizedText` looks up `md5(lineText)` and only falls back to
   the batch pipeline on a miss.

### The second writer: admin video import (SPEC-096)

`POST /admin/videos/add` (and its batch / channel / playlist siblings) writes
a whole-video entry at **insert time**, before the video is ever watched:

- the id is allocated by the importer (SPEC-038 prefix block), and the cache
  key is `cache_video_id(new_id)` — the legacy Directus id — so the first
  watch-page request hits the entry instead of re-lemmatizing the transcript;
- `utils_video_lemma.get_lemmas_from_video()` was changed to translate the
  key the same way. It used the raw `video['id']`, so a consolidated id would
  have been written (and looked up) under the *new* id, and every lookup from
  the watch page — which translates the id back — would have missed;
- the write goes through the same `save_to_lemmatized_subs_cache()`, so it is
  local-only and the offload job owns the shared host.


### Key Design Decisions

| Decision | Rationale |
|---|---|
| Cache the **whole video**, not per line | One request per video instead of ~300; a transcript is a closed, known set of lines up front. |
| Key the *outer* entry by `(lang, video_id)` | Survives subtitle edits only at the cost of a rebuild; trivial to look up from the watch page. |
| Key the *inner* entries by `md5(line_text)` | Identical lines across the transcript share one entry; the client can hash a line locally with no server round-trip. |
| Translate IDs at lookup time (not rename files) | The remote API has no list/rename/batch-move, and local/remote are not synchronized copies, so a rename cannot be atomic. |
| Store **raw** lemmatizer output; normalize on read | The raw value is engine-agnostic and reusable; normalizing at read lets the schema evolve without invalidating the cache. |
| Writes are local-only; offload is a separate job | Keeps the request path fast and keeps the shared host as a pure overflow tier. |
| No remote→local copy-back on a remote hit | Avoids write amplification and keeps local disk small; the cost is remote latency on every read of an offloaded entry. |
| Version the namespace per language (`v2/`), not globally | Only `kor` and `lzh` changed output format; a global bump would discard every other language's cache for nothing. |
| Decode HTML entities **before** hashing | The client hashes decoded text; the server must produce the same keys or every lookup misses (SPEC-091). |

---

## Cache Layers

| Layer | Key | Value | Location | Invalidation |
|---|---|---|---|---|
| **Whole-video** (`lemmatized_subs`) | `{iso639-3}/{video_id}`, or `v2/...` for `kor`/`lzh` | JSON `{md5(line): raw lemmatizer output}` | Local disk + shared host | Version namespace bump; deleted on subtitle/L2 edit and on video delete (SPEC-106); manual delete |
| **Per-text** (`lemmatization`) | `{lemmatizer_name}/{lang}/{md5(text)}` | JSON raw lemmatizer output | Local disk + shared host | Manual deletion only |
| **Inflection** (`inflection`) | `{inflector_name}/{lang}/{md5(text)}` | JSON inflection table | Local disk + shared host | Manual deletion only |
| **Client in-memory** (`TokenCache`) | `md5(line_text)` | `LemmatizedToken[]` | Browser / app memory | Discarded on unmount or `videoId` change |
| **Web module cache** (`lemmatizeCache`) | `` `${l2Code}:${text}` `` | `LemmatizedToken[]` | Web JS module scope | Lives for the page session |

The two server-side keys are easy to confuse. A whole-video entry is
`lemmatized_subs/kor/67`; a per-line entry is
`lemmatization/kiwi/kor/9f2c…`. They live in different buckets and are written
by different code paths.

---

## Server-Side Storage

### Two-tier read/write — `remote_cache.py`

```
read:   local cache/{bucket}/{key}  ──miss──▶  GET  load-flask-cache.php   ──miss──▶ compute
write:  local cache/{bucket}/{key}  (only)     [offload job handles the host]
```

- **Host**: `REMOTE_CACHE_HOST`, default `https://server.chinesezerotohero.com`.
- **Local root**: `LP_CACHE_ROOT`, default `cache`.
- **PHP endpoints**: `load-flask-cache.php` (GET), `save-flask-cache.php` (POST),
  `load-flask-cache-batch.php` (defined in `remote_cache.py` but currently
  unused), `delete-flask-cache.php` (DELETE).
- **Auth**: `X-Cache-Key` header, from `REMOTE_CACHE_KEY` or `~/.lp_cache_key`.
- **Sanitization**: bucket `[a-z0-9_-]`; each key segment `[A-Za-z0-9._-]`.
  A key with an empty segment returns `None` (no path traversal).
- **Timeouts**: get 5s, offload 60s, delete 10s.
- **Failure policy**: every remote failure is non-fatal — a timeout or
  connection error is a cache **miss**, and the caller recomputes. A stored
  entry that is not valid UTF-8 is also treated as a miss rather than raising.

Note the endpoint drift from SPEC-037/ARCH-016, which document a dedicated
`load-lemmatized-subs-cache.php`. The implementation now uses the **generic**
`load-flask-cache.php` with `bucket=lemmatized_subs` for every bucket.

### Cold offload — `prune_cache.py`

Run on the Flask VPS via cron (every 6 hours per SPEC-037). Keeps each local
bucket under a size cap:

- `lemmatization` → **2 GiB**; every other bucket (including
  `lemmatized_subs`) → **1 GiB**.
- Sizes use allocated blocks (`st_blocks * 512`), so the caps reflect real disk
  usage rather than apparent size.
- When a bucket is over its cap, files are sorted by **mtime, oldest first**,
  and offloaded via `remote_cache.remote_offload()`.
- A local file is deleted **only after** the remote save succeeds. If the host
  is unreachable, the file is kept and retried on the next run (the loop
  `break`s, so a single failure stops that bucket's pass).
- Empty directories are pruned after offloading.
- Flags: `--dry-run`, `--bucket NAME`.

`/home` on the VPS is mounted `noatime`, so the filesystem does not track
reads; **mtime (last write) is the coldness signal**, not last access.

Two implementation notes that differ from SPEC-037's description:
`prune_cache.py` hardcodes `CACHE_ROOT = 'cache'` (it ignores
`LP_CACHE_ROOT`), and it has no internal log file — it prints a per-bucket
summary to stdout/stderr, so the documented `logs/cache_prune.log` depends on
the cron redirect rather than the script.

### Cache ID rebinding (SPEC-061)

```python
KNOWN_VIDEO_ID_PREFIXES = frozenset(range(1, 15))

def cache_video_id(video_id, l2_code=None):
    # < 10**10                -> unchanged          (old Directus ID)
    # >= 10**10, known prefix -> video_id % 10**10  (consolidated -> old ID)
    # unknown prefix          -> unchanged          (never guess)
```

The inverse direction lives in `utils_user_data.remap_video_id(lang, old_id)`:

```python
new_id = L2_PREFIX_BY_CODE[code] * 10**10 + old_id      # old -> consolidated
```

`_resolve_l2_code()` normalizes ISO 639-1 / 639-3 / glottolog codes **and**
legacy numeric Directus language IDs, and raises `ValueError` for an unknown
language. A valid code that is absent from the 29-entry map correctly resolves
to prefix 1 (the base `youtube_videos` table).

### Entity decoding and key construction (SPEC-091)

Decoding happens **before** hashing on both sides of the cache:

- `utils_video_lemma.lemmatize_video()` / `get_lemmas_from_video()` decode each
  subtitle line before computing its md5 key.
- `get_and_lemmatize_video_by_id_normalized()` builds its space-recovery
  `text_by_hash` map from the same decoded text.

Legacy entries keyed on raw (undecoded) text simply miss and are rebuilt
naturally — SPEC-091 deliberately did not purge `lemmatized_subs`, since a
purge would only cost re-lemmatization on next access.

---

## API Endpoints

| Endpoint | Method | Purpose | Input | Output | Cache |
|---|---|---|---|---|---|
| `/lemmatize-video` | GET | **Legacy.** Raw per-lemmatizer output | `?video_id&lang` (Directus ID) | `{md5: raw}` | `lemmatized_subs` |
| `/lemmatize-video-legacy` | GET | Alias of the above | same | same | same |
| `/lemmatize-video-normalized` | GET | Unified tokens for a whole video | `?video_id&lang` (consolidated ID) | `{md5: {tokens}}` | same cache |
| `/lemmatize-normalized` | POST | Single line/string | `{text, l2}` | `{tokens}` | `lemmatization` |
| `/lemmatize-normalized/batch` | POST | Many strings | `{texts, l2}` | `{results}` | `lemmatization` |

Both video endpoints share one underlying cache entry. Unknown videos return
`200 null`.

Legacy raw values **may be JSON-stringified**, so a consumer of the
`/lemmatize-video` shape must `json.loads` each value — the normalized endpoint
does exactly that (`if isinstance(raw_tokens, str): raw_tokens = json.loads(...)`).

---

## Client-Side Cache

### Shared class — `packages/utils/src/token-cache.ts`

Used by **web**. Keyed by `md5(text)`, matching the server keys exactly:

```ts
load(hashTable)   // stores only entries with tokens.length > 0
get(text)         // md5(text) -> LemmatizedToken[] | undefined
has(text) / size / clear()
```

`load()` deliberately skips entries with no tokens, so an empty result is not
cached as a hit.

### Web — `useVideoTokenCache` + the fallback chain

`apps/web/src/hooks/use-video-token-cache.ts`:

- Takes `videoId` = the **Directus/Supabase video ID, not the YouTube ID**.
- Fetches once per `videoId`; guards against a duplicate in-flight fetch.
- When `videoId` is absent (an imported/YouTube-only video not in the DB), it
  marks the cache as loaded immediately with an empty cache, so `TokenizedText`
  falls through to on-the-fly lemmatization instead of waiting forever.
- On fetch failure it logs and still marks `loaded`, so rendering proceeds.

`TokenizedText` resolves a line through this chain
(`apps/web/src/components/tokenized-text.tsx`, `lib/lemmatize-queue.ts`):

```
1. video TokenCache.get(line)                  ← in-memory, md5-keyed
2. lemmatizeCache.get(`${l2}:${line}`)         ← module-level session cache
3. lemmatizeInflight.get(key)                  ← in-flight dedup
4. enqueueLemmatize -> POST /lemmatize-normalized/batch
      (max 12 per flush, 60 ms debounce, grouped by l2)
5. per-line POST /lemmatize-normalized         ← only if the batch request fails
```

Step 3 is what prevents a thundering herd: when 300 `TokenizedText` instances
mount at once, the first issues the request and the other 299 await the same
promise. Step 5 is a last resort — the batch failing is the only way to reach
it.

While `tokenCacheLoaded === false`, `TokenizedText` deliberately renders plain
text and makes **no** API calls; when the flag flips, the effect re-fires and
hits the now-populated cache.

### Mobile — `apps/mobile/hooks/use-video-token-cache.ts`

Ported from web with two differences: it resets the cache and marks `loaded`
false when `videoId` changes (avoiding stale data from the previous video), and
it aborts in-flight fetches via `AbortController`. **Its `TokenCache` is a
private inline class rather than the shared one — see Known Issues.**

### Chrome extension

Does **not** use the whole-video cache. It owns a debounced batch cache
(`apps/chrome-extension/src/use-batch-lemmatize.ts`) that calls
`/lemmatize-normalized/batch` directly, plus a page-tokenizer path in
`page-content.js`.

---

## Consumers

| Client | Endpoint | Notes |
|---|---|---|
| Web (`apps/web`) | `/lemmatize-video-normalized` | Via `getVideoTokenCache()` and the shared `TokenCache` |
| Mobile (`apps/mobile`) | `/lemmatize-video-normalized` | Via `getVideoTokenCache()`; cache lookups currently always miss |
| Chrome extension | `/lemmatize-normalized/batch` | No whole-video cache |
| Archived GO app (`apps/mobile-go-legacy`) | `/lemmatize-video` | The only caller of the raw endpoint |

---

## Known Issues

### 1. Mobile never gets a video-cache hit

`apps/mobile/hooks/use-video-token-cache.ts` defines its own `TokenCache`:

```ts
class TokenCache {
  private _cache = new Map<string, any>();
  load(data) { for (const [key, value] of Object.entries(data)) this._cache.set(key, value); }
  get(text) { return this._cache.get(text); }   // ← no md5!
  has(text) { return this._cache.has(text); }
}
```

The server returns keys that are **md5 hashes**, but `get(text)` looks up the
**raw line text**, and `apps/mobile/components/TokenizedText.tsx:1078` calls
`tc.get(effectiveText)`. So the lookup cannot match. Even if it did, `load()`
stores the whole `{tokens: [...]}` envelope while the call site tests
`cached.length > 0` — `undefined` — so the hit would be discarded anyway.
Net effect: mobile always falls through to the `enqueueLemmatize` batch
pipeline, and the fetched video cache is dead weight at runtime.

This is derived from static reading, not a runtime trace; the fix is for mobile
to use the shared `TokenCache` from `@langplayer/utils` (or `md5()` its lookup
key and unwrap `.tokens`).

**This is the root cause of an open item in SPEC-019.** Its Phase 1 task
"Wire video token cache through to subtitles" (which was expected to cut
API calls per video from ~500 to ~2) is still unchecked in that spec's
checklist. The wiring — hook, props, and `tokenCacheLoaded` gating — is all
present; only the key derivation is wrong, so the optimization is inert rather
than absent.

Note that `packages/shared/src/types.ts` declares
`get(text: string): LemmatizedToken[] | undefined`, which the non-hashing class
satisfies structurally — the interface cannot express "must hash before
lookup", so TypeScript does not catch this.

### 2. Stale comment about space tokens

`packages/shared/src/types.ts:182-184` states that
`/lemmatize-video-normalized` "does NOT include spaces". That is no longer
true: `normalize_by_lang()` recovers spaces whenever it receives the original
text (`lemmatize_unified.py:642-645`, explicitly so the video path "matches
/lemmatize-normalized"), and `get_and_lemmatize_video_by_id_normalized()`
passes `text=original_text`. The *stored* cache value has no spaces — the
recovered spaces are added at read time — which is likely what the comment
originally described.

### 3. Unversioned caches for every language except `kor` and `lzh`

The key has no engine-version component. Any future change to a lemmatizer's
raw output shape will silently serve stale entries for that language until its
namespace is bumped by hand. The per-language `v2/` mechanism exists, but
nothing enforces its use.

### 4. `cache_video_id()` ignores `l2_code`

The helper accepts `l2_code` but decides purely on the numeric prefix
(`KNOWN_VIDEO_ID_PREFIXES = 1..14`), rather than consulting
`L2_PREFIX_BY_CODE`. It is correct for every real consolidated ID, but the
unused parameter suggests an intent that was not implemented — and a
consolidated ID whose prefix falls outside 1–14 would be returned unchanged,
producing a cache key under the new ID.

### 5. No remote→local copy-back

By design (SPEC-037), a remote hit is not written back to local disk. An entry
that has been offloaded is therefore served over the network on **every**
subsequent read, until it is recomputed or the local entry is recreated. Under
sustained traffic for an offloaded video this trades local disk for repeated
remote latency.

### 6. Minor inconsistencies

- `remote_cache._BATCH_URL` (`load-flask-cache-batch.php`) is defined but
  unused; the batched text-lookup path SPEC-037 described is not wired up.
- `prune_cache.py` hardcodes `CACHE_ROOT = 'cache'` and ignores the
  `LP_CACHE_ROOT` env var that `remote_cache.py` honors.
- SPEC-037/ARCH-016 still document the retired dedicated
  `load-lemmatized-subs-cache.php` endpoint name.

---

## Key Files

| File | Role |
|---|---|
| `zerotohero-python-server/routes/text_routes.py` | `/lemmatize-video`, `/lemmatize-video-legacy`, `/lemmatize-video-normalized`, `/lemmatize-normalized[/batch]` handlers |
| `zerotohero-python-server/utils_video_import.py` | Second writer: populates the cache when an admin imports a video (SPEC-096) |
| `zerotohero-python-server/routes/admin.py` | `/admin/videos/add[-batch]`, `/admin/channels/add`, `/admin/playlists/add` |
| `zerotohero-python-server/app_directus.py` | `_fetch_video_with_subs()`, `get_and_lemmatize_video_by_id[_normalized]()` — fetch, key rebinding, normalization |
| `zerotohero-python-server/utils_video_lemma.py` | `cache_video_id()`, `lemmatize_video()` — cache read/write, entity decode, md5 keying |
| `zerotohero-python-server/utils_cache.py` | Bucket wrappers; `_lemmatized_subs_key()` owns the `v2/` namespacing rule |
| `zerotohero-python-server/remote_cache.py` | Two-tier local/remote storage, sanitization, non-fatal failure policy |
| `zerotohero-python-server/prune_cache.py` | Cron cold-offload job and per-bucket size caps |
| `zerotohero-python-server/utils_content.py` | `get_video_by_id(..., include_subs=True)`, `resolve_video_id()` |
| `zerotohero-python-server/utils_user_data.py` | `L2_PREFIX_BY_CODE`, `_resolve_l2_code()`, `remap_video_id()` |
| `zerotohero-python-server/lemmatize_unified.py` | `normalize_by_lang()`, `_recover_spaces()` — raw → unified schema |
| `zerotohero-python-server/test_video_id_remap.py` | Regression tests: prefix map, ID round-trip, cache key versioning |
| `packages/utils/src/token-cache.ts` | Shared client `TokenCache` (md5-keyed) |
| `packages/api-client/src/videos.ts` | `getVideoTokenCache()` → `/lemmatize-video-normalized` |
| `apps/web/src/hooks/use-video-token-cache.ts` | Web fetch + cache population |
| `apps/web/src/lib/lemmatize-queue.ts` | Batch queue, per-line fallback, in-flight dedup |
| `apps/mobile/hooks/use-video-token-cache.ts` | Mobile fetch + (non-hashing) cache |
| `packages/shared/src/types.ts` | `TokenCache` interface, `LemmatizedToken`, response-shape notes |

---

## Consequences

### Pros

- **One request per video.** A full transcript resolves without per-line calls,
  which is what makes the watch page viable on mobile connections.
- **Cross-line deduplication.** Identical subtitle lines hash to the same key
  and are lemmatized once, not per occurrence.
- **Migration-free ID rebinding.** Hundreds of thousands of pre-Supabase cache
  entries were reused with no file movement and no atomic-rename problem.
- **Small local disk.** The offload job bounds the VPS cache, and writes stay
  local-only so the request path never blocks on the shared host.
- **Graceful degradation.** Remote failure → recompute; entity mismatch → miss
  and rebuild; fetch failure → per-line fallback. No cache problem becomes a
  500.
- **Selective invalidation.** Per-language `v2/` namespacing discards only the
  caches that a real engine change invalidated.

### Cons / Risks

- **The key carries no engine version.** Silent staleness is the default for
  any language not explicitly bumped (Known Issue 3).
- **Mobile's cache is inert** (Known Issue 1) — the mobile watch page pays the
  batch-pipeline cost the cache was built to avoid.
- **Cold-read latency after offload** with no copy-back (Known Issue 5).
- **Whole-video granularity.** One corrupt line or one subtitle edit
  invalidates the entire video's entry, and there is no partial refresh. Since
  SPEC-106 the subtitle/L2 edit path deletes the entry (`utils_cache.delete_from_lemmatized_subs_cache`)
  and recomputes it synchronously.
- **Two ID spaces coexist indefinitely.** Every caller must know whether it
  holds a legacy or consolidated ID; `cache_video_id()` exists precisely
  because that is error-prone.
- **Legacy raw format still in production.** `/lemmatize-video` returns
  JSON-stringified values in a non-unified schema, and one archived client
  still depends on it — so the format cannot be retired yet.

### Migration Notes

If the whole-video cache is ever retired or restructured:

1. `cache_video_id()` / `remap_video_id()` become removable only once no cache
   entry is keyed by a legacy Directus ID **and** the archived GO app stops
   calling `/lemmatize-video`.
2. A global namespace bump (`v3/`) is the cheap escape hatch — it abandons all
   existing entries at once, which is acceptable only if a full re-lemmatization
   pass is affordable.
3. Anything replacing the client cache must keep `md5(text)` lookup semantics,
   or it will silently never hit (the mobile bug is the cautionary example).

---

## Open Questions

- Should mobile switch to the shared `TokenCache`, or is the batch pipeline
  fast enough that the video cache should simply be dropped there?
- Should the `v2/` namespacing rule be driven by a per-language engine-version
  registry rather than a hardcoded `('kor', 'lzh')` tuple?
- Is a remote→local copy-back worth adding for offloaded entries that are read
  repeatedly?
- Should `/lemmatize-video` accept consolidated IDs directly, or keep strictly
  requiring old Directus IDs? (Also open in SPEC-061.)
- Should the `TokenCache` interface express the md5 contract so a
  non-hashing implementation fails to typecheck?

---

## Related Documents

- [SPEC-061 — Supabase Video Lemmatization + Cache ID Rebinding](../specs/061-video-lemmatization-supabase-cache.md)
- [SPEC-037 — Two-Tier Remote Cache with Cold Offload](../specs/037-two-tier-remote-cache-offload.md)
- [SPEC-091 — Subtitle HTML-Entity Decoding](../specs/091-subtitle-html-entity-decoding.md)
- [SPEC-038 — Video Content Supabase Migration](../specs/038-video-content-supabase.md)
- [ARCH-016 — Server Tokenization Pipeline](016-server-tokenization.md)
- [ARCH-017 — Tokenization Batch Lookup Pipeline](017-tokenization-batch-lookup-pipeline.md)
- [ARCH-010 — Video Loading Pipeline](010-video-loading-pipeline.md)
- [SPEC-019 — Mobile Tokenization & Batch Lookup Completion](../specs/019-mobile-tokenization-batch-lookup-completion.md)
- [ADR-0021 — Video Content Migration](<../adr/0021-migrate-video-content-to-supabase.md>)
