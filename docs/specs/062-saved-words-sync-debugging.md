# SPEC-062: Saved Words Sync Debugging — Cross-Device Divergence & Account Pollution

## Metadata

- **Spec ID**: SPEC-062
- **Feature**: Diagnose and fix saved-words cross-device divergence (web Safari iPad/iPhone), `tester.mary` account pollution with `jon.long`'s words, and ensure all four clients use the SPEC-034 row API with correct logout wiping
- **Status**: investigation complete; quick wins implemented 2026-08-10 (see below); Chrome extension Phase 2 fixes complete 2026-08-13; web/mobile/Classic hydration work still pending
- **Created**: 2026-08-10
- **ROADMAP Phase**: Phase 9: Backend Consolidation (cross-cutting)
- **See also**: [SPEC-034 (Saved Words, complete)](034-saved-words-supabase-migration.md), [SPEC-039 (Full Database Migration)](039-full-database-migration-supabase.md), [ARCH-014 (Saved Words Data Flow)](../arch/014-saved-words-data-flow.md)

## Symptoms

1. **Cross-device divergence**: logged into production `apps/web` on an iPad and an iPhone (Safari), saved words on both, refreshed both — saved-words counts differ and words saved on one device are missing on the other.
2. **Test-account pollution**: `tester.mary@zerotohero.ca` has 2,186 saved words — clearly not a test account's data; the set closely matches `jon.long@zerotohero.ca` (2,225).
3. **Logout hygiene requirement**: every current app (web, mobile, Classic/Nuxt, Chrome extension) must wipe the user's data from the device on logout.

## Environment Timeline (important context)

| Time (PDT 2026-08-10) | Event |
|---|---|
| 04:01 | gunicorn master started (pre-teardown code) |
| 12:08–12:13 | workers autorestarted (still pre-teardown code) |
| 12:24–12:36 | sweep cron hits `/saved-words/reconcile-sweep` every minute; web PUTs/GETs all 200 |
| 12:35 | teardown files copied to VPS (`routes/saved_words.py` mtime) |
| 12:37 | initial production smoke: `/user-data` 200, `/saved-words/reconcile-sweep` 500 (old code still running) |
| 12:38 | gunicorn restarted cleanly on new code |
| 13:0x | sweep cron commented out (`# DISABLED 2026-08-10 (SPEC-039 WS-8)`) |
| after 12:38 | re-smoke: `/saved-words` 200; `/user-data` 404; `/saved-words/reconcile-sweep` 404 ✅ |

**Conclusion**: production now runs the SPEC-039 WS-8 teardown code, so the mirror/reconciler/sweep is no longer executing. The iPad/iPhone reproduction must be re-run against this code before any client fix is judged; the earlier observations were against the pre-teardown backend.

## Investigation Findings

### 1. Backend / data forensics (Supabase, read-only)

| Query | Result |
|---|---|
| Mary rows / Jon rows | 2,186 / 2,225 |
| Shared `(l2, word_id)` | 2,060 |
| Mary-only / Jon-only | 126 / 165 |
| Shared rows with identical `first_saved_at` + `updated_at` + `forms` | **2,060 / 2,060** — wholesale copy |
| `user_saved_word_sync.last_classic_blob` overlap (Mary vs Jon) | 2,156 shared — the Directus blobs were cross-contaminated |
| Other test accounts | `tester.bob` = 4 rows, **zero** overlap with Jon; all other `test.*` = 0 rows (one has 5). Pollution is Mary-specific |
| Orphan rows | 151 rows keyed by numeric Directus ids + a few UUIDs not in `auth.users` (cleanup item) |
| Production routes now | `/saved-words` 200; `/user-data` 404; `/saved-words/reconcile-sweep` 404 |

**Interpretation**: Mary's Directus `user_data.saved_words` blob contained Jon's words (identical timestamps/forms for the shared set) before the SPEC-034 backfill. The backfill copied the polluted blob faithfully — the SPEC-034 "Mary PASS 2,186/2,186" only verified count equality against the source blob, not that the blob was Mary's own data. The most plausible pollution mechanism is the **old full-blob sync** (Classic localStorage `zthSavedWords` and/or the Chrome extension) uploading another account's store into Mary's blob, e.g. when Mary logged in on a browser/extension that still held Jon's words.

### 2. Client audit

#### apps/web (Next.js)

- ✅ Uses the row API (`packages/api-client/src/saved-words.ts` → `GET/PUT /saved-words`, `DELETE /saved-words/{l2}/{id}`).
- ⚠️ **Local-first render**: on mount it reads `localStorage.zthSavedWords` and sets `loaded = true`; server hydration happens afterward and replaces state. The Saved Words page gates on `loaded`, so it renders the **stale device-local snapshot** for the whole hydration window (~0.5–1.2s+ for Mary's 2,186-word store), and if hydration fails it keeps the stale snapshot forever with no indicator.
- ⚠️ **No in-memory reset on logout**: `clearUserData()` clears localStorage (from the user menu), but the hook's `savedWords` state and `hydratedUserId` ref survive. Logging back in as the **same user** without a full page reload skips hydration entirely (stale state); logging in as a different user hydrates correctly.
- ⚠️ **Dead-session logout doesn't wipe**: `ApiClientProvider` calls `signOut({ redirect: false })` on a dead refresh token without `clearUserData()`.
- ⚠️ **Anonymous merge can re-pollute shared devices**: `mergeAnonymousSavedWordsEnabled()` (env `NEXT_PUBLIC_MERGE_ANONYMOUS_SAVED_WORDS`, default off) merges `localStorage.zthSavedWords` into the logged-in account once per browser (`lpSavedWordsAnonMerged`). On a shared device where another user's words are in localStorage, that uploads them into the current account. The key is also global (not per-user) and is deleted by logout wipe, so re-login re-merges.
- ⚠️ `saveWord` mutates the existing record object in state (React anti-pattern; can cause subtle staleness).

#### apps/mobile (Expo)

- ✅ Row API + SPEC-053 durable outbox (`sync-engine`, `entity_cache`); pull-merge bridge applies remote changes.
- ✅ **Logout wipe is thorough**: `AuthContext.logout()` → `wipeUserData()` (SecureStore keys incl. `zthSavedWords`, AsyncStorage keys, `sync.db` outbox/cache, recent searches, offline-mode reset).
- ✅ Resets in-memory state and `hydratedUserId` on user change (including logout→login as the same user).
- ⚠️ Same **local-first render** pattern as web: `loaded` becomes true after SecureStore load, then server hydration replaces state (stale window; stale fallback if hydration fails).
- ⚠️ `zthSavedWords` is persisted in **SecureStore**; Mary's ~175KB store likely exceeds SecureStore value limits, so the write fails silently and is only best-effort in memory (not a sync bug, but a device-resume/offline gap).

#### classic/nuxt (`zerotohero-nuxt`)

- ✅ Row API in `store/savedWords.js` (`GET/PUT /saved-words`, `DELETE /saved-words/{l2}/{id}`); localStorage is only a cache.
- ⚠️ **No logout wipe at all**: `pages/logout.vue` and `plugins/auth-guard.js` (`clearDeadSession`) call `$auth.logout()` but never remove `zthSavedWords` or other user-data keys from localStorage.
- ⚠️ Same local-first render pattern (`savedWordsLoaded` set by the localStorage `load()` action before `fetchFromFlask` replaces state).
- ✅ Cross-tab mutations are shared via `vuex-shared-mutations` for ADD/REMOVE only (no full-store overwrite across tabs).

#### apps/chrome-extension

- ✅ Row API (`GET/PUT /saved-words`, `DELETE /saved-words/{l2}/{id}`) via Flask → Supabase (SPEC-034) — migrated in `3ed4ec80`.
- ✅ Auth via Flask `/auth/login` + `/auth/refresh` (Supabase/GoTrue JWT in `chrome.storage.local`) — migrated in `3ed4ec80`.
- ✅ No full-blob sync: writes are per-word optimistic PUT/DELETE, not whole-store uploads.
- ✅ `SavedWordsProvider` resets on auth change/logout, ignores stale in-flight responses, and loads only the current L2 (2026-08-13).
- ✅ Refresh calls are single-flighted and a dead/rotated refresh token clean-logouts instead of looping (2026-08-13).

## Root Causes

1. **Mary pollution (data-level)**: old full-blob sync copied Jon's store into Mary's Directus blob; SPEC-034 backfilled the polluted blob; the mirror/reconciler then treated it as canonical and wrote it into Supabase rows. Mary's account now contains 2,060 of Jon's words with identical timestamps/forms.
2. **Cross-device count divergence (client-level)**: all three UI apps render the device-local snapshot before server hydration completes and fall back to it silently on hydration failure. With Mary's large store, the hydration window is long enough to observe different counts on two devices; any transient hydration failure leaves a device permanently stale. (The extension's full-blob overwrite can cause real cross-device data loss, independent of hydration.)
3. **Production timing confound**: until 12:38 PDT, production ran pre-teardown code with a Directus round-trip on every GET (lazy reconcile) and a live sweep — extra failure modes and mutation during the observed window.
4. **Logout hygiene gaps**: Classic wipes nothing; web wipes only on explicit menu logout; the extension originally had no saved-words state reset on logout (fixed 2026-08-13).

## Proposed Fixes

### Quick wins (implemented 2026-08-10)

- **Classic logout wipe**: new `zerotohero-nuxt/lib/logout-wipe.js` clears account-scoped localStorage keys (`zthSavedWords`, `zthSavedPhrases`, `zthProgress`, `zthBookshelf`, `zthHistory`, `zthFullHistory`, `zthSettings`, etc.); called from `pages/logout.vue` and the stale-token guard (`plugins/auth-guard.js`).
- **Web dead-session wipe**: `ApiClientProvider` now calls `clearUserData()` before `signOut()` when the refresh token is dead.
- **Web auth-change reset**: `useSavedWords` drops in-memory state and `hydratedUserId` on any auth-user change, so logout → login as the **same user** rehydrates instead of showing stale state.
- **Web per-user anonymous-merge key**: the merge-once flag is now `lpSavedWordsAnonMerged:<userId>`; `clearUserData()` removes all per-user variants. Prevents one account's words being merged into another account on a shared device.
- **Web immutable save**: `saveWord` no longer mutates the existing record object in state.

### Phase 1 — Data remediation (backend)

1. Decide Mary's canonical set. Recommended: **remove the 2,060 rows shared with `jon.long`** (keep Mary's 126 own words); alternative: reset Mary to 0. Confirm Jon's set is authoritative first.
2. Add a verification query: Mary's overlap with Jon = 0, Bob unchanged (4), no growth over 24h.
3. Clean the 151 numeric-id orphan rows (after confirming they're unmapped/deleted users) and the few UUID orphans not in `auth.users`.
4. Finish WS-8: run `tmp/supabase-saved-words-teardown.sql` (backs up + drops `user_saved_word_sync`, `saved_words_sweep_state`) — the backup tables were useful for this forensics, but the scaffolding is now dead code in production.

### Phase 2 — Client fixes

#### apps/web

- Gate `loaded` on **server hydration** when authenticated (render loading state, don't show the localStorage snapshot as authoritative); on hydration failure, fall back to local with an explicit "offline/stale" indicator and retry.
- Reset `savedWords` + `hydratedUserId` on auth change (logout/login as same user must rehydrate).
- Call `clearUserData()` on **every** logout path, including the dead-session `signOut` in `ApiClientProvider`.
- Make the anonymous-merge flag per-user (`lpSavedWordsAnonMerged:<userId>`) or remove the feature; verify it is **off** in production.
- Stop mutating records inside `setSavedWords` (`saveWord`).

#### apps/mobile

- Same hydration-gating fix (`loaded` should mean cloud-hydrated when authenticated).
- Move `zthSavedWords` from SecureStore to AsyncStorage (or keep in-memory only) so large stores persist on device resume.

#### classic/nuxt

- Wipe `zthSavedWords` (and the other user-data localStorage keys web wipes) in `pages/logout.vue` and `plugins/auth-guard.js` before/after `$auth.logout()`.
- Gate `savedWordsLoaded` on `fetchFromFlask` completion when logged in (show loader until server state replaces local).

#### apps/chrome-extension

- ✅ Port auth to Flask `POST /auth/login` (Supabase/GoTrue token via Flask) and store the token in `chrome.storage.local`.
- ✅ Port saved words to the row API: `GET /saved-words`, `PUT /saved-words`, `DELETE /saved-words/{l2}/{id}`; removed `src/saved-words.ts` blob code.
- ✅ Reset `SavedWordsProvider` state on auth change/logout and ignore stale responses.
- ✅ Move `syncSavedWords` out of the `setState` updater; use the same optimistic + retry pattern as web/mobile.
- ✅ Rebuild the extension after edits (`node apps/chrome-extension/build.mjs`).

### Phase 3 — Performance optimization (single-l2 loading)

- **Users should load saved words for a single `l2` at a time, not the whole
  multi-language store.** Today `SavedWordsProvider` is mounted in the web
  root layout and calls `GET /saved-words` with no `l2`, so every authenticated
  page downloads the user's entire vocabulary (~1.35MB for Mary's polluted
  set; grows linearly with word count). Combined with the 15s client timeout,
  heavy users hit `NETWORK_ERROR` and fall back to stale local data.
- Hydrate only the current language's words per page; the saved-words page
  fetches the l2s it displays (paginated if large). Keep the store keyed by
  `l2` so cross-language lookups remain cheap without one giant fetch.
- Backend: make `GET /saved-words?l2=<code>` the primary read path and add
  pagination for large l2 sets; keep the no-l2 response for the saved-words
  page only if it remains within timeout budget.
- Client: load instances/contexts lazily per word where a list view doesn't
  need them, instead of bundling every context into the hydration payload.
- Acceptance for this phase: page-load cost must not scale with total
  vocabulary size — a heavy user's first hydration completes inside the
  client timeout regardless of how many words they have saved.

## Verification Plan

1. **Cross-device matrix** (production): web on iPad Safari + iPhone Safari, mobile, Classic, extension — save on A, refresh B → word appears; delete on A, refresh B → gone; counts equal after hydration on both.
2. **Hydration failure drill**: block `/saved-words` on one device (offline/DevTools) → app shows stale indicator, recovers when network returns.
3. **Logout wipe matrix**: for each app, log in as Mary, save a word, log out, log in as Bob → Bob's saved words don't include Mary's; localStorage/AsyncStorage/SecureStore keys for saved words are gone.
4. **Mary cleanup verification**: overlap with Jon = 0; count stable over 24h; Bob 4 rows unchanged.
5. Re-run the production smoke after the extension ships: `/saved-words` 200, `/user-data` 404, `/saved-words/reconcile-sweep` 404.
6. **Single-l2 performance**: time `GET /saved-words?l2=zh` vs no-`l2` for a heavy user; confirm first page load hydrates within the client timeout and no longer downloads all languages.

## Open Questions

1. Mary's canonical set: delete the 2,060 Jon-overlapping rows, or reset Mary to empty?
2. Is `NEXT_PUBLIC_MERGE_ANONYMOUS_SAVED_WORDS` set anywhere in production/netlify env? Should the merge feature be removed entirely?
3. Does the Chrome extension saved-words feature still need to ship (Prime Video subtitle context), and should its auth move to Flask/GoTrue as part of this work?
4. Are the 151 numeric-id orphan rows safe to delete, or do they belong to users missing from `auth.users` that we still want to keep?

## Acceptance Criteria

- Saving a word on any app/device makes it visible on every other app/device after refresh (or push, where implemented).
- Deleting a word on any app/device removes it everywhere; no resurrection.
- Logging out on any app removes that user's saved-words (and other user-data) state from the device.
- Mary's account no longer contains Jon's words; test accounts are clean.
- A user with any vocabulary size loads quickly: page hydration fetches only
  the current l2's saved words (or paginated), never the full multi-language
  store on every page load.
- All four clients (web, mobile, Classic, extension) call the row API only; zero `/user-data`, `/user-data/sync`, or Directus auth references remain in active source.
