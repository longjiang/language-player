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
external blob storage is well below 1 MB: in a reproduction, an ordinary 268 KB
novel's binary, its search index, a 114 KB cover row and a synthetic 8 MB value
each produced a blob file.)

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
   - **Two rows per book**, because a mirror row is only safe while it stays
     small: `meta:<id>` holds the essential metadata (name, progress, location)
     and `cover:<id>` holds the cover data URL. Measured on a real 268 KB novel,
     the cover is 114,515 bytes of base64 — a combined row is written to an
     external blob file (114,619 bytes on disk) and dies in exactly the cleanup
     the mirror exists to survive, while the split `meta:` row is **431 bytes**
     and stays inline in LevelDB. Losing the cover row costs a cover, never the
     book's name; the essential row is written first, in its own transaction, so
     a cover that fails to store cannot take it down.
   - Mirror rows are read **one key at a time** (`getAllKeys()` then `get()`) so
     a single unreadable row cannot abort the walk and hide the books after it;
     cover rows are read only for books whose metadata row was found.
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
   records `openFailureId`; the page shows a recovery notice above the shelf, which
   Remove clears together with the book. Removal deletes the record, its mirror row
   and its search index; the user then imports the file again. The app never
   deletes a user's book on its own. Two or more unreadable books also get a
   **bulk Remove** above the grid (`msg.epub_unreadable_books`, "{n, plural, …}",
   counted over the books on screen and removed with one shelf reload): a swept
   profile can lose dozens at once, and clicking each card is not a recovery.
   - The **mount auto-open is quiet**: it is a convenience (open the last-read
     book), so a failure there badges the card and logs, but raises no notice —
     a notice about a book the user never chose, which (when the record's metadata
     died with it) cannot even be named, reads as noise. For the same reason a
     nameless card is titled `msg.epub_unreadable_book` ("Book no longer readable")
     rather than repeating the sentence.
   - **Volume matters in logs and on screen.** Per-record detail is info-level and
     each *new* loss is reported once on the error channel (a summary with the
     count); later loads and the count dropping as books are removed stay quiet at
     info level, because the shelf badges are the user-facing signal and a swept
     profile would otherwise re-print the same line on every load and every
     removal. A book that becomes readable again is forgotten, so losing it later
     is reported afresh; a card tap that fails logs once, as the user's own action.
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
  immune to the whole class of large-value read failures. The data loss does not
  have to spare the mirror either: with a real book whose binary **and** cover
  blob files were deleted, the shelf still showed the book by name and offered
  the one-click recovery (verified).
- A record that can never be read is distinguishable from a parse failure, a
  transient read error, and a missing record — in the UI and in the logs.
- `openDB` can no longer hang on a version upgrade blocked by another tab.

### Negative

- Two databases to keep in sync. A mirror write that fails silently degrades to
  the old (record-reading) shelf behavior; the log line says so once per session.
- The mirror duplicates metadata, so a book's metadata can outlive its binary
  (that is the point) and stale mirror rows are only pruned when the shelf loads.
- A mirrored cover is a second copy of the cover (up to ~150 KB per book) that
  can be lost independently; a book whose cover row is gone shows the placeholder
  icon rather than a broken image.
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
- `apps/mobile` adopted the same contract without needing the mirror (2026-10-16):
  its metadata is AsyncStorage rather than a large IndexedDB value, so losing a
  book *file* cannot damage it. What it did need was the data-loss guard
  (`readAll()` used to return `[]` on a failed read, and the next write then
  persisted that empty list — wiping every stored book), a real file-existence
  check on the shelf (badge + one-click Remove), and translation keys instead of
  raw English error strings that the screen discarded. Its paths are covered by
  unit tests, not by a device build.
- The same "do not memoize a failed open" rule was applied to the mobile SQLite
  stores (`dictionary.db`, `sync.db`): a rejected open promise was cached for the
  session, permanently disabling the offline dictionary and sync. This is the
  same class of bug (an unreadable file turning into a feature that never
  recovers), fixed one layer down.

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
