# SPEC-023: Mobile End-to-End Testing Plan

## Metadata
- **Spec ID**: SPEC-023
- **Feature**: End-to-End Testing for Mobile App
- **Status**: draft
- **Created**: 2026-07-27

## Overview

The mobile app (`apps/mobile/`) has 30+ screens across 4 tabs (Media, Reading, Vocab, Me), 9 React Contexts, 20 hooks, and native modules (SQLite, SecureStore, expo-video, expo-speech, expo-in-app-purchases, etc.). Currently there are **zero E2E tests** and only unit tests exist in `apps/web/` (vitest for shared utils). As the app prepares for App Store submission (replacing the Classic Nuxt binary per ADR-0013), E2E tests are critical to catch regressions in auth flows, language state, offline tokenization, and user flows that unit tests can't cover.

This spec covers the full E2E testing strategy: tool selection, test environment setup, and a prioritized test case catalog covering every major user flow.

## Tool Selection: Maestro

### Why Maestro

| Criteria | Maestro | Detox | Appium |
|---|---|---|---|
| Setup complexity | Low — install CLI, no native config | High — native build config, device registry | High — server setup, driver config |
| Expo compatibility | ✅ Works with Expo Go + dev builds | ⚠️ Requires dev build + detox-native setup | ⚠️ Works but needs appium-xcuitest-driver |
| Flow authoring | YAML (human-readable, git-friendly) | JS/TS (Jest + async/await) | JS/TS (WebDriverIO or similar) |
| Platform integration | ✅ Native CLI, easy to script | ✅ via Detox CLI | ✅ via Appium service |
| Wait-for-element | ✅ Built-in, no manual sleep | ✅ Built-in | ✅ But more verbose |
| Gesture support | Swipe, scroll, tap, long-press | Swipe, scroll, tap | Tap, scroll (via TouchAction) |
| Run speed | Fast (no instrumentation) | Moderate (compiled binary) | Slow (client-server protocol) |
| Community momentum | Growing fast (Expo team recommends) | Mature (Wix) | Mature but declining for RN |

**Decision: Maestro** — It's the simplest to set up, has native-first YAML syntax, and is recommended by the Expo team for E2E testing.

### Expo Go vs Dev Build

The app uses `newArchEnabled: true` (Fabric renderer + TurboModules). Maestro interacts with the native view hierarchy, and Fabric may expose elements differently to accessibility APIs.

Tests always run on an **iOS simulator** — whether using Expo Go or a dev build. Maestro drives the simulator programmatically (taps, scrolls, reads elements) the same way in both cases. The choice is about *which binary* is installed on that simulator. **Use a dev build, not Expo Go**, for these reasons:

1. **`appId` mismatch** — Expo Go runs as `host.exp.Exponent`, not `ca.zerotohero.app`. Maestro identifies the app by `appId`, so targeting `ca.zerotohero.app` won't find your app when running inside Expo Go.
2. **Native module availability** — Several features used by tests (SQLite, SecureStore, expo-video, expo-speech) require native modules that are already bundled in a dev build.
3. **New Architecture compatibility** — A dev build uses the exact same build pipeline (Fabric, TurboModules) as the production binary. Expo Go uses its own pre-built RN binary.
4. **Deterministic install** — A pre-built `.app` can be installed on the simulator programmatically via `xcrun simctl install`, unlike Expo Go's deep-link dance.

**Build locally (one time, ~15-20 min):**
```bash
cd apps/mobile
npx expo run:ios --configuration Release
# Output: ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
```
Rebuild only when dependencies or native code change.


## Test Environment

### Environments

| Environment | Server | Database | Auth |
|---|---|---|---|
| **Local dev** | `http://127.0.0.1:5001` (Flask) | Dev backend (Flask → Directus) | Test credentials (Mary/Bob from AGENTS.md) |
| **Staging** | Staging Flask server | Staging backend | Dedicated test accounts |

> **Note:** Per [SPEC-024](./024-consolidate-directus-calls.md), all Directus calls now route through the Flask backend. E2E tests hit the real staging Flask server — no mock server needed. This means tests verify actual backend behavior but depend on network and test data availability.

### Test Accounts

Maintain dedicated E2E test accounts (not Mary/Bob, which are manual test accounts):

| Account | Type | Purpose |
|---|---|---|
| `e2e.free@zerotohero.ca` | Free (no subscription) | Test free-tier limits, gate checks |
| `e2e.pro@zerotohero.ca` | Pro (lifetime) | Test full features, no paywall |
| `e2e.unverified@zerotohero.ca` | Unverified email | Test verify-email flow, resend |
| `e2e.new@zerotohero.ca` | New user, no L2 set | Test onboarding flow |

Passwords stored in local `.env.e2e` (gitignored).

### Recommended Tooling

```
apps/mobile/
├── e2e/                      ← Maestro flows
│   ├── fixtures/             ← Test data (JSON recordings, images)
│   ├── flows/                ← Composable flow fragments
│   │   ├── auth.yaml         ← Login, logout, register
│   │   ├── navigation.yaml   ← Tab switching, drawer
│   │   └── preflight-check.yaml ← Verify clean state before tests
│   ├── screens/              ← Screen-level test suites
│   │   ├── auth.yaml
│   │   ├── explore.yaml
│   │   ├── search.yaml
│   │   ├── tv-shows.yaml
│   │   ├── live-tv.yaml
│   │   ├── watch.yaml
│   │   ├── reader.yaml
│   │   ├── epub.yaml
│   │   ├── web-reader.yaml
│   │   ├── dictionary.yaml
│   │   ├── saved-words.yaml
│   │   ├── review.yaml
│   │   ├── profile.yaml
│   │   ├── settings.yaml
│   │   ├── offline-dicts.yaml
│   │   └── about.yaml
│   ├── smoke.yaml            ← Quick smoke test (30s)
│   ├── regression.yaml       ← Full regression suite
│   └── config.yaml           ← Shared config (test accounts, URLs, timeouts)
└── scripts/
    └── setup-e2e.sh          ← Bootstrap: start servers, seed data, install Maestro
```

### Maestro Configuration (`e2e/config.yaml`)

```yaml
appId: ca.zerotohero.app
env:
  FREE_EMAIL: e2e.free@zerotohero.ca
  FREE_PASS: "${E2E_FREE_PASS}"
  PRO_EMAIL: e2e.pro@zerotohero.ca
  PRO_PASS: "${E2E_PRO_PASS}"
  UNVERIFIED_EMAIL: e2e.unverified@zerotohero.ca
  NEW_EMAIL: e2e.new@zerotohero.ca
  NEW_PASS: "${E2E_NEW_PASS}"
  FLASK_URL: http://127.0.0.1:5001
  TIMEOUT: 15000
```

> **Note:** `DIRECTUS_URL` removed per SPEC-024. All backend calls go through `FLASK_URL`. Set `EXPO_PUBLIC_API_URL` in your build environment to point to your local Flask server. The app never reads `FLASK_URL` from Maestro config (that's for the setup script).

## Execution Modes

Every test case is tagged with one of two execution modes:

| Mode | Icon | Description | Who runs it | Frequency |
|---|---|---|---|---|
| **auto** | 🤖 | Fully automated via Maestro YAML flow. No human judgement required. Element visibility, text content, and navigation state verified programmatically. | Developer (before every commit) | Every time `apps/mobile/` changes |
| **human** | 🧑 | Must be performed by a person. Requires: audio verification (TTS), visual layout inspection (iPad split view / karaoke / theme colors), network state simulation (Airplane Mode), or multi-device setup (concurrent sessions). | Developer | Pre-submission or weekly |

The goal is to maximize the **auto** count. See the [Risks and Mitigations](#risks-and-mitigations) section for strategies to convert human tests to auto over time.

## Test Case Catalog

### Tier 0 — Smoke Test (pre-commit gate, ~30s)

Run before every commit to `apps/mobile/`. It verifies the app launches and core navigation works.

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| S1 | 🤖 auto | App launch | Start app → wait for splash → see login screen | Login form visible: email field, password field, Sign In button |
| S2 | 🤖 auto | Tab navigation | Login → see tabs → tap each tab | 4 tabs render; tapping each shows correct screen title |
| S3 | 🤖 auto | Language state | Login with existing user → verify L1/L2 selected | Header shows L1→L2 language names, drawer shows correct languages |
| S4 | 🤖 auto | Logout | Tap Me tab → scroll to Logout → confirm | Returns to login screen, no session token in SecureStore |

### Tier 1 — Auth & Onboarding (critical path, ~5min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| A1 | 🤖 auto | Login — happy path | Enter valid email/password → tap Sign In | Transition to tabs; header shows user avatar/first initial |
| A2 | 🤖 auto | Login — invalid credentials | Enter wrong password → tap Sign In | Error message shown (toast or inline), stays on login screen |
| A3 | 🤖 auto | Login — empty fields | Tap Sign In with empty fields | Validation errors shown on required fields |
| A4 | 🤖 auto | Register — happy path | Fill name, email, password, confirm → tap Create Account | Success toast → auto-login → redirect to language selection or tabs |
| A5 | 🤖 auto | Register — password mismatch | Enter different confirm password → submit | Error: "Passwords do not match" |
| A6 | 🤖 auto | Register — weak password | Enter <8 char password → submit | Error: minimum length requirement |
| A7 | 🤖 auto | Register — duplicate email | Register with existing email | Error: "Email already registered" |
| A8 | 🤖 auto | Forgot Password | Tap "Forgot Password" → enter email → submit | Success message: "Check your email" |
| A9 | 🤖 auto | Password Reset (deep link) | Open password-reset deep link with valid token → enter new passwords → submit | Success state with "Back to Login" button |
| A10 | 🤖 auto | Verify Email (deep link) | Open verify-email deep link with valid token | ✅ success state or ⚠️ error state shown |
| A11 | 🤖 auto | Delete Account | Login → Me tab → scroll to Delete Account → confirm → type confirmation | Logged out, returned to login screen, account no longer accessible |
| A12 | 🤖 auto | Select Language (new user) | Register fresh account → redirected to language select | Search works, popular/all tabs, selecting L1 then L2 redirects to tabs |
| A13 | 🤖 auto | Session persistence | Login → background app → foreground → check still logged in | Tabs still visible, no redirect to login |

### Tier 2 — Media Tab (core feature, ~10min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| M1 | 🤖 auto | Explore feed loads | Login → Media tab → scroll feed | Video cards visible with thumbnails, titles, durations |
| M2 | 🤖 auto | Level filter | Tap CEFR level filter pill (e.g., B1) | Feed filtered to that level; pill visually selected |
| M3 | 🤖 auto | Pagination / infinite scroll | Scroll to bottom of feed → wait | More videos load, scroll position maintained |
| M4 | 🤖 auto | Video player — open | Tap a video card → wait for player | Video meta shows (title, views, difficulty). Subtitles display below player |
| M5 | 🤖 auto | Subtitle interaction | Tap a word in subtitles | Dictionary popup opens with definition |
| M6 | 🧑 human | Karaoke mode | Toggle karaoke mode in settings or video controls | Active subtitle word dimming animates — visual animation, requires human eye |
| M7 | 🤖 auto | Video search | Tap search icon → type query → see results | Results show matching videos; tap navigates to player |
| M8 | 🤖 auto | YouTube URL search | Paste YouTube URL → submit | Video plays, subtitles load if available |
| M9 | 🤖 auto | TV Shows browser | Navigate to TV Shows → browse | Shows listed; tap show → episode listing; tap episode → player |
| M10 | 🤖 auto | Live TV | Navigate to Live TV → tap a channel | Stream starts in expo-video player; mute toggle works |
| M11 | 🤖 auto | Music tab | Navigate to Music → scroll grid | Video cards load with music content |
| M12 | 🤖 auto | Watch history | Watch a video partially → navigate to Watch History | Video appears in date-grouped list; tap to resume |
| M13 | 🤖 auto | Channel subscribe | Play a video → tap channel card → Subscribe | Channel actions menu shows Subscribed state |
| M14 | 🤖 auto | Video queue | Add video to queue → navigate queue | Queue shows added videos; tap to switch; remove works |
| M15 | 🤖 auto | Search — no results | Search a gibberish query | Empty state shown: "No results found" |
| M16 | 🤖 auto | Search — tag cloud | Tap a tag in the tag cloud | Results filtered to that tag |

### Tier 3 — Dictionary & Vocab (core feature, ~10min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| D1 | 🤖 auto | Dictionary search — found | Type a real word (e.g., "hello" for en) → tap search | Results cards show: headword, pronunciation, definition, level badge |
| D2 | 🤖 auto | Dictionary search — not found | Type a nonsense word → tap search | Empty state: "No entries found" |
| D3 | 🤖 auto | Save a word | Search a word → tap bookmark/save icon | Icon toggles to saved state; word appears in Saved Words |
| D4 | 🤖 auto | Unsave a word | Navigate to Saved Words → unsave a word | Word removed from list |
| D5 | 🤖 auto | Saved Words — filter | Filter by language or recent | List narrows to match filter |
| D6 | 🤖 auto | Saved Words — sort | Sort by date, alphabetically | Order changes accordingly |
| D7 | 🤖 auto | Saved Words — inline definitions | Scroll through saved words | Each row lazily loads pronunciation + part-of-speech + definition |
| D8 | 🤖 auto | Saved Words — source attribution | Tap a word saved from a video | Source shown (video title + date) |
| D9 | 🧑 human | Saved Words — export all | Tap export → confirm | Native share sheet opens — OS-level UI element, cannot be reliably detected by Maestro |
| D10 | 🤖 auto | Word Detail page | Search a word → tap result card | Two-panel: definitions card + tab bar (Examples, Inflections, AI Explain) |
| D11 | 🤖 auto | AI Explanation | Word Detail → tap AI Explain tab | Streaming response from DeepSeek renders progressively |
| D12 | 🤖 auto | Inflections tab | Word Detail → tap Inflections tab | Inflection table renders for the word's language |
| D13 | 🧑 human | Speak button | Word Detail → tap speaker icon | TTS plays audio — cannot verify sound without human ear |
| D14 | 🤖 auto | Recent searches | Search a word → clear search → see recent | Recent searches listed; tap to re-search |
| D15 | 🤖 auto | Dictionary popup (from reader) | Open reader → tap any word token | Popup shows dictionary entry for that word |
| D16 | 🤖 auto | Pitch accent (Japanese) | Search a Japanese word with pitch accent data | ↑↓ markers shown on kana reading |
| D17 | 🤖 auto | Alternate script (Chinese) | Search a Chinese word with traditional preference set | Traditional characters shown alongside simplified |

### Tier 4 — SRS Review (~5min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| R1 | 🤖 auto | Review — no cards due | Open Review screen with no due cards | "No cards due" state shown |
| R2 | 🤖 auto | Review — card display | Have due cards → open Review | Card shows front (word) with prompt to recall |
| R3 | 🤖 auto | Review — rating | Tap "Good" rating | Next card appears; SM-2 interval recalculated |
| R4 | 🤖 auto | Review — all done | Rate all due cards | "All done!" state shown with stats (cards reviewed, time) |
| R5 | 🤖 auto | Review — undo | Rate a card → tap Undo | Card returns to queue, rating reverted |
| R6 | 🤖 auto | Review — daily new limit | Review all new cards for the day | "No more new cards today" message; remaining new count = 0 |
| R7 | 🤖 auto | Review — entry preloading | Scroll through review session | Each card's dictionary data preloads before card appears |

### Tier 5 — Reading Tab (~8min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| E1 | 🤖 auto | Notes reader — create note | Open Notes → create new note → type content | Note saved (auto-save). Reopen → content persists |
| E2 | 🤖 auto | Notes reader — tokenized text | Type a paragraph → tokens display | Words are tappable; tapping opens dictionary popup |
| E3 | 🤖 auto | Notes reader — edit/rename | Long-press a note → rename | Note title updates |
| E4 | 🤖 auto | Notes reader — delete note | Long-press a note → delete | Note removed from list |
| E5 | 🤖 auto | EPUB — upload | Tap upload → select .epub file | EPUB parses, chapters listed, cover image renders |
| E6 | 🤖 auto | EPUB — paginated reading | Tap a chapter → paginated content renders | Swipe/page-navigate through pages; position auto-saves |
| E7 | 🤖 auto | EPUB — word tokenization | Tap a word in EPUB content | Dictionary popup opens with definition |
| E8 | 🤖 auto | EPUB — resume reading | Close EPUB → reopen | Reopens at saved position/chapter |
| E9 | 🤖 auto | Web reader — fetch URL | Enter a URL → tap Load | Content fetched, paragraphs displayed with TextActionMenu |
| E10 | 🤖 auto | Web reader — TextActionMenu (Copy, AI Explain, Translate) | Tap ⋮ on a paragraph → Copy / AI Explain / Translate | Copy: clipboard has text. AI Explain: streaming response renders. Translate: translation text appears |
| E10b | 🧑 human | Web reader — TextActionMenu (Speak) | Tap ⋮ → Speak | TTS plays audio — cannot verify without human ear |
| E11 | 🤖 auto | Web reader — notes sidebar | Open notes sidebar → create note → switch notes | Notes CRUD works alongside fetched content |

### Tier 6 — Settings & Profile (~5min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| P1 | 🤖 auto | Profile display | Me tab → tap profile row | Shows: name, email, L2 level, subscription status, watch history preview, saved words preview |
| P2 | 🤖 auto | Language level selector | Tap language level → change level | Level updates; progress screen reflects change |
| P3 | 🧑 human | Settings — Display | Navigate to Display settings → toggle theme (light/dark/system) | Theme changes immediately (background/text colors swap) — visual color change requires human eye |
| P4 | 🤖 auto | Settings — Playback | Toggle captions, karaoke mode, auto-pause | Changes reflected in video player |
| P5 | 🧑 human | Settings — Speech | Change voice picker → adjust rate | TTS uses selected voice and rate — audio verification requires human ear |
| P6 | 🤖 auto | Settings — Review | Change new cards/day limit | SRS daily limit updates |
| P7 | 🤖 auto | Settings — search | Type in settings search bar | Results filter to matching settings; tapping navigates directly |
| P8 | 🧑 human | iPad split view settings | (iPad) Settings in sidebar mode | Sidebar capped at Min(256, width*0.4); detail pane shows selected setting — layout check requires visual inspection |
| P9 | 🤖 auto | Subscription management | Tap subscription status → see plan details | Pro: shows plan, cancel option, expire date. Free: upsell to Pro |

### Tier 7 — Offline & Local Features (~8min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| O1 | 🤖 auto | Offline dictionaries — download | Navigate to Offline Dictionaries → tap download for a language | Download progress shown; completion badge appears |
| O2 | 🤖 auto | Offline dictionaries — delete | Tap delete on downloaded dictionary | Dictionary removed; download option returns |
| O3 | 🤖 auto | Offline dictionaries — tokenizer warning | View a Category E language (no tokenizer pack) | Warning shown: "Cannot make text interactive offline" |
| O4 | 🧑 human | Offline reading (no network) | Download a dictionary → enable Airplane Mode → open reader | Reader works offline; dictionary popups resolve from local DB — requires network state simulation |
| O5 | 🧑 human | Offline tokenization | Download target language tokenizer → go offline → open reader | Tokens rendered from local tokenizer (kuromoji/snowball/etc.) — requires network state simulation |
| O6 | 🧑 human | Offline → Online sync | Make changes offline → reconnect | Saved words and SRS progress sync to cloud — requires toggling network mid-flow |

### Tier 8 — iPad & Responsive Layout (~5min)

All iPad layout tests are **human** — every assertion is visual (column counts, centering, overflow, drawer width). No reliable element-level assertions exist for layout correctness.

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| IP1 | 🧑 human | iPad landscape mode | Rotate to landscape | App reflows; video grid adjusts columns; no layout breaking |
| IP2 | 🧑 human | iPad 1/3 split view | Slide app to 1/3 width (~320px) | Content visible, no horizontal overflow, settings in narrow mode |
| IP3 | 🧑 human | iPad 50/50 split | Slide app to 50% width (~438px) | Drawer capped, content readable |
| IP4 | 🧑 human | iPad full portrait | Full screen portrait (820px) | Video grid 3+ columns; PageContainer max-w-3xl centers content |
| IP5 | 🧑 human | iPad full landscape | Full screen landscape (1180px) | Video grid 4 columns; content centered |
| IP6 | 🧑 human | Slide Over mode | Open another app → swipe in Slide Over | App renders correctly at ~320px width |
| IP7 | 🧑 human | Wide-screen content | Open search/explore/saved-words on iPad | PageContainer centers content; not stretched edge-to-edge |

### Tier 9 — Deep Links & Cross-Flow (edge cases, ~5min)

| # | Mode | Flow | Steps | Assertions |
|---|---|---|---|---|
| L1 | 🤖 auto | Deep link — word entry | Open `languageplayer://vocab/word/cedict-123` | Word detail page opens for that entry |
| L2 | 🤖 auto | Deep link — video | Open `languageplayer://media/watch/abc123` | Video player opens at that video |
| L3 | 🤖 auto | Deep link — password reset | Open password reset link from email | App opens to password-reset screen with token pre-filled |
| L4 | 🧑 human | Network loss mid-flow | Start video → toggle Airplane Mode | Graceful error; user informed of network loss — requires network state simulation |
| L5 | 🤖 auto | Rapid language switch | Switch L2 repeatedly in quick succession | No stale data; correct language's data loads |
| L6 | 🧑 human | Concurrent sessions | Login on two devices → save word on one → sync | Word appears on second device — requires two devices or simulator instances |
| L7 | 🧑 human | Push notification (if added) | Receive notification → tap | Navigates to correct screen — push notifications not yet implemented |

## Test Execution Strategy

All tests run on the developer's Mac against the local simulator. There is no cloud CI — every developer runs tests directly.

| When | What to run | Mode | Environment | Expected Time |
|---|---|---|---|---|
| Before every commit touching `apps/mobile/` | Smoke (S1-S4) | auto | Local simulator + local Flask | ~30s |
| Before every commit | Tiers 1-3 (auto tests only) | auto | Local simulator + local Flask | ~12min |
| Before App Store submission | Full auto regression (78 tests) + human checklist | auto + human | Simulator + Device | ~50min + ~40min human |
| Weekly (developer discretion) | Human tests (audio, iPad, offline) | human | Physical iPad + iPhone | ~30min |

### When Tests Fail

Since there's no CI gate, the developer is responsible for interpreting failures. Here's the workflow:

1. **Read the failure screenshot** — Maestro auto-captures the screen at the point of failure (`~/.maestro/tests/`). Start there.

2. **Categorize the failure**:
   - 🕐 **Timing flake** — element wasn't visible yet. Add `waitFor` or increase timeout.
   - 🔍 **Element not found** — `testID` missing, wrong, or not forwardable. Check the component's native hierarchy.
   - 🔑 **Stale state** — Keychain token from a previous run preventing login screen. Uninstall + reinstall.
   - 🐛 **Actual bug** — the app behaves incorrectly. Fix the code, not the test.
   - 🌐 **Network** — Flask server down, test data missing. Run `scripts/setup-e2e-env.sh --validate`.

3. **Fix and re-run only the failing test**, not the whole suite:
   ```bash
   maestro test apps/mobile/e2e/screens/<failing-file>.yaml
   ```

4. **After fixing, re-run the full regression** to confirm no cascading breakage.

5. **If a test flakes more than twice in a row**, mark it for Phase 9 review — it may need to be demoted from pre-commit to pre-submission.

## Test Data Strategy

### Seed Data Requirements

To run E2E tests reliably, the backend must have:

1. **Test user accounts** (4 accounts as defined in Test Environment section)
2. **Sample videos** with subtitles in 2+ languages (en, zh, ja at minimum)
3. **TV Shows** with episodes
4. **Live TV channels** (mock streams)
5. **Dictionary data** for en, zh, ja, ko, fr
6. **Difficulty profiles** (CEFR, HSK, JLPT)
7. **Subscription test data** (Stripe test mode prices, test products)
8. **Sample EPUB files** for upload tests
9. **Channel preferences** for a test user

### Seed Data Strategy: API-Based (not SQL dump)

Per SPEC-024, all backend operations go through Flask. Use a setup script that creates test data via the Flask API, not a Directus SQL dump:

Maintain a setup script at `scripts/setup-e2e-env.sh` that:
1. Creates test user accounts via `POST /auth/register` (Flask proxies to Directus)
2. Seeds initial state (saved words, SRS cards, watch history) via Flask endpoints
3. Verifies dictionary data availability for test languages
4. Seeds video/TV show/channel data via relevant Flask data endpoints

```bash
# scripts/setup-e2e-env.sh (conceptual)
FLASK_URL=${FLASK_URL:-http://127.0.0.1:5001}

echo "Creating E2E test accounts..."
for account in free pro unverified new; do
  # Create account via Flask auth proxy
  curl -s -X POST "$FLASK_URL/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"e2e.$account@zerotohero.ca\",\"password\":\"${E2E_PASS}\",\"firstName\":\"E2E\",\"lastName\":\"$account\"}"
done

echo "Seeding initial data for pro test user..."
# Login to get token, then seed saved words / SRS cards
# ...
```

This approach is version-independent — it works against any backend deployment without schema coupling.

### State Between Tests

Each Maestro flow is designed to start from a known state (logged out or logged in as a specific user) and clean up after itself.

#### iOS: No `clearState` Equivalent

Maestro's `clearState: true` is **Android-only**. On iOS, there is no way to programmatically clear Keychain (`expo-secure-store`) or app sandbox data. The iOS Keychain also **survives app deletion** — entries are tied to the bundle ID, not the app installation. This means:

- Parallel test execution won't work — tests must be order-dependent
- Every test run should start with `xcrun simctl uninstall booted ca.zerotohero.app` to guarantee a clean state
- `expo-secure-store` auth tokens from a previous run will prevent the login screen from appearing

#### Strategy: Order-Dependent Suites + Preflight Check

1. **Suite-level setup**: Before each suite (e.g., auth suite, media suite), run a Maestro preflight flow that:
   - Checks if login screen is visible
   - If not visible (stale token exists), navigates to logout first
   - If login is visible, proceeds normally

2. **Teardown per test**: Each test that modifies state (saves a word, rates a card) includes a teardown flow that navigates back to a known baseline (e.g., logout or home screen).

3. **Local preflight**: Before running tests, uninstall and reinstall the app:

```bash
# Preflight script
xcrun simctl shutdown booted 2>/dev/null || true
xcrun simctl boot "iPhone 15 Pro"
xcrun simctl uninstall booted ca.zerotohero.app
xcrun simctl install booted path/to/build.app
```

```yaml
# e2e/flows/preflight-check.yaml
appId: ca.zerotohero.app
---
# Verify we're on the login screen; if not, navigate to logout
- assertVisible:
    text: "Language Player"
    optional: true
- runFlow:
    file: flows/logout.yaml
    when:
      notVisible: { id: "login-email-input" }
```

## Key Locators Strategy

### Naming Convention

Use `testID` props with a `screen-element-purpose` naming convention for reliable Maestro selectors:

```tsx
<TextInput testID="login-email-input" />
<TextInput testID="login-password-input" />
<Pressable testID="login-signin-button" />
<Pressable testID="media-explore-video-card-0" />
```

### React Native: `testID` → Maestro `id` Mapping

In React Native:
- `testID` maps to `accessibilityIdentifier` on iOS → Maestro finds it via `id:` selector ✅
- On Android, `testID` maps to `resource-id` → also works
- **Caution**: Components wrapped in `Pressable`, `TouchableOpacity`, etc. — the `testID` must be on the innermost native view. Maestro may not find it if attached to a wrapper component that doesn't forward to native.
- For elements wrapped in `@rn-primitives/*` components (Dialog, Select, Tabs, Switch), testIDs need to be passed down through the primitives' `nativeID` or `id` prop — verify each primitive separately.

### Toast Message Detection

The app uses `react-native-toast-message`. Toast messages render on a **separate native layer** above the React Native view hierarchy — Maestro may not detect them reliably.

- **A2 (login error)**: Already safe — `login.tsx` uses inline `{error && <Text>}`, not a toast.
- **A4 (register success)**: The register screen shows a "verify email" step after registration, not a toast. Verify in code that the success state uses a visible `<Text>` element with a `testID`.
- **General rule**: For any test assertion that says "toast shown", verify the component uses inline visible elements. If a real toast is unavoidable, add a `testID="toast-message"` to the toast render and test that the toast's parent container is visible, not the toast itself.

### Reusable Helper

Since there are zero `testID` props currently (30+ screens need them), create a reusable helper to keep the codebase clean:

```ts
// lib/e2e.ts — E2E test identifier helper
import { Platform } from 'react-native';

/**
 * Returns a testID prop for Maestro element discovery.
 * Only included in dev/test builds; stripped from production bundles
 * by Metro dead-code elimination when __DEV__ is false.
 */
export function e2e(id: string) {
  return __DEV__ ? { testID: id } : {};
}

// Usage:
// <TextInput {...e2e('login-email-input')} />
```

### Priority Elements (Phase 1)

Login form fields, tab bar items, and main CTAs get testIDs first. Each subsequent phase adds testIDs only for screens covered in that phase.

```tsx
// Priority elements for testID:

// Core login + navigation
<TextInput testID="login-email-input" />
<TextInput testID="login-password-input" />
<Pressable testID="login-signin-button" />
<TabBar.Item testID="tab-media" />
<TabBar.Item testID="tab-reading" />
<TabBar.Item testID="tab-vocab" />
<TabBar.Item testID="tab-me" />

// Main actions
<Pressable testID="save-word-button" />
<Pressable testID="search-button" />
<Pressable testID="settings-display" />

// RN primitives (de-risk Fabric compatibility early)
<Pressable testID="primitive-pressable" />
<Switch nativeID="primitive-switch" />
<Dialog.Content testID="primitive-dialog" />
<Tabs.Trigger testID="primitive-tab-trigger" />
```

Add a testID checklist row to the porting STATUS.md: when a screen reaches ✅ status, it should also have testIDs on its primary interactive elements.

### Video Player: Subtitles Outside WebView

The video player uses `react-native-youtube-iframe` (renders a WebView). Maestro cannot reliably interact with content inside WebViews. However:

- **Video metadata** (title, duration, difficulty) renders in `<VideoMeta>` — outside the WebView, Maestro can verify ✅
- **Subtitles** render in `<SubtitleDisplay>` — outside the WebView, Maestro can tap individual words ✅
- **Channel card** and **control bar** are separate native components — all detectable

Tests M4 and M5 should assert video metadata and subtitle interaction, not the player itself.

Example Maestro flow using testIDs:

```yaml
appId: ca.zerotohero.app
---
- tapOn:
    id: "login-email-input"
- inputText: ${FREE_EMAIL}
- tapOn:
    id: "login-password-input"
- inputText: ${FREE_PASS}
- tapOn:
    id: "login-signin-button"
- assertVisible:
    id: "tab-media"
```

## Success Criteria

Before shipping the E2E testing pipeline:

1. **Smoke suite passes** before every commit touching `apps/mobile/`
2. **Auth suite passes** covering all 4 test accounts
3. **Media suite passes** covering explore, search, player, TV shows, live TV
4. **Dictionary suite passes** covering search, save/unsave, saved words, word detail
5. **SRS suite passes** covering review flow, ratings, undo, daily limit
6. **Reader suite passes** covering notes, EPUB, web reader with TextActionMenu
7. **Settings suite passes** covering themes, toggles, search, iPad layout
8. **All tests pass on iPad simulator** (landscape, split view, slide over)
9. **Test failure artifacts** (screenshots + Maestro report) saved on failure<br>
10. **Full regression passes 3x consecutively** with no flaky failures

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

> **Phase 1 is now unblocked.** The build issue (see step 4) was resolved
> by adding a Podfile `post_install` hook that stubs the missing
> `EXEventEmitterService.h` header. Steps 1-3, 6, and 8 are complete or in
> progress. See each step for current status.

1. **Maestro + New Architecture spike** (Day 1) — Build a dev build with `newArchEnabled: true`, write one Maestro flow (login + tap 4 tabs), verify element discovery works under Fabric renderer.

   **Pass/fail criterion**: Maestro can find and tap the email input, password input, sign-in button, and all 4 tab bar items via `testID`. Include one element from each RN primitive type used (Pressable, TextInput, Switch from `@rn-primitives/*`, and a list item) to de-risk primitive compatibility early. If elements are missing, budget time to add `accessibilityLabel` as a fallback alongside `testID`.

   > **Findings from the 2026-07-27 test run:**
   > - **Login elements**: All 3 login testIDs discovered and tappable ✅
   > - **Login success**: Login with Mary's credentials succeeded; profile page rendered ✅
   > - **Tab bar items**: Not reached — flow failed at hamburger drawer step
   > - **Hamburger drawer**: `header-hamburger-button` was tappable, but the drawer
   >   rendered offscreen/wrong position. "X" close button appeared but "Media",
   >   "Reading", "Vocab" text was not in the viewport. Likely a layout bug in
   >   `HamburgerDrawer.tsx` — see Bugs section.
   > - **"Save Password" dialog**: Still appears on iOS 26.5 despite
   >   `textContentType="none"` + `autoComplete="off"` on the password input.
   >   `tapOn: "Not Now" optional: true` fallback works to dismiss it.
   > - **Maestro env vars**: `${VAR}` references in flow steps do not resolve from
   >   `config.yaml`'s `env:` block. Credentials must be inlined directly in
   >   `inputText` steps or passed via `--env-file`.
   >
   > **Not verified**: Switch from `@rn-primitives/*`, Dialog, Tabs primitives.
   > Login screen discovered but drawer prevents tab navigation.
   >
   > Status: ◐ Partial — login elements work. Hamburger drawer layout broken
   > (blocking S3-S4). Primitive compatibility not tested.

2. **Create `lib/e2e.ts` helper** (Day 1) — Reusable `e2e(id)` helper that returns `{ testID: id }` only in `__DEV__`.

   > Status: ✅ Done — `apps/mobile/lib/e2e.ts` exists.

3. **Add `testID` props** (Days 2-4) — Login form fields, tab bar items, main CTA buttons, search bar, save button. ~15-20 testIDs across ~10 files.

   > Status: ◐ Partial — 3 testIDs added to `login.tsx` (`login-email-input`, `login-password-input`, `login-signin-button`). Remaining screens need testIDs as they are ported.

4. **Build dev build** (one time, ~15-20 min on your Mac):
   ```bash
   cd apps/mobile && npx expo run:ios --configuration Release
   # Result: ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
   ```
   Rebuild only when native dependencies or Podfile.lock changes.

   > **⚠️ Expect the first build to fail and require many retries.** In practice, the first
   > successful dev build took **13 attempts** over **~3–4 hours of cumulative build time**
   > (wall-clock: ~14:00–18:30 on 2026-07-27, with roughly 10 hours between first and last
   > commit due to concurrent spec documentation). Here is the actual build history:
   >
   > | # | Time (approx) | Command | Why | Build type | Sim state | Mitigation tried | Result |
   > |---|---|---|---|---|---|---|---|
   > | 1 | ~14:05 | `npx expo run:ios --configuration Release` | Initial build attempt | Release | Already booted | Searched error, found `EXEventEmitterService.h` removed in SDK 57 | ❌ |
   > | 2-4 | ~14:25–15:05 | `npx expo run:ios --configuration Release` | Retries (hoping transient) | Release | Stayed booted | Checked if `expo-in-app-purchases` version bump could fix it | ❌ Same error |
   > | 5 | ~15:25 | `npx expo run:ios --configuration Release` | After bumping `expo-in-app-purchases` to v14.6.0 | Release | Stayed booted | Inspected Pods/ headers to confirm missing from ExpoModulesCore | ❌ (version ≠ fix) |
   > | 6-8 | ~15:45–16:25 | `npx expo run:ios --configuration Release` | More retries after version bump | Release | Stayed booted | Researched Podfile `post_install` hook approach | ❌ Same error |
   > | 9 | ~16:50–17:10 | `npx expo run:ios --configuration Release` | After creating Pods header stubs manually | Release | Stayed booted | Manually created `EXEventEmitterService.h` + umbrella header entry | ✅ **Succeeded** |
   > | 10 | ~17:20 | `npx expo run:ios` (debug) | Verify testIDs with Metro | **Debug** | Stayed booted | No mitigation — reused existing build artifacts | ✅ Succeeded |
   > | 11 | ~17:35 | `npx expo run:ios` (debug) | Rebuild after JS changes — `pod install` regenerated `ios/Pods/`, wiping stubs | **Debug** | Stayed booted | Re-created stubs in Pods/ manually again | ❌ Stubs lost |
   > | 12 | ~17:55 | `npx expo run:ios` (debug) | Retry | **Debug** | Stayed booted | Investigated why `ios/Pods/` is ephemeral; confirmed `post_install` is the fix | ❌ Same error |
   > | 13 | ~18:15 | `npx expo run:ios` (debug) | Latest attempt | **Debug** | Stayed booted | Deferred permanent fix — need Podfile `post_install` hook | ❌ Same error |
   >
   > **Key observations from the review:**
   >
   > - **Attempts 2–4 were wasted (~1h).** Compile errors don't heal themselves — the missing
   >   header couldn't resolve without code changes. Three full rebuild cycles were spent
   >   hoping a transient that had no mechanism to occur.
   > - **Attempt 5 tested the wrong hypothesis.** A minor version bump of the *dependent*
   >   (`expo-in-app-purchases`) cannot restore a header removed from the *dependency*
   >   (`ExpoModulesCore`). The correct diagnosis (`grep -r` in `node_modules/`) would have
   >   taken ~5 minutes instead of ~20 minutes for a rebuild.
   > - **Attempts 6–8 had the right answer but rebuilt to find it.** Podfile `post_install`
   >   research doesn't require a build. Pattern: *try → rebuild → observe → think → rebuild*.
   >   Faster: *diagnose fully → fix → rebuild once*.
   > - **`--configuration Release` added ~5 min/attempt with no benefit.** E2E testing on a
   >   simulator doesn't need compiler optimizations. Switching to debug after attempt 9
   >   saved ~25 min over the remaining 4 attempts. All 13 should have been debug builds.
   > - **The "can we remove the dependency?" question was never asked.** `expo-in-app-purchases`
   >   is only needed for payment flows (SPEC-025), which are explicitly excluded from SPEC-023
   >   E2E tests. A dev build for E2E could exclude it — either by removing from `package.json`
   >   or adding a conditional in the Podfile. A ~2-minute investigation vs. ~4 hours of rebuilds.
   > - **After attempt 9 (stubs proved the fix), 4 more attempts were needed to accept that
   >   `ios/Pods/` is ephemeral.** The manual edit succeeded once, then attempts 10–13
   >   re-confirmed what was already known. The Podfile hook should have been written immediately.
   > - **Attempt 14 proved the Podfile hook works.** One build attempt, no manual
   >   stubs needed. The hook survives `pod install`.
   >
   > | 14 | ~19:00 | `npx expo run:ios` (debug) | After Podfile `post_install` hook added | **Debug** | Erased + rebooted | Podfile hook creates `EXEventEmitterService.h` stub in `Pods/Headers/Public/ExpoModulesCore/` | ✅ **Succeeded** |
   >
   > **Root cause**: `expo-in-app-purchases` imports `EXEventEmitterService.h` from
   > `ExpoModulesCore`, which was removed in Expo SDK 57. Each `npx expo run:ios`
   > invocation triggers a full `pod install` step (~15–20 min) that regenerates the
   > `ios/Pods/` directory, wiping any ad-hoc header stubs placed there. The fix is to
   > add the missing header stubs via the **Podfile `post_install` hook** (not by editing
   > `ios/Pods/` directly), so they survive rebuilds. See commit `6208fea7` for the
   > initial workaround and the `post_install` hook in `apps/mobile/ios/Podfile`.
   >
   > Status: ✅ Done — build succeeds with Podfile `post_install` hook.
   > Attempt 14 was the first and only attempt with the hook in place.

5. **Seed test data on the staging backend** (Days 3-5) — Build `scripts/setup-e2e-env.sh` that calls Flask endpoints (`POST /auth/register`, etc.) against the staging server to create test accounts (`e2e.free`, `e2e.pro`, `e2e.unverified`, `e2e.new`) and seed initial data (saved words, SRS cards, watch history for the pro user).

   > Status: ◐ Partial — `scripts/setup-e2e-env.sh` exists, but Directus SQL errors (`directus_activity` table) prevent account creation from completing.

6. **Create `apps/mobile/e2e/` scaffold** — `config.yaml`, `flows/auth.yaml`, `flows/preflight-check.yaml`, `smoke.yaml`.

   > Status: ✅ Done — `smoke.yaml`, `flows/login.yaml`, `flows/logout.yaml`, `flows/preflight-check.yaml`, `screens/auth.yaml`, `config.yaml`, `regression.yaml`, `README.md` all exist.

7. **Run smoke test** — Verify the scaffold works against the dev build on the simulator:
   ```bash
   maestro test apps/mobile/e2e/smoke.yaml
   ```
   Fix any element discovery issues before progressing.

   > **2026-07-27 test run results:**
   > - S1 (login screen visible) — ✅ Passed
   > - S2 (login → tabs) — ✅ Passed: login succeeded, "Save Password" dismissed,
   >   hamburger drawer opens with "Media"/"Reading"/"Vocab" visible.
   > - S3 (language state) — ✅ Passed: `me-logout-button` visible on profile page.
   > - S4 (logout) — ✅ Passed: logout navigates to login screen.
   >
   > **Bugs fixed during tests:**
   > - Hamburger drawer: replaced Dialog portal (Zustand-based) with React Native
   >   `<Modal>` — the portal's async re-mounting caused the drawer panel to render
   >   offscreen. Modal renders at the native layer with reliable positioning.
   > - Logout navigation: `logout()` cleared the token but didn't redirect to login,
   >   leaving the user on the Me tab showing the guest state. Added
   >   `router.replace('/login')` after logout.
   > - "Save Password" dialog: added `repeat: 3` + `waitToSettleTimeoutMs` to handle
   >   timing variance in iOS dialog appearance.
   > - `label.guest` → `label.guest_user`: translation key didn't exist in CSV, so
   >   the raw key was displayed after logout. Added key with 31 locale translations.
   >
   > Status: ✅ All 4 smoke tests pass.

8. **Document the local workflow** — Create `apps/mobile/e2e/README.md` with:
   - Prerequisites (Maestro installed, dev build built)
   - Running individual screen tests, full regression, smoke
   - Preflight checklist before running tests
   - Troubleshooting common issues

   > Status: ✅ Done — `apps/mobile/e2e/README.md` covers prereqs, running tests, preflight checklist, and troubleshooting.

### Bugs Discovered During Testing

| Bug | Component | Description | Severity | Status |
|---|---|---|---|---|
| Hamburger drawer renders offscreen | `HamburgerDrawer.tsx` | Dialog portal (Zustand-based) re-mounted children asynchronously when `open` changed, placing the panel offscreen. Fixed by replacing with React Native `<Modal>`. | 🔴 Blocks E2E | ✅ Fixed |
| Logout doesn't navigate to login | `index.tsx` | `logout()` cleared token/user but left user on the Me tab showing guest state. Fixed by adding `router.replace('/login')` after logout. | 🔴 Blocks E2E | ✅ Fixed |
| "Save Password" dialog persists on iOS 26.5 | `login.tsx` | iOS system dialog appears after sign-in despite `textContentType="none"` and `autoComplete="off"`. Maestro mitigation uses `repeat: 3` + `waitToSettleTimeoutMs`. | 🟡 Medium | ✅ Mitigated |
| `label.guest` key not in translations.csv | — | Raw translation key displayed after logout. Added `label.guest_user` with 31 locale translations. | 🟡 Medium | ✅ Fixed |
| Maestro `config.yaml` env vars not inherited | `e2e/` flows | `${VAR}` references in flow step `inputText` do not resolve from `config.yaml` `env:` block. Credentials inlined as workaround. | 🟡 Medium | Workaround |

### Phase 2: Auth + Navigation (Week 3) ✅ COMPLETED

> ✅ **Phase 2 is complete.** All 12 Tier 1 flows written and passing. A11 (Delete Account) deferred — deleting the test user mid-suite breaks downstream tests. The auth suite (`screens/auth.yaml`) uses a monolithic inline approach (~80 commands) which is acceptable for this tier's size, but future tiers use the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline) established in Phase 3.

- ✅ Write full auth suite (Tier 1: A1-A13) as Maestro YAML flows — 10 individual test files in `screens/auth/`
- ✅ Write language selection flow — embedded in `register-and-onboard.yaml` (A4 + A12)
- ✅ Write session persistence test — A13 in `auth.yaml` sequencer
- ✅ Add testIDs for auth screens — `login-*`, `register-*`, `forgot-*`, `dismiss-keyboard`, `picker-*`, `header-*`, `search-input`
- ✅ Run each flow locally against the simulator
- ✅ Run full auth suite end-to-end — `maestro test apps/mobile/e2e/screens/auth.yaml`
- ⚠️ A11 (Delete Account) deferred — deletes the authenticated user, breaking downstream tests

#### Phase 2 Learnings

- `eraseText` works reliably with React Native TextInput under Fabric. Focus the input with `tapOn` first, then `eraseText` removes up to 50 characters via simulated backspace. No long-press or "Select All" needed — Fabric doesn't show the native iOS context menu. See [Maestro docs](https://docs.maestro.dev/reference/commands-available/erasetext.md).
- Maestro has no `clearState` on iOS — Keychain persists across runs, but the "Not Now" dialog means autofill isn't the culprit. The login screen component stays alive in Expo Router's modal stack, so `useState` values persist between navigations.
- All text assertions must match the actual English output of `t('key')` from `translations.csv`, not guessed strings.
- Flask API error messages (`"Invalid credentials"`, `"Registration failed"`) are not from translations — they come from the server.
- Env vars (`${VAR}`) in Maestro YAML need a default in the file header's `env:` block, not bash-style `${VAR:-default}`.
- RunFlow paths in `screens/` subdirectory must be relative to that directory — use `../flows/` prefix for flows in the parent `e2e/flows/` directory.
- **Keyboard dismiss with Fabric**: Maestro's `hideKeyboard` command fails on React Native New Architecture (Fabric) — it returns "Couldn't hide the keyboard. This can happen if the app uses a custom input or doesn't expose a standard dismiss action." Several workarounds were tried:
  - `tapOn: point:` at the top of the screen — ❌ React Native `<Text>` elements aren't tappable by default, so the tap doesn't reach UIKit's `endEditing:`.
  - `KeyboardAvoidingView` with `behavior="padding"` — ⚠️ caused layout shifts: the first tap opens the keyboard, the view shifts, and the second `eraseText` land on the wrong position.
  - `Keyboard.dismiss()` in form submit handlers — ✅ works but only helps AFTER the button is tapped, not BEFORE (keyboard still obscures the button).
  - **Winner**: Wrapping the title `<Text>` in a `<Pressable onPress={() => Keyboard.dismiss()}>` with `testID="dismiss-keyboard"`. Maestro taps this by `id:` before every button tap, which reliably dismisses the keyboard through the native touch responder. No side effects, no layout shift. Document this pattern in `lib/e2e.ts` as the standard way to dismiss keyboard in tests.
- **Fabric breaks Maestro gestures**: Neither `tapOn: point:` nor `swipe:` triggered iOS navigation bar back button or interactive pop gesture under New Architecture. Gesture-based navigation (swipe-back, coordinate taps) is unreliable on Fabric.
- **Prefer real UI elements over coordinates**: Instead of guessing x/y for back navigation, add a `testID` to an existing link ("Already have an account?" in `register.tsx` calls `router.back()`) and tap it by `id:`. This works 100% reliably under Fabric because it goes through the standard React Native touch responder.
- **`when` only works inside `runFlow` blocks**: Maestro's `when` condition cannot be attached to bare commands like `tapOn`. It must wrap the command in `runFlow` → `when` → `commands`. The correct pattern is:
  ```yaml
  - runFlow:
      when:
        visible: { id: "some-element" }
      commands:
        - tapOn: ...
  ```
- **Nested `runFlow` paths are relative to the containing file**, not the root test file. A flow in `flows/preflight-check.yaml` that calls `flows/logout.yaml` must use `file: logout.yaml` (relative to `flows/`), not `file: flows/logout.yaml`.
- **Each test should clean up after itself**: Register validation tests (A5, A6, A7) leave the app on the register screen after asserting the error. Add a teardown step tapping `register-back-to-login` so individual runs don't leave a mess for the next test. The preflight handles getting to login, but doesn't clean up after.
- **Server-side idempotency > client-side cleanup**: Maestro `runScript` runs JavaScript in GraalJS — which has no `fetch()`, no top-level `await` (wrap in async IIFE), and accesses flow `env` vars as direct globals (`MY_VAR` not `env.MY_VAR`). This makes HTTP-based cleanup scripts unworkable from Maestro flows. Instead, make the Flask endpoint itself handle dedup: the register endpoint auto-deletes existing `e2e.*` users before creating new ones when `ENABLE_TEST_ENDPOINTS=true`. This keeps the YAML simple and works in any Maestro version.
- **Directus 8 `/users/me` is permission-gated**: The authenticate response already includes the full user profile — don't make a separate `/users/me` call. Non-admin roles get "Unauthorized request" on that endpoint. Use `auth_data.get("user", {})` from the `/auth/authenticate` response directly.
- **`runScript` paths are relative to the YAML file**: Same as `runFlow` — `screens/auth/` needs `../../scripts/` to reach `e2e/scripts/`. The Maestro docs example uses `../scripts/` because their flow is only one level deep (`flows/test.yaml`).
- **Split tests into individual files for faster debugging**: Instead of one monolithic auth.yaml, split into per-test files (`screens/auth/login-invalid-credentials.yaml`, etc.). Each can be run independently:
  ```bash
  maestro test apps/mobile/e2e/screens/auth/login-happy-path.yaml
  ```
  A sequencer file (`screens/auth.yaml`) runs them in order via `runFlow`.
- **`scrollUntilVisible` scrolls FIRST, then checks**: Maestro's `scrollUntilVisible` with `direction: DOWN` starts scrolling immediately, then checks if the element is visible. If the element is already at the top of a list (e.g., "English" in a language picker's first section), the first scroll moves it out of view and the command fails with "No visible element found." Fix: wrap in `runFlow` → `when: notVisible` so scrolling only happens when the element isn't already on screen. **CRITICAL**: `notVisible` takes an element selector **object** (e.g., `notVisible: { text: "English" }`), NOT a bare string (`notVisible: "English"`). A bare string is invalid YAML for Maestro's `when` condition and causes the guard to always trigger:
  ```yaml
  - runFlow:
      when:
        notVisible:
          text: "English"   # ✅ object syntax
      commands:
        - scrollUntilVisible:
            element:
              text: "English"
            direction: DOWN
  - tapOn:
      text: "English"
  ```
- **Navigation stack corruption**: `router.replace('/login')` from a screen pushed within a modal (e.g., forgot-password pushed from the login modal) creates a nested duplicate login screen, corrupting `SafeAreaInsets`. The header shifts down ~100px and dropdown menus render offscreen. **Fix**: `router.back()` to pop back to the original login screen. This is safe: logout from tabs uses `replace` because it replaces the root Stack, not a modal.

### Phase 3: Media Tab (Week 4) ◐ IN PROGRESS

> ◐ **Phase 3 in progress.** All 15 test files written, sequencer restructured to use the [`runFlow`-based hierarchical pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline). Tests need to be run against the simulator to verify. The initial flat-inline approach was refactored (commit `b4f2b964`) after discovering Maestro renders inline commands as a single undifferentiated list.

- ✅ Write media suite (Tier 2: M1-M16) as Maestro YAML flows — 15 individual files in `screens/media/`
- ✅ Add testIDs for: video cards, filter pills, search tags, watch screen, grid states
- ✅ Restructure to `runFlow` sequencer — 19-line `screens/media.yaml` calls individual test files, shared `flows/ensure-explore.yaml` handles setup
- ⬜ **Run each media flow locally** — `maestro test` each file, fix failures
- ✅ **Update regression.yaml** — media suite wired in
- ⬜ **Run combined regression** — auth + media suites pass sequentially (~17min)

> **Architecture rule**: Phase 3 established the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline). All future phases must follow this pattern: shared `ensure-<screen>.yaml` setup flow, individual test files, `runFlow`-based sequencer, chainable cleanup, and regression wiring.

### Phase 4: Dictionary + Vocab (Week 5)
- Write dictionary suite (Tier 3: D1-D17) as Maestro YAML flows
- Write SRS suite (Tier 4: R1-R7) as Maestro YAML flows
- Add testIDs for: search bar, save button, rating buttons, tab panels
- **Run each flow locally** — write → `maestro test` → fix → re-run
- **Update regression.yaml** to include dictionary + SRS flows
- **Run combined regression** — auth + media + dict + SRS pass (~32min)

> ⚠️ Must follow the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline).

### Phase 5: Reading + Settings (Week 6)
- Write reader suite (Tier 5: E1-E11) as Maestro YAML flows
- Write settings suite (Tier 6: P1-P9) as Maestro YAML flows
- Add testIDs for: note list, TextActionMenu buttons, settings rows
- **Run each flow locally** — write → `maestro test` → fix → re-run
- **Update regression.yaml** to include reading + settings flows
- **Run combined regression** — all prior suites + reading + settings pass (~37min)

> ⚠️ Must follow the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline).

### Phase 6: Offline (Week 7)
- Write offline suite (Tier 7: O1-O6) as Maestro YAML flows
- Implement `__E2E_NETWORK_OFFLINE__` app flag to convert O4-O6 from human to auto
- **Test offline flag in isolation** — verify the flag causes `fetch`/`apiClient` calls to reject with network error
- **Run each offline flow locally** — write → `maestro test` → fix → re-run
- **Update regression.yaml** to include offline flows
- **Run combined regression** — all prior suites + offline pass (~45min)

> ⚠️ Must follow the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline).

### Phase 7: iPad + Deep Links (Week 8)
- Write auto deep link flows (Tier 9: L1-L4) — word entry, video, password reset, rapid language switch
- Add testIDs for deep link screens (password-reset, verify-email)
- **Run each deep link flow locally** — Maestro can trigger deep links via `openLink:` command
- Note: iPad layout tests (IP1-IP7) are 🧑 human-only — write a human regression checklist instead of Maestro YAML
- **Update regression.yaml** to include deep link flows
- **Run combined regression** — all auto tests (78) pass (~50min)
- **Perform human iPad checklist** manually on iPad simulator

> ⚠️ Must follow the [hierarchical `runFlow` sequencer pattern](#test-suite-architecture-runflow-sequencers-not-flat-inline) for auto tests. Human iPad tests use a checklist, not Maestro YAML.

### Phase 8: Polish + Regression (Week 9)
- **Run full regression locally** — `maestro test apps/mobile/e2e/regression.yaml` — all 78 auto tests pass from clean simulator state
- **Flakiness audit** — run regression 3x in a row; identify any timing-dependent assertions and add retry logic
- Document common failure modes and fixes in `apps/mobile/e2e/README.md`
- Add `npx turbo e2e` command to root `package.json` that runs the full regression suite:
  ```json
  {
    "e2e": "maestro test apps/mobile/e2e/regression.yaml"
  }
  ```

### Phase 9: Execution & Refinement (Week 10)

This phase separates "building the tests" from "making the tests trustworthy." By now the full regression suite exists (Phase 2-8) but hasn't been battle-tested.

- **Run full regression 5+ times** — collect every failure, categorize by root cause (timing, test data, element not found, actual bug)
- **Tune timing** — adjust `waitFor` timeouts, add `optional: true` where appropriate, add retry logic for known-flaky assertions
- **Measure actual runtime** — record how long the full regression takes on your Mac; adjust time estimates if needed
- **Decide which tests gate commits** — some tests may be too flaky (or too slow) to run before every commit. Demote them to pre-submission-only if needed
- **Write troubleshooting guide** — document the 3-5 most common failure patterns and their fixes in `apps/mobile/e2e/README.md`
- **Establish the "go/no-go" threshold** — define what it means for the regression to "pass" (e.g., no auto-test failures, known human-tests documented)

> **Why separate?** Phases 2-8 are about *authoring* — writing YAML, adding testIDs, making flows work once. Phase 9 is about *running at scale* — making them work reliably, every time, without false positives. These require different debugging techniques and mindsets.

### Phase 10: Cleanup (Week 10, last 1-2 days)

- **Remove debug code** — any temporary `console.log`, `__DEV__` guards, or `__E2E__` flags added during development that shouldn't ship
- **Verify testID stripping** — confirm the `e2e()` helper (which gates on `__DEV__`) properly strips testIDs from production bundles. Run a build with `NODE_ENV=production` and `__DEV__=false` to confirm no `testID` props leak
- **Remove test-only dependencies** — check `package.json` for any packages installed solely for E2E testing and ensure they're in `devDependencies`, not `dependencies`
- **Final README polish** — verify `apps/mobile/e2e/README.md` has the full local workflow from scratch (first-time setup → daily use → troubleshooting)
- **Commit and tag** — tag the commit with `e2e-v1` so you can roll back cleanly if needed

## Execution Mode Summary

| Tier | Area | 🤖 Auto | 🧑 Human | Total | % Auto |
|---|---|---|---|---|---|
| 0 | Smoke | 4 | 0 | 4 | 100% |
| 1 | Auth & Onboarding | 13 | 0 | 13 | 100% |
| 2 | Media Tab | 15 | 1 | 16 | 94% |
| 3 | Dictionary & Vocab | 15 | 2 | 17 | 88% |
| 4 | SRS Review | 7 | 0 | 7 | 100% |
| 5 | Reading Tab | 11 | 1 | 12 | 92% |
| 6 | Settings & Profile | 6 | 3 | 9 | 67% |
| 7 | Offline & Local | 3 | 3 | 6 | 50% |
| 8 | iPad & Responsive | 0 | 7 | 7 | 0% |
| 9 | Deep Links & Cross-Flow | 4 | 3 | 7 | 57% |
| | **Total** | **78** | **20** | **98** | **80%** |

> **Note:** Payment & Pro Gates testing (including IAP, Stripe, WeChat Pay, Alipay, PayPal, subscription management, free-tier gates) has been moved to [SPEC-025](./025-payment-e2e-testing.md). All payment tests are human-only pending a mocked payment backend.

**80% of all test cases run fully unattended on your local machine.** The remaining 20 human tests cluster into 4 categories, each with a path to convert to auto:

| Human test category | Count | Future automation path |
|---|---|---|
| **Audio** (Speak/TTS verification, voice picker) | 3 | Add `__E2E__` flag that logs "TTS played: {text}" to a detectable element |
| **Visual appearance** (theme toggle, karaoke animation, all iPad layout) | 10 | Add `__E2E__` flag that exposes layout metrics as text overlays; screenshot diffing on local machine |
| **Network simulation** (Airplane Mode offline, sync) | 3 | `__E2E_NETWORK_OFFLINE__` app flag — swaps `fetch`/`apiClient` to reject network calls. No mitmproxy needed. Instant, deterministic, ~20 lines of code. |
| **Real device / concurrency** (concurrent sessions, push notifications) | 3 | Second simulator instance; revisit when push is added |
| **OS-level UI** (native share sheet) | 1 | Verify the export API call was made instead of checking the sheet UI |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Maestro + New Architecture (Fabric) compatibility | Medium | High | Run compatibility spike in Phase 1 with one element per primitive type; fall back to `accessibilityLabel` if `testID` fails |
| Network-dependent tests flaky | Medium | High | **Accepted** — tests hit the real backend. Mitigate by: dedicated test accounts, retry logic in Maestro flows, and a weekly manual seed data check |
| Video playback can't be automated | Medium | Medium | Test video meta display and subtitle interaction (outside WebView); skip actual play verification |
| iOS Keychain persistence breaks test isolation | High | Medium | Preflight uninstall + reinstall with `xcrun simctl uninstall` before each test run; preflight-check flow for test-local runs |
| Maestro flakes on async rendering | Medium | Medium | Use `waitFor` matchers generously; avoid `tapOn` without visibility checks |
| Test data changes break tests (e.g., a test video deleted) | Medium | High | Dedicated staging-only seed data (not production). Run `scripts/setup-e2e-env.sh --validate` before test runs. |

## Open Questions

*(None remaining — all open questions have been resolved. See [Resolved Decisions](#resolved-decisions) below.)*

## Resolved Decisions

### Backend Strategy: Real Staging Flask Server (not a mock)

Tests hit the real staging Flask backend (`https://staging.zerotohero.ca:5001` or similar). The app is built with `EXPO_PUBLIC_API_URL` set to the staging server, so all API calls go to real endpoints with real data. No canned JSON, no mock server to maintain.

**Implications:**
- Tests verify actual backend behavior — catches regressions in auth, video serving, dictionary, SRS, and user data endpoints
- Test data must be stable and version-controlled via `scripts/setup-e2e-env.sh`
- Network flakiness is accepted — mitigated by dedicated test accounts and a pre-flight validation step
- Offline tests (O4-O6, L4) still use the `__E2E_NETWORK_OFFLINE__` app flag — the real backend is irrelevant for those since the app gets a network error before reaching it

**Setup locally:**
```bash
# Build with local Flask URL:
export EXPO_PUBLIC_API_URL=http://127.0.0.1:5001
npx expo run:ios --configuration Release
```

### Self-Hosted Maestro (not Maestro Cloud)

Maestro runs as a local CLI directly on your Mac — no cloud service needed, no per-minute costs. The same YAML flow files work whether run by one developer or many; just run `maestro test`. If flaky test management or multi-device parallel runs become necessary later, switching to Maestro Cloud (`maestro cloud`) requires no flow file changes — just a different CLI command.

### Offline Test Strategy: `__E2E_NETWORK_OFFLINE__` App Flag

No mitmproxy needed. A ~20-line app-level flag swaps `fetch` and `apiClient` to reject all requests to `PYTHON_API_URL` with a network error. This converts 3 human tests (O4, O5, O6) to auto:

```ts
// lib/e2e-network.ts
let offlineMode = false;

export function setE2EOfflineMode(enabled: boolean) {
  offlineMode = enabled;
}

export function wrapFetchForE2E(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (offlineMode && typeof input === 'string' && input.includes(PYTHON_API_URL)) {
      throw new TypeError('Network request failed (E2E offline mode)');
    }
    return originalFetch(input, init);
  };
}
```

The Maestro flow sets the flag via a simple app entry point env check or by tapping a hidden debug toggle before starting the offline test suite. This is simpler, faster, and gives deterministic offline behavior — you control exactly when the network "fails" and which endpoints are affected.

### Seed Data Ownership & Validation

Since seeds go through Flask API endpoints (per SPEC-024), the person who maintains the Flask server also owns the seed script (`scripts/setup-e2e-env.sh`). This keeps responsibility aligned — the person who changes the backend schema knows to update the seed data.

Run **manual validation** before each test session:

```bash
sh scripts/setup-e2e-env.sh --validate
```

This checks that all 4 test accounts exist and can authenticate. Run this whenever you suspect backend data may have changed (after a migration, server restart, or data reset).

Without automated CI, there is no cron job — validation is a developer responsibility. To make it harder to forget, consider adding it as a pre-test step in your local workflow (see `apps/mobile/e2e/README.md`).

### Test Suite Architecture: `runFlow` Sequencers (Not Flat Inline)

**All test suites MUST use the hierarchical `runFlow`-based sequencer pattern, not flat inline commands.** This was discovered during Phase 3 when the initial `screens/media.yaml` inlined ~200 commands at the top level. Maestro rendered this as a single flat list — when one command failed, all remaining ~190 commands showed `🔲` (not reached), making debugging painful.

#### The pattern

Each tier gets a **sequencer file** at `screens/<tier>.yaml` that calls individual test files via `runFlow`:

```yaml
# screens/media.yaml — sequencer, not inline commands
- runFlow:
    file: ../flows/ensure-explore.yaml    # login once
- runFlow:
    file: media/explore-feed.yaml          # M1
- runFlow:
    file: media/level-filter.yaml          # M2
- runFlow:
    file: media/explore-pagination.yaml    # M3
# ... each test is one collapsible line
```

Each individual test file in `screens/<tier>/<test-name>.yaml` is independently runnable and uses a shared `ensure-<start-screen>.yaml` flow for setup:

```yaml
# screens/media/level-filter.yaml — independently runnable
- runFlow:
    file: ../../flows/ensure-explore.yaml  # login if needed, land on Explore
# ... test-specific commands ...
- tapOn:
    id: "header-logo"                      # return to start for sequencer chainability
```

#### Maestro output comparison

| Approach | Output | Debuggability |
|---|---|---|
| **Flat inline** (old) | 200 commands at top level, one failure blocks everything | Must scroll through ~200 lines to find the failure |
| **`runFlow` sequencer** (new) | 16 collapsible lines, each test is one entry | Expand only the failing test to see its ~5–10 commands |

```
# Flat (old) — painful
║  ❌ Assert that id: explore-screen is visible
║  🔲 Tap on id: level-filter-2
║  🔲 Assert that id: explore-screen is visible
║  🔲 ... (~190 more lines)

# Hierarchical (new) — clean
║  ✅ Run ../flows/ensure-explore.yaml
║  ✅ Run media/explore-feed.yaml
║  ❌ Run media/level-filter.yaml          ← expand ONLY this
║  🔲 Run media/explore-pagination.yaml
```

#### Requirements for new suites

When implementing future phases (Phase 4–9), every test suite must:

1. **Shared setup flow** — Create an `ensure-<screen>.yaml` in `flows/` that handles both "need to log in" and "already authenticated" states, always landing on the correct starting screen.
2. **Individual test files** — Each test in `screens/<tier>/<name>.yaml`, independently runnable via `maestro test e2e/screens/<tier>/<name>.yaml`.
3. **Sequencer** — `screens/<tier>.yaml` calls individual files via `runFlow`, not inline commands.
4. **Chainability** — Each test file ends by returning to the shared start screen (e.g., `tapOn: header-logo`) so the sequencer's next test starts clean.
5. **Regression wiring** — Add the sequencer to `regression.yaml` as a single `runFlow` call.
