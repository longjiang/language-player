# Dev Build Ledger

Tracked dev builds for Language Player 3 (`ca.zerotohero.go`).

**"Dev build" = DEBUG build** (Metro-connected, Fast Refresh — the artifact
`npx expo run:ios --device` / `run:android` produce). The JS bundle is NOT
embedded; the app loads it from Metro at runtime, so the ledger's commit
covers the native shell + app config at build time.

Dev builds never consume store build numbers (SPEC-076 § 4.2) and are
identified by git commit instead. Every row records the exact commit the
artifact mirrors plus the artifact's SHA-256, so a build can be verified
from the artifact itself (SPEC-076 § 4.8, `scripts/verify-dev-build.mjs`).

**Retention:** the 3 most recent builds (current + 2 previous) are kept
active at the repo-local `.dev-builds/` (gitignored; override with `LP_DEV_BUILD_DIR`). When
a new build is recorded, the oldest beyond the window is moved to
`.dev-builds/archive/` and its row is marked `archived`. Numbers
are never reused — a consumed number stays consumed even if the build is
later discarded.

**Dirty-tree rule:** a dev build must mirror a commit exactly, so
`scripts/dev-build.mjs` refuses to build on a dirty tree unless
`--allow-dirty` is passed; a dirty build is marked `(dirty)` in Status and
does not mirror the commit for sure.

| N | Platform | Git commit | Describe | Date | Artifact | SHA-256 | Status |
|---|---|---|---|---|---|---|---|



| 1 | ios-device | 3c98c0bd6865d0a09c98cfec92264fcacc86f069 | v3.1.2-5-g3c98c0bd | 2026-08-17 | lp-dev-1-ios-device-3c98c0bd6865.zip | 75ffcf2242dc9ca9f3c293cb0ef63dee9482d8edbea90087baf1f1ca84a3b9c2 | active |
| 2 | ios-device | ddb8cc50f8d93070870689a94ba5bb0c2d279aad | v3.1.2-7-gddb8cc50 | 2026-08-17 | lp-dev-2-ios-device-ddb8cc50f8d9.zip | 1437ff69da9b72fd366949974ecd036518a6531fdef86f44a71c763d4512e3ea | active |
| 3 | ios-device | 88135bde47af0b8e26f3ef09754d28ff3b640d64 | v3.1.2-11-g88135bde | 2026-08-17 | lp-dev-3-ios-device-88135bde47af.zip | 6e10c5aed4541adf030f02325001dbe72bf0416388776ea0754446a694d8ea5e | active |
