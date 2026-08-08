# SPEC-053 — Mobile Offline Mode & Offline Sync

## Metadata

- **Spec ID**: SPEC-053
- **Feature**: Offline Mode (local network kill switch) + offline-first sync strategy
- **Status**: in-progress — Phase 1 (kill switch) implemented 2026-08-07; Phase 2 core (durable outbox engine, server push/pull contract, connectivity + status UI) implemented 2026-08-07; full two-device conflict suite pending manual verification
- **Created**: 2026-08-07
- **Scope**: `apps/mobile` client + proposed Flask sync endpoints
- **Related specs**: [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md) · [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md) · [SPEC-039 — Full Database Migration to Supabase](039-full-database-migration-supabase.md) · [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)
- **Related architecture**: [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md)

---

## Overview

Offline Mode is a mobile-only setting that blocks all app-level network
requests without touching the host's network stack. It gives users a
deterministic way to keep using downloaded dictionaries and local tokenizers
while preventing the app from making any network calls, and it gives
developers a way to exercise the offline fallback chain without killing Metro
or disabling the Mac's Wi-Fi.

This spec has two parts. **Phase 1** (implemented) is the local network kill
switch described below. **Phase 2** (drafted in this document) is the
offline-first sync strategy: every user-generated row — notes, saved words,
progress, SRS cards, settings, watch history, reading progress — must remain
fully usable offline, queue its mutations durably, and sync both directions
reliably when connectivity returns. The goal is Google-Docs-like confidence:
the app never blocks on the network and no user write is silently lost.

The setting is intentionally **local-only**: it is stored in SecureStore under
its own key, outside `SettingsV2`, and is never sent to `GET/PUT
/user-settings`. It does not sync to the user's account or to other devices.

---

## User Stories

- As a user in a low-connectivity environment, I want to switch the app into
  Offline Mode so downloaded dictionaries and tokenizers keep working while
  nothing tries to phone home.
- As a user on a plane or in a tunnel, I want to keep reading, taking notes,
  saving words, and doing reviews so that every change is saved on my device
  and automatically synced when I get back online.
- As a user who works on two devices, I want the same notes, words, progress,
  and settings on both after sync, with conflicts resolved deterministically
  and without duplicates.
- As a user who is offline, I want to know it: what is saved locally, what is
  still waiting to sync, and when the last successful sync happened.
- As a developer, I want to simulate full app-level network failure without
  killing Metro or changing the Mac's network so I can verify offline fallbacks
  and error states.
- As a user who cares about device-local control, I want this setting to stay
  on this device only and never sync to my account.

---

## Requirements — Phase 1

### Functional

- Toggle at **Settings → Network → Offline Mode**.
- While enabled, all app JS network requests fail fast:
  - global `fetch()` (direct calls + `authenticatedFetch`)
  - `XMLHttpRequest` (the default axios adapter used by `apiClient`)
  - `File.downloadFileAsync()` (offline dictionary and tokenizer pack downloads)
- Local data remains fully usable:
  - offline dictionary SQLite lookups
  - downloaded lemma tables
  - kuromoji / kuromoji-ko data packs
  - the local `lemmatizeText()` fallback chain
- Persist locally in SecureStore under `lp_offline_mode`.
- Never sync: the value is not part of `SettingsV2`, so it is never included in
  the cloud settings payload.
- Install the network gate before any provider mounts, so the setting is active
  from the first app request (auth refresh, settings hydration, user data).
- Skip boot-time auth refresh while Offline Mode is on so an expired access
  token does not log the user out; refresh happens naturally after the user
  returns online.
- When Offline Mode is turned off, networking resumes immediately and cloud
  settings hydration retries if it was blocked at startup.

### Non-Functional

- No host network changes (Metro keeps running).
- No server-side changes.
- Works on both iOS and Android at the React Native JS layer.

### Out of Scope / Known Limitations

- Native `<Image>` loading and WebView content are not intercepted by the JS
  gate; only app-level JS networking is blocked.
- Requests already in flight when the toggle is flipped are not aborted; only
  new requests are blocked. In-progress dictionary downloads can still be
  cancelled from the Offline Dictionaries screen.
- Other settings changes made while Offline Mode is on will not reach the
  server until the user makes another change while online (existing debounced
  sync behavior). Phase 2 replaces this with a durable outbox so the change is
  never dropped.

---

## Architecture — Phase 1

```
Settings → Network → Offline Mode toggle
                    │
                    ▼
        useSettings.setOfflineMode()
                    │
                    ▼
        offline-mode.ts (module-level gate)
           │        │              │
           ▼        ▼              ▼
        fetch()  XMLHttpRequest  File.downloadFileAsync
                 (axios / apiClient)  (dict + tokenizer downloads)
```

The gate is a singleton installed once per app session. Enabling/disabling only
flips a module-level boolean; the patched `fetch`, `XMLHttpRequest`, and
`File.downloadFileAsync` entry points check that boolean on every call.

### Boot Sequence

1. `RootLayout` calls `initOfflineMode()` and waits for it to resolve before
   rendering any providers.
2. `initOfflineMode()` reads `lp_offline_mode` from SecureStore and installs
   the gate.
3. Providers mount with the gate already active, so auth refresh, settings
   hydration, and user-data fetches are blocked if Offline Mode is on.
4. `AuthContext` checks `isOfflineModeEnabled()` during boot; if the stored
   access token is expired and Offline Mode is on, it skips the refresh attempt
   instead of logging the user out.

---

## Implementation — Phase 1

### Storage

SecureStore key: `lp_offline_mode` (`"true"` / `"false"`).

Deliberately **not** a field on `SettingsV2`:

- `createSettingsV2()` and the cloud schema are unchanged.
- `useSettings().persist()` sends only `SettingsV2`, so the value can never be
  written to the server by the existing sync path.
- Cloud hydration merges `{ ...cloud, ...local }`, so there is no field to
  clobber or resurrect on another device.

### Network Gate (`apps/mobile/lib/offline-mode.ts`)

- `OfflineModeError` — a named error for blocked requests.
- `isOfflineModeEnabled()` — synchronous module-level read.
- `initOfflineMode()` — idempotent; reads SecureStore once and installs the
  gate.
- `setOfflineModeEnabled(enabled)` — flips the boolean, installs the gate,
  persists locally, and serializes writes so rapid toggling cannot persist out
  of order.

Patching strategy:

| Surface | Behavior while enabled |
|---|---|
| `global.fetch` | Returns a rejected `OfflineModeError` promise |
| `XMLHttpRequest.open` / `.send` | Throws `OfflineModeError` (axios promise executors catch this and reject) |
| `File.downloadFileAsync` | Returns a rejected `OfflineModeError` promise |

### Settings UI

- Root settings row: **Offline Mode** under the Data section, with a Wi-Fi-off
  icon and an "Offline" subtitle while enabled.
- Detail page: `apps/mobile/app/(tabs)/(me)/settings/network.tsx` with the
  toggle, description, and a "not synced" note.
- Wide (iPad) split view renders the same page through `DetailPanel`.
- Mobile-only search aliases include `Network`, `Offline Mode`, the description,
  and the not-synced note.

### i18n Keys

Added through the standard CSV workflow (all 31 locales):

| Key | English |
|---|---|
| `title.offline_mode` | Offline Mode |
| `setting.network` | Network |
| `setting.offline_mode_desc` | Blocks all network requests. Downloaded dictionaries and tokenizers still work. |
| `msg.offline_mode_not_synced` | This setting stays on this device and is not synced to your account. |

---

## Files Touched

| File | Change |
|---|---|
| `apps/mobile/lib/offline-mode.ts` | New network gate + local storage |
| `apps/mobile/app/(tabs)/(me)/settings/network.tsx` | New settings detail page |
| `apps/mobile/app/(tabs)/(me)/settings/index.tsx` | Root row, wide-mode detail, search aliases |
| `apps/mobile/app/(tabs)/(me)/settings/_layout.tsx` | Stack screen registration, saved-toast dependency |
| `apps/mobile/hooks/use-settings.ts` | Local-only state, toggle callback, cloud hydrate retry |
| `apps/mobile/contexts/SettingsContext.tsx` | Expose `offlineMode` / `setOfflineMode` |
| `apps/mobile/app/_layout.tsx` | Install gate before providers mount |
| `apps/mobile/contexts/AuthContext.tsx` | Skip boot refresh while offline |
| `translations.csv` + `packages/shared/locales/*.json` | 4 new i18n keys |
| `docs/specs/018-local-tokenization-mobile.md` | Phase 3f status + section |

---

## Phase 2 — Offline Sync Strategy (Core Implemented)

### Goal

Everything the mobile app writes to the user's account must be usable and
editable while offline, and must sync to the server reliably once connectivity
returns. Reads come from local storage first; writes apply locally and enqueue
durably. The server remains the coordinating copy between devices; the device
is the fast copy that never blocks on a network round-trip.

"As reliable as Google Docs" here means: the user can keep working with no
spinner, no "save failed" dialog, and no fear that edits made on a plane will
vanish. It does **not** mean we need Google-Docs-style real-time collaborative
editing. Our data is row-level (a note, a saved word, an SRS card, a settings
object), not a shared rich document, so operational transformation / CRDTs are
out of scope. A durable outbox plus deterministic conflict resolution gets us
the reliability without that complexity.

### How popular applications handle this

Research summary (sources linked in [References](#references)):

- **Gmail offline** keeps composed messages in an **Outbox folder** and sends
  them automatically when the device reconnects. Users always know which
  messages have not reached the server.
- **Google Docs / Drive** stores edits locally, syncs them automatically on
  reconnect, and keeps version history. Files marked for offline use show a
  gray check; a lightning-bolt or cloud-with-slash icon appears while the user
  is offline.
- **Notion** moved its SQLite cache into a persistent offline record store,
  tracks an `offline_page`/`offline_action` tree so pages stay available for
  the right reasons, uses a CRDT data model only for offline pages, and keeps
  downloaded pages fresh with push-based updates plus a
  `lastDownloadedTimestamp` for incremental re-sync. Its help center exposes
  per-page "Available offline" toggles, a download progress bar, and a
  Settings → Offline management screen.
- **Firestore / Firebase** holds pending writes in local persistence and
  transmits them after reconnect; clients do not need a separate queue because
  the SDK owns it.
- **WhatsApp** makes server commitment visible with check marks: one tick means
  written from the device, two ticks means delivered to the recipient's device.
  It is a simple, widely understood "saved locally vs. committed remotely"
  metaphor.
- **Turso's local-first guide** describes the mainstream pattern for
  SQLite-based apps: row-level change data capture, separate push/pull loops,
  last-write-wins by default, and transform hooks only where a merge needs to
  be smarter (e.g. counters). It explicitly notes that OT/CRDT machinery is
  only worth it for real-time shared documents.

The recurring architecture:

1. **Write locally first, optimistically.** The UI updates instantly from
   local storage; the network is never on the critical path.
2. **Append to a durable outbox in the same local transaction.** The mutation
   is not lost when the app is killed, the OS suspends it, or the network drops
   mid-request.
3. **Run one sync loop:** pull remote changes since a cursor → merge → push
   the outbox FIFO → acknowledge and delete outbox rows.
4. **Use row-level last-write-wins by `updated_at`**, tombstones for deletes,
   and idempotency keys so retries cannot duplicate writes.
5. **Trigger sync on real events** (connectivity regained, app foreground,
   mutation, periodic retry) rather than only fixed polling, and never run two
   syncs at once.

### Syncable data inventory

Current mobile behavior (verified against the codebase):

| Domain | Local store today | Current behavior | Gap |
|---|---|---|---|
| Settings (`SettingsV2`) | SecureStore `lp_settings` | Debounced `PUT /user-settings`; whole-object LWW by `ts` | Offline failure is logged and dropped — no durable outbox; a kill during offline can lose the change |
| Learning progress | SecureStore `zthProgress` | Debounced `PUT /progress`; merge uses max time | Same: failures logged and dropped |
| SRS cards + daily limit | SecureStore `zthSrsProgress` | Direct `PUT/DELETE /srs/cards`, `PUT /srs/settings`; merge by `lastReview` | No queue at all; failures logged and dropped |
| Saved words | SecureStore store + `zthSavedWordsPendingOps` | Pending-op queue with per-word coalescing; replayed before hydration | No pull cursor/ack; server has no idempotency contract |
| Notes | AsyncStorage cache + `notes_sync_queue` | Durable FIFO outbox; temp IDs; retries with backoff | Separate engine from other domains; retries stop after 3 and errors stay stuck with no manual retry surface |
| Watch history | None | Direct `POST /watch-history` every 15s; failures silently ignored | Offline watching is effectively lost |
| EPUB bookshelf + reading progress | AsyncStorage `lp_epub_library_v1` | Local-only | Flask `/bookshelf` endpoint exists but the mobile app does not sync it |
| Likes / playlists / channel prefs | Not yet ported to mobile | Server row APIs exist | Must use the same sync engine when ported |

Intentionally **not** syncable: the Offline Mode toggle itself (Phase 1),
downloaded dictionaries, tokenizer packs, dictionary caches, and tokenizer
caches.

### Target architecture

**One local database for user data.** Introduce a `sync.db` SQLite database
(`expo-sqlite` is already used by the dictionary and tokenizer layers) with
three core tables:

```text
entity_cache(entity, entity_id, payload_json, updated_at, deleted_at)
  ── local source of truth for rendering; tombstones keep deletes alive

outbox(id, entity, entity_id, op, payload_json, idempotency_key,
       created_at, attempts, last_error, status)
  ── durable mutation queue; one row per queued operation

sync_meta(device_id, last_pull_cursor, last_sync_at, last_error)
  ── per-device sync position
```

Existing AsyncStorage/SecureStore stores are migrated into `sync.db` once
(idempotently, keeping the old keys until verified). SecureStore stays for
secrets, auth tokens, and the Phase 1 Offline Mode toggle.

**Write path.** Every mutation:

1. Validates and upserts the row in `entity_cache`.
2. Appends or coalesces an `outbox` row in the same SQLite transaction.
3. Updates the UI optimistically from local state.
4. Notifies the sync engine (debounced/coalesced, never blocking the write).

### Auto-detection vs. the manual Offline Mode toggle

The Phase 1 toggle stays a **manual, persisted, local-only override**. The app
should never flip it on or off by itself:

- Auto-flipping the toggle would destroy its purpose as a deterministic
  override (privacy, data-saving, developer testing) and would make the
  persisted setting mean "whatever the device happened to detect last".
- A connectivity change is ephemeral state, not a user preference. Persisting
  it would leave a stale "offline" value after the user moves to a new network
  or restarts the app.
- If auto-detection turned the toggle off the moment a weak network returned,
  a burst of queued network calls could fire during a flaky connection.

Instead, Phase 2 introduces two independent states:

```text
offlineMode     manual, persisted (SecureStore), device-local only
connectivity    auto-detected, ephemeral: online | offline | unknown

effectiveOffline = offlineMode || connectivity === "offline"
```

Auto-detection uses a native connectivity listener (NetInfo) as the primary
signal, with the existing lightweight API health probe (`checkOnline()` HEAD
request pattern) as a fallback when the native signal is ambiguous. When
`connectivity` becomes `offline`, the same network gate applies and sync stops
attempting; when it returns to `online`, the gate opens and the sync engine
starts a pull/push cycle automatically. Detection is debounced (~1–3 s) before
marking the app offline to avoid flickering on flaky networks, and returns
online immediately when connectivity is confirmed.

The UI must keep the two reasons visually distinct:

- **Auto-detected**: "No connection — changes are saved on this device."
- **Manual toggle**: "Offline Mode is on."
- **Both**: show the manual state as the reason, since it is user-controlled.

The manual toggle's current label ("Offline Mode") can stay, but its settings
row should make clear it is a force-offline override rather than the only way
the app knows it is offline.

**Outbox rules.**

- FIFO per entity, with coalescing: a newer op for the same entity replaces an
  older pending op's payload (the saved-words queue already does this), and a
  pending delete collapses any earlier pending ops for that entity.
- Every outbox row carries a stable `idempotency_key`. The server must be able
  to replay the same key and return the original result instead of applying
  the mutation twice.
- An outbox row is deleted **only after the server acknowledges it**.
- Failures increment `attempts`, keep `last_error`, and retry with exponential
  backoff. After the cap the row moves to `error` status but is never dropped;
  the user can retry from the sync status screen.
- Offline creates use temporary local IDs. Pending updates/deletes refer to the
  temp ID until the create is acknowledged, then the server-issued ID is
  remapped everywhere (the notes queue already does this).

**Pull and merge.** The sync loop runs `pull → merge → push → ack` and never
runs concurrently (mutex):

1. Pull changes since `last_pull_cursor`.
2. Apply remote rows to `entity_cache` using the per-domain conflict policy,
   including server tombstones (`deleted_at`).
3. Push the outbox FIFO with idempotency keys.
4. On ack, remap temp IDs, refresh cache, and advance the cursor.

Pull happens before push so a remote row cannot clobber a local edit that is
about to be pushed back.

**Conflict policy.**

| Domain | Resolution |
|---|---|
| Settings | Whole-object last-write-wins by existing `ts`; `offlineMode` stays excluded |
| Progress | Row last-write-wins by `updated_at`; elapsed time uses the max |
| SRS cards | Per-card last-write-wins by `lastReview`/`updated_at`; daily limit LWW |
| Saved words | Per-word last-write-wins by saved date/`updated_at`; delete tombstone wins |
| Notes | Per-note last-write-wins by `updated_at`; delete tombstone wins |
| Watch history | Per-video upsert; latest `last_position` / watched-at wins |
| Bookshelf/progress | Per-book last-write-wins by `lastReadAt`; delete tombstone wins |

Deletes are tombstones, not hard deletes, so an older remote row can never
resurrect a locally deleted item during a later pull.

**Sync triggers.**

- Connectivity regained (NetInfo)
- App returns to foreground (`AppState`)
- A mutation is enqueued (debounced ~1–3 s)
- Periodic retry every ~30 s while pending ops exist
- Manual "Sync now" (settings / outbox screen / pull-to-refresh)
- Offline Mode is turned off
- After login or a session refresh

**Recommended server contract.** Existing row endpoints
(`/user-settings`, `/progress`, `/srs/cards`, `/saved-words`,
`/user-notes`, `/watch-history`, `/bookshelf`) stay for online reads and
one-off writes, but reliable two-way sync should be built on:

- `POST /sync/push` — accepts a batch of `{ idempotency_key, entity,
  entity_id, op, payload, updated_at, device_id }`; applies each op once and
  returns per-op status plus server-issued IDs/timestamps.
- `GET /sync/pull?cursor=<opaque>` (or `POST /sync/pull` for larger payloads)
  — returns `{ cursor, changes }` since the last cursor, including tombstones,
  with pagination.

The server should append every user mutation to a per-user change log in the
same transaction as the row write so the pull cursor is reliable and not
subject to `updated_at` timestamp ties.

### Implementation — Phase 2 core (2026-08-07)

**Server (`zerotohero-python-server`).**

- `utils_sync.py` + `routes/sync.py`:
  - `POST /sync/push` — batch `{ idempotency_key, entity, entity_id, op,
    payload, updated_at, device_id }`; applies each op once (idempotency is
    stored in `user_sync_ops`), appends to `user_sync_log` in the same
    transaction, and returns per-op results (including server-issued IDs for
    offline note creates so temp IDs can be remapped).
  - `GET /sync/pull?cursor=<id>&limit=<n>` — per-user changes since the cursor
    including tombstones (`deleted`), with pagination.
  - Entities: `settings`, `progress`, `srs_settings`, `srs_card`,
    `saved_word`, `note`, `watch_history`, `bookshelf`.
- Existing row endpoints (`/progress`, `/srs/...`, `/user-settings`,
  `/bookshelf`, `/watch-history`, `/saved-words`, `/user-notes`) now append to
  the same change log, so mutations made by any device/API are visible to
  other devices via pull.
- LWW guards were added to `upsert_progress`, `upsert_srs_settings`,
  `upsert_srs_card`, `upsert_settings`, and `upsert_bookshelf` (a client
  `updated_at` older than the stored row is ignored).

**Mobile (`apps/mobile`).**

- `lib/sync-db.ts` — `sync.db` with `entity_cache` (payload + tombstone),
  `outbox` (durable FIFO with idempotency keys), and `sync_meta`.
- `lib/sync-engine.ts` — write-through enqueue with per-entity coalescing
  (same op type keeps its idempotency key; op-type change gets a fresh key),
  pull → merge (LWW + tombstone wins) → push FIFO → ack, temp-ID remap events
  for notes, exponential retries capped at 5 (then `error` status), and
  triggers: connectivity regained, app foreground, mutation debounce
  (1.5 s), periodic retry (30 s), and manual "Sync now".
- `lib/connectivity.ts` — NetInfo auto-detection (debounced ~1.5 s offline,
  immediate online) with the existing API health probe as fallback. The
  manual Offline Mode toggle remains a separate persisted override;
  `effectiveOffline = offlineMode || connectivity === offline`.
- `contexts/SyncStatusContext.tsx` — global sync status provider
  (connectivity, syncing, pending/error counts, last sync time).
- UI: header cloud icon immediately left of Search (cloud / cloud-off /
  cloud-upload / cloud-alert + pending badge, tap opens Sync Status), a
  persistent non-blocking offline/pending banner, and the Sync Status /
  Outbox screen with per-op status, errors, and manual retry.
- Wiring: settings, progress, SRS cards/settings, saved words, notes, watch
  history, and the EPUB bookshelf all write through the durable outbox. The
  old notes/saved-words queues were replaced by the engine (their public APIs
  were kept for call-site compatibility). Pull merges refresh local caches
  for notes, saved words, settings, progress, SRS, and the bookshelf.
- i18n: 10 new keys added through the standard CSV workflow (all 31 locales).

### Offline UX — how users know they are offline

**State model.** The app exposes one sync status:

- `connectivity`: `online` / `offline` / `unknown` (auto-detected, ephemeral)
- `offlineMode`: manual Phase 1 toggle (persisted, local-only)
- `effectiveOffline`: `offlineMode || connectivity === "offline"`
- Global sync state: `synced` / `syncing` / `pending` / `error`
- Per item: `synced`, `pending`, `syncing`, `error`
- Global: pending count, `lastSyncAt`, `lastError`

### Header cloud status icon

Add a global status icon in `components/layout/Header.tsx`, immediately to the
**left of the Search icon**, visible on all signed-in screens:

- **Synced** — cloud with a check (or plain muted cloud), no badge.
- **Syncing** — cloud with an up arrow (or animated cloud) while a sync cycle
  is actively pushing/pulling. Any CRUD operation that enqueues a row and
  starts flushing it shows this state until the server acknowledges it.
- **Offline** — cloud with a slash (cloud-off) when `effectiveOffline` is
  true, with a small pending-count badge when the outbox is non-empty.

Recommended additions so the icon is never ambiguous:

- A small numeric badge (`3`) whenever the outbox has pending ops but the app
  is not actively syncing (offline, backoff, or waiting for the next trigger).
- An error state (cloud with alert) when any op has exhausted retries and
  needs attention.
- Tapping the icon opens the central Sync Status / Outbox screen.

State transition rule: a local write sets the icon to `syncing` only when a
sync attempt can actually run; while `effectiveOffline` is true, the icon
shows `offline` + pending count instead. The icon returns to `synced` only
after the outbox is empty and the last pull succeeded. Use semantic tokens and
an accessible label; never rely on color alone.

**Alternatives considered.**

- **Icon-only cloud (chosen)** — compact and always visible, but needs the
  pending badge and tap-through to the outbox screen to explain itself.
- **Status pill with text** ("Synced" / "3 pending" / "Offline") — clearer,
  but too wide on phone headers; use as the detail-screen variant.
- **Per-item status chips only** — good detail on notes/saved words/review
  cards, but no global reassurance; keep them in addition to the icon.
- **Transient toast after every save** ("Saved locally" / "Synced") — noisy
  and gives no persistent state; not sufficient on its own.
- **Always-visible banner** — too intrusive once everything is synced; keep
  the banner for offline/pending/error states only.

**Indicators.**

- **Persistent, non-blocking banner** when the device is offline or Offline
  Mode is on: "Offline — changes are saved on this device" plus "N waiting" and
  a "Sync now" action. It does not cover content and cannot be dismissed while
  still offline (Gmail's outbox + Google's offline bar pattern).
- **Global pending badge** in the header / Me tab: `Offline · 3 pending` or
  `3 pending` when online but unsynced.
- **Per-item badges** on notes, saved words, SRS cards, and reading progress:
  "Saved locally", "Waiting to sync", "Syncing…", "Needs attention" — the
  notes list already has `_syncStatus`; this extends it everywhere.
- **A central Sync Status / Outbox screen** listing domains, pending operations,
  last successful sync, per-item retry, and error explanations. This is the
  "what will happen when I'm back online?" answer.
- **Optimistic UI** with rollback only on a permanent validation error, never
  on a transient network failure.
- **Dim network-only actions** while offline; local actions (notes, saved
  words, reviews, reading) stay enabled.
- **Non-blocking conflict prompt** only when a conflict cannot be auto-resolved
  (proposed: notes only): "A conflict was detected. Tap to review changes,"
  with side-by-side comparison. Default LWW resolves everything else silently.
- **Freshness cues**: "As of 14:32" on cached content and a subtle syncing
  indicator, rather than hiding content or showing spinners.

### Definition of done (Phase 2)

- ✅ A full offline session (write notes, save words, review cards, set
  progress, watch part of a video, read an EPUB) writes through the durable
  outbox and survives app kill / airplane mode. Two-way sync is implemented;
  the full manual checklist (below) still needs device verification.
- ✅ Two devices editing concurrently converge via LWW + tombstones
  (server-side LWW guards + client merge; deleted items are not resurrected).
  Manual two-device verification is still pending.
- ✅ Replaying the same outbox op (retry, crash, duplicate network response)
  cannot create a duplicate row (server-side idempotency keys).
- ✅ The sync status UI covers online / offline / offline mode / pending /
  syncing / error (banner, header icon, Sync Status screen).
- ✅ The header cloud icon reflects synced / syncing / offline (plus
  pending/error badges) and opens the Sync Status screen on tap.
- ⚠️ Existing local stores remain in place (SecureStore/AsyncStorage caches
  still render); `sync.db` is the durable write path. Full migration of the
  render caches into `entity_cache` is not yet done. The Phase 1 Offline Mode
  toggle remains device-local and is never included in a sync payload.
- ✅ Auto-detected offline never flips the persisted Offline Mode toggle, and
  manual Offline Mode stays on even when connectivity returns.
- ✅ `npx turbo typecheck` passes before commit; server `test_sync.py` +
  user-data endpoint tests pass.

**Deferred within Phase 2**: per-item sync badges on saved words / SRS /
reading progress (notes already has `_syncStatus`), the non-blocking conflict
prompt for notes, and migration of render caches into `entity_cache`.

### References

- [Notion engineering — How we made Notion available offline](https://www.notion.com/de/blog/how-we-made-notion-available-offline)
- [Notion help — Use pages offline](https://www.notion.com/en-gb/help/use-pages-offline)
- [Turso — Building Local-First Apps: The Complete Guide](https://turso.tech/blog/building-local-first-apps-the-complete-guide-to-offline-first-database-sync)
- [Gmail offline — Outbox behavior](https://support.google.com/mail/answer/1306849)
- [Google Drive offline — indicators and sync](https://support.google.com/drive/answer/6388103)
- [How-To Geek — How to Use Google Docs Offline](https://www.howtogeek.com/404811/how-to-use-google-docs-offline/)
- [Designing Offline-First UX for PWA Transitions](https://needlecode.com/blog/pwa/designing-offline-first-ux-pwa-transitions.html)
- [Oracle Mobile UX — Offline pattern](https://www.oracle.com/webfolder/ux/mobile/pattern/offline.html)

---

## Testing — Phase 1

Manual verification checklist:

1. Settings → Network → Offline Mode → enable.
2. Open a downloaded dictionary language and confirm dictionary lookups come
   from SQLite and still work.
3. Open tokenized text and confirm the local `lemmatizeText()` fallback runs
   (server call fails fast, no 3s hang). With Offline Mode on,
   `lemmatizeText()` skips the server entirely and goes straight to the local
   chain (see SPEC-018 Phase 3g), and `TokenizedText` / the EPUB reader skip
   their `/lemmatize-normalized/batch` requests the same way.
4. Start a dictionary download while Offline Mode is on; confirm it fails
   fast and does not replace an existing downloaded dictionary.
5. Disable Offline Mode; confirm networking resumes immediately.
6. Reload the app with Offline Mode enabled; confirm no boot-time network calls
   are made and an expired session is not logged out.
7. Inspect the `PUT /user-settings` payload (network inspector or server logs)
   and confirm `offlineMode` never appears.
8. Use settings search for "offline" and "network"; confirm the row appears.

## Testing — Phase 2

Manual verification checklist:

1. With the device offline (airplane mode), create and edit notes, save and
   remove words, review SRS cards, change learning progress, watch part of a
   video, and read an EPUB; kill and relaunch the app while still offline.
2. Confirm all changes are still present locally and the UI shows "Saved
   locally" / "Waiting to sync" states with a pending count.
3. Reconnect; confirm every change appears on the server exactly once, temp
   note IDs are remapped, and the pending count returns to zero.
4. Repeat on a second device with conflicting edits; confirm deterministic
   LWW convergence and that deleted items stay deleted.
5. Force a retry/network failure mid-push (kill app after server commit but
   before ack); confirm the idempotency key prevents duplicates.
6. Let outbox attempts exhaust for one item; confirm it shows "Needs
   attention" and can be retried from the Sync Status screen without affecting
   other pending items.
7. Turn on Offline Mode while pending ops exist; confirm no network attempts
   occur and the pending badge still updates locally; turn it off and confirm
   sync resumes.

---

## Edge Cases

- **Fast toggle spam** — SecureStore writes are serialized so the final
  persisted value matches the last toggle.
- **SecureStore unavailable** — the in-memory gate still applies for the
  session, but the value will not survive restart.
- **Offline Mode on at boot with an expired token** — session is preserved;
  the next network call after going online triggers the normal refresh path.
- **Cloud settings load fails while offline** — `cloudLoaded` is reset so
  hydration retries when Offline Mode is turned off.
- **Dictionary download blocked mid-flight** — the gate only blocks new
  requests; users can cancel an in-progress download manually.

---

## Open Questions

- Should native image and WebView traffic also be blocked? Currently deferred;
  doing so would require per-media handling rather than a JS-level gate.
- Should turning Offline Mode on abort all in-flight requests? Currently no;
  the existing cancel controls cover dictionary downloads.
- Phase 2: should the unified store be a new `sync.db` SQLite database or an
  evolution of the existing AsyncStorage/SecureStore queues? SQLite is
  recommended because outbox + cache + cursor need atomic transactions.
- Phase 2: should the server use a per-user `user_sync_log` sequence for the
  pull cursor, or query `updated_at` across tables? A change log is recommended
  to avoid timestamp ties and missed rows.
- Phase 2: which domains, if any, should prompt for manual conflict review
  instead of silent LWW? Notes is the proposed candidate; everything else is
  low-contention personal data.
- Phase 2: should watch history be queued at all, or stay best-effort with
  coalescing to the latest position per video? Queued-with-coalescing is
  recommended so offline watching is not lost.
- Phase 2: should EPUB bookshelf/progress sync to the existing `/bookshelf`
  endpoint? Recommended yes, but it is currently local-only.
- Phase 2: should locally cached notes be encrypted? Notes currently live in
  AsyncStorage in plain text; moving them to SQLite is an opportunity to
  revisit that.

---

## Related Docs

- [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md)
- [SPEC-018 — Mobile Local Tokenization & Lemmatization](018-local-tokenization-mobile.md)
- [SPEC-015 — Mobile Settings Full Parity Completion](015-mobile-settings-completion.md)
- [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)
- [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md)
