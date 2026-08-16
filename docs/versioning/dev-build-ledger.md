# Dev Build Ledger

Tracked dev builds for Language Player 3 (`ca.zerotohero.go`).

Dev builds are separate from store builds: they **never** consume store build
numbers (SPEC-076 § 4.2) and are identified by git commit instead. Every row
records the exact commit the artifact mirrors plus the artifact's SHA-256, so
a build can be verified from the artifact alone — no trust in the record
required (SPEC-076 § 4.8, `scripts/verify-dev-build.mjs`).

**Retention:** the 3 most recent builds (current + 2 previous) are kept
active at `~/Desktop/LP-DevBuilds/` (override with `LP_DEV_BUILD_DIR`). When
a new build is recorded, the oldest beyond the window is moved to
`~/Desktop/LP-DevBuilds/archive/` and its row is marked `archived`. Numbers
are never reused — a consumed number stays consumed even if the build is
later discarded.

**Dirty-tree rule:** a dev build must mirror a commit exactly, so
`scripts/dev-build.mjs` refuses to build on a dirty tree unless
`--allow-dirty` is passed; a dirty build is marked `(dirty)` in Status and
does not mirror the commit for sure.

| N | Platform | Git commit | Describe | Date | Artifact | SHA-256 | Status |
|---|---|---|---|---|---|---|---|
