# SPEC-065: EPUB Reading Progress Sync (Server + Mobile Offline)

## Metadata

- **Spec ID**: SPEC-065
- **Feature**: Sync user-uploaded EPUB shelf metadata and reading progress through Flask/Supabase, with durable offline sync on mobile
- **Status**: draft
- **Created**: 2026-08-11
- **ROADMAP Phase**: Phase 6 (User Features) / Phase 9 (Backend Consolidation)
- **See also**: [SPEC-032 (EPUB Reader Re-Engineering)](032-epub-reader-re-engineering.md) · [SPEC-049 §9 (EPUB parity)](049-mobile-feature-parity.md) · [SPEC-053 (Mobile Offline Mode & Offline Sync)](053-mobile-offline-mode.md) · [SPEC-034 (Saved Words row migration)](034-saved-words-supabase-migration.md) · [SPEC-039 (Full DB migration)](039-full-database-migration-supabase.md) · [ADR-0022 (epubjs whole-book model)](../adr/0022-epub-web-book-model-on-epubjs.md) · [ARCH-013 (EPUB Reader Architecture)](../arch/013-epub-reader-architecture.md)

## Overview

The web and mobile EPUB readers are currently **local-only**: each device stores its own bookshelf and reading position (web in IndexedDB, mobile in AsyncStorage + files), and SPEC-053 Phase 2 deliberately left the EPUB bookshelf out of the sync contract. This spec adds a server-side record of the user's EPUB books and reading progress so the same uploaded book can be resumed on another device — including on mobile while it is offline, using the existing durable outbox engine.

The design follows the patterns the project already uses:

- **SPEC-034 row pattern** for per-book server rows instead of one whole-blob bookshelf (the existing `/bookshelf` JSONB endpoint stays untouched for Classic/Gutenberg).
- **SPEC-053 sync engine** for mobile offline writes: local write → durable outbox → pull/push with idempotency keys → LWW merge → tombstones.
- **SPEC-032/SPEC-049 book model** for the position format: `BookLocation` over the whole-book block stream, with chapter-href and percentage fallbacks so web and mobile parser differences never strand a resume.
- **No EPUB binary upload.** The server stores small metadata/progress rows only. A device still needs the actual `.epub` file locally to open the book.

## User Stories

- As a learner, I want to read an EPUB on my phone, then open the same file on the web app and continue at roughly the same place.
- As a mobile user on a plane, I want to keep reading while offline; when I reconnect, my latest position syncs automatically and I never see a "save failed" error.
- As a user with two devices, I want my bookshelf progress percentages to converge deterministically, with deletes not resurrecting.
- As a developer, I want EPUB progress to ride the same sync engine as notes, saved words, and settings rather than inventing a second offline system.

## Relevant Context (as-built)

| Area | Current behavior | Source |
|---|---|---|
| Web EPUB storage | IndexedDB `lp-epub-store`; `id` = SHA-256 of the EPUB bytes; `EpubMeta` has `lastLocation`, `readChars`, `totalChars`, `lastReadAt`, `addedAt` | `apps/web/src/lib/epub-store.ts`, `apps/web/src/hooks/use-epub.ts` |
| Mobile EPUB storage | AsyncStorage `lp_epub_library_v1` + files under `epub_library/`; `id` = sanitized file name; `EpubMeta` has the same progress fields | `apps/mobile/lib/epub-store.ts`, `apps/mobile/hooks/use-epub.ts` |
| Mobile location | Global `{ blockIndex, offset }` over the whole-book block stream | `apps/mobile/lib/epub-book.ts` |
| Web location | `{ spineIndex, blockIndex, offset }` per spine item | `apps/web/src/lib/epub-book-types.ts` |
| Server bookshelf | Whole-blob `user_bookshelf(books jsonb, updated_at)` used by Classic/Gutenberg; LWW by `updated_at` | `zerotohero-python-server/utils_user_data.py`, `routes/user_data_columns.py` |
| Sync server | `/sync/push` + `/sync/pull` with per-user change log, idempotency keys, and a registered **no-op** `bookshelf` handler | `zerotohero-python-server/utils_sync.py`, `routes/sync.py` |
| Mobile sync engine | SQLite `sync.db` (`entity_cache`, `outbox`, `sync_meta`), pull → merge → push → ack, per-entity registry in `packages/utils/src/sync-entities.ts` | `apps/mobile/lib/sync-db.ts`, `apps/mobile/lib/sync-engine.ts`, SPEC-053 |

Key finding: the server already has a `/bookshelf` endpoint and a `bookshelf` sync entity, but both are shaped for Classic's whole-blob Gutenberg shelf. Reusing them for per-book EPUB progress would either force a full-blob overwrite (bad for offline LWW) or couple the new feature to Classic teardown. This spec adds a separate, row-level `epub_book` entity while leaving the existing `bookshelf` no-op untouched.

## Goals

- Same-book cross-device resume: web ↔ mobile and mobile ↔ mobile.
- Progress bars and shelf metadata (title, author, file name, L2, `readChars`/`totalChars`) sync per book.
- Mobile works fully offline: every local mutation (import, page turn, delete) is durable and syncs when connectivity returns.
- Deterministic conflict resolution: LWW by `updated_at`, delete tombstones, no resurrection.
- Parser-tolerant positions: when web and mobile block streams differ, resume falls back from exact block → chapter href → percentage.

## Non-Goals

- **Uploading the EPUB binary.** The server stores progress metadata, not book files or covers.
- **Remote-only bookshelf entries in v1.** A device only materializes books it already has locally. Server rows for books not on this device are kept in the sync cache and applied when the book is imported later.
- **Unifying Classic's `/bookshelf` with this feature.** Classic/Gutenberg continues to use `user_bookshelf` untouched.
- **Syncing annotations, highlights, or per-word state.** Only shelf membership + reading position/progress.
- **Real-time collaboration / CRDTs.** Row-level LWW is sufficient (SPEC-053 rationale).

## Book Identity

### `bookId`

Use the **SHA-256 hex digest of the EPUB bytes** as the canonical book id:

- Web already derives `EpubMeta.id` this way (`sha256Hex` in `apps/web/src/lib/epub-store.ts`), so `bookId = id`.
- Mobile currently uses a sanitized file name. It gains a `bookId` field computed at import time from the stored file bytes, while keeping its local `id` for file naming during a transition period. A pure-JS SHA-256 helper (e.g. `js-sha256`, which supports chunked `update`) hashes the file without a native dependency.
- On import, mobile dedupes by `bookId`: if a local handle already exists with the same hash, update that handle instead of creating a second shelf entry.

> **Partial implementation (2026-08-30) — import-time dedupe only.** The
> content-hash import dedupe described here is now implemented on **both**
> platforms for the "skip already in library" behavior: web re-uses its
> `EpubMeta.id` (SHA-256) as the content key and skips a re-import when the
> handle already exists; mobile adds a `bookId` = `md5-<md5(base64 of the
> file bytes)>` content digest to `EpubMeta` and skips a file whose `bookId`
> already matches a shelf book (a renamed copy never creates a duplicate).
> Mobile's `bookId` is currently an **MD5 digest** for local dedupe, not the
> SPEC SHA-256 sync key — the server-sync `bookId` is still a future step
> (see "Files Touched" and the open question about migrating mobile `id` to
> `bookId`).

This means two devices only converge if they have the same EPUB bytes — acceptable for uploaded user files, and the same constraint web already has for its own IndexedDB key.

### Portable location

Web and mobile store different native location shapes, so the server payload uses a portable shape:

```ts
interface PortableEpubLocation {
  formatVersion: 1;
  /** Spine item index (web-native; mobile derives it from its block stream). */
  spineIndex: number;
  /** Block index within that spine item. */
  blockIndex: number;
  /** Character offset within the block. */
  offset: number;
  /** Canonical zip-relative chapter href, fragment kept (e.g. "OEBPS/text2.xhtml#ch3"). */
  chapterHref: string | null;
  /** Nearest preceding TOC label, for UI before the book is opened. */
  chapterLabel: string | null;
  /** Short non-cryptographic hash of the block text, for drift detection. */
  blockTextHash: string | null;
}
```

Both book models add two methods:

- `toPortableLocation(native: BookLocation): PortableEpubLocation`
- `resolvePortableLocation(portable: PortableEpubLocation): BookLocation | null`

Resolution order on the receiving device:

1. If `formatVersion` matches, the spine/block indexes are in range, and `blockTextHash` matches the local block, use the exact location.
2. Else resolve `chapterHref` with the existing `resolveHref()`.
3. Else use the payload's `progress` (0–1) to pick the nearest block via `prefixChars` (mobile) / per-spine `starts` (web).

`blockTextHash` is a tiny pure helper (FNV-1a-style 32-bit over normalized block text) in `packages/utils` so web and mobile agree without adding a crypto dependency.

## Server Contract

### New table: `user_epub_books`

```sql
create table public.user_epub_books (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  l2 text not null default '',
  title text not null,
  author text not null default '',
  file_name text not null,
  file_size bigint not null default 0,
  location jsonb not null default '{}'::jsonb,
  total_chars bigint not null default 0,
  read_chars bigint not null default 0,
  progress double precision not null default 0,
  added_at bigint not null,
  last_read_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, book_id)
);

create index idx_user_epub_books_user_updated
  on public.user_epub_books (user_id, updated_at);
```

`progress` is computed server-side as `min(1, read_chars / total_chars)` when `total_chars > 0`. `deleted_at` is a tombstone so a stale offline upsert cannot resurrect a deleted book.

### Row endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/epub-books?l2=ja` | GET | Return non-deleted books for the user (optional L2 filter) |
| `/epub-books` | PUT | Upsert one book/progress row; LWW guard; append to `user_sync_log` |
| `/epub-books/{bookId}` | DELETE | Tombstone (set `deleted_at`, `updated_at`); append delete to `user_sync_log` |

These mirror the SPEC-034 row API pattern and give the online-first web app a simple hydration path. The mobile app can use them too, but its normal path is the existing sync endpoints.

### Sync entity: `epub_book`

`POST /sync/push` gains an `epub_book` handler with the same semantics as the row endpoint:

- `upsert` — validate the whole-row payload, LWW-update `user_epub_books`, log the change.
- `delete` — tombstone the row, log `deleted=true`.

`GET /sync/pull` needs no new code beyond the handler: the change log already returns tombstones and paginates. The old `bookshelf` no-op handler stays registered so legacy queued ops still drain.

Payload (whole row, matching the mobile outbox contract):

```json
{
  "bookId": "sha256 hex",
  "l2": "ja",
  "title": "坊っちゃん",
  "author": "夏目漱石",
  "fileName": "botchan.epub",
  "fileSize": 123456,
  "location": { "formatVersion": 1, "spineIndex": 2, "blockIndex": 4, "offset": 0, "chapterHref": "OEBPS/text00002.html#chapter-3", "chapterLabel": "三", "blockTextHash": "1a2b3c4d" },
  "totalChars": 120000,
  "readChars": 50400,
  "progress": 0.42,
  "lastReadAt": 1789000000000,
  "addedAt": 1788900000000
}
```

Server validation requires `bookId`, `fileName`, `l2`, `title`, `author`, `totalChars`, `readChars`, `lastReadAt`, `addedAt`, and a `location` object. `progress` is recomputed server-side rather than trusted.

## Mobile Implementation

### 1. Entity registry

Add `epub_book` to `packages/utils/src/sync-entities.ts`:

```ts
epub_book: {
  entity: 'epub_book',
  schema: {
    bookId: 'string',
    l2: 'string',
    title: 'string',
    author: 'string',
    fileName: 'string',
    fileSize: 'number',
    location: 'object',
    totalChars: 'number',
    readChars: 'number',
    progress: 'number',
    lastReadAt: 'number',
    addedAt: 'number',
  },
  coalesce: (_prev, next) => next, // whole-row replace
},
```

Legacy untagged books store `l2: ''` so the schema stays non-nullable. Add the same entity to the server `_ENTITY_SCHEMAS`.

### 2. Local metadata

`EpubMeta` gains:

- `bookId: string` — SHA-256 of the stored file.
- `syncLocation: PortableEpubLocation | null` — the last portable position (kept alongside the native `lastLocation`).
- `syncUpdatedAt: number` — the LWW clock used for server rows; updated on every local mutation (import, progress save, delete).

`saveEpub()` dedupes by `bookId` across local handles so re-importing a file under a new name updates the existing handle.

### 3. Write path

- **Import**: after saving local files/meta, `enqueueSyncOp({ entity: 'epub_book', entityId: bookId, op: 'upsert', payload: wholeRow, updatedAt: syncUpdatedAt })`.
- **`saveLocation()`**: keep the existing immediate AsyncStorage write, then enqueue the same upsert. The outbox coalesces rapid page turns into one row, so per-page enqueues are durable without unbounded growth.
- **`removeBook()`**: delete local files/meta, then `enqueueSyncOp({ ..., op: 'delete' })`.
- Logout wipe already clears `sync.db`; server rows remain account-side, which is correct.

### 4. Pull/merge

`sync-engine.ts`'s generic `mergeChange()` already handles `entity_cache` LWW + tombstones. Add a domain bridge for `epub_book`:

- **Local book exists** (matched by `bookId`): if the remote change is newer, write the remote `syncLocation`, `readChars` (recomputed from `progress` against local `totalChars`), `lastReadAt`, and `syncUpdatedAt` back into `lp_epub_library_v1`, then refresh the bookshelf.
- **Local book does not exist**: keep the row only in `entity_cache`; do not show a remote-only card in v1.
- **Delete**: if the local book exists and the tombstone is newer, remove the shelf handle (and optionally keep the file for later re-import; existing delete behavior is preserved).

`useEpub` subscribes to `subscribeEntity('epub_book', ...)` (same pattern as notes/saved words/settings) and refreshes `books` when the cache changes.

### 5. Import-time reconciliation

When a book is imported on mobile, after computing `bookId`, read the matching `entity_cache` row (if any) before saving local meta. If the cached row is newer, apply its progress/location before the first open. This is how a device that ignored a remote-only row picks it up the moment the book is imported.

### 6. Location conversion

`apps/mobile/lib/epub-book.ts` gains `toPortableLocation()` / `resolvePortableLocation()` on `EpubBookModel`, using the internal `spineData` global-start mapping and `prefixChars`. On open, if `syncLocation` exists, call `resolvePortableLocation()` and pass the result as the resume location.

## Web Implementation

Web is online-first, so it uses the row endpoints directly (no durable outbox):

- `refreshBooks()`: after loading IndexedDB, call `GET /epub-books`. For each remote row with a local book (`id === bookId`), merge if remote `updated_at` is newer. Keep remote-only rows in a module-level `remoteBooks` map (used only for future import reconciliation).
- `addBook()`: after saving IndexedDB, `PUT /epub-books` with the whole row.
- `saveLocation()`: keep the immediate IndexedDB write, then a debounced `PUT /epub-books` (~2 s) plus a flush on `visibilitychange`/`pagehide`.
- `removeBook()`: `DELETE /epub-books/{bookId}` after the local delete.
- `openBook()`: if the saved `syncLocation` exists, run it through `resolvePortableLocation()` before seeking.
- Signed-out behavior is unchanged: all sync calls are skipped, and the local shelf still works.

## Conflict Semantics

| Case | Rule |
|---|---|
| Same book, two devices | LWW by `updated_at`; the server only applies an incoming upsert when it is newer (or equal with a deterministic tie-break: higher `readChars`, then higher `lastReadAt`) |
| Offline edit vs server delete | Tombstone wins when `deleted_at >= updated_at`; a genuinely newer upsert resurrects (the user re-imported/read again) |
| Web vs mobile parser drift | `blockTextHash` → `chapterHref` → `progress` resolution chain |
| Different `totalChars` between parsers | Remote `readChars` is never used raw; `progress` is applied to the local `totalChars` |
| Rapid page turns | Outbox coalescing keeps one latest row per book |
| Duplicate file import | `bookId` dedupe prevents duplicate shelf handles |

## Files Touched (when implemented)

| File | Change |
|---|---|
| `zerotohero-python-server/utils_epub_books.py` (new) | `get_epub_books`, `upsert_epub_book` (LWW + tombstone), `delete_epub_book` |
| `zerotohero-python-server/routes/epub_books.py` (new) | `GET/PUT/DELETE /epub-books`, change-log appends |
| `zerotohero-python-server/routes/__init__.py` | Register `epub_books_bp` |
| `zerotohero-python-server/utils_sync.py` | `_h_epub_book` handler + `_ENTITY_SCHEMAS` entry |
| `zerotohero-python-server/test_epub_books.py` (new) | Row API + tombstone tests |
| `zerotohero-python-server/test_sync.py` | `epub_book` push/pull/idempotency tests |
| `packages/utils/src/sync-entities.ts` | `epub_book` registry entry |
| `packages/utils/src/sync-entities.test.ts` | Coalescing + schema tests |
| `packages/utils/src/epub-location.ts` (new) | `hashBlockText`, progress helpers (pure, platform-agnostic) |
| `apps/mobile/lib/epub-store.ts` | `bookId`/`syncLocation`/`syncUpdatedAt`, `bookId` dedupe |
| `apps/mobile/lib/epub-book.ts` | Portable location conversion methods |
| `apps/mobile/lib/epub-sync.ts` (new) | Outbox writes, pull bridge, import-time reconciliation |
| `apps/mobile/lib/sync-engine.ts` | `epub_book` merge bridge |
| `apps/mobile/hooks/use-epub.ts` | Wire sync calls + `subscribeEntity` |
| `apps/web/src/lib/epub-sync.ts` (new) | GET/PUT/DELETE, debounced save, remote map |
| `apps/web/src/lib/epub-store.ts` | `syncLocation`/`syncUpdatedAt` fields |
| `apps/web/src/lib/epub-book.ts` | Portable location conversion methods |
| `apps/web/src/hooks/use-epub.ts` | Wire sync calls |
| `docs/specs/053-mobile-offline-mode.md` | Update the "bookshelf out of scope" note to point here |
| `docs/arch/013-epub-reader-architecture.md` | Add sync layer to the persistence diagram |

## i18n

No new UI strings are required for v1: the reader and bookshelf are unchanged, and the global sync status icon/outbox screen already communicates pending/error states. If a later phase adds "Not on this device / Import to read" remote-only cards, those strings must go through the standard 31-locale CSV workflow.

## Verification Plan

1. **Mobile offline session**: import a fixture EPUB, read to a mid-book block, enable airplane mode / Offline Mode, read more, kill and relaunch, then reconnect. `sync.db` outbox drains, the header clears, and `GET /epub-books` shows one row with the latest `progress`.
2. **Web → mobile**: open the same file on web, turn a few pages, wait for the debounced PUT, then import the same file on mobile. The shelf shows the web progress and opens near the same location.
3. **Mobile → web**: reverse direction; the web bookshelf updates after `refreshBooks`.
4. **Parser fallback**: with the same fixture on web (epubjs/DOM converter) and mobile (JSZip/regex), verify exact-block resume when hashes match and chapter/percentage fallback when they don't. Fixtures: Botchan, Snow Country, 1Q84.
5. **Delete**: delete on device A; pull on device B removes the shelf entry; a stale offline upsert with an older `updated_at` does not resurrect it.
6. **LWW**: two devices edit offline; both come online; server state converges deterministically with no duplicate rows.
7. **Idempotency**: replay the same push op; server returns the original response and no duplicate row.
8. **Typecheck/verification**: `npx turbo typecheck`, `npm run build:check -w apps/web`, and the server test suite pass before commit.

## Open Questions

1. Should a later phase show **remote-only cards** on devices that don't have the file, with an "import to read" action instead of silently ignoring them? (Recommended: yes, as a separate follow-up.)
2. Should mobile eventually migrate its local `id` (file-name-based) entirely to `bookId` so files are named by content hash like web? (Recommended: yes, after the `bookId` dedupe is stable.)
3. Is SHA-256 of the exact bytes the right identity, or should we add an OPF-identifier-based edition key for books downloaded from the same source with different zip metadata? (Recommended: keep bytes-only in v1; revisit if we ever build a server-side book catalog.)
4. Should server rows be backfilled from existing local shelves on first sync, or should users opt in? (Recommended: auto-upsert local books on first signed-in refresh, LWW-protected.)
