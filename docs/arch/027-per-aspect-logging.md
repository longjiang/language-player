# Per-Aspect Logging (Log Domains)

## Metadata
- **Arch ID**: ARCH-027
- **Feature**: Per-aspect log domains with per-domain level overrides
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-08-11
- **Last Updated**: 2026-08-11
- **Scope**: Shared (`packages/utils`), Mobile (`apps/mobile`); the mechanism is available to any app that wraps `createLogger` (e.g. web)
- **See also**:
  - `packages/utils/src/logger.ts` — shared logger + domain resolution
  - `apps/mobile/lib/logger.ts` — mobile app wrapper and domain logger exports
  - `docs/arch/012-metro-debugging-process.md` — Metro debugging workflow
  - AGENTS.md → "All logging must be gated by an app-wide switch" conventions

---

## Overview

The app logs a lot: tokenizer batches, reader render timing, popup lookup timing,
sync engine pushes/pulls, and translation requests. Before domains, every log
line was gated by a single global `LOG_LEVEL`, so debugging one subsystem meant
either seeing everything or seeing nothing.

The shared logger now supports **log domains**: a logger is created with an
optional domain name (e.g. `translation`), and each domain has its own effective
level. A domain override wins over the global level, so you can keep the global
level at errors-only while following translation in full detail, or silence the
sync domain completely without touching anything else.

## Design

### Level semantics (unchanged)

| Level | Shows |
|---|---|
| 0 | nothing |
| 1 | `logerr()` |
| 2 | `logerr()` + `logwarn()` |
| 3 | everything (`log()` + `logwarn()` + `logerr()`) |

### Domain resolution

Each log call computes its effective level:

```
domain override (runtime setLogLevel) → domain env var → global logLevel
```

Rules:
- A logger created **without** a domain behaves exactly as before (global level).
- A **domain override replaces the global level** for that domain. `setLogLevel(0, 'sync')`
  silences even sync errors; `setLogLevel(3, 'translation')` shows every
  translation line even when the global level is `1`.
- Every line is emitted as `[LP Mobile] [domain] message` (e.g.
  `[LP Mobile] [translation] request …`), so both the app and the domain can
  be filtered in a shared console; messages without a domain stay
  `[LP Mobile] message`.

### API

| Function | Description |
|---|---|
| `createLogger(appPrefix, domain?)` | Create a logger bound to an app prefix and optional domain |
| `getLogLevel(domain?)` | Global level, or a domain's effective level |
| `setLogLevel(level, domain?)` | Set the global level, or a domain override at runtime |
| `EXPO_PUBLIC_LOG_LEVEL_<DOMAIN>` / `NEXT_PUBLIC_LOG_LEVEL_<DOMAIN>` | Build-time domain override (domain upper-snake, e.g. `translation` → `TRANSLATION`) |

Example:

```js
setLogLevel(1)                  // global: errors only
setLogLevel(3, 'translation')   // translation: full detail
setLogLevel(0, 'sync')          // sync: completely off
getLogLevel('translation')      // → 3
```

## Mobile Domains

All domain loggers are exported from `apps/mobile/lib/logger.ts`.

| Domain | Export | Routed code | Default |
|---|---|---|---|
| `translation` | `translationLogger` | EPUB translate chunk requests/failures in `hooks/use-epub-pagination.ts` | global |
| `tokenizer` | `tokenizerLogger` | `lib/tokenizer.ts`, `lib/tokenizer-worker.ts`, `TokenizedText` lemmatize/batch/fallback logs, `use-epub-pagination` lemmatize batches | global |
| `reader` | `readerLogger` | `PaginatedReader` render + lazy-tokenization-window diagnostics | global |
| `popup` | `popupLogger` | `TokenizedText` token-press/popup timing + `DictionaryPopup` lookup timing | global |
| `sync` | `syncLogger` | `lib/sync-engine.ts`, `lib/sync-db.ts`, `lib/notes-sync.ts`, progress/SRS queue hooks, sync-related `SavedWordsContext` lines (migration, hydration, pull-merge, enqueue) | **off** (unless `EXPO_PUBLIC_LOG_LEVEL_SYNC` is set) |

### Adding a new domain

1. Export a logger in `apps/mobile/lib/logger.ts`:
   `export const myDomainLogger = createLogger('[LP Mobile]', 'my-domain');`
2. Route that area's call sites to `myDomainLogger.log/logwarn/logerr`.
3. Control it with `setLogLevel(0|1|2|3, 'my-domain')` or
   `EXPO_PUBLIC_LOG_LEVEL_MY_DOMAIN=3`.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Optional domain argument on `createLogger` | Backward compatible — existing loggers and call sites need no changes. |
| Domain override replaces global | Enables both "quiet everything except X" and "silence X completely". |
| Env suffix is the domain in upper-snake case | Predictable per-domain build-time control (`TRANSLATION`, `TOKENIZER`, `SYNC`, …). |
| `sync` defaults off in mobile | Sync is the noisiest background subsystem; it can be re-enabled at runtime (`setLogLevel(3, 'sync')`) or build time. |
| Resolution order runtime → env → global | Runtime toggles are immediate for debugging; env pins the default for a session/build. |
