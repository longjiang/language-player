# Build Ledger

Every build of Language Player 3 (`ca.zerotohero.go`): store/TestFlight
uploads and dev (Debug) builds, one row per commit, chronological.

- **Store / TestFlight builds** — every upload to any track of either
  store, sharing one monotonic build number: `3.1.2 — iOS TestFlight (b5,
  consumed) · Android Internal testing (b5, consumed)`. Numbers are never
  reused or decreased (SPEC-076).
- **Dev builds** — always **Debug** configuration (Metro-connected; JS
  served at runtime). Never Release configuration. Format: `dev 4 (Debug;
  active; lp-dev-4-….zip; <sha256>)`. Retention keeps the 3 most recent
  dev builds recoverable in `.dev-builds/` (override: `LP_DEV_BUILD_DIR`);
  older artifacts move to `.dev-builds/archive/` and are marked archived.
  Rows 1–2 are the only historical Release-config dev builds (legacy,
  archived) — no new ones, ever.

| # | Commit | Date | Store / TestFlight builds | Dev builds |
|---|---|---|---|---|
| 1 | 339fcf0e | 2026-08-13 | 3.0.0 — iOS App Store (b1, live) · Android Internal/Closed testing (b1, consumed) · Android Production (b2, live) | — |
| 2 | 97a05bd0 | 2026-08-14 | 3.1.0 — iOS App Store (b3, consumed) · Android Internal testing (b3, consumed) | — |
| 3 | 1c86cd8a | 2026-08-15 | 3.1.1 — iOS TestFlight (b4, consumed) | — |
| 4 | 92a611ed | 2026-08-16 | 3.1.2 — iOS TestFlight (b5, consumed) · Android Internal testing (b5, consumed) · tags v3.1.2, v3.1.2-b5 | — |
| 5 | 3c98c0bd | 2026-08-16 | — | dev 1 (Release-config, legacy; archived; lp-dev-1-ios-device-3c98c0bd6865.zip; 75ffcf2242dc9ca9f3c293cb0ef63dee9482d8edbea90087baf1f1ca84a3b9c2) · dev 4 (Debug; active; lp-dev-4-ios-device-3c98c0bd6865.zip; 8acff05f74d0c135cd0020dab5de5ea937812ac70e08a3861ba4763321a3a1b2) |
| 6 | ddb8cc50 | 2026-08-16 | — | dev 2 (Release-config, legacy; archived; lp-dev-2-ios-device-ddb8cc50f8d9.zip; 1437ff69da9b72fd366949974ecd036518a6531fdef86f44a71c763d4512e3ea) · dev 5 (Debug; active; lp-dev-5-ios-device-ddb8cc50f8d9.zip; 9d66e6cb66b44cd0183540c18ea7d5b5afe8a58edb140745184e1a80136ea1cb) |
| 7 | 88135bde | 2026-08-16 | — | dev 3 (Debug; archived; lp-dev-3-ios-device-88135bde47af.zip; 6e10c5aed4541adf030f02325001dbe72bf0416388776ea0754446a694d8ea5e) |
| 8 | e64bcf32 | 2026-08-17 | — | dev 6 (Debug; active; lp-dev-6-ios-device-e64bcf325739.zip; 72d49156cf3b018f9dd165319ef66d05e3f8aa1aabd971e96b56a63dbaf21183) |
