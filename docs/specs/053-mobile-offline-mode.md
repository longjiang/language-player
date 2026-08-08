# SPEC-053 — Mobile Offline Mode (Local Network Kill Switch)

## Metadata

- **Spec ID**: SPEC-053
- **Feature**: Settings → Network → Offline Mode
- **Status**: complete (implemented 2026-08-07)
- **Created**: 2026-08-07
- **Scope**: `apps/mobile` only
- **Related specs**: [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md) · [SPEC-018 — Mobile Local Tokenization](018-local-tokenization-mobile.md) · [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)
- **Related architecture**: [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md)

---

## Overview

Offline Mode is a mobile-only setting that blocks all app-level network
requests without touching the host's network stack. It gives users a
deterministic way to keep using downloaded dictionaries and local tokenizers
while preventing the app from making any network calls, and it gives
developers a way to exercise the offline fallback chain without killing Metro
or disabling the Mac's Wi-Fi.

The setting is intentionally **local-only**: it is stored in SecureStore under
its own key, outside `SettingsV2`, and is never sent to `GET/PUT
/user-settings`. It does not sync to the user's account or to other devices.

---

## User Stories

- As a user in a low-connectivity environment, I want to switch the app into
  Offline Mode so downloaded dictionaries and tokenizers keep working while
  nothing tries to phone home.
- As a developer, I want to simulate full app-level network failure without
  killing Metro or changing the Mac's network so I can verify offline fallbacks
  and error states.
- As a user who cares about device-local control, I want this setting to stay
  on this device only and never sync to my account.

---

## Requirements

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
  sync behavior).

---

## Architecture

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

## Implementation

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

## Testing

Manual verification checklist:

1. Settings → Network → Offline Mode → enable.
2. Open a downloaded dictionary language and confirm dictionary lookups come
   from SQLite and still work.
3. Open tokenized text and confirm the local `lemmatizeText()` fallback runs
   (server call fails fast, no 3s hang).
4. Start a dictionary download while Offline Mode is on; confirm it fails
   fast and does not replace an existing downloaded dictionary.
5. Disable Offline Mode; confirm networking resumes immediately.
6. Reload the app with Offline Mode enabled; confirm no boot-time network calls
   are made and an expired session is not logged out.
7. Inspect the `PUT /user-settings` payload (network inspector or server logs)
   and confirm `offlineMode` never appears.
8. Use settings search for "offline" and "network"; confirm the row appears.

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

---

## Related Docs

- [SPEC-013 — Mobile Offline Dictionary](013-mobile-offline-dictionary.md)
- [SPEC-018 — Mobile Local Tokenization & Lemmatization](018-local-tokenization-mobile.md)
- [SPEC-015 — Mobile Settings Full Parity Completion](015-mobile-settings-completion.md)
- [ADR-0015 — Settings UI and Search](../adr/0015-settings-ui-and-search.md)
- [ARCH-018 — Local Tokenization Strategy](../arch/018-local-tokenization-strategy.md)
