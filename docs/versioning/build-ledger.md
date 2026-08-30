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
| 5 | 3c98c0bd | 2026-08-16 | — | dev 1 (Release-config, legacy; deleted; lp-dev-1-ios-device-3c98c0bd6865.zip; 75ffcf2242dc9ca9f3c293cb0ef63dee9482d8edbea90087baf1f1ca84a3b9c2) · dev 4 (Debug; deleted; lp-dev-4-ios-device-3c98c0bd6865.zip; 8acff05f74d0c135cd0020dab5de5ea937812ac70e08a3861ba4763321a3a1b2) |
| 6 | ddb8cc50 | 2026-08-16 | — | dev 2 (Release-config, legacy; deleted; lp-dev-2-ios-device-ddb8cc50f8d9.zip; 1437ff69da9b72fd366949974ecd036518a6531fdef86f44a71c763d4512e3ea) · dev 5 (Debug; deleted; lp-dev-5-ios-device-ddb8cc50f8d9.zip; 9d66e6cb66b44cd0183540c18ea7d5b5afe8a58edb140745184e1a80136ea1cb) |
| 7 | 88135bde | 2026-08-16 | — | dev 3 (Debug; deleted; lp-dev-3-ios-device-88135bde47af.zip; 6e10c5aed4541adf030f02325001dbe72bf0416388776ea0754446a694d8ea5e) |
| 8 | e64bcf32 | 2026-08-17 | — | dev 6 (Debug; deleted; lp-dev-6-ios-device-e64bcf325739.zip; 72d49156cf3b018f9dd165319ef66d05e3f8aa1aabd971e96b56a63dbaf21183) |
| 9 | abbafdc0 | 2026-08-16 | — | dev 7 (Debug; deleted; lp-dev-7-ios-device-abbafdc0.zip; 3d0c594cc25a4e0c88eb9f080f89be4223837ac8f24924e3b255bc90b06ef321) |
| 10 | 9a23db1c | 2026-08-18 | — | dev 8 (Debug; deleted; lp-dev-8-ios-device-9a23db1c8dea.zip; be3c8020ad81179737112ce85e5510be1c594beb27463d63e4bd0d0fb664bf5e) |
| 11 | 6c12a034 | 2026-08-18 | — | dev 9 (Debug; deleted; lp-dev-9-ios-device-6c12a0348b41.zip; 15b3c7f3727ba1b112021580344b37286844740df75970adedc7ecd7b5fc95cf) |
| 12 | 77ccd8ef | 2026-08-18 | 3.2.1 — iOS TestFlight (b6, consumed) · 3.2.1 — Android Internal testing (b6, consumed) | — |
| 13 | 7f220cf9 | 2026-08-18 | 3.2.2 — iOS testflight (b7, consumed) · 3.2.2 — Android internal (b7, consumed) | — |
| 14 | 0dddc4ba | 2026-08-19 | — | dev 10 (Debug; deleted; lp-dev-10-ios-device-0dddc4ba14fe.zip; 8596df43fe7407a3779402af17c5ccea521a7ec217aefee79a4d5c1ceb0cabe3) |
| 15 | 25c5e426 | 2026-08-19 | 3.2.3 — iOS TestFlight (b8, consumed) · 3.2.3 — Android Internal testing (b8, consumed) | — |
| 16 | 96af02c8 | 2026-08-19 | 3.3.0 — iOS TestFlight (b9, consumed) | — |
| 17 | 56dd0894 | 2026-08-21 | — | dev 11 (Debug; deleted; lp-dev-11-ios-device-56dd08942074.zip; 355ee1f6d2d6e7893c29e1b7a7dba4bdedf29248469716ce61373c5ac5376729) |
| 18 | efaebf55 | 2026-08-21 | 3.3.1 — iOS TestFlight (b10, consumed) · 3.3.1 — Android Internal testing (b10, consumed) | — |
| 19 | b8f9ba0b | 2026-08-22 | — | dev 12 (Debug; deleted; lp-dev-12-ios-device-b8f9ba0bb624.zip; 7ed6de3c217f146a63a0836a3bb4d7c411aa5b0ff3d605dcaf244e6d09bf6fc0) |
| 20 | 3ee53ad9 | 2026-08-21 | 3.3.2 — iOS TestFlight (b11, consumed) | — |
| 21 | 4e9d7176 | 2026-08-22 | — | dev 13 (Debug; deleted; lp-dev-13-ios-device-4e9d717633e9.zip; 1ac86dcd455a633a45c7d9358a4638992516e2d40b9bc9646162b45b67930409) |
| 22 | e36ab809 | 2026-08-22 | — | dev 14 (Debug; deleted; lp-dev-14-ios-device-e36ab8096ad1.zip; 3fb2af1305f999db3a7e89878242002474cb3d9f4cf9c5281047ea77be44f660) |
| 23 | c4d85615 | 2026-08-22 | — | dev 15 (Debug; deleted; lp-dev-15-ios-device-c4d85615eed7.zip; b89001ac519efdab2defbc515ef66582b585f0e43c363d30e1b1ac772343b310) |
| 24 | 59309fb7 | 2026-08-22 | — | dev 16 (Debug; deleted; lp-dev-16-ios-device-59309fb75ee3.zip; 7df3bb7916509e895e774b485bd432a75f144790855dbfabbebd7b6ecda5d115) |
| 25 | a7d1bbca | 2026-08-22 | — | dev 17 (Debug; deleted; lp-dev-17-ios-device-a7d1bbca4042.zip; ba3d3292b2731412e77f024697d9be1201e1112ddca89643c9864066d9f80d78) |
| 26 | 519a1e0e | 2026-08-22 | — | dev 18 (Debug; deleted; lp-dev-18-ios-device-519a1e0ebe79.zip; 8a634be757203caca69f62a323a8008ba83974d49afa6fa630bce8fdc048cbff) |
| 27 | fe329d3d | 2026-08-22 | 3.3.3 — iOS TestFlight (b12, consumed) | — |
| 28 | 5011c677 | 2026-08-23 | — | dev 19 (Debug; deleted; lp-dev-19-ios-device-5011c677be81.zip; 410b96dc73a7187329876a65956d1343d1fad95024643c51377947f59ac432eb) |
| 29 | febdb84a | 2026-08-24 | — | dev 20 (Debug; deleted; lp-dev-20-ios-device-febdb84a1a50.zip; 7db6d5b7562dacc20b47513526a7a865e98b46af5f9ecb00782a965e78cfc4e0) |
| 30 | 344c2155 | 2026-08-24 | — | dev 21 (Debug; deleted; lp-dev-21-ios-device-344c2155386c.zip; 2811bfe49f91c7bc627f97ccf6c14f1d1855c26c8257acf00286d1136c889af6) |
| 31 | f5f87142 | 2026-08-24 | — | dev 22 (Debug; deleted; lp-dev-22-ios-device-f5f87142beb1.zip; d95a96fd83492dbb0562ae2ffb3c3097b120c541638c0c3a0b7fd3a9e284b885) |
| 32 | dbfce4ad | 2026-08-24 | — | dev 23 (Debug; deleted; lp-dev-23-ios-device-dbfce4ad8dbb.zip; 02466cb84819cd3f4ae47f95c21c24907fd73ef44753191fbcb4fee1b929a7ea) |
| 33 | 2d8ccd39 | 2026-08-24 | — | dev 24 (Debug; deleted; lp-dev-24-ios-device-2d8ccd39c37a.zip; a5bc9f26aa34c4b4881a2ab3e168e843b817ec4341a81d587ec44c38e232c60e) |
| 34 | c0d1bedc | 2026-08-24 | — | dev 25 (Debug; deleted; lp-dev-25-ios-device-c0d1bedccc4d.zip; 2241bd1761b0742f6f3062261cc8a92371ee430de039d5ee7f28b67a4bdb0fe9) |
| 35 | ccf27b9e | 2026-08-24 | — | dev 26 (Debug; deleted; lp-dev-26-ios-device-ccf27b9e1450.zip; 6cc8c55d3b4473c0e0844e1ed160fb9b78bd6f059bedccba60d003c038fa11b8) |
| 36 | 57c4d862 | 2026-08-24 | 3.3.4 — iOS TestFlight (b13, consumed) · 3.3.4 — Android Internal testing (b13, consumed) | — |
| 37 | a7b9b1c3 | 2026-08-25 | 3.4.0 — Android Internal testing (b14, consumed) · 3.4.0 — iOS TestFlight (b14, consumed) | — |
| 38 | a9f95469 | 2026-08-27 | — | dev 27 (Debug; active; lp-dev-27-ios-device-a9f95469f3da.zip; 44ef0901cbb24d8be11ed1b8c5d377223bea9ca0742eb0bb251cf8223a4f0e86) |
| 39 | 01828c34 | 2026-08-27 | 3.4.1 — iOS TestFlight (b15, consumed) · 3.4.1 — Android Internal testing (b15, consumed) | — |
| 40 | 2d8e744c | 2026-08-29 | 3.4.2 — Android internal (b16, consumed) · 3.4.2 — iOS TestFlight (b16, consumed) | — |
| 41 | 3738fedc | 2026-08-29 | 3.4.3 — Android internal (b17, consumed) · 3.4.3 — iOS TestFlight (b17, consumed) | — |
| 42 | 4002fb92 | 2026-08-29 | — | dev 28 (Debug; active; lp-dev-28-ios-device-4002fb92a0b7.zip; 4c2825f6626d06d5ae7aa3886aaff36d918b2513b0af7be393a950b175fe4389) |
| 43 | e14479e7 | 2026-08-29 | — | dev 29 (Debug; active; lp-dev-29-ios-device-e14479e78195.zip; fed0e7002bcc488bc130c849230f7dbce9ee0253ca68d318afdf831bb252fe84) |
| 44 | 286d455a | 2026-08-29 | 3.4.4 — iOS TestFlight (b18, consumed) · 3.4.4 — Android Internal testing (b18, consumed) | — |

## Preserved working builds (deleted 2026-08-29)

Both preserved backups below were physically deleted on 2026-08-29 during a
rolling-window cleanup (dev 26/27/28 are the only retained builds). The
descriptions are kept as a historical record of what they were.

- **2026-08-16 — iPad 10 known-good Debug build** (`LanguagePlayer3-ipad10-working-debug-3.1.0-b3.app.zip`
  in `.dev-builds/ipad10-backup/`; sha256 `17914b24…`; full 142 MB `.app`, debug-dylib split). Reports
  `3.1.0 / b3` in About (version string from the 3.1.0 era, not the actual cut). Contains the native
  paragraph ruby renderer (`RubyTextParagraphView`) and **renders furigana correctly** on iPadOS 26.5.2
  (iPad 10). Extracted from CoreDevice's AppInstallationBinaryDeltas stash (3 identical copies found:
  `1b42e1f4…`, `d894beaa…`, `700da082…`; dylib sha256 `d0eff78e…`). **Deleted 2026-08-29.**
- **2026-08-16 — dev 7 = the working ruby-fix Debug build** (what is installed on the iPad Air M4 after
  the logLineFragments fix). Built from the working tree of the fix (≈`abbafdc0`); note it still
  contains the temporary `getParagraphSnapshotForTag` probe (removed from source in `abbafdc0`) — the
  binary was archived as-is so the exact installed build was recoverable. **Deleted 2026-08-29.**

## Incident log

- **2026-08-16 — Furigana missing in Debug builds (root cause found & fixed).** Debug builds with the
  native paragraph ruby renderer stopped painting readings (base kanji painted, furigana never drew);
  TestFlight 3.1.2 (Release) and the iPad 10 debug build (pre-`088a9439`) were unaffected. Cause:
  commit `088a9439` ("focus ruby diagnostics") added a `#if DEBUG` `logLineFragments` dump in
  `RubyTextParagraphView.layoutSubviews` that accesses `textView.layoutManager` (forcing a TextKit 1
  glyph-layout pass after every layout) — on iPadOS 26.6 that forced pass breaks `CTRubyAnnotation`
  painting in Debug builds (26.5.2 unaffected). Fix: removed the `logLineFragments` machinery from
  `RubyTextParagraphView.swift` (regression guard comment left in place). Debug now renders native
  paragraph ruby with overhang again. Debug-vs-Release variables ruled out along the way:
  `ENABLE_DEBUG_DYLIB` split (monolith still failed), fonts/typeFace, TextKit 1 vs 2, linked
  frameworks, build flags, settings.
- **2026-08-28 — TestFlight e.g. 3.4.1 (b15) black-screens on launch (no root cause; feature discarded).**
  The iOS Release build opens to a black screen with no crash report, while the latest Debug build
  (`dev 27`) runs fine. Device syslog shows a fatal JS exception thrown during bundle evaluation:
  `[runtime not ready]: TypeError: Cannot read property 'timeout' of undefined`. The crash is a
  **Release-build evaluation artifact**: `dev 27` (Debug) and the broken Release ship identical
  mobile source (only the harmless `8270edc3` image-reader view fix separates them), and the
  `.timeout` read could not be attributed to any source line (searched app/shared/`@langplayer`/
  `expo-linking`/`expo-file-system`/`expo-iap`/`axios`/every bundled dep; only `config.timeout`
  and `AbortSignal.timeout` exist). Because the failure was not reproducible in a Debug build and
  couldn't be traced, the OS file-open feature (`6ec2de25`, prime suspect; also the only mobile
  change requiring a native `CFBundleDocumentTypes` rebuild) was **discarded** (revert
  `0b0480ef`), and the docs/arch-013 + specs-089/090 mark it **unimplemented**. Re-adding the
  feature must be revalidated against a Release build before shipping.
