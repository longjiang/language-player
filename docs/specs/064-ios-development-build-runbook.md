# iOS Development Build Runbook

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

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ipconfig getifaddr en0          # Mac LAN IP, e.g. 192.168.1.130
EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001 npx expo run:ios --device
```

What happens:
1. `expo prebuild` (if needed) generates/updates the `ios/` directory.
2. CocoaPods installs native dependencies.
3. Xcode builds the app (15–20+ minutes on first build).
4. The app is installed on the connected device.

> ⚠️ **Never run build commands without the user's explicit go-ahead.**
> Builds take 15–20+ minutes and block the machine (AGENTS.md).

## 4. After the build: run Metro

The installed app needs Metro to load its JS bundle. From `apps/mobile`:

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile
source ~/.nvm/nvm.sh && nvm use 22
ulimit -n 65536 && npx expo start 2>&1 | tee /tmp/metro.log
```

Then open the app on the device. It connects to Metro over the LAN and
loads the bundle.

> ⚠️ **MacOS file-watcher limit (`EMFILE: too many open files, watch`):**
> Metro can fail to start with this error even though Watchman is installed.
> Raise the descriptor limit in the same shell first:
> `ulimit -n 65536 && npx expo start`. If Watchman itself is blocked (e.g.
> sandboxed shells can't write `~/Library/LaunchAgents`), start Metro
> outside the sandbox.

## 5. Point the app at your Flask server

The physical device cannot use `localhost`. Two options:

- **Before building** (recommended): set
  `EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001` so the value is baked into
  the bundle at build time.
- **After building**: `apps/mobile/.env` (gitignored) can set
  `EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001`; changing it requires a
  Metro restart and app reload.

Verify Flask accepts LAN connections:
```bash
curl http://<mac-lan-ip>:5001/
```
If that fails, Flask may be bound to `127.0.0.1` only.

## 6. Reloading after JS-only changes

No rebuild is needed for JS-only edits. Reload options:

- Press `r` in the Metro terminal (fastest).
- Force-quit and reopen the app on the device (always works; also resets
  in-memory module state — sometimes *required*, see Gotchas).

Native changes (new Expo modules, config plugins, `app.json` edits that
affect native code) require a **full rebuild**: repeat § 3.

## 7. Gotchas (learned the hard way)

### 7.1 Metro can fail to start: `EMFILE: too many open files, watch`
macOS watcher limits can block Metro even with Watchman installed. Raise the
file-descriptor limit in the same shell before starting:
`ulimit -n 65536 && npx expo start`. If Watchman is blocked (e.g. a sandboxed
shell can't write `~/Library/LaunchAgents`), start Metro outside the
sandbox.

### 7.2 "No script URL provided" after install
The freshly built app shows `No script URL provided. Make sure the packager
is running…` when Metro isn't running. Fix: start Metro (§ 4), then
force-quit and reopen the app on the device.

### 7.3 Missing IAP native module on the first build
The first dev build failed at runtime with
`Cannot find native module 'ExpoInAppPurchases'` — Expo SDK 57 removed the
legacy bridge that `expo-in-app-purchases` depended on. The fix required a
**code change + full rebuild**: migrate to `expo-iap` and repeat § 3.
Native IAP only works in a development build — never in Expo Go on a
physical device.

### 7.4 Default (yellow) app icon
The installed app showed Expo's default icon. Apply the Language Player
icon (`app.json` / `assets/icon.png`) and rebuild.

### 7.5 Builds are long and fragile
First build takes 15–20+ minutes and blocks the machine; it also died
mid-build once when the Mac restarted. Don't start other heavy work during
the build, and warn the user before starting.

### 7.6 Build won't start: signing / device registration
`npx expo run:ios --device` can fail before compiling when the iPad isn't
ready for development installs. Known blockers:
- **Developer Mode off** on the device (Settings → Privacy & Security →
  Developer Mode) — enable it and restart the iPad.
- **UDID not in the provisioning profile** — Xcode errors on signing; add
  the device in the Apple Developer portal (or let Xcode auto-register with
  `-allowProvisioningUpdates`).

## 8. Verification checklist

- [ ] `nvm use 22` succeeded
- [ ] Port 8081 free before starting Metro
- [ ] `EXPO_PUBLIC_API_URL` points at the Mac's LAN IP (not localhost)
- [ ] Flask reachable from the device (`curl http://<lan-ip>:5001/`)
- [ ] Build completed and app installed on the device
- [ ] Metro running with `ulimit -n 65536` and logs teed to a file
- [ ] App loads the JS bundle (no "No script URL provided")
- [ ] Login works; `/user-subscription` returns from Flask

## References

- SPEC-048 — Mobile Release Plan (§ 1.4/1.5 build modes, § 3 archive)
- ARCH-024 — Mobile IAP Architecture (JWS, `appAccountToken`, sandbox
  lessons)
- AGENTS.md — Terminal & Server Start Conventions, Debugging & Verification
