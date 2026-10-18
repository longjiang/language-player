# SPEC-064: iOS Development Build Runbook

## Metadata

- **Spec ID**: SPEC-064
- **Feature**: Building and installing a development build of `apps/mobile` on a physical iOS device
- **Status**: complete — build and install now run through the tracked pipeline (`scripts/dev-build.mjs` → `scripts/install-dev-build.mjs`); ARCH-028 is the canonical runbook
- **Created**: 2026-08-11
- **Last Updated**: 2026-10-18
- **ROADMAP Phase**: Phase 7 — Mobile Integration
- **Scope**: `apps/mobile/` (iOS), scripts under `scripts/`
- **Superseded in part by**: [ARCH-028 — Local Development Runbook](../arch/028-local-development-runbook.md)

How to build and install a **development build** of `apps/mobile` on a
physical iPhone/iPad (Expo SDK 57 / RN 0.86), with every step verified
2026-08-11 on an iPad 11" M4 (UDID `00008132-000261A41EFA401C`).

## 1. Why a development build?

Expo Go is **simulator-only** for this project. A physical device needs a
development build because SDK 57's native modules (including IAP) are not
present in Expo Go, and the app's bundle id is `ca.zerotohero.go`, not
`host.exp.Exponent`. See SPEC-048 § 1.4/1.5.

## 2. Prerequisites (one-time)

### 2.1 Node 22 (Mac)

1. Open Terminal.
2. Run:
   ```bash
   source ~/.nvm/nvm.sh && nvm use 22
   ```
3. Confirm the version:
   ```bash
   node -v   # must print v22.x
   ```

### 2.2 Xcode + Command Line Tools (Mac)

1. Install Xcode from the App Store (or confirm it's installed).
2. Run:
   ```bash
   xcode-select -p   # must print /Applications/Xcode.app/Contents/Developer
   ```
3. If it prints nothing or the wrong path:
   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   ```
4. Accept the license if prompted:
   ```bash
   sudo xcodebuild -license accept
   ```

### 2.3 Developer Mode (iPad — required)

1. On the iPad, open **Settings** (the gray gear icon).
2. Tap **Privacy & Security** (left sidebar on iPad).
3. Scroll down to **Developer Mode** (near the bottom).
4. Tap the toggle to **ON**.
5. Tap **Restart** when the dialog asks you to restart.
6. After the restart, confirm the prompt to enable Developer Mode
   (enter the passcode if asked).

> Without this, Xcode cannot install or launch a development-signed build —
> the build fails before it even starts.

### 2.4 Register the iPad with your Apple Developer account (Mac)

1. Get the iPad's UDID: connect the iPad to the Mac via cable, open Xcode,
   go to **Window → Devices and Simulators**, select the iPad, and copy the
   **Identifier** shown. (Or, on the iPad: Settings → General → About →
   tap the serial number until the UDID appears.)
2. Open **https://developer.apple.com/account** in a browser and sign in.
3. Click **Certificates, Identifiers & Profiles**.
4. Click **Devices** in the left menu.
5. Click the **+** button.
6. Give it a name (e.g. "Jiang's iPad M4") and paste the UDID into the
   **Device ID** field.
7. Click **Continue** → **Register**.
8. Make sure the development **provisioning profile** used by the project
   includes this device. If the project uses automatic signing in Xcode,
   run the build with `-allowProvisioningUpdates` so Xcode updates the
   profile automatically.

> The project's signing identity/profile supports `ca.zerotohero.go`. If
> Xcode errors on signing during the build, the device is missing from the
> profile (see § 7.6).

### 2.5 No stale servers (Mac)

1. Confirm Metro isn't already running:
   ```bash
   lsof -ti:8081   # must print nothing
   ```
2. Confirm Flask is running and reachable from the device's LAN
   (see § 5 for the exact URL check).

## 3. Build the development build

Use the tracked pipeline — `scripts/dev-build.mjs` (ARCH-028, SPEC-076). It
refuses a dirty git tree, bakes `ip.txt` for device builds, records a ledger
row in `docs/versioning/build-ledger.md`, and keeps only the 3 most recent dev
builds.

```bash
node scripts/dev-build.mjs ios-device
```

Useful flags: `--dry-run` (print the plan, build nothing), `--keep N`
(retention), `--allow-dirty` (throwaway build; the ledger row is marked
dirty and no longer mirrors a commit).

What it does: `expo prebuild` if needed → CocoaPods install → `xcodebuild` →
zip the `.app` into `.dev-builds/` → record the row. Expect 15–20+ minutes on
the first build, much less afterwards.

> ⚠️ **Never run build commands without the user's explicit go-ahead.**
> Builds block the machine (AGENTS.md).
>
> Prefer `node scripts/install-dev-build.mjs` (below) when a retained build
> already fits — it skips the build entirely.

## 4. Install and launch on the device

```bash
node scripts/start-metro.sh                      # physical-device Metro, records the session
node scripts/install-dev-build.mjs --device <udid>
```

`install-dev-build.mjs` derives the Metro host at run time, refuses to launch
when Metro is unreachable, installs the retained artifact, and launches it with
`-RCT_jsLocation <host>:<port>` so a stale `ip.txt` cannot strand the app on
the "No script URL provided" redbox. It then verifies that the device actually
reached Metro and diagnoses an isolating network if it did not.

The launch argument applies to **that launch only**. Launches from the home
screen — including after iOS terminates the app in the background — use the
app's persisted `RCT_jsLocation` / `ip.txt` instead, so a host from an older
network strands them on the same redbox. Persist the current host once per
network: in the running app, shake → dev menu → **Configure Bundler** →
`<lan-ip>:8081`. ARCH-028 §
[The persisted Metro host and cold launches](../arch/028-local-development-runbook.md#the-persisted-metro-host-and-cold-launches)
has the details (including why a direct plist edit is reverted by `cfprefsd`).

Useful flags: `--dry-run`, `--no-launch`, `--artifact <zip>`, `--metro-host`,
`--metro-scheme`, `--verify-timeout`.

## 5. Point the app at your Flask server

`scripts/start-metro.sh` derives the host from the interface that can actually
reach the device (not just `en0`) and exports the matching
`EXPO_PUBLIC_API_URL`, so the device does not need a rebuild when the LAN
address changes.

- If the Mac and device are on a network that isolates clients, use
  `scripts/start-metro.sh --tunnel` and pass `--api-url` for a separately
  tunnelled Flask.
- `install-dev-build.mjs` re-points the launched app at the *current* Metro
  host, so the value baked at build time is only a fallback.

Verify Flask accepts LAN connections:
```bash
curl http://<mac-lan-ip>:5001/
```
If that fails, Flask may be bound to `127.0.0.1` only.

## 6. Reloading after JS-only changes

No rebuild is needed for JS-only edits. Reload options:

- Press `r` in the Metro terminal (fastest).
- Force-quit and reopen the app on the device (resets in-memory module state —
  sometimes *required*, see Gotchas). This only works while the persisted Metro
  host matches the current network: after a LAN change the relaunch redboxes
  `No script URL provided` — relaunch through `install-dev-build.mjs` (step 4)
  and persist the host with Configure Bundler.

Native changes (new Expo modules, config plugins, `app.config.js` edits that
affect native code) require a **full rebuild**: repeat § 3.

## 7. Gotchas (learned the hard way)

### 7.1 Metro can fail to start: `EMFILE: too many open files, watch`
macOS watcher limits can block Metro even with Watchman installed. Raise the
file-descriptor limit in the same shell before starting:
`ulimit -n 65536 && npx expo start`. If Watchman is blocked (e.g. a sandboxed
shell can't write `~/Library/LaunchAgents`), start Metro outside the
sandbox.

### 7.2 "No script URL provided" after install
The app shows `No script URL provided. Make sure the packager is running…`
when it cannot reach Metro — most often because `ip.txt` **or the persisted
`RCT_jsLocation`** names an old LAN address (a cold launch uses those; the
installer's launch argument does not persist). `node
scripts/install-dev-build.mjs --device <udid>` fixes the current launch by
launching with the *current* host (`-RCT_jsLocation`) and verifying the device
connected. To make later launches work, persist the host in the dev menu
(**Configure Bundler**) — otherwise a force-quit/reopen on the new network
returns to this redbox. See ARCH-028 §
[The persisted Metro host and cold launches](../arch/028-local-development-runbook.md#the-persisted-metro-host-and-cold-launches).

### 7.3 Missing IAP native module on the first build
The first dev build failed at runtime with
`Cannot find native module 'ExpoInAppPurchases'` — Expo SDK 57 removed the
legacy bridge that `expo-in-app-purchases` depended on. The fix required a
**code change + full rebuild**: migrate to `expo-iap` and repeat § 3.
Native IAP only works in a development build — never in Expo Go on a
physical device.

### 7.4 Default (yellow) app icon
The installed app showed Expo's default icon. Apply the Language Player
icon (`app.config.js` / `assets/icon.png`) and rebuild.

### 7.5 Builds are long and fragile
First build takes 15–20+ minutes and blocks the machine; it also died
mid-build once when the Mac restarted. Don't start other heavy work during
the build, and warn the user before starting.

### 7.6 Build won't start: signing / device registration
`scripts/dev-build.mjs ios-device` (and a manual `npx expo run:ios --device`)
fails before compiling when the iPad isn't ready for development installs.
Known blockers:
- **Developer Mode off** on the device (Settings → Privacy & Security →
  Developer Mode) — enable it and restart the iPad.
- **UDID not in the provisioning profile** — Xcode errors on signing; add
  the device in the Apple Developer portal (or let Xcode auto-register with
  `-allowProvisioningUpdates`).

## 8. Verification checklist

- [ ] `node scripts/dev-build.mjs ios-device` completed and printed a ledger row
- [ ] `node scripts/verify-dev-build.mjs latest` passes (hash, `ip.txt`, commit in git)
- [ ] Metro started with `node scripts/start-metro.sh` (or `--check` passes)
- [ ] `node scripts/install-dev-build.mjs --device <udid>` reached the device and launched
- [ ] Flask reachable from the device (`curl http://<lan-ip>:5001/`)
- [ ] App loads the JS bundle (no "No script URL provided")
- [ ] Home-screen launch works (persisted host set with Configure Bundler, or the LAN has not changed since it was set)
- [ ] Login works; `/user-subscription` returns from Flask

## References

- [ARCH-028 — Local Development Runbook](../arch/028-local-development-runbook.md) — canonical dev-build / Metro / install instructions
- [SPEC-076 — Versioning & Build Number Strategy](076-versioning-strategy.md) — ledger, build numbers, retention
- SPEC-048 — Mobile Release Plan (§ 1.4/1.5 build modes, § 3 archive)
- ARCH-024 — Mobile IAP Architecture (JWS, `appAccountToken`, sandbox
  lessons)
- AGENTS.md — Terminal & Server Start Conventions, Debugging & Verification
