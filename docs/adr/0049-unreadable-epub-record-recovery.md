# ADR-0049 — A web EPUB/PDF record that can no longer be read is badged and removed, never silently deleted

**Status:** Accepted (2026-10-16)

## Context

Every web EPUB/PDF lives in IndexedDB (`lp-epub-store`, store `epubs`) as one
record per book: the full file as an `ArrayBuffer` plus its metadata (file name,
cover, progress, last location). Chromium does not keep a *large* value inline
in LevelDB — it writes it to a **separate file** in the profile
(`IndexedDB/<origin>.indexeddb.blob/…`) and stores only a reference. Blob files
show up in "choose large files to delete" tools and in disk-cleanup utilities,
so they get deleted while the reference survives. Every later read of that
record then fails:

```
NotReadableError: Data lost due to missing file.
Affected record should be considered irrecoverable
```

Chrome 132+ reports this as `NotReadableError`; 130/131 used `NotFoundError`
with the message `Failed to read large IndexedDB value`. Chrome's documented
guidance for such a record is to delete the entry, tell the user, and re-fetch
the data — the record can never be read again. (Chromium's threshold for
external blob storage is well below 1 MB: an ordinary 268 KB novel and a 394 KB
book both produced a blob file in a reproduction.)

The bug (reported 2026-10-16): opening `/zh-Hans/ja/epub` with one such book
showed **only a spinner, forever**, plus an uncaught rejection. The chain was:

1. `listEpubs()` read the whole record with a cursor (`cursor.value`) to list the
   shelf, so the failing record rejected the *whole* call — one dead book hid the
   entire library.
2. The reader page's mount effect `await`ed `refreshBooks()` /
   `handleOpenBook()` with no `try/catch`, and `setInitialized(true)` was the last
   statement — an unreachable line once anything threw.
3. No surface could express a storage read failure: the only keys were
   `msg.epub_parse_error` (a parse failure) and `msg.epub_file_unreadable` (an
   *import*-time read failure). Nothing offered a recovery.

## Decision

1. **Classify the failure.** `isUnreadableRecordError()` treats
   `NotReadableError` (and the 130/131 `NotFoundError` + "Failed to read large
   IndexedDB value" pair) as irrecoverable, and everything else
   (`UnknownError` / `DataError`) as retryable. A transient read failure is never
   presented as lost data.
2. **Mirror the metadata into its own small-value database** (`lp-epub-meta`,
   store `epub-meta`). The shelf is listed **from the mirror**, so rendering a
   card never reads a blob — a book whose binary was deleted still lists with its
   real name, cover and progress. The mirror is written on every
   `saveEpub` / `updateEpubMeta` and deleted with the record.
   - It is a **separate database**, not a new object store on `lp-epub-store`:
     bumping that database's version makes another tab's open connection block
     the upgrade, and a blocked `indexedDB.open` never settles (the same class of
     hang). The mirror is created at version 1 and never versioned against the
     library DB.
   - Mirror reads and writes are **best effort**: if the mirror is unavailable,
     the shelf falls back to reading the records (the pre-ADR behavior) and logs
     once on the error channel.
3. **Isolate the failure per record.** `listEpubs()` lists ids with
   `getAllKeys()` (keys are small) and reads only records the mirror does not
   know, one transaction each, returning an `unavailable: 'unreadable' | 'error'`
   summary for the book that failed instead of rejecting the list. Pre-mirror
   records are read once and backfilled; mirror rows whose record is gone are
   pruned.
4. **Mark, don't auto-delete.** A book whose record cannot be read is badged on
   the shelf (warning icon, destructive tint) with a one-click **Remove**, and its
   card click reports the failure. `openBook` sets `msg.epub_file_unreadable` and
   records `openFailureId`; the page shows a recovery notice above the shelf.
   Removal deletes the record, its mirror row and its search index; the user then
   imports the file again. The app never deletes a user's book on its own.
5. **Nothing may strand the page.** The mount effect's `setInitialized(true)` is
   in `finally`; the error branch renders before the cover/locating spinners;
   `openDB()` rejects on `blocked` (instead of awaiting forever) and closes its
   connection on `versionchange`; every fire-and-forget storage call handles its
   rejection.
6. **Storage failures are always diagnosable.** `epubStorageErr()` logs on the
   app-wide error channel — gated by `LOG_LEVEL`, not by the reader's verbose
   switch (`EPUB_LOGS_ENABLED`) — so the failing record and its DOMException are
   visible at the default level (1 in production, 2 in web dev).

Writes that meet an unreadable record **replace** it rather than failing:
`saveEpub` retries without the merge-read, and imports treat an unreadable
existing record as absent, so re-importing the file is a complete repair.

## Consequences

### Positive

- The reported symptom (spinner forever + uncaught `NotReadableError`) is gone:
  the shelf renders, the dead book is named and badged, and one click cleans it
  up. Verified in headless Chromium by deleting the record's blob file from the
  profile exactly as a cleanup tool does.
- Rendering the shelf no longer reads book binaries at all, so it is faster and
  immune to the whole class of large-value read failures.
- A record that can never be read is distinguishable from a parse failure, a
  transient read error, and a missing record — in the UI and in the logs.
- `openDB` can no longer hang on a version upgrade blocked by another tab.

### Negative

- Two databases to keep in sync. A mirror write that fails silently degrades to
  the old (record-reading) shelf behavior; the log line says so once per session.
- The mirror duplicates metadata, so a book's metadata can outlive its binary
  (that is the point) and a stale mirror row is only pruned when the shelf loads.
- One more store to wipe for a "delete all local data" feature: `deleteEpub`
  removes the mirror row, so per-book removal is covered, but a bulk wipe must
  delete both databases.
- Metadata written before this ADR has no mirror row; the first shelf load after
  the upgrade reads those records once to backfill. If such a record's blob file
  is already gone, that book appears as a name-less "could not read this file"
  card until it is removed.

### Neutral

- Nothing changes for a healthy library: import, open, resume, progress and the
  PDF path were re-verified end to end (real EPUB + real PDF) after the change.
- `apps/mobile` is unaffected. Its books are sandbox files with metadata in
  AsyncStorage, and it already checks `getInfoAsync` before opening; adopting the
  same recovery UX there (an i18n'd "file missing" state instead of the generic
  parse error) is a separate, tracked follow-up.

## Alternatives considered

- **Auto-delete an irrecoverable record and notify.** Chrome's literal
  recommendation, and less UI, but it destroys the user's library entry (name,
  cover, progress) without consent. Rejected in favor of mark + one-click remove.
- **Keep one database, add an `epub-meta` object store at version 4.** Rejected:
  a version bump can be blocked by another tab's open connection, and a blocked
  open hangs every read.
- **Store metadata in `localStorage`.** Rejected: synchronous, ~5 MB total,
  per-origin, and it would fail wholesale under quota pressure, taking the
  bookshelf with it.
- **Copy book binaries to OPFS / the File System Access API.** Rejected for now:
  OPFS is not available everywhere the web app runs and it moves the durability
  problem rather than solving it (and `media-store.ts` shows the permission
  friction of the handle path).
- **Show a name-less placeholder card.** Rejected: without the mirror the user
  cannot tell which of several books is broken, and progress/cover are lost.

## References

- Chrome Platform Status, *Improved error reporting in IndexedDB for large value
  read failures* — <https://chromestatus.com/feature/5140210640486400> (the
  `NotReadableError` / "irrecoverable" behavior, Chrome 130–132).
- `apps/web/src/lib/epub-store.ts` — classification, mirror, per-record listing.
- `apps/web/src/lib/epub-store.test.ts` — fake-IndexedDB coverage of the failure,
  the isolation, the mirror and the repair-on-save paths.
- `apps/web/src/hooks/use-epub.ts` — `openFailureId`, `unreadable`, recovery.
- `docs/arch/013-epub-reader-architecture.md` § "Unreadable stored records".
- `docs/specs/085-ebook-reader-interface.md` § 18.
