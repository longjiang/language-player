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

- **Node 22**: Expo SDK 57 requires Node ≥ 20.19.4. Always run:
  ```bash
  source ~/.nvm/nvm.sh && nvm use 22
  ```
- **Xcode + Command Line Tools** installed on the Mac.
- **Apple Developer account** with a development certificate/profile that
  covers the device. The project's profile supports `ca.zerotohero.go`.
- **Device registered** in the Apple Developer portal / Xcode (the iPad's
  UDID must be in the provisioning profile).
- **Metro not already running** on port 8081:
  ```bash
  lsof -ti:8081   # must print nothing
  ```
- **Flask server** running and reachable from the device over your LAN
  (see § 5).

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
