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

### 7.1 Sandbox Apple ID must have a readable email
Apple sends sign-in verification codes to the sandbox account's address.
`iossandboxtester3@zerotohero.ca` had no readable inbox and looped the
password prompt forever. Use a plus-alias of a mailbox you can read
(e.g. `youraddress+lpiap@gmail.com`).

### 7.2 Clear purchase history ≠ clear device StoreKit state
Clearing sandbox purchase history in App Store Connect did **not** clear the
device's local StoreKit queue — the old transaction replayed. A **fresh
sandbox tester account** was the only reliable reset.

### 7.3 IAP requires a development build
`expo-in-app-purchases` is dead on SDK 57 (missing native bridge); the app
uses `expo-iap`. Native IAP only works in a development build — never in
Expo Go on a physical device.

### 7.4 Stale bundles masquerade as bugs
After editing JS, the device can still run the previous bundle. Symptoms
included: a spinner that "never resolves", missing success-screen
navigation, and debug logs that never appear. **Force-quit and reopen the
app** before assuming the code is wrong.

### 7.5 Metro session buffers are small
Live terminal buffers scroll away; the one log line you need is gone. Tee
Metro output to a file (`tee /tmp/metro.log`) and grep it instead of relying
on a live window.

### 7.6 Flask must be restarted after backend edits
The Flask server does not hot-reload reliably in this setup. After changing
Python code (e.g. `app_in_app_purchase.py`), restart Flask or the app talks
to stale logic.

### 7.7 `appAccountToken` binds purchases to users
New IAP purchases must carry `appAccountToken = user.id`; the backend rejects
transactions without a matching token. Old test transactions (pre-binding)
are unclaimable — delete the subscription row and make a fresh purchase with
a fresh tester.

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
