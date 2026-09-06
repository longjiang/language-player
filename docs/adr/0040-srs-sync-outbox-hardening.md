# ADR-0040 — Harden the web SRS sync outbox

**Status:** Accepted (2026-08-17)

## Context

Web SRS cards sync through a localStorage-backed pending-op queue
(`zthSrsProgressPendingOps`) in `apps/web/src/hooks/use-srs.ts`: every
`updateCard`/`removeCard`/`pruneOrphans`/`removeCardFromStorage` enqueues an
upsert or delete op, and `flushAllPendingSrsOps` replays them against the row
API (`PUT/DELETE /srs/cards`), with a 10-second retry timer for failures and a
one-time `GET /srs` hydration (newer-`lastReview`-wins merge) per page load.
The backend protects writes with an LWW upsert guard
(`WHERE excluded.updated_at >= current`), a delete tombstone check
(`stale_after_delete`), and an idempotent review log for the free 20/day cap
(SPEC-066, ADR-0034).

An audit (2026-08-17) found five defects:

1. **In-flight flush clobbers newly enqueued ops.** `flushAllPendingSrsOps`
   snapshotted the queue, flushed only the snapshot, then overwrote the queue
   with its `remaining` list. Ops enqueued while the flush was running were
   erased. Because the review page's deck auto-init loop calls `updateCard`
   synchronously for up to `dailyLimit` cards, every session only the first
   new card reached the server; rapid ratings and rapid unsaves lost the same
   way. Reproduced with a simulation: 5-op burst → 1 sent, 4 lost.
2. **A 403 cap rejection blocks the whole queue for the rest of the day.**
   On failure the flush re-queued the failing op *and everything after it*
   and retried every 10s; the server keeps rejecting a capped rating until
   the next local day, so one capped op (multi-device edge) stalled all other
   writes and fired ~8,600 requests/day. (The 403 was also never detected as
   such: api-client normalizes errors to `ApiError { code: '403' }`, and the
   catch only looked at `err.response.status`, so the `lp:srs-cap-reached`
   event never fired from the flush path.)
3. **Undo does not propagate to the server.** The undo write restores the
   pre-rating card, whose `lastReview` is deliberately older than the rating
   being voided. `PUT /srs/cards` derives its LWW timestamp from that
   (`updatedAt: state.lastReview`), so the server's `updated_at` guard
   rejected the restore; only the review-log void landed. The next hydration
   re-applied the rated state — the undo silently reverted after reload and
   on other devices.
4. **Stale queued deletes can destroy newer data.** A delete op queued
   offline is applied unconditionally when the network returns, even if
   another device rated the card in the meantime. `stale_after_delete` only
   protects upserts against older deletes, never deletes against newer
   upserts, and the DELETE endpoint accepted no client timestamp.
5. **`removeCardFromStorage` bypasses the `useSrs` store.** Unsave buttons
   call it directly (no hook), so a mounted hook's in-memory store kept the
   card; the next store change — including a hydration merge landing after
   the unsave — persisted the ghost card back into localStorage. Healed by
   orphan reconciliation on the next review-page visit — server-side
   `POST /srs/cards/reconcile` for credentialed users (the server owns both
   `user_srs_cards` and `user_saved_words` so it only deletes true orphans),
   with a hardened local prune as the anonymous/offline fallback.

## Decision

Fix the web outbox and the two server gaps behind it:

1. **Extract the queue into `apps/web/src/lib/srs-pending-queue.ts` and make
   flushes lossless.** After each flush pass, re-read the queue and merge
   back every op that was added mid-flight — new keys, or a newer
   `updatedAt` for a key in the snapshot (e.g. undo → re-rate while the
   first PUT is in flight). If new ops arrived, run another pass (bounded at
   10 passes; the retry timer is the safety net). Only genuine failures arm
   the 10s retry timer.
2. **Treat a 403 as final for that op.** Detect it from the normalized
   `ApiError.code === '403'` (or a raw `response.status === 403`), drop the
   op, dispatch `lp:srs-cap-reached`, and continue flushing the rest of the
   queue. The rating stays local-only — the server's rejection is
   authoritative for the day, and the upgrade banner is the feedback.
   (Mobile's sync engine already handles cap rejections by reverting the
   card; web keeps its existing "keep locally, show banner" behavior.)
3. **Timestamp undo/void writes as fresh writes server-side.** In
   `PUT /srs/cards`, when `state.voidRatingId` is present, use
   `now_ms()` for the client timestamp instead of the restored card's old
   `lastReview`, so the LWW guard accepts the restore, the void's
   `voided_at` is the actual undo time, and the stale-after-delete check
   compares against the undo time. Single change fixes both web and mobile
   (both send the same undo shape).
4. **Guard deletes with the client's unsave timestamp.** `DELETE
   /srs/cards/<l2>/<wordId>` accepts `?updatedAt=<client unsave time>`; the
   server drops the delete (returns `dropped: true`, writes no tombstone)
   when the row was written more recently (`row.updated_at > client_ts`).
   The web queue passes `op.updatedAt` on every delete.
5. **Keep mounted hooks in sync with external removals.**
   `removeCardFromStorage` dispatches a `lp:srs-card-removed` event;
   `useSrs` listens and drops the card from its store, so the persist effect
   can't resurrect it.
6. **Quota failure keeps the queue in memory for the session** with a logged
   warning instead of silently dropping ops.

## Consequences

- The web queue is now an outbox that never loses ops to a concurrent flush,
  capped ratings no longer stall the queue or hammer the server, undos stick
  across reloads, and stale offline deletes can no longer destroy newer
  ratings.
- **LWW limitations remain and are accepted:** an undo cannot retract a
  rating that already synced to *another* device — that device keeps the
  rated state until it rates again (its local `lastReview` is newer than the
  restored one). This is inherent to last-write-wins and matches Anki-style
  behavior; the undo is guaranteed on the device that performed it.
- **Dropped capped ratings are intentionally local-only**; the review page's
  `lp:srs-cap-reached` banner is the user-visible feedback. (The client-side
  counter already blocks ratings at the cap, so this path is a multi-device
  edge case.)
- **Cross-tab coordination is only partially addressed.** The lossless merge
  prevents the main clobber, but two tabs can still double-flush
  (idempotent) and race the final queue write. A storage-event/lock-based
  cross-tab protocol was considered and deferred — the queue is per-device
  and the server LWW/tombstone guards bound the damage.
- The backend changes are backward compatible: the DELETE query param is
  optional (old clients keep unconditional deletes — the pre-existing
  behavior), and the void-write timestamp only changes writes that carry
  `voidRatingId`.
- Mobile benefits from decisions 3 and 4 with no code changes (its sync
  engine uses the same endpoints and the same undo state shape); decisions
  1, 2, 5, 6 are web-only (mobile has its own SQLite outbox in
  `apps/mobile/lib/sync-engine.ts`).

## References

- SPEC-066 — SRS review page (row API, pending-op queue, free cap, undo)
- SPEC-039 § 5.2 — row-level user-data endpoints
- ADR-0034 — Pro gating / free SRS cap
- ADR-0037 — Legacy `user_srs_settings` removal (same endpoint family)
- `apps/web/src/lib/srs-pending-queue.ts` — extracted, hardened outbox
- `apps/web/src/hooks/use-srs.ts` — hook consumes the outbox; listens for
  `lp:srs-card-removed`
- `packages/api-client/src/user-data-columns.ts` — `deleteSrsCard` carries
  `updatedAt`; `reconcileSrsCards` for the server-side orphan reconcile
- `zerotohero-python-server/routes/user_data_columns.py` —
  void-write timestamp override; delete guard wiring;
  `POST /srs/cards/reconcile` (server-side orphan reconcile)
- `zerotohero-python-server/utils_user_data.py` — `delete_srs_card` stale
  guard; `find_srs_orphans` bulk orphan selection
