# Production Deployment Runbook

## Metadata

- **Arch ID**: ARCH-029
- **Feature**: End-to-end production deployment runbook for every shipped surface of Language Player
- **Type**: runbook / reference
- **Status**: draft
- **Created**: 2026-08-14
- **Last Updated**: 2026-08-14
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Classic web (v2), Next.js web (v3), iOS App Store, Google Play, Chrome Web Store, Flask backend
- **See also**:
  - [ARCH-028 — Local Development Runbook](028-local-development-runbook.md)
  - [ARCH-001 — Classic App Architecture](001-classic-app-architecture.md)
  - [ARCH-003 — Python Backend Architecture](003-python-backend-architecture.md)
  - [ARCH-019 — Chrome Extension Architecture](019-chrome-extension-architecture.md)
  - [SPEC-048 — Mobile Release Plan](../specs/048-mobile-release-plan.md)
  - [SPEC-067 — Google Play Release Runbook](../specs/067-google-play-release-runbook.md)
  - [SPEC-074 — Chrome Web Store Deployment](../specs/074-chrome-web-store-deployment.md)
  - [SPEC-076 — Versioning & Build Number Strategy](../specs/076-versioning-strategy.md)
  - [SPEC-071 — Classic Route Redirect Adapter](../specs/071-classic-route-redirect-adapter.md)

---

## Overview

Language Player ships six production surfaces from three codebases plus one
shared monorepo. This runbook is the "how do I push to prod" answer for each
one: the deploy command or click path, the URLs that must respond, and what
to check after deploy.

| Surface | Source | Production URLs / store IDs | Deploy trigger | Detailed guide |
|---|---|---|---|---|
| **Classic web (v2)** | `zerotohero-nuxt` (separate repo, reference-only in monorepo) | `zerotohero-nuxt.netlify.app` · `v2.languageplayer.io` · `beta.languageplayer.io` (domain alias) | Git push to Classic repo's production branch → Netlify | § 1 |
| **Web (v3)** | `apps/web` (monorepo) | `language-player.netlify.app` · `languageplayer.io` | Git push to monorepo production branch → Netlify (`netlify.toml`) | § 2 |
| **Flask backend** | `zerotohero-python-server` (local checkout of `zerotohero-python`) | `https://pythonvps.zerotohero.ca` | SSH to DreamHost VPS → `git pull` → restart gunicorn | § 3 |
| **iOS app** | `apps/mobile` (Expo/React Native) | App Store Connect app ID `6520385296`, bundle `ca.zerotohero.go` | Build IPA → `scripts/upload.mjs ios` (or Xcode Organizer / Transporter) | § 4 |
| **Android app** | `apps/mobile` (Expo/React Native) | Google Play app ID `4975392680448759197`, package `ca.zerotohero.go` | Build AAB → `scripts/upload.mjs android` (or Play Console) | § 5 |
| **Chrome extension** | `apps/chrome-extension` (monorepo) | Chrome Web Store item ID `cbkhenammkocfidciagbbibkleoenbej` | `node apps/chrome-extension/build.mjs` → zip → Dashboard upload | § 6 |

**Versioning rule (SPEC-076):** web + mobile share one SemVer product version
(`packages/shared/src/version.json`); iOS and Android share one monotonic
build number recorded in `docs/versioning/build-ledger.md`. The Chrome
extension has its own 4-part `MAJOR.MINOR.PATCH.BUILD` version. Never reuse a
store build number.

---

## 1. Netlify — Classic (v2)

### 1.1 Site & domains

- Netlify site default URL: **`zerotohero-nuxt.netlify.app`**
- Custom primary domain: **`v2.languageplayer.io`**
- Domain alias: **`beta.languageplayer.io`** — an alias of the same site, not
  a separate deployment or deploy preview. Deploying the site updates all
  three URLs.
- The site is connected to the **`zerotohero-nuxt`** Git repository (not the
  monorepo). Build settings live in that repo's Netlify config / dashboard
  (Nuxt 2 static or server build; Node version pinned in the site settings).

> **Classic backend URL:** `zerotohero-nuxt/lib/utils/servers.js` defaults to
> the production `https://pythonvps.zerotohero.ca/`. Do **not** set a
> `PYTHON_SERVER` env var on this Netlify site (a localhost value there would
> break production — AGENTS.md). Local development overrides it in the
> gitignored `zerotohero-nuxt/.env` only.

### 1.2 Deploy

1. Commit and push to the production branch of the `zerotohero-nuxt` repo.
2. Netlify builds and deploys automatically.
3. Optional local trigger (if the CLI is linked to the site):

   ```bash
   cd zerotohero-nuxt
   npx netlify deploy --build --prod
   ```

### 1.3 Verify

```bash
curl -sSI https://v2.languageplayer.io/en/zh/explore-media | head -5
curl -sSI https://beta.languageplayer.io/en/zh/explore-media | head -5
curl -sSI https://zerotohero-nuxt.netlify.app/en/zh/explore-media | head -5
```

All three should return `200` (or a valid app redirect) with the **same**
deploy. `v2.languageplayer.io` is what the v3 web app and the legacy iOS
Capacitor wrapper redirect Classic-only routes to (SPEC-071), so confirm it
after every Classic deploy.

---

## 2. Netlify — Web (v3)

### 2.1 Site & domains

- Netlify site default URL: **`language-player.netlify.app`**
- Custom primary domain: **`languageplayer.io`**
- The site is connected to the **monorepo**; build settings come from
  [`netlify.toml`](../../netlify.toml) at the repo root.

### 2.2 Build & redirects (committed in `netlify.toml`)

```toml
[build]
  command = "npm install && npx turbo build --filter=@langplayer/web"
  publish = "apps/web/.next"
  base = "/"

[build.environment]
  NODE_VERSION = "22"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Key production behaviors:

- `/api/python/*` → `https://pythonvps.zerotohero.ca/:splat` (200 rewrite)
- `/api/directus/*` → `https://directusvps.zerotohero.ca/zerotohero/:splat`
  (200 rewrite)
- `/*` with `lp_legacy` cookie → `https://v2.languageplayer.io/:splat`
  (200 rewrite for the legacy iOS Capacitor wrapper; must stay **after** the
  API rules — the committed file already has this order). The full cookie
  mechanism, edge-function interaction, and caveats are documented in
  [SPEC-071 § 12 — Capacitor wrapper redirect](../specs/071-classic-route-redirect-adapter.md#12-capacitor-wrapper-redirect-cookie-gated-proxy).

### 2.3 Environment variables

Set in Netlify site settings (production):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://pythonvps.zerotohero.ca` |
| `NEXT_PUBLIC_LOG_LEVEL` | optional; default logging is off in production |

`apps/web/src/lib/api-url.ts` is the single source of truth and falls back to
the production URL in release builds, but set the env var explicitly so the
build never accidentally embeds localhost (SPEC-059).

### 2.4 Deploy

1. Run the release QA checklist (SPEC-059 § 1) and `npm run build:check -w
   apps/web` + `npx turbo typecheck` locally first.
2. Push to the monorepo's production branch. Netlify builds `apps/web` and
   deploys automatically.
3. Optional local trigger (if the CLI is linked to the site):

   ```bash
   npx netlify deploy --build --prod
   ```

### 2.5 Verify

```bash
# Landing + app route on both URLs
curl -sSI https://languageplayer.io/ | head -5
curl -sSI https://language-player.netlify.app/en/zh/explore | head -5

# API proxy must hit the production Flask backend
curl -sS "https://languageplayer.io/api/python/health" -o /dev/null -w "%{http_code}\n"
```

Confirm the HTML/JS bundle references `https://pythonvps.zerotohero.ca` and
contains no `localhost`/`127.0.0.1` API URL. Spot-check login, Explore, one
watch page, and one Classic-only redirect (e.g. `/en/ja/books` →
`https://v2.languageplayer.io/en/ja/books`, SPEC-071).

> **Note:** `curl .../api/python/health` returns whatever the Flask app
> returns for that path (even a 404 proves the proxy reaches it). Check the
> response body for the actual backend host if in doubt.

---

## 3. Flask backend — `pythonvps.zerotohero.ca`

The backend is deployed from the **DreamHost VPS** checkout at
`/home/dh_rqe96h/zerotohero-python` (production mirror of the
`zerotohero-python-server` directory in the monorepo). The user manages the
server process — never start/stop it from the workspace (AGENTS.md).

### 3.1 Deploy

SSH into the VPS, then:

```bash
cd /home/dh_rqe96h/zerotohero-python
git pull
source venv/bin/activate
pip install -r requirements.txt
systemctl --user restart gunicorn
```

Run each command and stop on failure. If `git pull` conflicts with local
changes, inspect before discarding anything — the checkout may contain
server-only config (`.env`) that must be preserved.

### 3.2 Verify

```bash
systemctl --user status gunicorn      # active (running)
curl -sSI https://pythonvps.zerotohero.ca/ | head -5
curl -sS https://pythonvps.zerotohero.ca/api/python/health -o /dev/null -w "%{http_code}\n"
```

Then smoke-test the endpoints the web/mobile apps depend on (login, saved
words, dictionary lookup) from the deployed web app — the mobile builds embed
this URL, so a broken backend is immediately visible to every client.

### 3.3 Rollback

```bash
cd /home/dh_rqe96h/zerotohero-python
git log --oneline -5
git checkout <previous-good-commit>
systemctl --user restart gunicorn
```

Restart with the previous dependency set if a new requirement broke the app
(`pip install -r requirements.txt` again after checkout).

---

## 4. Apple App Store (iOS)

**Store record:** App Store Connect app ID `6520385296` · bundle ID
`ca.zerotohero.go` · full build/QA/upload details in [SPEC-048 § 3](../specs/048-mobile-release-plan.md) ·
**last upload:** 3.1.0 build 3 → App Store Connect / TestFlight (2026-08-14).

### 4.1 Version gate

Before building, confirm `packages/shared/src/version.json` has the intended
version + build number, and the ledger has no consumed number >= N:

```bash
node scripts/next-build.mjs      # assigns the next shared build number N
node scripts/verify-version.mjs  # gate after prebuild AND after the archive
node scripts/tag-release.mjs --release   # v<version> + v<version>-bN at HEAD
```

### 4.2 Build & verify

Build the Release archive with
`EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` (SPEC-048 § 3.1), export
an **IPA** (Xcode Organizer → Distribute App, or `xcodebuild -exportArchive`),
and verify the embedded bundle contains the production URL and no localhost
(SPEC-048 § 3.2).

### 4.3 Upload (no EAS needed)

```bash
export LP_APPLE_ID="you@example.com"
export LP_APPLE_APP_SPECIFIC_PASS="xxxx-xxxx-xxxx-xxxx"  # appleid.apple.com → App-Specific Passwords

node scripts/upload.mjs ios ~/Desktop/LanguagePlayer3-3.1.0.ipa --dry-run
node scripts/upload.mjs ios ~/Desktop/LanguagePlayer3-3.1.0.ipa
```

Credentials may also be kept in the gitignored `scripts/.env.upload` (copy
`scripts/.env.upload.example`) — the script loads it automatically.
If the Apple ID belongs to multiple App Store Connect teams, set
`LP_APPLE_ITC_PROVIDER` (Language Player 3 uses `9CS9PCBX32`); without it
Transporter fails with "Client configuration failed".

The script wraps Transporter (`-assetFile`, required since 2026) and aborts
on version/build mismatch. Manual alternative: Xcode Organizer →
Distribute App → App Store Connect, or drag the IPA into the Transporter app.

> **Xcode 26 note:** Xcode no longer bundles the full Transporter CLI — only a
> shim. If upload fails with OSStatus error `-10661`, install the free
> **Transporter** app from the Mac App Store; the script then uses
> `/Applications/Transporter.app/Contents/itms/bin/iTMSTransporter`
> automatically.

**Fully automated submission (no browser):** with an App Store Connect API
key (`LP_ASC_KEY_PATH` / `LP_ASC_KEY_ID` / `LP_ASC_ISSUER_ID` in the
gitignored `scripts/.env.upload`; generate at App Store Connect → Users and
Access → Integrations → App Store Connect API, role **App Manager**), the
same script creates the version record, attaches the build, sets review info
(demo account + notes) and What's New, and submits for review:

```bash
node scripts/upload.mjs appstore status                # current versions + builds
node scripts/upload.mjs appstore prepare 3.1.0         # create version, attach build, set metadata
node scripts/upload.mjs appstore submit 3.1.0          # send to App Review
node scripts/upload.mjs appstore metadata 3.1.0 \
  --description "<store description>" --promo-text "<170 chars>" \
  --keywords "<100 chars, comma-separated>"             # update listing copy
```

This is exactly how 3.1.0 was submitted (2026-08-14). Listing copy
(description/promo/keywords) can be updated via `appstore metadata` even
while the version is waiting for review. Screenshots are per-version in App
Store Connect but are carried forward from the previous version (verified on
3.1.0: same sets as 3.0.0 — iPhone 6.7" ×10, iPad Pro 12.9" ×3, iPad Pro
12.9" 3rd gen ×9).

### 4.4 After upload

1. App Store Connect → TestFlight: confirm the build appears and finishes
   processing.
2. **Export compliance ("Missing Compliance"):** `app.config.js` sets
   `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, which prebuild bakes
   into Info.plist. App Store Connect then treats the build as "None of the
   algorithms mentioned above" and skips the compliance prompt, so TestFlight
   availability is immediate. This declaration is accurate for LP3 — it only
   uses standard exempt encryption (TLS/HTTPS via Apple frameworks). Caveat:
   the key is read from the binary, so a build uploaded **before** the key was
   added still prompts once; answer "None of the algorithms mentioned above"
   manually for that build (or bump the build number and re-upload).
3. Add testers / run the beta QA pass.
4. Submit for review from App Store Connect (review notes: demo account,
   sample video IDs, real backend note — SPEC-048 § 3.4).
5. Record the consumed build number immediately, even if rejected/rolled
   back:

   ```bash
   node scripts/record-build.mjs <N> ios "<track>" <version> --tag v<version>-b<N>
   ```

---

## 5. Google Play (Android)

**Store record:** Google Play app ID `4975392680448759197` · package
`ca.zerotohero.go` · full runbook in [SPEC-067](../specs/067-google-play-release-runbook.md) ·
**last upload:** 3.1.0 versionCode 3 → Internal testing (2026-08-14).

### 5.1 Version gate

Same gate as iOS — one shared build number means `versionCode` == `ios
buildNumber`:

```bash
node scripts/verify-version.mjs  # after prebuild and after bundleRelease
node scripts/tag-release.mjs --release
```

### 5.2 Build

```bash
cd apps/mobile/android
./gradlew bundleRelease   # output: app/build/outputs/bundle/release/app-release.aab
```

Verify the embedded bundle has `pythonvps.zerotohero.ca` and no localhost
(SPEC-067 § 3.6). The AAB must be signed with the upload key
(`~/.android/lp-upload.jks`, configured via `android/key.properties`).

### 5.3 Upload (no EAS needed)

One-time setup (SPEC-067 § 4.5) is **done and verified (2026-08-14)** — the
service account `lp-play-billing-2@zh-zerotohero.iam.gserviceaccount.com`
has release access to `ca.zerotohero.go`, and credentials are wired through
the gitignored `scripts/.env.upload`. Then:

```bash
# Optional overrides (defaults come from scripts/.env.upload):
export LP_PLAY_SERVICE_ACCOUNT_JSON=/Users/longjiang/Projects/language-player/scripts/lp-play-service-account.json

node scripts/upload.mjs android \
  apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --status completed --dry-run
node scripts/upload.mjs android \
  apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --status completed
```

Promote an already-uploaded build to another track without re-uploading:

```bash
node scripts/upload.mjs android promote 3 --dry-run                    # full production rollout
node scripts/upload.mjs android promote 3 \
  --status inProgress --user-fraction 0.1 --dry-run                    # staged 10% rollout
node scripts/upload.mjs android promote 3 --status inProgress --user-fraction 0.1
```

Upload or inspect store-listing images:

```bash
node scripts/upload.mjs android listing-image <path> --type featureGraphic   # icon|phoneScreenshots|...
node scripts/upload.mjs android listing-status --type featureGraphic          # verify what is live
```

Default track is `internal` with status `draft`; use `--status completed` to
publish, `--track production` for a production release (staged rollout is
recommended), and `--no-commit` to finish manually in the console. Manual
alternative: Play Console → Release management → upload the AAB.

### 5.4 After upload

1. QA on the Internal testing track on a real device before promoting
   (SPEC-067 § 3.7).
2. Promote through closed/open testing → production with a staged rollout
   (e.g. 10% → 100%).
3. Record the consumed build number in the ledger (same command as iOS,
   with `android`).

---

## 6. Chrome Web Store (extension)

**Store record:** item ID `cbkhenammkocfidciagbbibkleoenbej` · publisher
`longjiang2005` · full listing/packaging details in [SPEC-074](../specs/074-chrome-web-store-deployment.md).

### 6.1 Build (auto-bumps version)

```bash
node apps/chrome-extension/build.mjs
```

Every source change rebuilds `dist/` and bumps the **4th** version component
in `manifest.json` (`MAJOR.MINOR.PATCH.BUILD`, SPEC-076). `content.css`,
`popup.html`, `popup.css`, `_locales/`, and `icons/` are not bundled — changes
to those need a new ZIP + resubmit but no build step.

### 6.2 Package

```bash
VERSION=$(node -p "require('./apps/chrome-extension/manifest.json').version")
rm -rf /tmp/lp-ext-pkg && mkdir -p /tmp/lp-ext-pkg
cp -R apps/chrome-extension/{manifest.json,src,dist,_locales,icons} /tmp/lp-ext-pkg/
cd /tmp/lp-ext-pkg && rm -rf src/content.js   # legacy dead file
zip -r -X /tmp/language-player-extension-v$VERSION.zip . -x "*.DS_Store"
```

### 6.3 Upload & publish (browserless API, since 2026-08-16)

The Chrome Web Store API v2 (`node scripts/upload.mjs chrome …`) uploads the
ZIP and submits for review without the dashboard. One-time prerequisites:

1. **Enable the Chrome Web Store API** in the Google Cloud project
   (`chromewebstore.googleapis.com`; project `611434067` for the
   zh-zerotohero service account). **✅ verified 2026-08-16** — the status
   call below authenticated and returned the item without a 403.
2. **Link the service account** in the Web Store Developer Dashboard →
   **Settings** → **Service account** (only one service account per
   publisher). **✅ done 2026-08-16** — linked
   `lp-play-billing-2@zh-zerotohero.iam.gserviceaccount.com` (same key as
   Play, `LP_PLAY_SERVICE_ACCOUNT_JSON`). The dashboard UI path is the
   top-right **Settings** gear → **Service account** (verified 2026-08-16);
   the earlier "Account → Service account" label was from the old dashboard
   and no longer exists in the sidebar.
3. Credentials/IDs live in `scripts/.env.upload` (gitignored):
   `LP_CWS_SERVICE_ACCOUNT_JSON` (defaults to the Play key),
   `LP_CWS_PUBLISHER_ID` (default `650ad6b1-a9d4-43b6-9ff5-a8ae11ada6ad`),
   `LP_CWS_ITEM_ID` (default `cbkhenammkocfidciagbbibkleoenbej`).

```bash
# Read-only status check (auth + item access)
node scripts/upload.mjs chrome status

# Upload the new ZIP and submit for review
node scripts/upload.mjs chrome /tmp/language-player-extension-v$VERSION.zip --publish
```

**Limitation:** the API cannot edit listing text (Summary / Detailed
description), screenshots, or promo assets — those remain dashboard-only.
Update them in the dashboard before submitting when the listing copy changes.

**Dashboard fallback** (if the API is not set up):

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Select the item (`cbkhenammkocfidciagbbibkleoenbej`).
3. **Package** → upload the new ZIP.
4. Verify the new version is shown; update listing copy/assets if needed.
5. **Submit for review.**

> Publishing is gated by the Google identity verification (in progress as of
> SPEC-074) and at least one screenshot. First release only.

### 6.4 After upload

- Tag the release commit: `node scripts/tag-release.mjs --extension`
  (`ext-v<manifest version>`, SPEC-076).
- Reload the unpacked dev copy in `chrome://extensions` and verify the new
  version number shows in `chrome://extensions` — the build suffix exists
  precisely so a stale/reloaded bundle is easy to spot.

---

## 7. Versioning & tags (SPEC-076)

| Surface | Version source | Release tag |
|---|---|---|
| Web + mobile (product) | `packages/shared/src/version.json` | `v<version>` for product releases |
| iOS + Android build number | `PRODUCT_BUILD_NUMBER` (shared, monotonic) | `v<version>-b<N>` before **every** store upload |
| Chrome extension | `apps/chrome-extension/manifest.json` (4-part) | `ext-v<manifest version>` |
| Flask backend | own repo (proposed `__version__` + `/api/version`) | tags in `zerotohero-python-server` repo |
| Web deploys | — | not tagged per deploy (Netlify deploy ID + git SHA) |

Consumed store build numbers are recorded in
`docs/versioning/build-ledger.md` — never reuse one, even after a rejection
or rollback.

---

## 8. Release order & rollback

### Order

1. **Flask backend first** — deploy API changes and verify
   `pythonvps.zerotohero.ca` (all clients depend on it; keep changes backward
   compatible so already-shipped apps keep working).
2. **Netlify web (v3)** and **Classic (v2)** — deploy and smoke-test the
   production domains.
3. **Mobile stores** — build with the production API URL, run the gate,
   upload, QA on TestFlight/internal testing, then submit/promote.
4. **Chrome extension** — package, upload, submit.

### Rollback

| Surface | Rollback |
|---|---|
| Netlify (either site) | Deploys tab → previous deploy → **Publish deploy** |
| Flask | `git checkout <previous-good-commit>` → restart gunicorn (never reset the checkout blindly) |
| iOS | TestFlight builds are per-build; if a release is live, upload a previous build or use App Store Connect release controls |
| Android | Pause the staged rollout, or unpublish and roll back to the previous AAB |
| Chrome extension | Dashboard → previous version → **Rollback** (if available) |

---

## 9. Quick command reference

```bash
# Web v3 (auto-deploy on push; local optional)
npx netlify deploy --build --prod

# Flask
ssh <vps> 'cd /home/dh_rqe96h/zerotohero-python && git pull && source venv/bin/activate && pip install -r requirements.txt && systemctl --user restart gunicorn'

# iOS upload (from repo root; env vars set)
node scripts/upload.mjs ios ~/Desktop/LanguagePlayer3-3.1.0.ipa --dry-run

# Android upload (from repo root; env var set)
node scripts/upload.mjs android \
  apps/mobile/android/app/build/outputs/bundle/release/app-release.aab \
  --track internal --status completed --dry-run

# Chrome extension build + tag
node apps/chrome-extension/build.mjs
node scripts/tag-release.mjs --extension
```

---

## 10. Deployment gotchas (learned the hard way)

### iOS / Transporter

- **Xcode 26 ships only a shim.** `xcrun iTMSTransporter` fails with OSStatus
  error `-10661` until the free **Transporter** app is installed (Mac App
  Store). The script prefers
  `/Applications/Transporter.app/Contents/itms/bin/iTMSTransporter` when
  present.
- **First run downloads its runtime.** Transporter pulls its Java/OSGi
  components into `~/Library/Caches/com.apple.amp.itmstransporter` on first
  use (allow a few minutes) and needs write access to the user's home
  directory — run it from a normal terminal or an unsandboxed agent, not a
  restricted sandbox.
- **Multi-provider Apple IDs fail with "Client configuration failed".** If
  the Apple ID belongs to more than one App Store Connect team, pass
  `-itc_provider <short-name>` (script: `--itc-provider` or
  `LP_APPLE_ITC_PROVIDER`). Find the short name with:
  `/Applications/Transporter.app/Contents/itms/bin/iTMSTransporter -m provider -u <id> -p <pass>`
  Language Player 3 uses `9CS9PCBX32`.
- **Only an app-specific password works** — the regular Apple Account
  password is rejected. Changing/resetting the primary password revokes all
  app-specific passwords. Keep them in the gitignored `scripts/.env.upload`
  (chmod 600) and never paste them into chat or terminal history; the script
  masks the password in its own error output.
- **TestFlight "Missing Compliance" prompt** is avoided by
  `ITSAppUsesNonExemptEncryption: false` in `app.config.js` (baked into
  Info.plist by prebuild). Builds uploaded without that key still prompt
  once — answer "None of the algorithms mentioned above" or re-upload a new
  build number.
- **Transporter needs an `.ipa`**, not the `.xcarchive`.

### Android / Play API

- **Media uploads use a different base URL.** Bundle uploads go to
  `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/...`
  (note the `/upload/`). Using the normal API base makes Google try to parse
  the AAB as JSON: `400 Invalid JSON payload received. Unexpected token. PK…`.
  `scripts/upload.mjs` uses the correct URI.
- **The service account must have Release/Admin access.** A billing-only
  account fails on the first API call; verify before your first real upload
  (token mint + edit creation + track read all returned 200 in 2026-08-14).
  The key JSON is gitignored in both repos and should stay chmod 600.
- **versionCode must increase across ALL tracks** and is shared with iOS
  (`PRODUCT_BUILD_NUMBER`, SPEC-076). Never reuse a number, even after a
  rejection or rollback — record it in the ledger immediately.

### Both stores / general

- **Run the version gate before uploading** (`verify-version.mjs`), tag
  `v<version>-b<N>` **before** the upload, and record the ledger entry right
  after — even if the build is later rejected.
- **Store processing is not instant.** iOS builds appear in TestFlight a few
  minutes after upload; Play internal builds may take a few minutes to become
  installable.
- **The AAB/IPA must embed the production API URL** and never
  `localhost`/`127.0.0.1` — check before upload (SPEC-048 § 3.2, SPEC-067 § 3.6).
