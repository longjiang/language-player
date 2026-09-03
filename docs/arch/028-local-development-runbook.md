# Local Development Runbook

## Metadata
- **Arch ID**: ARCH-028
- **Feature**: Local development runbook for every app in the monorepo
- **Type**: reference
- **Status**: draft
- **Created**: 2026-08-13
- **Last Updated**: 2026-08-16
- **ROADMAP Phase**: Cross-cutting (all phases)
- **Scope**: Web (active), Admin (active), Mobile (active), Chrome Extension (active), Classic Nuxt (reference), Flask backend
- **See also**:
  - [ARCH-012 — Metro Debugging Process](012-metro-debugging-process.md)
  - [ARCH-019 — Chrome Extension Architecture](019-chrome-extension-architecture.md)
  - [ARCH-001 — Classic App Architecture](001-classic-app-architecture.md)
  - [ARCH-003 — Python Backend Architecture](003-python-backend-architecture.md)
  - [SPEC-048 — Mobile Release Plan](../specs/048-mobile-release-plan.md)
  - [SPEC-064 — iOS Development Build Runbook](../specs/064-ios-development-build-runbook.md)
  - [SPEC-067 — Google Play Release Runbook](../specs/067-google-play-release-runbook.md)
  - [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)

---

## Overview

This runbook tells you how to start, verify, and debug every project in the
Language Player monorepo on a local machine. It is the first document to read
when you need to run one of the apps: the exact command, the port it listens
on, what must already be running, and where the logs go.

The repo has six local development targets: three Next.js/Expo apps, one
browser extension with no server, the reference-only Classic Nuxt app, and the
Flask backend that most of the others depend on.

| App | Directory | Local port | Start command (repo root unless noted) |
|---|---|---|---|
| **Web** | `apps/web` | `3000` | `npm run dev -w apps/web` |
| **Admin** | `apps/admin` | `3100` | `npm run dev -w apps/admin` |
| **Mobile (Metro)** | `apps/mobile` | `8081` | `cd apps/mobile && npx expo start --ios` (see [Mobile](#mobile-appsmobile)) |
| **Chrome Extension** | `apps/chrome-extension` | — (no server) | `node apps/chrome-extension/build.mjs`, then load unpacked (see [Chrome Extension](#chrome-extension-appschrome-extension)) |
| **Classic (Nuxt)** | `zerotohero-nuxt` | `3001` | `cd zerotohero-nuxt && npm run dev -- --port 3001` |
| **Flask backend** | `zerotohero-python-server` | `5001` | `cd zerotohero-python-server && FLASK_ENV=development python3.10 app.py` |

---

## Shared Rules

### One server instance per port

Before starting anything, check whether it is already running. If the user
says a server is already running, trust them — do not open a second one.

```bash
lsof -ti:3000   # web
lsof -ti:3001   # classic
lsof -ti:3100   # admin
lsof -ti:8081   # metro
lsof -i:5001    # flask (grep for python)
```

**Never use port 5000 for Flask.** On macOS, port 5000 is occupied by
`ControlCenter` (AirPlay Receiver). The backend is configured for **5001**.

### Node 22 everywhere

All apps require Node 22. The shell loses nvm context between terminal
sessions, so load it explicitly before any Node command:

```bash
source ~/.nvm/nvm.sh && nvm use 22
```

Expo SDK 57 fails on Node 18 with `toReversed is not a function`.

### Install once at the root

```bash
npm install   # installs all workspace deps (apps/*, packages/*)
```

### Never run build commands without the user's go-ahead

`npx turbo build`, `npm run build`, `npx next build`, `npx expo run:ios`, and
`npx expo run:android` are all builds: they take 15–20+ minutes, block the
machine, and `turbo build`/`next build` delete `.next` and kill the dev server.
Use the safe alternatives:

```bash
npm run build:check -w apps/web    # isolated .next-check/ build
npx turbo typecheck                 # type-check everything
```

For a single package, `cd` into it and run its local TypeScript binary:

```bash
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/mobile && ./node_modules/.bin/tsc --noEmit
```

Never run `npx tsc` from the sandboxed terminal (it can fail silently), and
never run bare `tsc` against the root `tsconfig.json` (it type-checks the
entire tree and dies with a heap OOM).

### Log conventions

Every `console.log` / `console.warn` / `console.error` in application code
must start with the app's bracketed prefix and be gated by the app-wide
`LOG_LEVEL` switch:

| App | Prefix | Logging module |
|---|---|---|
| Web | `[LP Web]` | `apps/web/src/lib/logger.ts` (`NEXT_PUBLIC_LOG_LEVEL`) |
| Admin | `[LP Admin]` | `apps/admin/src/lib/logger.ts` (`NEXT_PUBLIC_LOG_LEVEL`) |
| Mobile | `[LP Mobile]` | `apps/mobile/lib/logger.ts` (`EXPO_PUBLIC_LOG_LEVEL`) |
| Chrome Extension | `[LP Extension]` | `apps/chrome-extension/src/i18n.js` (`LOG_LEVEL`) |

Use the exported `log()`, `logwarn()`, `logerr()` helpers — never call
`console.log` directly.

---

## Web — `apps/web`

The main user-facing Next.js app (Next.js 16, App Router, Tailwind + shadcn/ui,
next-intl, NextAuth v5). Runs on **port 3000**.

### Environment

Copy the example env file once:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Key values:

- `NEXT_PUBLIC_API_URL=http://localhost:5001` — local Flask backend
- `AUTH_URL=http://localhost:3000` — must match the app port for NextAuth
- `AUTH_SECRET` — at least 32 chars, change from the placeholder
- `NEXT_PUBLIC_DIRECTUS_URL` — Directus base URL (auth + CMS)

Always import `PYTHON_API_URL` from `@/lib/api-url`, never `process.env`
directly.

### Start

```bash
npm run dev -w apps/web          # or: npx turbo dev --filter=@langplayer/web
```

The script is `next dev --port 3000`. The app needs Flask running on 5001 for
login, video/channel APIs, and subtitle fetching.

### Verify

- `lsof -ti:3000` returns a PID
- Open http://localhost:3000
- Log in with the test credentials (Mary: `tester.mary@zerotohero.ca` /
  `pc8qm8LBZeGuBno`)

### Logs

Next.js prints to the terminal running the dev server. App logs use the
`[LP Web]` prefix and are gated by `NEXT_PUBLIC_LOG_LEVEL`
(0=off, 1=errors, 2=warnings, 3=verbose).

### Stop / restart

Stop with Ctrl+C in the dev terminal. Restart the same command. `npm run
build` or `npx turbo build` deletes `.next` and will kill a running dev
server — use `npm run build:check -w apps/web` instead.

---

## Admin — `apps/admin`

Internal admin console (Next.js 16) for user search and plan/subscription
management (SPEC-060). Only admin accounts can sign in — NextAuth v5 calls the
Flask `/auth/login` endpoint and rejects non-admin users. Runs on **port
3100**.

### Environment

```bash
cp apps/admin/.env.local.example apps/admin/.env.local
```

Key values:

- `NEXT_PUBLIC_API_URL=http://127.0.0.1:5001` — local Flask backend
- `AUTH_URL=http://localhost:3100` — must match the app port
- `AUTH_SECRET` — at least 32 chars
- `NEXT_PUBLIC_LOG_LEVEL=3` — optional, enables verbose logs

Flask CORS already allows `http://localhost:3100` and `http://127.0.0.1:3100`.

### Start

```bash
npm run dev -w apps/admin
```

The script is `next dev --port 3100`. Requires Flask on 5001.

### Verify

- `lsof -ti:3100` returns a PID
- Open http://localhost:3100
- Sign in with an admin account; non-admins get rejected at login

### Logs

Same conventions as web: `[LP Admin]` prefix,
`apps/admin/src/lib/logger.ts`, gated by `NEXT_PUBLIC_LOG_LEVEL`. Verbose
user-action logs use the `[LP Admin] action=<name> <details>` format.

---

## Mobile — `apps/mobile`

Expo SDK 57 / React Native 0.86 app (Expo Router, NativeWind). There is no
single "dev server" — Metro runs on **port 8081** and serves the JS bundle to
the app. There are two local workflows:

1. **Metro + Expo Go in the iOS Simulator** — fastest, no native build
2. **Metro + development build on a physical device** — native binary on iOS
   and Android

> ⚠️ **Status change (2026-08-29): iOS Simulators are no longer used.**
> All simulator runtimes/devices were removed from this machine and the
> project no longer supports simulator workflows. Workflow 1 (Metro + Expo Go
> in the iOS Simulator) is therefore **no longer available** — physical-device
> debug builds (`node scripts/dev-build.mjs ios-device|android`) and
> TestFlight/store builds are the only mobile-device paths now.

### Prerequisites for both

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22   # mandatory — Expo SDK 57 needs Node >= 20.19.4
```

Check Metro isn't already running: `lsof -ti:8081`. Only one Metro instance
may run at a time.

The mobile API URL resolution is in `apps/mobile/lib/api-url.ts`:

| Target | API URL |
|---|---|
| iOS Simulator (dev) | `http://localhost:5001` (default) |
| Android emulator (dev) | `http://10.0.2.2:5001` (default) |
| Physical device (dev) | `http://<mac-lan-ip>:5001` — set `EXPO_PUBLIC_API_URL` |
| Release builds | `https://pythonvps.zerotohero.ca` (never localhost) |

`EXPO_PUBLIC_API_URL` is inlined by Metro at bundle time — changing it after
the bundle is built requires a reload or restart, not just hot reload.

### Workflow 1 — Metro + Expo Go (iOS Simulator)

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
npx expo start --ios
```

`--ios` opens the iOS Simulator and launches Expo Go, which connects to Metro
and loads the bundle.

**Expo Go is simulator-only for this project.** SDK 57 native modules
(including IAP) are missing from Expo Go, and the bundle id is
`ca.zerotohero.go`, not `host.exp.Exponent`. Never suggest Expo Go for a
physical device.

Verify: the Metro terminal shows `iOS Bundled … node_modules/expo-router/entry.js
(N modules)` and `lsof -ti:8081` returns a PID.

### Workflow 2 — Metro + development build (physical device, iOS and Android)

The development build is a native binary with all SDK 57 modules. It still
needs Metro running to load its JS bundle. This workflow is for **physical
devices only** — for the iOS Simulator use Workflow 1 (Expo Go).

#### Check for an existing build first

A dev build may already exist on this machine — don't rebuild if a usable one
is found. Check in this order:

1. **The unified build ledger** (authoritative since 2026-08-16, SPEC-076
   § 4.8): `docs/versioning/build-ledger.md` lists every tracked dev build
   (and store upload), one row per commit, with artifact name and SHA-256.
   The **3 most recent dev builds** (current + 2 previous) are recoverable
   at the repo-local, gitignored `.dev-builds/` (e.g.
   `lp-dev-3-ios-device-88135bde47af.zip`).
   Prove what a build mirrors with:
   `node scripts/verify-dev-build.mjs latest` (re-hashes the artifact,
   checks `ip.txt` on device builds, confirms the commit exists in git).
   Only build via `scripts/dev-build.mjs` when none of the retained builds
   suits (or when native code changed since the last one).
2. Then fall back to the older searches: `.app`/`.ipa`/`.xcarchive` under
   `apps/mobile/ios/build`, `apps/mobile/build/devbuild` (dev-build outputs),
   `tmp/release/` (release artifacts — usually gone, they are deleted after a
   successful upload per ARCH-029), and Xcode DerivedData/Archives.
3. Then check CoreDevice's app-install cache:
   `~/Library/Containers/com.apple.CoreDevice.CoreDeviceService/Data/Library/Caches/AppInstallationBinaryDeltas/<bundle-id>/.../Stashed/*.app`
   — e.g. a verified `ca.zerotohero.go` debug device build from 2026-08-11 was
   found there after the repo/tmp check came back empty.

**Sideload a cached build (step by step, verified 2026-08-14):**

1. List connected devices — `devicectl` talks to CoreDeviceService, so run
   these outside a restricted sandbox:
   `xcrun devicectl list devices`
2. Get each device's **hardware UDID**: the `Identifier` printed by
   `devicectl` is a CoreDevice UUID (e.g. `2DFF9AA2-…`), which is **not** the
   UDID stored in provisioning profiles. Use:
   `xcrun devicectl list devices --json-output /tmp/devices.json`
   and read `hardwareProperties.udid` (e.g. `00008132-000261A41EFA401C`).
3. Find cached builds:
   `find ~/Library/Containers/com.apple.CoreDevice.CoreDeviceService/Data/Library/Caches/AppInstallationBinaryDeltas/<bundle-id> -name '*.app' -type d`
4. Check the build's version/date (`Info.plist`) and its provisioning
   profile:
   `security cms -D -i App.app/embedded.mobileprovision > /tmp/profile.plist`
   then inspect `ProvisionedDevices` (hardware UDIDs) and `ExpirationDate`.
   `security` also fails inside a restricted sandbox.
5. Install **only if the target device's hardware UDID is in the profile**:
   `xcrun devicectl device install app --device <devicectl-identifier> /path/to/App.app`

**Worked example (2026-08-14):** the cached 3.0.0 build was provisioned for 6
devices, including the iPad Air 11-inch M4 (`00008132-000261A41EFA401C`) and
the iPhone 15 Pro Max (`00008130-0016691A3A78001C`). It was installed to the
iPad with:
`xcrun devicectl device install app --device 2DFF9AA2-B075-5A68-8299-65C16DF38803 .../Stashed/LanguagePlayer.app`

**Caveats when reusing a cached build:**
- It can be stale — the 2026-08-11 cache is **3.0.0**, not the current 3.1.2.
- Debug builds have **no embedded JS bundle**; they load it from Metro. Metro
  must be running and `EXPO_PUBLIC_API_URL` must point at the Mac's LAN IP
  (never `127.0.0.1`) or the app cannot reach the Flask backend from the
  device. (For builds made by `dev-build.mjs`, `ip.txt` is baked in and the
  app finds Metro at `http://<mac-lan-ip>:8081` automatically.)
- Installing a dev build replaces any installed app with the same bundle ID
  (TestFlight/App Store included) — they cannot coexist on one device.

Only run the build commands below if no usable build exists.

#### Start Metro

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ulimit -n 65536 && npx expo start   # ulimit avoids EMFILE watcher crashes
```

Start Metro before building/installing so the app can connect as soon as it
opens.

#### iOS (iPhone/iPad)

Requires: device connected and unlocked, Developer Mode enabled, and the
device UDID registered in the `ca.zerotohero.go` development provisioning
profile (see [SPEC-064 — iOS Development Build Runbook](../specs/064-ios-development-build-runbook.md)).

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ipconfig getifaddr en0   # Mac LAN IP, e.g. 192.168.1.130
EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001 npx expo run:ios --device
```

Then open the app on the device — it connects to Metro over the LAN and loads
the bundle.

**Tracked alternative (recommended, SPEC-076 § 4.8):** build the same Debug
app, record it in the dev ledger, and retain the 3-build window in one step:

```bash
node scripts/dev-build.mjs ios-device     # Debug build, ledger row, .dev-builds/
node scripts/verify-dev-build.mjs latest  # prove which commit it mirrors
```

`dev-build.mjs` refuses a dirty git tree (a build must mirror a commit "for
sure"), requires Metro already running (`npx expo start` above), and bakes
`ip.txt` so the device finds Metro at `http://<mac-lan-ip>:8081`. To show the
exact commit in the About dialog, start Metro with
`EXPO_PUBLIC_GIT_SHA=$(git rev-parse HEAD) npx expo start`.

#### Android (physical device)

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ipconfig getifaddr en0   # Mac LAN IP, e.g. 192.168.1.130
EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001 npx expo run:android
```

Then open the app on the device — it connects to Metro over the LAN and loads
the bundle.

> ⚠️ `npx expo run:ios` / `npx expo run:android` are native builds (15–20+
> minutes, run CocoaPods/Gradle). Never run them without the user's go-ahead.
> See [SPEC-064 — iOS Development Build Runbook](../specs/064-ios-development-build-runbook.md)
> for the full physical-device procedure.

#### Android over Wi-Fi (no cable) — wireless debugging

adb works over TCP/IP, so a physical Android device does **not** need to stay
tethered. Verified 2026-08-15 on a Pixel 5a (barbet).

**Where adb lives (per machine — not on PATH by default):**

- **MacBook Air M2**:
  `/opt/homebrew/share/android-commandlinetools/platform-tools/adb`
  (Homebrew `android-commandlinetools`, platform-tools 37.0.1). The
  authoritative pointer is `apps/mobile/android/local.properties`
  (`sdk.dir=...`), which the Android/Gradle tooling writes.
- On any other machine, locate it the same way: read `sdk.dir` from
  `apps/mobile/android/local.properties` and append `/platform-tools/adb`
  (fallback: `mdfind -name adb`). Then optionally make plain `adb` work:
  ```bash
  export ANDROID_HOME=<sdk.dir-value>
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
  ```

**One-time pairing (Android 11+):**

1. Phone: **Settings → Developer options → Wireless debugging** → on.
2. Tap **Pair device with pairing code** and read the `IP:port` + 6-digit code.
3. Mac: `adb pair <phone-ip>:<port> <code>` → then `adb connect <phone-ip>:<port>`
   (on modern adb the device also auto-connects via mDNS).
4. Confirm: `adb devices -l` shows the device (e.g.
   `adb-19271JEG502854-8QMiDF._adb-tls-connect._tcp device`).

**The dev-server host setting (the usual "Unable to load script" culprit):**

- The debug app loads its JS bundle from a host saved in shared preferences
  (`ca.zerotohero.go_preferences.xml`, key `debug_http_host`). It is **not**
  set by installing the APK.
- Format matters: the React Native dev menu wants **host:port only**
  (`192.168.1.130:8081`) under **Settings → Debug server host & port for
  device**. The `exp://192.168.1.130:8081` format is only for an Expo
  "Enter URL manually" menu (expo-dev-client builds).
- **A plain reload does NOT re-read the setting.** After changing it (or after
  a fresh install), the app must be cold-restarted:
  `adb shell am force-stop ca.zerotohero.go && adb shell am start -n ca.zerotohero.go/.MainActivity`
- Quick sanity check from the phone browser:
  `http://<mac-lan-ip>:8081/status` must show `packager-status:running`.
- Do **not** test Metro with `/index.bundle` — that is the RN-CLI path and 404s
  on this Expo Router project. The app requests the manifest's launchAsset URL
  (`http://<mac-lan-ip>:8081/apps/mobile/node_modules/expo-router/entry.bundle?...`).

**Metro must always be started from `apps/mobile`** (never the repo root) —
starting from the root serves a broken bundle and causes the same
"Unable to load script" failure:

```bash
cd apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ulimit -n 65536 && npx expo start
```

When in doubt, the fix sequence is: (1) confirm `/status` from the phone
browser, (2) cold-restart the app via adb, (3) read `adb logcat` for the real
bundle error instead of guessing.

### Verify

- Metro: `lsof -ti:8081`, bundle line in the terminal
- Flask reachable from the target: iOS Simulator `curl http://localhost:5001`,
  Android emulator `http://10.0.2.2:5001`, physical device
  `curl http://<mac-lan-ip>:5001`
- Android device → Metro over Wi-Fi: phone browser
  `http://<mac-lan-ip>:8081/status` returns `packager-status:running`

### Logs

- Metro terminal shows all `console.log/warn/error` from the app (`[LP Mobile]`
  prefix, gated by `EXPO_PUBLIC_LOG_LEVEL`)
- If you don't own the Metro terminal, structured JSON logs are written to
  `apps/mobile/.expo/dev/logs/start.log`
- Native crashes can be viewed with `idb log` (iOS Simulator)
- **Native `print()` output (Swift/Kotlin) NEVER reaches Metro** — it goes to
  the app process's stdout. Capture it on a physical device by relaunching
  the app with the console attached (streams until the app exits; run it in
  its own terminal or a background job):

  ```bash
  xcrun devicectl device process launch --console --terminate-existing \
    --device 2DFF9AA2-B075-5A68-8299-65C16DF38803 ca.zerotohero.go
  ```

  This is how the ruby-text module's `attach-ruby`/`rebuild` prints are
  inspected. ⚠️ Keep such diagnostics read-only: forcing
  `textView.layoutManager` layout from a debug print broke
  `CTRubyAnnotation` painting on iPadOS 26.6 (see
  [ARCH-030 — Native Ruby Text Rendering](030-ruby-text-native-rendering.md)).

### Reload / restart

- **Fast reload**: press `r` in the Metro terminal (~1 s). Does NOT re-evaluate
  module-level constants (e.g. API URLs).
- **Full restart**: kill Metro, `rm -rf apps/mobile/.expo`, restart WITHOUT
  `--clear`. Needed for module-level constant changes, new dependencies,
  NativeWind/Tailwind config changes, and metro.config.js changes.
- Never use `--clear` unless proven necessary — it forces a full rebuild of
  2000+ modules.

See [ARCH-012 — Metro Debugging Process](012-metro-debugging-process.md) for
the full troubleshooting guide.

---

## Chrome Extension — `apps/chrome-extension`

The Chrome extension has no dev server and no port. The workflow is: build →
load unpacked → refresh → reload the video page.

### Build

```bash
node apps/chrome-extension/build.mjs
```

Run from the repo root. The build:

1. Generates `dist/lang-names.json` from `translations.csv`
2. Bundles `src/content-entry.js` → `dist/content.js` with esbuild
3. Bundles `src/popup-options.js` → `dist/popup-options.js`
4. Bundles `src/popup.js` → `dist/popup.js`
5. Copies `src/content.css` and `src/netflix-main-world.js` into `dist/`
6. Auto-bumps the patch version in `manifest.json`

### Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `apps/chrome-extension/`

The manifest points at `dist/content.js` and `dist/content.css`, so a rebuild
is required after any source change before refreshing.

### After editing source

```bash
node apps/chrome-extension/build.mjs
```

Then: `chrome://extensions` → click **Refresh** on Language Player → reload the
video page.

### After editing locales

```bash
node apps/chrome-extension/scripts/generate-locales.js
node apps/chrome-extension/build.mjs
```

Then refresh the extension at `chrome://extensions` and reload the video page.
Extension message keys must be flat (no dots) and named placeholders need a
`placeholders` definition — see the i18n rules in
[ARCH-019 — Chrome Extension Architecture](019-chrome-extension-architecture.md).

### Verify

- `dist/content.js` exists and its banner shows a fresh version
- `chrome://extensions` shows the extension enabled (no load errors)
- On a supported site (YouTube, Netflix, Prime Video, Disney+, Hulu, Max) the
  transcript panel appears and console logs use `[LP Extension]`

---

## Classic Nuxt — `zerotohero-nuxt`

The legacy full-featured web app (Nuxt 2 / Vue 2). **Reference only — do not
edit its files.** Runs on **port 3001**.

### Environment

`zerotohero-nuxt/.env` (gitignored) supplies local overrides. For local dev:

```bash
PYTHON_SERVER=http://127.0.0.1:5001/
PAYPAL_ENV=sandbox          # only if the PayPal button must render
PAYPAL_SANDBOX_CLIENT_ID=...
PAYPAL_CLIENT_ID=...
```

Never edit the committed default in `lib/utils/servers.js` — its production
URL (`https://python.zerotohero.ca/`) must stay the default. Committing a
localhost value breaks production.

### Start

Classic always runs on **port 3001** — the `--port 3001` flag is required.
Without it, Nuxt may bind to 3000 (the web app's port) and collide with it:

```bash
cd zerotohero-nuxt && npm run dev -- --port 3001
```

Requires Flask on 5001 for user data, dictionary lookups, and translations.

### Verify

- `lsof -ti:3001` returns a PID
- Open http://localhost:3001

### Gotchas

- All authenticated Flask calls must use `$axios` (Nuxt auth refresh scheme),
  never plain `axios` — plain axios bypasses token refresh and 401s after the
  access token expires.
- The Classic repo is its own Git repository. If changes are ever needed
  there, commit inside `zerotohero-nuxt/`, not in the monorepo.

---

## Flask Backend — `zerotohero-python-server`

The Flask API (Python 3.10) that web, admin, mobile, and Classic all call.
Runs on **port 5001**. In development it runs with `debug=True` and prints
debug logs.

### Start (human-run command)

```bash
cd zerotohero-python-server
FLASK_ENV=development python3.10 app.py
```

`FLASK_ENV=development` switches the app into debug mode:

- `debug=True` — Flask's reloader watches the source and reloads on change
- Serves on `0.0.0.0:5001`
- Python logging level is `DEBUG`
- Flask prints startup lines (`Serving Flask app 'app'`, `Debug mode: on`)
  and per-request lines to the terminal
- `logging.basicConfig` writes logs to `logs/application.log` (created in the
  server directory when the production path is unavailable)

Without `FLASK_ENV=development`, the app runs at `INFO` level, and `app.py`
execs gunicorn (production mode) or falls back to waitress.

> ⚠️ **Never start or stop the Flask server as an AI agent.** The server is
> the user's responsibility to manage. If it is down, tell the user; do not
> restart it yourself. You may query endpoints with `curl` to test behavior.

### Verify

```bash
lsof -i:5001 | grep python          # must show a LISTENing python process
curl -s http://127.0.0.1:5001/python_version
```

Startup takes ~10–15 seconds (MySQL connection pools, large NLP imports).
Requests before it is ready get `Connection refused`. In debug mode Flask
does not print the `* Running on http://...` line — it IS listening even when
the terminal only shows the two startup lines.

### Logs

- Debug request logs: Flask terminal
- Application logs: `logs/application.log` (relative to
  `zerotohero-python-server/`)
- Production (gunicorn): access log to stdout, error log to stderr
  (`gunicorn.conf.py`), Python logs to the server's application log

### Gotchas

- Port 5000 is macOS AirPlay — never check or use it
- Always use `python3.10`, never bare `python` / `python3`
- After killing Flask, the reloader child can keep the port:
  `lsof -ti:5001 | xargs kill -9`

---

## Start Everything (Quick Reference)

```bash
# 1. Flask (user-managed in this project)
cd zerotohero-python-server && FLASK_ENV=development python3.10 app.py

# 2. Web
npm run dev -w apps/web

# 3. Admin
npm run dev -w apps/admin

# 4. Classic (reference, only when needed)
cd zerotohero-nuxt && npm run dev -- --port 3001

# 5. Mobile — Metro + Expo Go (iOS Simulator)
cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22 && npx expo start --ios

# 6. Chrome extension
node apps/chrome-extension/build.mjs   # then Load unpacked at chrome://extensions
```

---

## Disk cleanup (builds & caches)

When disk space is tight, reclaim it without losing the ability to build
later. Adopted 2026-08-29. Safe to delete (all regenerable):

```bash
# Web / admin build output
rm -rf apps/web/.next apps/web/.next-check apps/admin/.next 2>/dev/null
# Expo / Metro / turbo caches
rm -rf apps/mobile/.expo .turbo apps/mobile/.turbo
# iOS native build output + Xcode DerivedData / Archives
rm -rf apps/mobile/ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData/LanguagePlayer*
rm -rf ~/Library/Developer/Xcode/Archives
# Android build output
rm -rf apps/mobile/android/.gradle apps/mobile/android/app/build
# Transient release artifacts (ARCH-029 deletes these after a successful upload)
rm -rf tmp/release
# Older dev builds beyond the 3-build retention window
rm -rf .dev-builds/archive
```

Do **not** delete (needed to build again): `node_modules`,
`apps/mobile/ios` (+ `Pods`), `apps/mobile/android` (native project,
`key.properties`, `local.properties` — remember to recreate these after any
`expo prebuild`, see SPEC-067 § 3.4), and the 3 most recent dev builds in
`.dev-builds/` (current + 2 previous).

### Python / pytest caches

`.pytest_cache/`, `logs/` and the legacy `hs_err_pid*.log` are safe to remove;
`~/.gradle`, `~/.cocoapods` and Xcode's module cache are large and can be
cleared, but the next build just regenerates them (slower).

### iOS & Android simulators

Simulators are no longer used (removed 2026-08-29). To reclaim their space:

```bash
xcrun simctl delete all
xcrun simctl runtime delete iOS 26.5   # or the installed runtime name
```

See ARCH-012 for the deprecation note.

## Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Web/Admin can't log in or fetch data | Flask not running | Verify `lsof -i:5001`; ask the user to start Flask |
| Mobile app gets network errors | API URL wrong for the target | Simulator: localhost. Android emulator: `10.0.2.2`. Physical device: Mac LAN IP |
| Mobile stale behavior after edits | Hot reload didn't re-evaluate module-level constants | Kill Metro, `rm -rf apps/mobile/.expo`, restart without `--clear` |
| Port already in use | Second dev server | `lsof -ti:<port>` and kill the stale process, or use the running instance |
| Extension changes not visible | dist/ is stale | Run `node apps/chrome-extension/build.mjs`, refresh at `chrome://extensions`, reload the video page |
| `EMFILE: too many open files` (Metro) | macOS file-watcher limit | `ulimit -n 65536 && npx expo start` |
| Flask not reachable from a physical device | Server bound to loopback only / wrong Wi-Fi | `curl http://<mac-lan-ip>:5001/`; device and Mac on the same network |

---

## Consequences

### Pros
- One canonical place to find the start command, port, env file, and log
  location for every project.
- Captures hard-won traps (port 5000 vs 5001, Expo Go simulator-only,
  `--clear` policy, extension rebuild rules) next to the commands they affect.

### Cons / Risks
- Ports and commands drift as apps evolve; this document must be updated when
  a `package.json` script or default port changes.
- Runbooks describe ideal state; a developer's local env (LAN IP, installed
  emulators, provisioned devices) can still differ.

---

## Open Questions

- The extension has no package.json script wrapper; consider adding `build`
  scripts so `npm run build -w apps/chrome-extension` works like the other
  apps.

---

## Related Documents

- [ARCH-012 — Metro Debugging Process](012-metro-debugging-process.md)
- [ARCH-019 — Chrome Extension Architecture](019-chrome-extension-architecture.md)
- [SPEC-048 — Mobile Release Plan](../specs/048-mobile-release-plan.md)
- [SPEC-064 — iOS Development Build Runbook](../specs/064-ios-development-build-runbook.md)
- [SPEC-067 — Google Play Release Runbook](../specs/067-google-play-release-runbook.md)
- [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)
