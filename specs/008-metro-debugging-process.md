# SPEC-008: Metro Debugging Process

## Metadata
- **Spec ID**: SPEC-008
- **Feature**: Mobile app debugging workflow with Metro + idb + iOS Simulator
- **Status**: draft
- **Created**: 2026-07-22
- **ROADMAP Phase**: Cross-cutting (all phases)

## Overview

This document standardizes the debugging workflow for the React Native mobile app (`apps/mobile/`). It covers server startup, log monitoring, idb usage for iOS Simulator interaction, and troubleshooting patterns.

---

## Server Startup (AI Agent Responsibility)

The AI agent MUST start all servers itself so it owns the terminal UUIDs and can access stdout via `get_terminal_output`. The user should NOT start servers manually.

### Prerequisites Check

```bash
# Check what's running
lsof -ti:8081 2>/dev/null && echo "Metro running" || echo "Metro not running"
lsof -i:5001 2>&1 | grep -q python && echo "Flask running on 5001" || echo "Flask not running"
idb list-targets 2>&1 | grep -i booted
```

**Important:** Port 5000 on macOS is occupied by `ControlCenter` (AirPlay Receiver), NOT available for Flask. The Python backend is configured for port **5001**. Use `lsof -i:5001` to check Flask, not `lsof -ti:5000`. The PID on port 5000 is always macOS AirPlay, not Flask.

### Start Python Backend (if not running)

```bash
cd zerotohero-python-server && python3.10 app.py
```

Run in **async mode** since it's a long-running server. The Flask dev server runs on **port 5001** (not 5000). Key endpoints used by mobile:
- `POST /dictionary/lookup` — dictionary search with LLM fallback
- `GET /recommend-videos` — video recommendations
- `POST /translate_array` — batch subtitle translation

**Startup time:** Flask takes ~10–15 seconds to start (database connection pooling, module imports). Any request before it's ready gets `Connection refused`. Wait for the `* Running on http://0.0.0.0:5001` line before testing. Do NOT kill the terminal — Flask logs to stdout only.

### Start Metro + iOS Simulator

```bash
cd apps/mobile && source ~/.nvm/nvm.sh && nvm use 22 && npx expo start --ios
```

Run in **async mode**. The `--ios` flag auto-opens the iOS Simulator and launches Expo Go.

**Critical:** `nvm use 22` is mandatory — Expo SDK 57 requires Node ≥20.19.4; Node 18 fails with `toReversed is not a function`.

### Forcing a Fresh Metro Connection

Sometimes Expo Go loads a cached bundle instead of connecting to the new Metro instance. To force a fresh connection:

```bash
# Kill Expo Go on the simulator
xcrun simctl terminate <UDID> host.exp.Exponent
# Re-open the Metro URL directly (bypasses Expo Go home screen)
xcrun simctl openurl <UDID> "exp://192.168.1.130:8081"
```

This avoids the Expo Go "Recent Projects" screen entirely. The app connects directly and triggers a fresh bundle build. Confirmation: Metro terminal shows `iOS Bundled Xms node_modules/expo-router/entry.js (N modules)`.

---

## Log Monitoring

### Where Logs Appear

| Log Source | Where to See It | How to Access |
|---|---|---|
| `console.log()` / `console.warn()` / `console.error()` | **Metro terminal** | `get_terminal_output(id=<metro-uuid>)` |
| React Native redbox errors | Simulator screen (visual) | Cannot be read programmatically; user must describe |
| Network errors (axios) | Metro terminal | Same as console.log |
| Python backend errors | Flask terminal | `get_terminal_output(id=<flask-uuid>)` |
| Native crashes / OS-level logs | idb log stream | `idb log --filter <pattern>` |
| App filesystem (SQLite, AsyncStorage) | idb fs commands | `idb fs ls` / `idb fs pull` |

### Reading Metro Logs

After starting Metro in async mode, periodically call:

```
get_terminal_output(id=<metro-uuid>)
```

This returns the latest output since the last read. Metro prints:
- Bundle build progress (`Bundling... 45%`)
- All `console.log/warn/error` from the running app
- Fetch/Axios network errors
- React render warnings

### Debug Log Convention

All Phase 1 dictionary debug logs use the `[PHASE1]` prefix for easy filtering:

```
[PHASE1] onlineLookup: { text: "你好", l1: "en", l2: "zh", resultCount: 3, source: "PYTHON" }
[PHASE1] online lookup success: { text: "你好", count: 3, matchTypes: ["exact", "fuzzy"], llmCount: 0 }
[PHASE1] memory cache hit: { text: "你好", count: 3 }
[PHASE1] falling back to local SQLite for: "稀有词"
```

---

## idb (iOS Device Bridge) Usage

`idb` provides programmatic access to the iOS Simulator without screenshots.

### Key Commands

| Command | Purpose |
|---|---|
| `idb list-targets` | List all simulators and their boot state |
| `idb boot <udid>` | Boot a specific simulator |
| `idb ui describe-all` | Dump entire UI hierarchy as text (all elements, frames, labels) |
| `idb ui describe-point x y` | Describe the UI element at specific coordinates |
| `idb log` | Stream device logs (continuous, use with timeout) |
| `idb log --filter Dict` | Filter logs for dictionary-related messages |
| `idb fs ls --bundle <bundle-id>` | List app sandbox contents |
| `idb fs pull --bundle <bundle-id> /path/on/device /local/path` | Pull files (e.g., SQLite db) |
| `idb install <ipa>` | Install an app |
| `idb launch <bundle-id>` | Launch an app |

### Limitations

- **`idb ui tap x y` does NOT work with Expo Go** (per repo memory). It works with development builds where the app has the `idb` companion library linked.
- **`idb screenshot` is not available** — use `idb ui describe-all` for text-based UI inspection instead.
- The agent cannot see the simulator screen; it relies on Metro logs + `idb ui describe-all` for visibility.

### Debugging Without Screenshots

The standard approach for understanding app state:

1. **Read Metro logs** — `console.log` output shows data flow, API responses, state changes
2. **Use `idb ui describe-all`** — returns a text tree of all visible UI elements with their labels, positions, and types. Example output:
   ```
   Application | 0x... | "Language Player" | CGRect(0,0,393,852)
   ├── StaticText | 0x... | "Dictionary" | CGRect(16,54,200,44)
   ├── TextField | 0x... | "Search..." | CGRect(16,106,361,44)
   ├── TableView | 0x... | | CGRect(0,158,393,694)
   │   ├── Cell | 0x... | "你好 - Hello" | CGRect(0,0,393,88)
   │   └── Cell | 0x... | "你好吗 - How are you?" | CGRect(0,88,393,88)
   ```
3. **Use `idb fs pull`** to inspect SQLite databases, AsyncStorage, and other persisted state

---

## Monorepo Metro Configuration (apps/mobile-v2)

The `apps/mobile-v2/` Metro config requires specific additions for npm workspace hoisting. See **ADR-0010 → Monorepo Metro Configuration** for the architectural decision and rationale. The full working config is reproduced below for reference.

### Required metro.config.js additions

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Fix monorepo hoisting: expo/AppEntry.js resolves ../../App to the wrong
//    place (monorepo root, not app root). Redirect to the correct App.js.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../../App' || moduleName === './App') {
    return {
      filePath: path.resolve(projectRoot, 'App.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 2. Watch shared packages for live reload
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(workspaceRoot, 'packages'),
];

// 3. Resolve modules from both local and workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 4. Don't block the packages directory from Metro's transpiler
const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList];
config.resolver.blockList = blockList.filter(
  (pattern) => !pattern.toString().includes('packages'),
);

// 5. NativeWind integration (must be last)
module.exports = withNativeWind(config, { input: './global.css' });
```

### Why the resolveRequest hook is needed

In npm workspaces, `node_modules` is hoisted to the monorepo root. `expo/AppEntry.js` lives at `{root}/node_modules/expo/AppEntry.js` and does `import App from '../../App'`. From that path, `../../` resolves to the **monorepo root**, not `apps/mobile-v2/`. The `resolveRequest` hook intercepts this and redirects to the correct `App.js`.

Without this fix: `Unable to resolve "../../App" from "node_modules/expo/AppEntry.js"`.

### Dynamic require() is prohibited in Metro

Metro's bundler does NOT allow dynamic `require()` or `import()` expressions:

```ts
// ❌ BROKEN — Metro will reject this at bundle time
const messages = require(`@langplayer/shared/locales/${locale}.json`);

// ✅ CORRECT — use static imports with a lookup map
import en from '@langplayer/shared/locales/en.json';
import fr from '@langplayer/shared/locales/fr.json';
const localeMessages = { en, fr };
const messages = localeMessages[locale] ?? localeMessages['en'];
```

This affects any code that imports from `packages/shared/locales/` or any other location with variable-based paths. Always use static import maps.

### tailwind.config.js cannot import TypeScript

The NativeWind Metro plugin loads `tailwind.config.js` via Node's `require()`, which cannot resolve `.ts` files. The config must be a plain `.js` file. Design tokens from `packages/shared/src/tokens.ts` must be either:

1. Hardcoded in `tailwind.config.js` (Phase 1 approach — pragmatic for scaffolding)
2. Generated by a build script (`scripts/build-tokens.mjs`) that outputs a `.js` config (Phase 2+ approach — keeps tokens as single source of truth)

---

## Hot Reload

When code changes are made during debugging, reload the app in the simulator:

- **Fast reload**: Press `r` in the Metro terminal (reloads JS bundle, ~1 second). Reloads component code and hooks, but does NOT re-evaluate module-level constants (e.g., `const API_URL = '...'`). For changes to module-level values or imported config files, a full restart is required.
- **Full restart**: Kill Metro, `rm -rf apps/mobile-v2/.expo`, and restart WITHOUT `--clear`. Necessary for: module-level constant changes, new dependencies, NativeWind/Tailwind config changes, metro.config.js changes.

To send `r` to Metro programmatically:

```
send_to_terminal(id=<metro-uuid>, command="r")
```

**Never use `--clear`** unless proven necessary — it wipes the bundle cache and forces a full rebuild of 2000+ modules. **Note:** In monorepo setups, `--clear` has been observed to NOT fully clear the transform cache, causing stale module errors to persist across restarts. When changes aren't picked up, the reliable approach is:

1. Kill Metro (`lsof -ti:8081 | xargs kill -9`)
2. Delete `.expo/` directory (`rm -rf apps/mobile-v2/.expo`)
3. Restart Metro WITHOUT `--clear`

---

## Verification Checklist (Phase 1 Dictionary)

1. [ ] Flask running on port 5000
2. [ ] Metro running, app loaded in simulator
3. [ ] Log in with test credentials
4. [ ] Navigate to a video with subtitles (e.g., Chinese)
5. [ ] Tap a word → dictionary popup appears
6. [ ] Metro shows `[PHASE1] onlineLookup: { ..., source: "PYTHON" }`
7. [ ] If source is "FALLBACK", check Flask terminal for errors
8. [ ] Tap the same word again → Metro shows `[PHASE1] memory cache hit`
9. [ ] Look up a rare word → check `llmCount > 0` in success log
10. [ ] Switch L1 to non-English (e.g., Spanish) → definitions should be translated

---

## Common Issues

### Monorepo: "Unable to resolve ../../App from node_modules/expo/AppEntry.js"
**Cause**: npm workspace hoists `expo` to root `node_modules`. `expo/AppEntry.js` resolves `../../App` to the monorepo root, not the app directory.
**Fix**: Add a `resolveRequest` hook in `metro.config.js` (see [Monorepo Metro Configuration](#monorepo-metro-configuration-appsmobile-v2)).

### Monorepo: "Invalid call at line N: require(\`...\${variable}...\`)"
**Cause**: Metro does not allow dynamic `require()` or template literals in import paths. All `require()` and `import` paths must be static strings.
**Fix**: Replace dynamic requires with a static import map (see [Dynamic require() is prohibited](#dynamic-require-is-prohibited-in-metro)).

### NativeWind: "Tailwind CSS has not been configured with the NativeWind preset"
**Cause**: `tailwind.config.js` is missing `presets: [require('nativewind/preset')]`.
**Fix**: Add the preset as the first item in the config.

### NativeWind: "Cannot find module '@langplayer/shared/tokens'"
**Cause**: `tailwind.config.js` tries to `require()` a TypeScript file from the shared package. Node can't parse `.ts` files directly.
**Fix**: Hardcode token values in `tailwind.config.js` (Phase 1) or generate the config via a build script (Phase 2+).

### Stale bundle after code changes (--clear not working)
**Cause**: `--clear` flag sometimes fails to fully purge the Metro transform cache in monorepo setups. Old module transforms persist and cause errors that reference code you've already changed.
**Fix**: Kill Metro, `rm -rf apps/mobile-v2/.expo`, restart WITHOUT `--clear`. The `.expo` directory contains the transform cache; manual deletion is reliable.

### Hot reload doesn't pick up module-level constant changes
**Cause**: Metro's HMR (Hot Module Replacement) patches function/component changes but does NOT re-evaluate module-level constants. If you change `const API_URL = 'http://old:5000'` to `'http://new:5001'` in a file that's been imported, the old value persists until a full restart.
**Fix**: Kill Metro, `rm -rf apps/mobile-v2/.expo`, restart WITHOUT `--clear`. Module-level changes require a cold start.

### Simulator Networking: 127.0.0.1 vs host IP
**Cause**: The iOS Simulator shares the host Mac's network but has its own loopback interface. `127.0.0.1` (and `localhost`) from the simulator point to the **simulator itself**, not the Mac. For the simulator to reach services running on the Mac (Flask, etc.), you must use the Mac's LAN IP address (e.g., `192.168.1.130`).
**Fix**: 
- **Metro/Expo**: Uses `exp://192.168.1.130:8081` automatically — Expo handles this.
- **Custom API calls (axios/fetch)**: Must use the host IP, not 127.0.0.1. Configure the api-client's `baseURL` as `http://192.168.1.130:5001`.
- **Verification**: `curl http://127.0.0.1:5001/...` from the Mac terminal works (same machine). `curl` from the simulator would fail with 127.0.0.1.

### Flask port confusion: 5000 is macOS AirPlay, not Flask
**Cause**: `lsof -ti:5000` returns PID 652 (`ControlCenter`) — this is macOS's AirPlay Receiver, not Flask. The Python backend is configured for port **5001** (`app.py` line 67: `port=5001`).
**Fix**: Always use `lsof -i:5001 | grep python` to check if Flask is running. Never assume port 5000 is available.

### 403 Forbidden from mobile app but curl returns 200
**Cause**: Usually a stale Metro bundle — the app is sending requests to the wrong URL (old cached value). Module-level constants like `PYTHON_API_URL` are baked into the bundle at build time and don't update via hot reload. The old URL may point to a port/service that returns 403.
**Fix**: Full clean restart: kill Metro → `rm -rf apps/mobile-v2/.expo` → restart WITHOUT `--clear`. Also verify the URL is reachable from the simulator's network perspective (use host IP, not 127.0.0.1).
**Debug**: Test the endpoint with `curl http://<host-ip>:5001/recommend-videos?l2=ja&limit=2`. If curl returns 200 but the app returns 403, the bundle is stale.

### Flask startup takes 10–15 seconds
**Cause**: The Python backend initializes MySQL connection pools, imports large modules, and sets up routes on startup. During this time, the port is not yet listening.
**Fix**: Wait for the `* Running on http://0.0.0.0:5001` line in the Flask terminal before making requests. The app will show `[explore] Fetch failed: {"code": "NETWORK_ERROR"}` if Flask isn't ready yet. This is transient — once Flask is up, subsequent requests succeed.

### "Online dictionary lookup unavailable (network)"
**Cause**: Flask backend not running or not reachable from simulator.
**Fix**: Verify Flask is running on **port 5001** (`lsof -i:5001 | grep python`). Port 5000 is macOS AirPlay, not Flask. The simulator cannot reach `127.0.0.1` — the app must be configured to use the host machine's LAN IP (e.g., `192.168.1.130:5001`). See [Simulator Networking](#simulator-networking-127001-vs-host-ip).

### Bundle fails to load (white screen in simulator)
**Cause**: Metro not finished bundling or HMR cache corruption.
**Fix**: Wait for "Bundling complete" in Metro terminal. If stuck, press `r` to reload. Last resort: restart Metro without `--clear`.

### "Tokenizer not yet initialized"
**Cause**: Normal — the tokenizer loads async. The app renders plain text until it's ready. This log is expected during cold start.

### LLM cache insert fails silently
**Cause**: The `DictionaryDB.insertLlmCacheEntries` method catches errors and only `console.warn`s them. The dictionary DB must be open before calling this.
**Fix**: Check that `dictionaryDB.openDB()` was called (it's part of `loadData()`, which runs on DictionaryContext mount).
