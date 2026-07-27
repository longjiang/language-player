# SPEC-023: Mobile End-to-End Testing Plan

## Metadata
- **Spec ID**: SPEC-023
- **Feature**: End-to-End Testing for Mobile App
- **Status**: draft
- **Created**: 2026-07-27

## Overview

The mobile app (`apps/mobile/`) has 30+ screens across 4 tabs (Media, Reading, Vocab, Me), 9 React Contexts, 20 hooks, and native modules (SQLite, SecureStore, expo-video, expo-speech, expo-in-app-purchases, etc.). Currently there are **zero E2E tests** and only unit tests exist in `apps/web/` (vitest for shared utils). As the app prepares for App Store submission (replacing the Classic Nuxt binary per ADR-0013), E2E tests are critical to catch regressions in auth flows, language state, offline tokenization, and user flows that unit tests can't cover.

This spec covers the full E2E testing strategy: tool selection, test environment setup, CI integration, and a prioritized test case catalog covering every major user flow.

## Tool Selection: Maestro

### Why Maestro

| Criteria | Maestro | Detox | Appium |
|---|---|---|---|
| Setup complexity | Low — install CLI, no native config | High — native build config, device registry | High — server setup, driver config |
| Expo compatibility | ✅ Works with Expo Go + dev builds | ⚠️ Requires dev build + detox-native setup | ⚠️ Works but needs appium-xcuitest-driver |
| Flow authoring | YAML (human-readable, git-friendly) | JS/TS (Jest + async/await) | JS/TS (WebDriverIO or similar) |
| CI integration | ✅ Native GitHub Action | ✅ via Detox CLI | ✅ via Appium service |
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
4. **CI reliability** — A pre-built `.app` can be installed deterministically on the simulator, avoiding the fragile deep-link-into-Expo-Go dance.

**Cost:** Free. No EAS subscription needed. Build locally on the CI runner or on your Mac and cache the `.app` artifact.

**Build locally (once):**
```bash
cd apps/mobile
npx expo run:ios --configuration Release
# Output: ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
```

**CI: use a cached pre-built `.app`:**
```bash
# Build once, upload to GitHub Actions artifact cache, download in CI:
# .github/actions/cached-app/action.yml handles:
# - Restore .app from cache (keyed by git hash of apps/mobile/ **/*.tsx)
# - On cache miss: build with `expo run:ios`, upload result
```


## Test Environment

### Environments

| Environment | Server | Database | Auth |
|---|---|---|---|
| **Local dev** | `http://127.0.0.1:5001` (Flask) | Dev backend (Flask → Directus) | Test credentials (Mary/Bob from AGENTS.md) |
| **Staging** | Staging Flask server | Staging backend | Dedicated test accounts |
| **CI (GitHub Actions)** | Live staging Flask server (or local Flask + staging Directus) | Staging backend | CI-only test accounts |

> **Note:** Per [SPEC-024](./024-consolidate-directus-calls.md), all Directus calls now route through the Flask backend. E2E tests hit the real staging Flask server — no mock server needed. This means tests verify actual backend behavior but depend on network and test data availability.

### Test Accounts

Maintain dedicated E2E test accounts (not Mary/Bob, which are manual test accounts):

| Account | Type | Purpose |
|---|---|---|
| `e2e.free@zerotohero.ca` | Free (no subscription) | Test free-tier limits, gate checks |
| `e2e.pro@zerotohero.ca` | Pro (lifetime) | Test full features, no paywall |
| `e2e.unverified@zerotohero.ca` | Unverified email | Test verify-email flow, resend |
| `e2e.new@zerotohero.ca` | New user, no L2 set | Test onboarding flow |

Passwords stored in GitHub Actions secrets + local `.env.e2e`.

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

> **Note:** `DIRECTUS_URL` removed per SPEC-024. All backend calls go through `FLASK_URL`. If using a mocked Flask server, set `EXPO_PUBLIC_API_URL` to the mock server address in the build environment; the app never reads `FLASK_URL` from Maestro config (that's for the setup script).

## Execution Modes

Every test case is tagged with one of two execution modes:

| Mode | Icon | Description | Who runs it | Frequency |
|---|---|---|---|---|
| **auto** | 🤖 | Fully automated via Maestro YAML flow. No human judgement required. Element visibility, text content, and navigation state verified programmatically. | CI (every PR / nightly) | Every PR touching `apps/mobile/` |
| **human** | 🧑 | Must be performed by a person. Requires: audio verification (TTS), visual layout inspection (iPad split view / karaoke / theme colors), network state simulation (Airplane Mode), or multi-device setup (concurrent sessions). | Developer / QA | Pre-submission or nightly |

The goal is to maximize the **auto** count. See the [Risks and Mitigations](#risks-and-mitigations) section for strategies to convert human tests to auto over time.

## Test Case Catalog

### Tier 0 — Smoke Test (CI gate, ~30s)

Every commit to `apps/mobile/` runs the smoke suite. It verifies the app launches and core navigation works.

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

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/mobile-e2e.yml
name: Mobile E2E
on:
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'packages/**'
  workflow_dispatch:

jobs:
  maestro:
    runs-on: macos-14  # M1 runner for iOS sim
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: mobile-dev-inc/setup-maestro@v2
      - name: Install dependencies
        run: |
          cd apps/mobile && npm ci

      - name: Restore cached dev build
        id: cache
        uses: actions/cache@v4
        with:
          path: apps/mobile/ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app
          key: ios-dev-build-${{ hashFiles('apps/mobile/**/*.tsx', 'apps/mobile/**/*.ts', 'apps/mobile/ios/Podfile.lock', 'apps/mobile/package.json') }}

      - name: Build dev build (cache miss)
        if: steps.cache.outputs.cache-hit != 'true'
        run: |
          cd apps/mobile
          npx expo run:ios --configuration Release

      - name: Pre-clean simulator
        run: |
          xcrun simctl boot "iPhone 15 Pro" 2>/dev/null || true
          xcrun simctl uninstall booted ca.zerotohero.app || true

      - name: Install app on simulator
        run: |
          xcrun simctl install booted \
            apps/mobile/ios/build/Build/Products/Release-iphonesimulator/ZeroToHero.app

      - name: Wait for Metro bundler
        run: |
          cd apps/mobile && npx expo start --ios --no-dev &
          # Poll Metro until ready (avoids hardcoded sleep)
          for i in $(seq 1 60); do
            curl -s http://localhost:8081 > /dev/null 2>&1 && break
            sleep 1
          done

      - name: Set EXPO_PUBLIC_API_URL for staging backend
        run: |
          echo "EXPO_PUBLIC_API_URL=${{ secrets.STAGING_FLASK_URL }}" >> $GITHUB_ENV
        run: |
          cd apps/mobile && npx expo start --ios --no-dev &
          # Poll Metro until ready (avoids hardcoded sleep)
          for i in $(seq 1 60); do
            curl -s http://localhost:8081 > /dev/null 2>&1 && break
            sleep 1
          done

      - name: Run Maestro smoke tests
        run: maestro test apps/mobile/e2e/smoke.yaml --env-file .env.e2e

      - name: Run Maestro full regression
        run: maestro test apps/mobile/e2e/regression.yaml --env-file .env.e2e

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: maestro-failures
          path: ~/.maestro/tests/**/*.png
```

### Test Execution Strategy

| Trigger | Suite | Mode | Environment | Expected Time |
|---|---|---|---|---|
| Every PR touching `apps/mobile/` | Smoke (S1-S4) | auto only | CI + staging Flask + pre-built .app | ~2min (incl. app install) |
| Every PR touching `apps/mobile/` | Tiers 1-3 (auto tests only) | auto only | CI + staging Flask + pre-built .app | ~12min |
| Nightly | All auto tests (Tiers 1-10) | auto only | CI + staging Flask + pre-built .app | ~35min |
| Before App Store submission | All auto tests + human-regression checklist | auto + human | Simulator + Device | ~90min |
| Weekly (scheduled) | Human regression (Tiers 6-8 human tests) | human only | Physical iPad + iPhone | ~30min |
|| | | | |

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

3. **CI preflight**: Before all tests, uninstall and reinstall the app:

```bash
# CI preflight script
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
<TextInput testID="login-email-input" />
<TextInput testID="login-password-input" />
<Pressable testID="login-signin-button" />
<TabBar.Item testID="tab-media" />
<TabBar.Item testID="tab-reading" />
<TabBar.Item testID="tab-vocab" />
<TabBar.Item testID="tab-me" />
<Pressable testID="save-word-button" />
<Pressable testID="search-button" />
<Pressable testID="settings-display" />
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

1. **Smoke suite passes** on every PR touching `apps/mobile/` (CI gate)
2. **Auth suite passes** covering all 4 test accounts
3. **Media suite passes** covering explore, search, player, TV shows, live TV
4. **Dictionary suite passes** covering search, save/unsave, saved words, word detail
5. **SRS suite passes** covering review flow, ratings, undo, daily limit
6. **Reader suite passes** covering notes, EPUB, web reader with TextActionMenu
7. **Settings suite passes** covering themes, toggles, search, iPad layout
8. **All tests pass on iPad simulator** (landscape, split view, slide over)
9. **Test failure artifacts** (screenshots + Maestro report) uploaded on CI failure

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

1. **Maestro + New Architecture spike** (Day 1) — Build a dev build with `newArchEnabled: true`, write one Maestro flow (login + tap 4 tabs), verify element discovery works under Fabric renderer. If elements are missing, budget time to add `accessibilityLabel` as a fallback alongside `testID`.

2. **Create `lib/e2e.ts` helper** (Day 1) — Reusable `e2e(id)` helper that returns `{ testID: id }` only in `__DEV__`.

3. **Add `testID` props** (Days 2-4) — Login form fields, tab bar items, main CTA buttons, search bar, save button. ~15-20 testIDs across ~10 files.

4. **Build dev build locally** — One `npx expo run:ios --configuration Release` on your Mac. In CI, cache the resulting `.app` via `actions/cache@v4` (cache key includes `**/*.tsx`, `Podfile.lock`, `package.json`). On cache miss, rebuild on the `macos-14` CI runner (~15-20min first build, ~30s cache restore on subsequent runs).

5. **Seed test data on the staging backend** (Days 3-5) — Build `scripts/setup-e2e-env.sh` that calls Flask endpoints (`POST /auth/register`, etc.) against the staging server to create test accounts (`e2e.free`, `e2e.pro`, `e2e.unverified`, `e2e.new`) and seed initial data (saved words, SRS cards, watch history for the pro user).

6. **Create `apps/mobile/e2e/` scaffold** — `config.yaml`, `flows/auth.yaml`, `flows/preflight-check.yaml`, `smoke.yaml`. CI workflow with dev build install + `EXPO_PUBLIC_API_URL` set to staging + smoke tests.

### Phase 2: Auth + Navigation (Week 3)
- Write full auth suite (Tier 1: A1-A13)
- Write language selection flow
- Write session persistence test
- Add testIDs for auth screens

### Phase 3: Media Tab (Week 4)
- Write media suite (Tier 2: M1-M16)
- Add testIDs for: video cards, search bar, filter pills, player controls
- Handle async video loading in tests

### Phase 4: Dictionary + Vocab (Week 5)
- Write dictionary suite (Tier 3: D1-D17)
- Write SRS suite (Tier 4: R1-R7)
- Add testIDs for: search bar, save button, rating buttons, tab panels

### Phase 5: Reading + Settings (Week 6)
- Write reader suite (Tier 5: E1-E11)
- Write settings suite (Tier 6: P1-P9)
- Add testIDs for: note list, TextActionMenu buttons, settings rows

### Phase 6: Offline (Week 7)
- Write offline suite (Tier 7: O1-O6)
- Implement `__E2E_NETWORK_OFFLINE__` app flag to convert O4-O6 from human to auto

### Phase 7: iPad + Deep Links (Week 8)
- Write iPad suite (Tier 8: IP1-IP7)
- Write deep link suite (Tier 9: L1-L7)

### Phase 8: Polish + Regression (Week 9)
- Full regression: all auto tests passing, human regression checklist finalized
- Test flakiness audit: add retry logic for timing-dependent assertions
- Document common failure modes and fixes
- Add `npx turbo e2e` command to root `package.json`

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

**80% of all test cases run fully unattended in CI.** The remaining 20 human tests cluster into 4 categories, each with a path to convert to auto:

| Human test category | Count | Future automation path |
|---|---|---|
| **Audio** (Speak/TTS verification, voice picker) | 3 | Add `__E2E__` flag that logs "TTS played: {text}" to a detectable element |
| **Visual appearance** (theme toggle, karaoke animation, all iPad layout) | 10 | Add `__E2E__` flag that exposes layout metrics as text overlays; screenshot diffing in CI |
| **Network simulation** (Airplane Mode offline, sync) | 3 | `__E2E_NETWORK_OFFLINE__` app flag — swaps `fetch`/`apiClient` to reject network calls. No mitmproxy needed. Instant, deterministic, ~20 lines of code. |
| **Real device / concurrency** (concurrent sessions, push notifications) | 3 | Multi-device CI runner; revisit when push is added |
| **OS-level UI** (native share sheet) | 1 | Verify the export API call was made instead of checking the sheet UI |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Maestro + New Architecture (Fabric) compatibility | Medium | High | Run compatibility spike before Phase 1; fall back to `accessibilityLabel` if `testID` fails |
| Network-dependent tests flaky in CI | High | High | **Accepted** — tests hit the real staging backend. Mitigate by: dedicated test accounts with known data, seed validation job, retry logic in Maestro flows, and a weekly human check on test data |
| Video playback can't be automated | Medium | Medium | Test video meta display and subtitle interaction (outside WebView); skip actual play verification |
| iOS Keychain persistence breaks test isolation | High | Medium | Preflight uninstall + reinstall before each CI run; preflight-check flow for local runs |
| Expo dev build cold start in CI | Medium | Medium | Cache `.app` artifact via `actions/cache` (keyed by source hashes); build only on cache miss |
| Maestro flakes on async rendering | Medium | Medium | Use `waitFor` matchers generously; avoid `tapOn` without visibility checks |
| Test data changes break tests (e.g., a test video deleted) | Medium | High | Dedicated staging-only seed data (not production). Seed validation job alerts on data loss. Test accounts are service accounts — no human uses them |
| iPad sim not available in macOS runner | Low | High | Use `macos-14` runner (supports iPad sim); fall back to manual iPad testing |

## Open Questions

*(None remaining — all open questions have been resolved. See [Resolved Decisions](#resolved-decisions) below.)*

## Resolved Decisions

### Backend Strategy: Real Staging Flask Server (not a mock)

Tests hit the real staging Flask backend (`https://staging.zerotohero.ca:5001` or similar). The app is built with `EXPO_PUBLIC_API_URL` set to the staging server, so all API calls go to real endpoints with real data. No canned JSON, no mock server to maintain.

**Implications:**
- Tests verify actual backend behavior — catches regressions in auth, video serving, dictionary, SRS, and user data endpoints
- Test data must be stable and version-controlled via `scripts/setup-e2e-env.sh`
- Network flakiness is accepted — mitigated by dedicated test accounts (not used by humans) and a seed validation CI job
- Offline tests (O4-O6, L4) still use the `__E2E_NETWORK_OFFLINE__` app flag — the real backend is irrelevant for those since the app gets a network error before reaching it

**Setup in CI:**
```bash
# No mock server needed. Just configure which backend to hit:
echo "EXPO_PUBLIC_API_URL=${{ secrets.STAGING_FLASK_URL }}" >> $GITHUB_ENV
```

### Self-Hosted Maestro (not Maestro Cloud)

Maestro runs as a local CLI on the same macOS runner that hosts the iOS simulator — no cloud service needed. The CI job uses GitHub Actions `macos-14` runner (~$0.08/min, ~$2.80/nightly suite). The same YAML flow files work identically in local dev (`maestro test`) and CI. If flaky test management or multi-device parallel runs become necessary later, switching to Maestro Cloud (`maestro cloud`) requires no flow file changes — just a different CLI command.

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

A **weekly CI validation job** (GitHub Actions `schedule` trigger, Monday 8am UTC) verifies that all E2E test accounts still exist and have expected data:

```yaml
# .github/workflows/seed-validation.yml (conceptual)
name: Validate E2E Seed Data
on:
  schedule:
    - cron: '0 8 * * MON'  # Every Monday at 8am UTC

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Check test accounts exist
        run: |
          for account in free pro unverified new; do
            status=$(curl -s -o /dev/null -w "%{http_code}" \
              -X POST ${{ secrets.STAGING_FLASK_URL }}/auth/login \
              -d "{\"email\":\"e2e.$account@zerotohero.ca\",\"password\":\"${{ secrets.E2E_PASS }}\"}")
            if [ "$status" != "200" ]; then
              echo "FAIL: e2e.$account account check returned $status"
              exit 1
            fi
          done
          echo "All 4 test accounts verified."
```

This catches silently deleted accounts, password changes, or backend migrations that break test data — before anyone discovers it mid-E2E-test-run.
