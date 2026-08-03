# 037 - Two-Tier Remote Cache with Cold Offload

Status: Implemented (August 2026)

## Context

The production Flask server (`zerotohero-python` on the DreamHost VPS) keeps
every cache on local disk under `cache/`. The largest consumers are:

| Bucket | Local size (approx.) | Notes |
|---|---:|---|
| `lemmatization` | 20G | Per-text lemmatizer output, per lemmatizer + language |
| `caption` | 9.1G | Generated video captions/transcripts |
| `chatgpt` | 4.4G | Dictionary / explanation LLM responses |
| `translation_chatgpt` | 1.6G | LLM translations |
| `translation` | 1.5G | Azure/other translations |
| `subs_search` | 1.5G | Subtitle search results |
| `lemmatized_subs` | 0.6G | Local copy; remote PHP cache is primary |
| Everything else | ~0.8G | Images, avatars, inflection, mistral, etc. |

The VPS has run out of headroom under its quota. The shared hosting server
(`server.chinesezerotohero.com`) has ~5.8T free and already hosts a remote
lemmatized-subs cache, so it is the natural overflow target.

## Goals

- Keep hot cache data on the Flask server's local disk for speed.
- Use the shared host as a remote fallback and as the destination for cold
  cache data.
- Automatically offload files not used recently so the local disk stays small.
- Move all existing cache buckets, not just `lemmatized_subs`.

## Non-Goals

- Removing the local cache entirely.
- Rewriting cache invalidation semantics.
- Changing what is cached, only where it lives and how it is found.

## Read / Write Flow

Every cache read goes through the same two-tier path:

1. Check Flask's local `cache/` directory.
2. On local miss, GET the entry from the shared host.
3. On remote hit, return the entry. Do **not** copy it back to local disk.
4. On remote miss, compute the value and save it to **local disk only**.

Every cache write is local-only. The offload job is the only component that
writes to the shared host outside the request path.

## Shared Host API

New PHP endpoints under `~/server.chinesezerotohero.com/`:

- `load-flask-cache.php` — GET `bucket` + `key`, returns raw file contents or
  `null`.
- `save-flask-cache.php` — POST raw body with `bucket` + `key` query params,
  writes `~/zerotohero-server-flask-cache/{bucket}/{key}`.
- `load-flask-cache-batch.php` — POST JSON `{"items":[{"bucket","key"}, ...]}`,
  returns `{"results":[...]}` for batched text lookups.
- `delete-flask-cache.php` — DELETE `bucket` + `key`, used for tests and
  invalidation.

All endpoints require an `X-Cache-Key` header matching the `cacheKey` value in
`apikeys.json` (gitignored). `apikeys.example.json` documents the field.

Bucket names are restricted to `[a-z0-9_-]`. Every key segment is sanitized to
`[A-Za-z0-9._-]` to prevent path traversal.

## Python Cache Layer

New module `remote_cache.py`:

- `local_path(bucket, key)` — maps a bucket/key pair to `cache/{bucket}/{key}`.
- `get(bucket, key)` — local first, then remote GET.
- `set(bucket, key, data)` — local write only.
- `mget(bucket, keys)` — batched remote GET for text caches.
- `offload(bucket, key, data)` — remote save used by the offload job.

`utils_cache.py` is rewritten so every `load_from_*` / `save_to_*` function
uses this layer. Direct-file cache modules are converted too:

- `app_chatgpt.py` → bucket `chatgpt`
- `app_translator_chatgpt.py` → bucket `translation_chatgpt`
- `app_translator.py`, `app_translator_azure.py` → bucket `translation`
- `app_mistral.py` → bucket `mistral`
- `routes/dictionary.py` → buckets `dictionary_llm`, `dictionary_download`,
  `image_queries`
- `app_youtubecaptions.py` → bucket `transcribe_youtube`

Remote failures are non-fatal: a timeout/connection error is treated as a
cache miss and the request continues to compute locally.

## Offload Job

`offload_cache.py` runs on the Flask VPS (cron, default nightly):

- Walk each bucket under `cache/`.
- For every file older than `CACHE_OFFLOAD_DAYS` (default 30):
  1. Upload raw bytes to `save-flask-cache.php`.
  2. Delete the local file only after the remote save returns success.
  3. Prune empty directories.
- Logs to `logs/cache_offload.log`.

### "Last read" caveat

The VPS `/home` mount is `noatime`, so the filesystem does not track reads.
The 30-day rule therefore uses **mtime (last write)** as the coldness signal.
This is documented rather than fixed because a true read index would add
write overhead to every cache hit.

## Initial Migration

Existing files are almost all older than 30 days, so they qualify for offload
immediately. The initial copy is a server-to-server `tar`/`rsync` stream from
the VPS to `~/zerotohero-server-flask-cache/` (same DreamHost datacenter),
followed by spot verification and local deletion.

## Rollout

1. Deploy PHP endpoints to the shared host and commit to `zerotohero-server`.
2. Deploy the Python layer to the VPS and syntax-check.
3. Bulk-migrate existing cache files, verify counts/samples, delete local.
4. Install the cron offload job.
5. Restart Flask (user action) and smoke-test a few endpoints.

## Risks

- Shared hosting file-count limits: the host already stores >1M cache files;
  many small files may be slower than fewer larger files.
- Remote latency on cold misses: batched lookups are supported for text
  caches; hot data remains local.
- Public write abuse is mitigated by the shared secret header.
