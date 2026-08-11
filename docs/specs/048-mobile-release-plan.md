# SPEC-048: Mobile Release Plan — Human QA + App Store & Play Store Distribution

## Metadata
- **Spec ID**: SPEC-048
- **Feature**: Pre-release (informal, human) testing + releasing `apps/mobile/` to the Apple App Store and Google Play Store
- **Status**: draft
- **Created**: 2026-08-06
- **Related**: [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) · [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) (deferred) · [SPEC-014 — Subscription/Payment](014-subscription-payment-system.md) · [SPEC-025 — Payment E2E (archived)](archive/025-payment-e2e-testing.md) · [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) · [SPEC-052 — Mobile Large Screen (iPad) Layout Parity with Web](052-mobile-large-screen-ipad-layout-parity-with-web.md)

## Overview

This is the **release plan for the mobile app**. It covers the full path from
code to store on both platforms:

1. **Pre-release QA** — informal, checklist-based **human** testing (per
   [ADR-0027](../adr/0027-defer-automated-e2e-human-qa.md), automated Maestro
   E2E is deferred).
2. **Apple App Store (iOS)** — build the Release archive, verify it, upload to
   App Store Connect, submit for review.
3. **Google Play Store (Android)** — register a new Play Developer account,
   build the Android AAB, and publish through Play Console.

The iOS build details and the two hard-won gotchas from the first archive
remain documented here so future releases are one-command and correct.

## Current app identity (as of 2026-08)

| Property | iOS | Android |
|---|---|---|
| App name | Language Player 3 | Language Player 3 |
| Identifier | `ca.zerotohero.go` (bundle ID — replaces the GO listing) | `ca.zerotohero.go` (package, new Play launch) |
| Version | `3.0.0` (build `1`) | `3.0.0` (versionCode `1`) |
| Min OS | iOS 16.4 | set in `app.json` |
| Production API URL | `https://pythonvps.zerotohero.ca` | same |

> Version numbers live in `apps/mobile/app.json` (`expo.version`, plus
> `ios.buildNumber` and `android.versionCode`). Bump **both** stores' versions
> on every release; the store-specific build numbers are independent.

### Store strategy (2026-08-06)

Per [ADR-0013 (revised)](../adr/0013-app-store-strategy.md):

- **iOS — Classic stays**: the Classic Nuxt app remains live as **"Language
  Player 2"**. It is **not** replaced by this app.
- **iOS — GO replaced**: this app **replaces the GO Legacy listing** and is
  named **"Language Player 3"**. The iOS build uses the GO bundle ID
  **`ca.zerotohero.go`** (set in `apps/mobile/app.json`
  `ios.bundleIdentifier` and the native project).
  **Why this ID:** a store listing's bundle ID cannot be changed, so updating
  the GO listing requires keeping `ca.zerotohero.go`. Doing so also preserves
  the GO app's IAP product (non-consumable `pro_go`) and existing installs'
  receipt-validation / restore continuity. It does **not** inherit the Classic
  app's `ca.zerotohero.app` IAP product — that stays with Classic. Signing must
  use a Distribution profile for `ca.zerotohero.go`.
- **Google Play — new launch**: a brand-new **"Language Player 3"** listing on
  a new Play Developer account (see § 4). It uses the same identifier
  `ca.zerotohero.go` as iOS (Android packages and iOS bundle IDs are separate
  namespaces; keeping them identical avoids confusion).

## 1. Testing strategy — informal, checklist-based human QA

**Per ADR-0027**, automated Maestro E2E (SPEC-023) is deferred. Releases are
gated by a **human-executed QA checklist** instead. This is deliberately
informal: no CI, no test runner — a reviewer runs the checklist against a
release build and ticks boxes.

The checklist is derived from SPEC-023's Tier 0–9 catalog, converted from
Maestro assertions to manual checks.

### 1.1 How to run

- Test the **exact release build** you intend to ship (install the `.app` /
  `.aab` on a device or simulator — not Expo Go).
- Use a **real device** for any check marked *device* (audio, network,
  payments); otherwise the iOS simulator is fine.
- Recommended minimum: iPhone (real), iPad (simulator), Android phone (real,
  once a build exists).
- Platform split: run the full checklist once on iOS, then the Android subset
  — see [§ 1.3](#13-platform-split--ios-first-android-subset).

### 1.2 Pre-release QA checklist

Checklists are grouped by product flow (smoke/auth → media → dictionary &
vocab → review → reading → settings → offline → deep links → payments).
Tester comments are kept in brackets.

#### S. Smoke  **· SPEC-023 ref:** Tier 0 · **Run on:** Simulator

- ✅ Launch → login screen
- ✅ login → 4 tabs render
- ✅ logout returns to login

#### A. Auth & onboarding  **· SPEC-023 ref:** Tier 1 · **Run on:** Simulator

- ✅ Login ok
- ✅ Login wrong pass
- ✅ Login empty fields
- ✅ register (happy + duplicate email) [language section conflicting with notch after registration]
- ✅ verify email
- ✅ delete account
- ✅ language selection [should go to explore not saved words; language switching from dictionary should go back to explore; when switching to a new language]
- ✅ session persists across background

#### M. Media  **· SPEC-023 ref:** Tier 2 · **Run on:** Simulator

- ✅ Explore feed + level filter + pagination
- ✅ video cards
- ✅ live TV stream + mute [stream should not continue to play when navigating away]
- ✅ channel subscribe
- ✅ video playback [subtitles in 'transcript' mode not showing, tabs invisible, tab content missing]
- ✅ search (results + empty state)
- ✅ TV shows → episodes
- ✅ watch history
- ✅ video queue
- ✅ tap subtitle word → dictionary popup
- ⚠️ multiline transcript - smooth scroll [very slow and buggy - leave as is]
- ⚠️ single line transcript [should be right aligned but have repeated issues implementing - leave as is]

#### 049-M1. Subs-search & player translation (§7)  **· SPEC-023 ref:** Tier 2 · **Run on:** Simulator

- ✅ subs-search translation always stacked below the subtitle
- ✅ text action menu + translations on subs-search subtitle
- ✅ watch full button
- ✅ highlight target form in translation by having target form sent to the translate API [translation is bolded with ** but not properly displayed, keyword is not highlighted in subs - should match apps/web’s way of highlighting the term in translation]
- ✅ specific translated YouTube player errors [test against “untamed” episode]

#### 049-M2. Native text selection & actions (§8)  **· SPEC-023 ref:** Tier 2 · **Run on:** Simulator

- ⚠️ native text-selection actions on TokenizedText [feature missing, leave as is]
- ⚠️ selection opens the dictionary popup (not the action menu) [feature missing, leave as is]
- ⚠️ canonical phrase cards in the selection dictionary popup [feature missing, leave as is]
- ⚠️ immediate sentence passed as selection popup context [feature missing, leave as is]

#### D. Dictionary & vocab  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ save + unsave word
- ✅ word detail - defs
- ✅ Inflections
- ✅ speak button
- ✅ recent searches
- ✅ pitch accent (ja)
- ✅ popup dictionary’s l1≠en defs translation
- ✅ quick gloss
- ✅ chinese cedict cannot open word - “Unrecognized entry ID format”
- ✅ traditional chars (zh)
- ✅ saved list (filter / inline defs / source)
- ✅ saved words render as dictionary entry cards
- ✅ saved-word metadata (date/source/context/form)
- ✅ saved-word form highlighted in the save bar
- ✅ saved-word context - video titles capped
- ✅ dictionary search found / not found
- ✅ AI Explain
- ⚠️ Subs search show-all list [result item needs to scroll horizontally if too long, leave as is]

#### 049-S1. Dict — search/autocomplete & sidebar (SPEC-049 §1)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ English-definition autocomplete surfaces matching L2 entries (typing “meal”)
- ✅ dead toggles hidden [sidebar missing on phone]
- ✅ Conjugations tab hidden for non-inflecting languages
- ✅ sidebar is a slide-from-right drawer
- ✅ sidebar prev/next in header
- ⚠️ currently-viewed entry card highlighted [not highlighted, leave as is]
- ⚠️ “Related” sidebar title when a corpus list is available [text too large - clipped off, leave as is]

#### 049-S2. Dict — saved words as entry cards (§2)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ cards tile responsively
- ✅ sort toggle removed

#### 049-S3. Dict — image search grid (§3)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ Openverse image-search tab
- ✅ LLM-rewritten search with filter pills
- ✅ scrollable query pills + paginated grid + query relaxation
- ✅ skeleton loading + grid placeholders
- ✅ compact image strip in the popup dictionary

#### 049-S4. Dict — corpus tab / Sketch Engine (§4)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ corpus text is interactive tokenized text with term highlighting
- ✅ related words as infinite-scroll card grid with bookmark + corpus source
- ✅ corpus tab pills: Collocations / Examples / Related / Mistakes [translations show up as English]

#### 049-S5. Dict — AI Explain / DeepSeek (§5)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ pro-gated explanation embedded in the full entry card
- ✅ interactive tokenized L2 strings in AI-explain responses
- ✅ “ask for two same-sense usage examples”
- ✅ “Let AI Explain” instant + subscription status shared app-wide
- ✅ Follow up questions for “Let AI Explain” [not implemented, should match apps/web’s implementation]

#### 049-Q. Quick gloss & translation styling (§11)  **· SPEC-023 ref:** Tier 3 · **Run on:** Simulator

- ✅ quick gloss restyled with parens + smart spacing
- ✅ TokenizedText respects the text-scaling setting everywhere

#### R. Review (SRS)  **· SPEC-023 ref:** Tier 4 · **Run on:** Simulator

- ✅ No-cards-due state
- ✅ card front and back
- ✅ rate Good → next card
- ✅ all-done + stats
- ✅ undo
- ✅ daily new-card limit

#### 049-R. Review — phonetics & styling (§6)  **· SPEC-023 ref:** Tier 4 · **Run on:** Simulator

- ✅ phonetics on highlighted words; reveal on card flip
- ✅ target form emphasized in review translation; markdown rendered
- ✅ card padding halved on phones; source dates localized
- ✅ tap-to-rate zones removed

#### E. Reading  **· SPEC-023 ref:** Tier 5 · **Run on:** Simulator

- ✅ Notes ✅create/⚠️ edit/✅ rename/✅ delete + ✅ tokenized tap (after editing, translation needs to reload)
- ✅ EPUB reader resume + word lookup
- ✅ EPUB upload
- ✅ web reader fetch
- ✅ web reader TextActionMenu (copy / AI explain / translate / speak)

#### 049-E1. Reading — EPUB bookshelf & search (§9)  **· SPEC-023 ref:** Tier 5 · **Run on:** Simulator

- ✅ per-book EPUB bookshelf with reading progress
- ✅ in-book search with snippets
- ✅ EPUB opens straight to content + page-number estimates
- ✅ in-book back history
- ✅ language-specific EPUB bookshelf
- ⚠️ whole-book model re-engineering [pagination calculation should be more intelligent, but do so without loading forever - leave as is] [some pages are paginated extremely long; tokenization and translation process hangs UI because it’s not lazy or visibility driven - leave as is]
- ⚠️ dictionary popup from clicked tokens / internal links [cannot be tested - books with internal links cannot open - leave as is]
- ⚠️ in-content link fragments [yet to be tested - books cannot open - leave as is]

#### 049-E2. Reading — web reader (§10)  **· SPEC-023 ref:** Tier 5 · **Run on:** Simulator

- ✅ curated reading suggestions
- ✅ markdown formatting [cannot be tested - fails to load]
- ✅ page-title sniffing + tracked visited sites/date
- ✅ reader links open in-app
- ✅ back-to-home button
- ✅ text-source titles capped in the save bar

#### P. Settings & profile  **· SPEC-023 ref:** Tier 6 · **Run on:** Simulator + device

- ✅ Profile info
- ✅ level change
- ✅ display theme light/dark/system
- ✅ playback toggles
- ✅ review settings
- ✅ settings search
- ✅ subscription screen (pro/free)
- ✅ speech voice + rate

#### O. Offline  **· SPEC-023 ref:** Tier 7 · **Run on:** Device

- ✅ Download + delete offline dict
- ✅ tokenizer warning (Category E)
- ✅ airplane-mode reading + dictionary popup
- ✅ offline tokenization
- ✅ offline → online sync
- ⬜ network loss mid-reading

#### L. Deep links & cross-flow  **· SPEC-023 ref:** Tier 9 · **Run on:** Device

- ⬜ languageplayer://vocab/word/...
- ⬜ .../media/watch/...
- ⬜ password-reset deep link
- ⬜ L2 switch in deeplinking
- ⬜ forgot & reset password (deep link) [missing deeplinking (website can also reset fine]

#### Pay. Payments  **· SPEC-023 ref:** SPEC-054 · **Run on:** Device

- ⬜ Stripe card
- ⬜ WeChat / Alipay / PayPal
- ⬜ iOS IAP purchase + restore
- ⬜ free-tier gates

> Audio, visual-layout, offline, and payment checks require a human and
> (mostly) a real device — exactly why they are human checks rather than Maestro
> automation. See SPEC-054 for the detailed payment checklist. The `Run on`
> column is **iOS-first** — see
> [§ 1.3](#13-platform-split--ios-first-android-subset) for the Android subset.

### 1.3 Platform split — iOS first, Android subset

The checklist above is **iOS-first** (the `Run on` column assumes the iOS
simulator / iPhone / iPad). You do **not** run the full checklist twice:

1. **Run the full checklist once on iOS** — the app is ~100% shared React
   Native, so this covers all cross-platform logic (auth, media, dictionary,
   review, reading, settings).
2. **On Android, run a targeted platform-specific subset** — these genuinely
   differ per OS and must be verified on the Android build:
   - **Build / install / signing** — AAB install, `versionCode`, package
     `ca.zerotohero.go` (same identifier as iOS).
   - **Native modules** — SQLite, SecureStore, expo-video, expo-speech,
     expo-sharing (share sheet), TTS voices/rate.
   - **OS UI** — Android back button, permission dialogs, keyboard, status
     bar/notch, safe areas.
   - **Deep links** — Android App Links / intents vs the iOS
     `languageplayer://` URL scheme.
   - **Payments** — Stripe / WeChat / Alipay / PayPal web views; Play Billing
     is **N/A** (not implemented — SPEC-014).
   - **Tablet layout** — Android tablets, if targeted (iPad layout parity is
     tracked separately in [SPEC-052](052-mobile-large-screen-ipad-layout-parity-with-web.md);
     the 1.2 checklist no longer has a separate iPad row).
   - **Offline / network** — airplane-mode behavior and storage paths.
3. For everything else on Android, do a **light smoke pass** (launch, login,
   one screen per tab) to confirm no platform-specific crash.

Android QA can only be completed once an Android build exists (§ 4) — it runs
after the first AAB is built.

### 1.4 Simulator vs real device — concrete steps

**The local Flask flag.** `EXPO_PUBLIC_API_URL` selects which Flask server the
app talks to. It is read at **bundle time** in `lib/api-url.ts`, so set it
**before** starting Metro / building; changing it later requires restarting the
dev server (or rebuilding). Dev builds default to the right local URL
automatically via `__DEV__`, but set it explicitly whenever you need control
(release builds, LAN IP, staging).

**Local Flask server** — start it on the Mac first (per AGENTS.md this is the
developer's job, not the agent's):

```bash
cd zerotohero-python-server && python3.10 app.py   # serves http://127.0.0.1:5001
```

#### iOS Simulator
The simulator shares the Mac's network stack, so `localhost:5001` reaches the
Mac's Flask server directly.

```bash
# Dev (Expo Go / dev build) — __DEV__ already defaults to localhost:5001
cd apps/mobile && npx expo start --ios

# Release build on the simulator (matches the shipped binary)
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:5001 npx expo run:ios --configuration Release

# …or install the built archive directly:
# xcrun simctl install booted ~/Desktop/LanguagePlayer.xcarchive/Products/Applications/LanguagePlayer.app
```

#### Real device (iOS or Android)
A physical device cannot reach your Mac's `localhost` — point it at your Mac's
**LAN IP**:

```bash
ipconfig getifaddr en0        # macOS: your LAN IP, e.g. 192.168.1.130
cd apps/mobile && EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:5001 npx expo start
# then scan the QR with Expo Go, or install the dev/release build on the device
```

- Phone and Mac must be on the **same Wi-Fi**, and the Flask server must accept
  LAN connections (if a device can't connect, it may be bound to `127.0.0.1`
  only — verify with `curl http://<mac-lan-ip>:5001/`).
- On-device checks that need this setup: audio (TTS), offline (airplane mode),
  payments (Stripe/IAP web views), permissions — the `Device` rows in § 1.2.

#### Android emulator
The Android emulator reaches the host via `10.0.2.2` (already the `__DEV__`
default in `lib/api-url.ts`):

```bash
cd apps/mobile && EXPO_PUBLIC_API_URL=http://10.0.2.2:5001 npx expo start --android
```

> **Never ship a build pointing at `localhost` or a LAN IP.** Release builds
> must use `https://pythonvps.zerotohero.ca` — see § 2 (and the
> [Problems encountered](#problems-encountered) section for the stale-bundle
> trap that produced a `localhost:5001` release).

### 1.5 The four iOS run/build modes & conflicts

| # | Mode | Command | API URL | Native build? |
|---|---|---|---|---|
| 1 | Simulator · Metro + Expo Go | `npx expo start --ios` | `localhost:5001` (dev default) | ❌ |
| 2 | Simulator · built app | `npx expo run:ios` · `npx expo run:ios --configuration Release` | `localhost:5001` (dev default) | ✅ |
| 3 | Real device · built app | `npx expo run:ios --device`, Expo Go via LAN IP, or TestFlight / Ad Hoc from a § 3 archive | `http://<mac-lan-ip>:5001` (dev) / prod | ✅ |
| 4 | App Store · archive | `xcodebuild … archive` (see § 3) | `https://pythonvps.zerotohero.ca` (explicit) | ✅ |

**Conflicts:**
- **One Metro at a time** (port 8081) — modes 1 and dev-mode 2 both start
  Metro; kill first with `kill $(lsof -ti:8081)`.
- **One native build at a time** — modes 2 and 4 share DerivedData +
  `ios/Pods`; never run an archive while `expo run:ios` is compiling.
- **Env-var scoping** — dev modes default to localhost via `__DEV__`; the
  archive MUST set `EXPO_PUBLIC_API_URL` explicitly and keep it scoped to that
  command (a leaked prod URL makes dev hit production).
- Simulator vs real device are independent; Expo Go (`host.exp.Exponent`) and a
  dev build (`ca.zerotohero.go`) can coexist installed, but only one is
  frontmost.
- The iOS bundle ID is `ca.zerotohero.go` — real-device dev builds and archives
  need provisioning for that ID (not `ca.zerotohero.app`).

**Troubleshooting — `expo start` crashes with `Cannot find module 'expo-router/_ctx-shared'`:**
The root `@expo/cli` / `@expo/router-server` (typed-routes generation, enabled
via `experiments.typedRoutes`) must resolve `expo-router` from the **root**
`node_modules`. Keep `expo-router` in the ROOT `package.json`
`devDependencies` so it stays hoisted; if it ever gets nested back under
`apps/mobile/node_modules` (e.g., after a lockfile regeneration), mode 1 fails
at startup. Note: the archive build does **not** cause this — it is purely a
dependency-hoisting condition.

### 1.6 Failure handling

- Any **blocking** failure (crash, broken login, wrong API host, corrupt data)
  stops the release — fix, rebuild, re-verify.
- Non-blocking cosmetic issues may ship but must be logged for the next release.



## 2. Release build — common to both stores

### Production API URL — REQUIRED, not optional

Set `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` **explicitly** on the
build command for **both** the iOS archive and the Android AAB. Do **not** rely
on `.env.production.local` — it is not reliably applied during native builds
(see [Problem #2](#2-stale-bundle-embedded-localhost5001)). `lib/api-url.ts`
already defaults Release builds to production via `__DEV__`, but the explicit
env var is the source of truth.

### Version bump

- `apps/mobile/app.json` → `expo.version` (user-facing version) plus
  `ios.buildNumber` and `android.versionCode` (monotonic per store).

## 3. Apple App Store (iOS)

> **Strategy:** this app **replaces the GO Legacy listing** and is renamed
> "Language Player 3"; the Classic app stays live as "Language Player 2". The
> build uses the GO bundle ID **`ca.zerotohero.go`** (set in
> `apps/mobile/app.json` `ios.bundleIdentifier` and the native project) because
> a listing's bundle ID cannot change — see
> [Store strategy](#store-strategy-2026-08-06) for the full reasoning.

### 3.1 Build the Release archive

Run from `apps/mobile/`:

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile

rm -rf ~/Desktop/LanguagePlayer.xcarchive

EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  xcodebuild \
    -workspace ios/LanguagePlayer.xcworkspace \
    -scheme LanguagePlayer \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -allowProvisioningUpdates \
    -archivePath ~/Desktop/LanguagePlayer.xcarchive \
    archive -jobs 4 2>&1 | tee /tmp/lp-archive.log
```

- `-jobs 4` is fine once the module cache is **warm**. On a **cold** DerivedData
  it can hit the RNSVG race — see
  [Problem #1](#1-rnsvg-rnsvgforeignobjectmanagermm-compile-failure-under--jobs-4-transient).
  When in doubt, `-jobs 1` is guaranteed correct (just slower).
- The archive lands at `~/Desktop/LanguagePlayer.xcarchive`.

### 3.2 Verify the archive + embedded bundle

```bash
ARCHIVE=~/Desktop/LanguagePlayer.xcarchive
plutil -p "$ARCHIVE/Info.plist"   # CreationDate, CFBundleShortVersionString, CFBundleVersion, SigningIdentity
ls -la "$ARCHIVE/Products/Applications/LanguagePlayer.app"

BUNDLE="$ARCHIVE/Products/Applications/LanguagePlayer.app/main.jsbundle"
grep -c 'pythonvps.zerotohero.ca' "$BUNDLE"   # expect ≥ 1
grep -c 'localhost:5001'          "$BUNDLE"   # expect 0
grep -c '127.0.0.1:5001'          "$BUNDLE"   # expect 0
```

The bundle is Hermes bytecode, but URL strings are plain text in the string
table, so `grep` works. If `localhost:5001` appears, the bundle is stale/wrong
— see [Problem #2](#2-stale-bundle-embedded-localhost5001).

### 3.3 Upload to App Store Connect

- **Xcode Organizer (recommended):** `open -a Xcode` → **Window → Organizer** →
  select the `LanguagePlayer` archive → **Distribute App** → **App Store
  Connect** (re-signs with the Distribution certificate during export).
- **CLI:** `xcrun notarytool submit <archive> --wait` (or legacy
  `xcrun altool --upload-app`), or drag into **Transporter**.

> **Signing note:** the raw archive is signed with the **Apple Development**
> identity + automatic provisioning (project uses `-allowProvisioningUpdates`).
> For a real submission, export with the **Apple Distribution** certificate —
> either via the project's signing settings or Xcode Organizer's Distribute
> wizard. Because this build replaces the **GO** listing, the Distribution
> profile must be for **`ca.zerotohero.go`** (the new app's production bundle
> ID), not `ca.zerotohero.app`. Confirm the build appears in App Store Connect
> under the GO app record after upload (processing takes a few minutes).

### 3.4 App Store Connect setup

- App name, subtitle, description, keywords, category, and **screenshots**
  (6.7" iPhone + iPad) + app icon.
- **App Privacy / Data Safety** answers (accounts, usage, purchases, etc.).
- **TestFlight** build for beta testers before submitting for review.
- Submit for review with **review notes**: demo account, sample video IDs,
  and a note that the app hits a real backend.

## 4. Google Play Store (Android)

### 4.1 Register a new Play Developer account

The previous Play account was **deleted after failing to renew business info**
([ADR-0013](0013-app-store-strategy.md)), so Android distribution starts from
scratch:

1. Go to [play.google.com/console](https://play.google.com/console) →
   **Create account**.
2. Choose account type:
   - **Organization** — requires business details + a **DUNS number**.
   - **Personal** — requires your name + ID; usually faster for a solo/small
     operation.
3. Provide the **developer name** (shown on the Play listing) and a **contact
   email**.
4. Accept the **Google Play Developer Distribution Agreement**.
5. Pay the **one-time US$25 registration fee**.
6. Complete **verification** (email / phone / ID) — and **keep the business /
   developer info current** thereafter. This is the step that was neglected
   before and cost the original account.

> ⚠️ Play Console's UI and requirements change; verify exact steps and pricing
> at execution time. The one-time $25 fee and the "keep business info current"
> requirement are stable facts (see SPEC-014).

### 4.2 Build the Android release (AAB)

No `android/` native dir or `eas.json` exists in `apps/mobile/` yet — generate
the native project once, then build:

```bash
cd /Users/longjiang/Projects/language-player/apps/mobile

EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca \
  npx expo prebuild --platform android

cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

- **AAB** (Android App Bundle) is required by Play — Google derives per-device
  APKs from it. (EAS Build is a possible alternative later; the CLI route
  matches the project's manual build style.)
- **Signing:** generate an **upload key** (`keytool`), and enroll in **Play App
  Signing** — Google holds the app-signing key; you keep the upload key.

### 4.3 Play Console — publish

1. **Create app** — name, default language, app-or-game, free/paid, category.
2. **App content** — data safety form, ads declaration, **content rating**
   (IARC questionnaire), target audience, privacy policy URL, government-app
   declaration.
3. **Release management** — upload the `.aab` and roll through tracks:
   **Internal testing** → **Closed testing** (opt-in testers) → **Open
   testing** → **Production**.
4. **Store listing** — short & full description, screenshots (phone + tablet),
   feature graphic, icon, promo text, contact details.
5. **Rollout** — use a staged rollout (e.g., 10% → 100%) for Production.

### 4.4 Caveats for the first Android release

- **Google Play Billing is not implemented** (SPEC-014) — Android IAP is
  blocked until the new Play account and billing setup exist. Launch with
  free-tier features + web-based payments; add Play Billing later.
- The GO listing's `pro_go` lifetime product exists as **iOS IAP only**
  today, and the new app uses it (Classic's `pro` belongs to
  `ca.zerotohero.app`). Pro grants are backend-driven — an Android user who
  purchased via iOS still gets Pro through the shared subscription grant.

## 5. Post-release

- Watch store crash reports (App Store Connect / Xcode Organizer; Play Console
  → Android Vitals).
- Keep TestFlight and Play testing tracks fresh for the next build.
- **iOS rollback:** upload a previous build or use App Store Connect's release
  controls. **Android rollback:** pause the staged rollout or unpublish the
  version.

## Problems encountered

Two real failures were hit on 2026-08-06 while producing the first App
Store–ready archive. Both are documented so they are not re-diagnosed from
scratch.

### 1. RNSVG `RNSVGForeignObjectManager.mm` compile failure under `-jobs 4` (transient)

**Symptom:** on a **cold** DerivedData, `xcodebuild archive -jobs 4` failed with:

```
error: .../react-native-svg/apple/ViewManagers/RNSVGForeignObjectManager.mm
CompileC .../RNSVGForeignObjectManager.o ... (in target 'RNSVG' from project 'Pods')
** ARCHIVE FAILED **
```

**Diagnosis:** not a code bug. Re-running the *exact* clang command for that
single file (extracted from the build's `*-common-args.resp` in DerivedData)
compiled successfully in isolation. The failure is a **parallel-build race**:
with `-fmodules` and a cold module cache, concurrent clang processes contend
writing `ModuleCache.noindex`, producing spurious "file not found" / "unknown
type" errors in random pods (RNSVG here).

**Workarounds (pick one):**
- `-jobs 1` — fully serial, guaranteed to pass (slow: a full rebuild can take
  1–2+ h on an M2).
- Rebuild with `-jobs 4` after the module cache is warm — the race does not
  reappear on incremental/warm-cache builds.

**Do not** edit `react-native-svg` source or bump its version to "fix" this.

### 2. Stale bundle embedded `localhost:5001` (production URL not baked in)

**Symptom:** the first `-jobs 1` archive built without an explicit env var
produced a `.app` whose `main.jsbundle` contained `localhost:5001` and **zero**
occurrences of `pythonvps.zerotohero.ca` — even though
`apps/mobile/.env.production.local` existed with the correct value.

**Diagnosis:** the `.env.production.local` fallback is **not reliably applied**
during `xcodebuild archive` (the bundle phase can reuse a stale/cached bundle or
not load the env file depending on how the build is invoked). The archive
silently shipped the localhost dev URL — exactly what must never reach the
stores.

**Fix (must be done every release):**
1. Set `EXPO_PUBLIC_API_URL` **explicitly** in the build command (above).
2. If re-archiving over a previous build, **delete the stale bundle** in
   DerivedData so the bundle phase is forced to re-run:

   ```bash
   DD=~/Library/Developer/Xcode/DerivedData/LanguagePlayer-*/Build/Intermediates.noindex/ArchiveIntermediates/LanguagePlayer/BuildProductsPath/Release-iphoneos
   rm -f "$DD"/main.jsbundle "$DD"/main.jsbundle.meta
   ```

3. **Always** verify the final bundle with the greps in
   [§ 3.2](#32-verify-the-archive--embedded-bundle) before uploading.

### 3. `.env.production.local` is not a reliable source of truth

The file exists and `@expo/env` *does* load it in a clean `export:embed`
production run (verified: `NODE_ENV=production` → loads `.env.production.local`
→ `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`). But because the
`xcodebuild` bundle phase can hit a stale bundle path, the file must be treated
as a **defense-in-depth fallback, never the primary mechanism**. The explicit
command-line env var is the source of truth for release builds.

## Release checklist (dual-store)

- [ ] `app.json` version bumped (`expo.version` + `ios.buildNumber` + `android.versionCode`)
- [ ] Human QA checklist (§ 1.2) passed on the release build
- [ ] Build command includes `EXPO_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`
- [ ] Stale bundle removed; bundle verified (`pythonvps` ≥ 1, `localhost:5001` = 0)
- [ ] **iOS:** archive verified → uploaded → App Store Connect build appears → submitted
- [ ] **Android:** Play account verified → `.aab` built & signed → Internal → … → Production
- [ ] Store listings complete (screenshots, privacy policy, data safety, content rating)

## Related docs

- [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) — why releases use human QA, not Maestro
- [ADR-0013 — App Store Strategy & Product Naming](../adr/0013-app-store-strategy.md) — *which* app/listing, bundle ID, IAP, Play gap
- [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) — deferred; source of the human QA checklist
- [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md) — IAP + Play Billing caveats
- [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) — detailed payment checklist
- [AGENTS.md](../../AGENTS.md) — dev-server conventions, Node 22 requirement, "never run builds un-prompted"
