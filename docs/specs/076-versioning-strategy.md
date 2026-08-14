# SPEC-076: Versioning & Build Number Strategy

## Metadata

- **Spec ID**: SPEC-076
- **Feature**: Product-wide version numbering and store build-number policy
- **Status**: draft
- **Created**: 2026-08-14
- **See also**: [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) ·
  [SPEC-059 — Web Release QA Checklist](059-web-release-qa-checklist.md) ·
  [SPEC-064 — iOS Development Build Runbook](064-ios-development-build-runbook.md) ·
  [SPEC-067 — Google Play Release Runbook](067-google-play-release-runbook.md) ·
  [SPEC-074 — Chrome Web Store Deployment](074-chrome-web-store-deployment.md) ·
  [ADR-0013 — App Store Strategy & Product Naming](../adr/0013-app-store-strategy.md)

## 1. Overview

This spec defines how Language Player numbers its releases and store builds so
that:

1. Web and mobile always present the same product version (they have feature
   parity and are maintained together).
2. iOS and Android build numbers can never collide, regress, or get reused,
   which is the most common cause of store-upload rejections.
3. The Chrome extension has its own independent version that increments on
   every build, so a reloaded unpacked extension is always verifiable.
4. The "3" brand generation and the version numbers stay in sync across
   stores, domains, and About pages.

The strategy is intentionally boring: **one shared SemVer product version for
web + mobile, one shared monotonic integer for both store build numbers, and a
separate 4-part version for the Chrome extension.** Boring is the point —
store rejection and reload-verification problems come from clever or manual
versioning, not from simple monotonic counters.

## 2. Current State (verified 2026-08-14)

| Product | Where it lives | Version today | Build number today |
|---|---|---|---|
| Web (Next.js) | `apps/web/package.json` | `3.1.0` (cut 2026-08-14) | none |
| Mobile — iOS | `apps/mobile/app.config.js` ← `packages/shared/src/version.json` | `3.1.0` (cut 2026-08-14) | **3** (prepared; shipped build was 1) |
| Mobile — Android | `apps/mobile/app.config.js` ← `packages/shared/src/version.json` | `3.1.0` (cut 2026-08-14) | **3** (prepared; shipped versionCode was 2) |
| Chrome extension | `apps/chrome-extension/manifest.json` | `1.0.110.1` | 4th component auto-bumps per build |
| Flask API | `zerotohero-python-server/` (separate git repo) | **none** — `/python_version` returns the Python runtime, not the app version | git SHA only; no release tags |
| Shared packages | `packages/*/package.json` | `0.0.1` (npm-private, not product) | n/a |

### 2.1 What is actually live in the stores

**App Store — Language Player 3** (`ca.zerotohero.go`):

- Version **3.0.0**, live since 2026-08-13.
- Build number is not exposed publicly. The submitted IPA on disk
  (`~/Desktop/LanguagePlayer3.ipa`, 2026-08-13) contains
  `CFBundleVersion = 1`, `CFBundleShortVersionString = 3.0.0`,
  `CFBundleIdentifier = ca.zerotohero.go`. **So iOS build 1 shipped.**
- Confirmed by reading `apps/mobile/ios/LanguagePlayer3/Info.plist`
  (`CFBundleVersion = 1`) and the runbook in SPEC-048 § 3.

**Google Play — Language Player 3** (`ca.zerotohero.go`):

- Version **3.0.0**, **versionCode 2**, listing updated 2026-08-13.
- Confirmed by `android/app/build.gradle` (`versionCode 2`,
  `versionName "3.0.0"`) and SPEC-067 § 6/§ 8.
- **Why versionCode 2?** versionCode 1 was already consumed by the
  Internal/Closed testing tracks. Google rejects an upload whose versionCode
  is not greater than every previously uploaded versionCode **across all
  tracks**. This is exactly the failure class this spec prevents.

**Legacy listings (frozen, reference only):**

- App Store — Language Player 2 (`ca.zerotohero.app`): **2.12.2** (2023-03-31).
- Google Play — Language Player 2 (`ca.zerotohero.app`): **2.14.1**
  (2023-04-05).

### 2.2 Problems found in the audit

1. **Web and mobile show different versions.** About pages today:
   web shows `v0.0.1` (from `apps/web/package.json`), mobile shows `v3.0.0`
   (from `expoConfig.version`). They are the same product and are maintained
   in lockstep.
2. **`ios.buildNumber` is missing from `app.json`.** Expo then defaults the
   native `CFBundleVersion` (currently `1`). It is only implicit, so nothing
   forces it to be bumped deliberately.
3. **iOS (1) and Android (2) are already out of sync.** Today they happen to
   be different because Android consumed 1 in testing. There is no policy or
   tooling that keeps them aligned going forward.
4. **SPEC-074 claims `build.mjs` "auto-bumps" the extension patch version,
   but it does not.** `apps/chrome-extension/build.mjs` reads the version for
   the banner and never writes `manifest.json`. Bumps are manual per commit
   (visible in git history: `v1.0.109` → `v1.0.110`). The doc is wrong and the
   process is one forgotten bump away from an unverifiable reload.
5. **No ledger of consumed build numbers.** The versionCode-1 incident was
   learned the hard way; the knowledge currently lives only in prose in
   SPEC-067.

## 3. Industry Standards Compared

| Scheme | Format | Used by | Pros | Cons | Relevance here |
|---|---|---|---|---|---|
| **SemVer** | `MAJOR.MINOR.PATCH` (+ optional `-prerelease` / `+build`) | npm, GitHub releases, most software | Clear meaning per segment; tooling exists | Prerelease labels are invalid in store/Chrome version fields | **Adopt for the product version** (without prerelease labels in store-facing fields) |
| **CalVer** | date-based, e.g. `24.04`, `2026.8` | Ubuntu, Chrome (indirectly), many SaaS | Monotonic by clock; obvious release age | No semantic meaning; awkward as a brand "3" version | Not chosen — conflicts with the "3" generation brand |
| **Apple** | `CFBundleShortVersionString` (user-facing) + `CFBundleVersion` (build) | iOS/macOS | Two clean namespaces | iOS build must be unique per version; reuse across versions is legal but error-prone; macOS requires monotonic | Follow, but use a **globally monotonic** build number on iOS anyway |
| **Google** | `versionName` (user-facing) + `versionCode` (integer) | Android | Explicit monotonic integer; `versionName` is free-form | versionCode must be strictly greater than **every** previous upload on **any** track; max `2100000000`; can never reuse | Follow exactly; this is the strictest rule in the stack |
| **Chrome Web Store** | 1–4 dot-separated integers, each 0–65535 | Chrome extensions | Simple left-to-right comparison | No letters; each component capped at 65535; must strictly increase | **Adopt 4-part** `MAJOR.MINOR.PATCH.BUILD` |
| **Flutter** | `version: 1.2.3+45` → versionName/`CFBundleShortVersionString` = `1.2.3`, versionCode/`CFBundleVersion` = `45` | Flutter apps | **One build number maps to both stores** — the exact cross-platform model we want | Requires discipline to keep the single number monotonic | **Adopt the same model**: one shared integer for iOS + Android |
| **Git/CI-based** | `git describe --tags`, `1.2.3-14-gabc1234`, CI run number, commit SHA | OSS, Sentry releases, Vercel/Netlify | Uniqueness guaranteed per commit/run | Not human-meaningful; branch-dependent | Use for **dev builds and web build metadata**, not store-facing numbers |
| **Release trains** (single version for many products) | Chromium `138.0.7208.0`, Firefox `139.0`, VS Code `1.98.x` | Big product suites | One version = one coordinated release | Requires synchronized shipping | Matches our web+mobile parity model |

### 3.1 Official constraints we must never violate

- **Apple:** `CFBundleVersion` is required, numeric-dot only (one to three
  integers; extra components ignored). App Store Connect keys on the
  (version, build) pair, so a build number can't be reused for the same
  version. Safest policy: never reuse any build number, ever.
  (Source: Apple's `CFBundleVersion` documentation.)
- **Google Play:** `versionCode` is a positive integer, max 2,100,000,000;
  every uploaded build on **any track** (internal, closed, open, production)
  must have a higher versionCode than all previous uploads; a used versionCode
  can never be uploaded again. (Source: Android developer docs on app
  versioning.)
- **Chrome Web Store:** version is one to four dot-separated integers in
  `0..65535`, no leading zeros, not all zero; auto-update compares left to
  right; each published version must be strictly greater than the previous
  one. SemVer labels like `1.2.0-beta.4` are **not** allowed.

## 4. Recommended Strategy

### 4.1 One product version for web + mobile: SemVer `MAJOR.MINOR.PATCH`

- **`MAJOR` = product generation / brand.** `3` = Language Player 3. Do not
  bump to 4 while the stores and domains still say "3"; a major bump requires
  a coordinated brand change (app names, `v2.languageplayer.io` / main domain
  story, marketing).
- **`MINOR` = user-facing feature release.** Bump when web or mobile ships a
  new feature. Because web + mobile are maintained together with feature
  parity, they always share the same minor.
- **`PATCH` = bug fixes, performance, non-user-facing changes.**
- Store-facing fields must be plain `MAJOR.MINOR.PATCH` (no `-beta`, `-rc`).
  Pre-release builds for TestFlight/Play testing may keep the same
  `MAJOR.MINOR.PATCH`; the **build number** is what distinguishes them.
- Release tags: `v3.1.0`, `v3.0.1`, etc.

**Single source of truth:** `packages/shared/src/version.json` holds
`PRODUCT_VERSION` and `PRODUCT_BUILD_NUMBER`.
`packages/shared/src/version.ts` re-exports them for web/mobile runtime code,
and `apps/mobile/app.config.js` requires the JSON directly so Expo reads the
same values. A release script (below) writes:

- `apps/web/package.json` → `version`
- mobile picks up `PRODUCT_VERSION` + `PRODUCT_BUILD_NUMBER` automatically
- web About page reads `PRODUCT_VERSION` (so it stops showing `v0.0.1`)
- mobile About page already reads `expoConfig.version` — keep it

### 4.2 One shared build number for iOS + Android

**Format:** a plain positive integer, e.g. `3`, `4`, `5`.

**Rule:** for each product release, both platforms use the **same** integer
`N`:

```text
N = max(last iOS build number, last Android versionCode) + 1
```

Record every store-uploaded build in a ledger
(`docs/versioning/build-ledger.md`), including testing-track uploads. A
number is consumed the moment it is uploaded to **any** track of **either**
store — even if the build is later rejected, archived, or rolled back.

This mirrors Flutter's `1.2.3+45` model and eliminates the "did I bump iOS
but not Android?" class of rejection. There is only one number to get right,
and it is shared.

**Current ledger (start of policy):**

| N | Platform / track | Version | Date | Status |
|---|---|---|---|---|
| 1 | iOS App Store (LP3) | 3.0.0 | 2026-08-13 | live |
| 1 | Android Internal/Closed testing (LP3) | 3.0.0 | 2026-08-13 | consumed (never reuse) |
| 2 | Android Production (LP3) | 3.0.0 | 2026-08-13 | live |

**Adopted 2026-08-14:** the shared counter is active with **N = 3 already
set** in `PRODUCT_BUILD_NUMBER` (max(1, 2) + 1). iOS skips 2, Android moves
to 3 — skipping is fine and intentional; reusing is not. Until build 3 is
uploaded, `scripts/verify-version.mjs` reports a pending release and the
strict pre-upload checks apply (native projects must be regenerated with
`expo prebuild` before upload).

**Dev builds must not consume store build numbers.** Local builds, simulators,
and side-loaded dev builds should identify themselves with git SHA / build
date instead. Store build numbers are a scarce, monotonically increasing
resource.

### 4.3 Web versioning

- Web uses the same `MAJOR.MINOR.PATCH` as mobile; About shows `v3.x.y`.
- Keep the build-date row (SPEC-073). Optionally add a short build hash
  (`abc1234`) in a support-only field for debugging; do not add the full
  commit/branch UI back.
- Web has no store constraints, so no store build number is needed. CI/deploy
  IDs (Netlify deploy, git SHA) serve as web build identifiers.

### 4.4 Chrome extension: independent 4-part version

**Yes, it should have its own version lineage.** It has its own store, its own
release cadence, its own manifest format, and it is maintained on top of web
parity rather than in lockstep with store releases. Forcing it to equal the
mobile version would either waste extension build numbers or stall extension
releases.

**Format: `MAJOR.MINOR.PATCH.BUILD`** (four dot-separated integers, all
`0..65535`, no leading zeros):

- `MAJOR.MINOR.PATCH` — extension feature semantics on its own lineage
  (current: `1.0.x`; the lineage is kept because extension development is
  independent from web/mobile — see Decisions).
- `BUILD` — **auto-increments by 1 on every successful build** of
  `build.mjs`, starting at `1`. Every commit that touches `src/` therefore
  produces a manifest whose version is different from the previous one, which
  is exactly what makes reload verification possible:
  `chrome://extensions` shows the new version, and the content-script banner
  embeds it.

Example: `1.0.110` → `1.0.110.1` → `1.0.110.2` … → `1.0.111.1` on the next
store-worthy patch bump. `1.0.110.1` compares greater than `1.0.110` because
missing components compare as zero, so the Web Store accepts the first
4-part upload without a special migration.

**Implemented (2026-08-14):** `apps/chrome-extension/build.mjs` bumps
`manifest.json` *before* bundling so the generated banner carries the new
version; the popup displays `chrome.runtime.getManifest().version` so the
loaded build is verifiable without opening `chrome://extensions`.

### 4.5 v2 vs v3 branding rules

- **Language Player 3** (`ca.zerotohero.go`, both stores) is the active
  product and owns versions `3.x.y`.
- **Language Player 2** (Classic, `ca.zerotohero.app`, both stores) is frozen
  at `2.x` — never bump it; it is reference-only and its releases are done.
- **Web:** `languageplayer.io` is the v3 product; `v2.languageplayer.io`
  serves Classic. About on the v3 web shows `v3.x.y`.
- A future `4.x` requires coordinated rename of the store listings and a
  migration story (ADR-0013 already documents why "3" is a branding
  dead-end; until that decision is revisited, staying on 3.x is correct).

### 4.6 Flask backend (API server)

**The backend gets its own SemVer, independent of the web/mobile product
version.** It deploys on its own cadence (server-side hotfixes and data
changes do not require store releases), and it has its own compatibility
contract with all three clients (web, mobile, Chrome extension).

- **Format:** `MAJOR.MINOR.PATCH` in its own git repo
  (`zerotohero-python-server/`). MAJOR = breaking API change; MINOR = new
  endpoint/feature; PATCH = fix. Tag releases there (e.g. `v1.2.3`); the
  repo currently has no release tags.
- **Build identifier:** git SHA + deploy timestamp — **not** a store-style
  build counter. The backend is not store-bound, so it follows decision 3:
  SHA/date identify a deployment.
- **Expose it:** add `__version__` to the app and a `/api/version` endpoint
  returning `{ "name": "language-player-api", "version": "1.2.3",
  "commit": "abc1234", "python": "3.10.x", "deployed_at": "..." }`. Keep
  `/python_version` only as a diagnostic (it reports the runtime, which is
  misleading as an app version).
- **API contract versioning:** while web/mobile/extension are maintained in
  lockstep with the backend, keep the current unversioned endpoints and
  simply document the API version. Add `/v1` URL prefixes or an
  `X-API-Version` header only when a breaking change must support old
  clients (URL path versioning is the common industry default; headers are
  better when old clients must keep working during a transition).
- **Relationship to product releases:** a product release (e.g. `3.1.0`)
  records the backend SHA it was tested against in its release notes; the
  backend's own version stays independent.

### 4.7 Release tags (git)

**Tag every store upload — not just major releases.** Tags give you a
reproducible git marker for exactly what was uploaded, so "which commit is
this build?" is answerable from the tag alone. Create the tag **before**
uploading, on the exact commit whose `version.json`/manifest state produced
the binary. Tags are immutable: never move, delete, or reuse one.

| What | Tag format | Example | When |
|---|---|---|---|
| Product release (web + mobile) | `v<MAJOR.MINOR.PATCH>` | `v3.1.0` | Once per product release, at the release commit |
| Any store upload — iOS or Android, any track | `v<MAJOR.MINOR.PATCH>-b<N>` | `v3.0.0-b3` | Every upload to any track, before uploading |
| Chrome Web Store upload | `ext-v<manifest version>` | `ext-v1.0.110.1` | Every Web Store upload |
| Flask backend (own repo) | `v<MAJOR.MINOR.PATCH>` | `v1.2.3` | Per backend release/deploy |

The plain `v3.1.0` tag is created by `tag-release.mjs --release`, which also
creates `v3.1.0-b<N>`. The build-suffixed tag is the one that maps 1:1 to the
ledger: `record-build.mjs --tag v3.1.0-b3` verifies the tag exists before
recording the consumed number.

**Historical note:** builds 1–2 (3.0.0, both stores) predate this policy and
were uploaded from a working tree, so no reliable retroactive tags exist.
Tagging starts with build 3.
The repo also contains legacy `0.1.x` tags from 2024 (old GO-app history);
they predate the scheme and are left untouched.

**Milestone tags (2026-08-14):** post-release milestones belong to the **next
minor release**, not the released version. The first 11 post-3.0.0 milestones
are tagged `v3.1.0-m1` … `v3.1.0-m11` in chronological order (e.g.
`v3.1.0-m10` = subs-search match line) on their milestone commits, and the
product version was cut to `3.1.0` at the same time. These are not
store-upload tags, so they are not recorded in the ledger; the plain `v3.0.0`
tag anchors the release commit documented in SPEC-067. Going forward, cut a
minor version when a milestone batch is complete and tag its commits
`v<next-minor>-m<N>`.

**Web deploys** are not tagged per deploy (continuous Netlify/CI deploys are
identified by deploy ID + git SHA); only product releases get tags.

## 5. Tooling & Verification Gates

### 5.1 New scripts (in `scripts/`)

| Script | Purpose |
|---|---|
| `bump-product-version.mjs [major\|minor\|patch]` | Bumps `PRODUCT_VERSION` in `packages/shared/src/version.json` and `apps/web/package.json` together; `apps/mobile/app.config.js` picks it up automatically; fails if they drift |
| `next-build.mjs` | Reads the ledger, prints `N = max(last iOS, last Android) + 1`, writes it into `packages/shared/src/version.json` (`PRODUCT_BUILD_NUMBER`), which feeds both `ios.buildNumber` and `android.versionCode` via `app.config.js` |
| `record-build.mjs <N> <platform> <track> <version> <date>` | Appends a row to `docs/versioning/build-ledger.md`; refuses to add a duplicate or lower number |
| `tag-release.mjs [--release] [--extension]` | Creates `v<version>-b<N>` at HEAD before upload; `--release` also creates `v<version>`, `--extension` also creates `ext-v<manifest version>` |
| `verify-version.mjs` | Pre-upload gate (below); exits non-zero on any mismatch |

### 5.2 Pre-upload gate (`verify-version.mjs`)

Run **after** `expo prebuild` and **after** the archive/AAB build, before
uploading:

1. `expo.version` == `PRODUCT_VERSION` == web `package.json` version.
2. `ios.buildNumber` == `android.versionCode` == `N`, and `N` > every
   recorded number for that platform in the ledger.
3. After prebuild: `ios/LanguagePlayer3/Info.plist`
   (`CFBundleShortVersionString`, `CFBundleVersion`) matches the shared
   config.
4. After prebuild: `android/app/build.gradle` (`versionName`, `versionCode`)
   matches the shared config.
5. After iOS archive: the `.ipa`/`.app` `Info.plist` matches (extend the
   existing SPEC-048 § 3.2 archive verification).
6. `version` (SemVer) > the last release tag.

If any check fails, **do not upload**. The script exists precisely to catch
the two rejections that waste rebuild time: iOS build reuse and Android
versionCode regression.

### 5.3 Release flow

```text
1. Decide release type (minor / patch)
2. node scripts/bump-product-version.mjs --minor        # 3.0.0 -> 3.1.0
3. node scripts/next-build.mjs                            # assigns N (e.g. 3)
4. Human QA (SPEC-048 / SPEC-059 checklists)
5. EXPO_PUBLIC_API_URL=... npx expo prebuild --platform android|ios
6. node scripts/verify-version.mjs                        # gate
7. node scripts/tag-release.mjs --release                 # v3.1.0-bN (+ v3.1.0)
8. Build archive / AAB (SPEC-048 § 3.1, SPEC-067 § 3.3)
9. node scripts/verify-version.mjs                        # gate again post-build
10. Upload to store track
11. node scripts/record-build.mjs ... --tag v3.1.0-bN     # ledger, even if rejected
```

### 5.4 Files to change on adoption

- Add `packages/shared/src/version.json` + `version.ts` (source of truth for
  product version and shared store build number).
- Add the four scripts in § 5.1 and `docs/versioning/build-ledger.md`.
- `apps/mobile/app.json` — replaced by `apps/mobile/app.config.js`, which
  reads `PRODUCT_VERSION` and `PRODUCT_BUILD_NUMBER` from
  `packages/shared/src/version.json`; the static `app.json` is removed.
- `apps/web/package.json` — set `version` to `3.0.0` now (matches mobile),
  then to `3.1.0` on the next release.
- `apps/web/src/components/about/about-dialog.tsx` — read version from
  shared `PRODUCT_VERSION` instead of `package.json` (or keep `package.json`
  but let the bump script keep it in sync).
- `apps/chrome-extension/build.mjs` — implement auto-bump of the 4th
  component; update SPEC-074 wording to match reality.
- Update SPEC-048 § 2/§ 3/§ 4 and SPEC-067 § 3.2/§ 6 to reference the ledger
  and the gate script instead of prose-only instructions.

## 6. Decisions (2026-08-14)

| # | Question | Decision |
|---|---|---|
| 1 | Adopt the shared counter immediately with N = 3? | **Yes.** `PRODUCT_BUILD_NUMBER = 3` is set; iOS skips 2, Android moves to 3 on the next release, and both stay aligned from there. |
| 2 | Rebase the extension `1.0.x` to the product `3.x` lineage? | **No — keep `1.0.x`.** Extension development/features are independent from web/mobile, so its version history stays independent. |
| 3 | Do local dev builds need store build numbers? | **No.** Dev builds use git SHA / build date; store build numbers are consumed only by store uploads (recorded in the ledger). |
| 4 | Convert `app.json` → `app.config.js` reading from `packages/shared`? | **Yes.** `apps/mobile/app.config.js` now reads `PRODUCT_VERSION` and `PRODUCT_BUILD_NUMBER` from `packages/shared/src/version.json`; `app.json` is removed. |
| 5 | How should the Flask backend be versioned? | **Proposed (2026-08-14):** own SemVer + git tags in `zerotohero-python-server/`, a `__version__` + `/api/version` endpoint, and git-SHA build identifiers. Independent from the product version; not yet implemented. |
| 6 | Tag a version with every store upload? | **Yes.** Every upload to any track gets `v<version>-b<N>` before uploading; product releases also get plain `v<version>`; Chrome uploads get `ext-v<manifest version>`; backend tags live in its own repo. Implemented via `scripts/tag-release.mjs`. |
| 7 | Do post-release milestones deserve their own minor versions? | **Yes.** They belong to the next minor release: milestones are tagged `v<next-minor>-m<N>` and the product version is cut to that minor (e.g. `3.1.0`) once the batch is complete. The next store upload ships that version with the shared build number. |

## 7. References

- Apple — `CFBundleVersion` documentation (bundle resources).
- Android — "App versioning" developer documentation (versionCode /
  versionName rules and 2,100,000,000 cap).
- Chrome for Developers — "Manifest — Version" (one to four dot-separated
  integers, 0–65535).
- Flutter — `pubspec.yaml` version/build-number convention (`1.2.3+45`).
- SemVer — semver.org.
- [ADR-0013 — App Store Strategy & Product Naming](../adr/0013-app-store-strategy.md).
