# SPEC-069: Web → Mobile Universal Links & App Links

## Metadata

- **Spec ID**: SPEC-069
- **Feature**: Let website links (`https://languageplayer.io/...`) open the same resource in the iOS/Android app via Universal Links (iOS) and App Links (Android)
- **Status**: draft
- **Created**: 2026-08-12
- **See also**: [ADR-0010 — Fresh-Start Mobile Architecture](../adr/0010-port-web-to-mobile-fresh-start.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-068 — Google Play Billing Implementation](068-google-play-billing-implementation.md) · [SPEC-067 — Google Play Release Runbook](067-google-play-release-runbook.md)

## 1. Goal

Tapping a website URL on a phone opens the **same resource in the mobile
app** instead of the browser — for example:

- `https://languageplayer.io/en/ja/watch/-tKVN2mAKRI` → video player in the app
- `https://languageplayer.io/en/ja/dictionary/entry/edict/92130` → word detail
- `https://languageplayer.io/en/ja/settings/display` → Display settings

The web URL stays exactly as-is in the browser address bar; the app translates
it internally. This works on iOS (Universal Links) and Android (App Links).

## 2. Why mobile URLs differ from web URLs (and why that's OK)

Web URLs encode the language pair as path segments because the web app is
server-rendered and each `/[l1]/[l2]/...` route is a distinct, shareable URL.
The mobile app stores L1/L2 in React Context persisted to SecureStore, so its
internal routes have no `[l1]/[l2]` prefix (ADR-0010). Route-group folders like
`(tabs)`, `(media)`, and `(vocab)` are also stripped from Expo Router URLs.

The user does not need to see the internal route. Universal Links/App Links
let the **external URL** be the exact web URL while the app maps it to its
internal route — the mapping is invisible.

## 3. Decision

- **Keep the mobile internal routes as-is** (`/watch/[videoId]`,
  `/word/[entryId]`, etc.). Do not restructure the app into
  `[l1]/[l2]/...` for this feature.
- **Accept the exact web URL** (`https://languageplayer.io/en/ja/watch/...`)
  on both platforms and translate it in the app with a small mapping module.
- Support the production domain **`languageplayer.io`**. The Netlify default
  subdomain (`language-player.netlify.app`) is optional and must be confirmed
  before adding it to the app config.

### Alternative considered — full route mirroring

It is technically possible to make the mobile internal routes identical to
the web (`app/[l1]/[l2]/watch/[videoId].tsx` → `languageplayer://en/ja/watch/...`).
This is **not** a React Native limitation — ADR-0010 chose the current shape
deliberately: mobile treats L1/L2 as persisted user state rather than URL
state, and route groups like `(tabs)` are organizational only.

Full mirroring would require:

- Restructuring the route tree under `[l1]/[l2]/...`
- Updating every `router.push` / `Link` to carry the language pair
- Making the tab layout and language switcher URL-driven
- Handling onboarding for deep links that arrive before a language is chosen

It provides no user-visible benefit over the mapping approach, because
Universal Links already present the exact web URL. Revisit only if the app
adopts URL-driven language state for other reasons.

## 4. URL mapping table (web → mobile)

The mapper strips `[l1]/[l2]`, converts the L2 into `?l2=...`, and maps the
web path to the mobile route:

| Web path | Mobile deep link |
|---|---|
| `/en/ja/watch/[videoId]` | `languageplayer://watch/[videoId]?l2=ja` |
| `/en/ja/channel/[channelId]` | `languageplayer://channel/[channelId]?l2=ja` |
| `/en/ja/dictionary/entry/[dictId]/[entryId]` | `languageplayer://word/[entryId]?l2=ja` (commas → `~`) |
| `/en/ja/dictionary/word/[word]` | `languageplayer://word?query=[word]&l2=ja` (new: dictionary search query param) |
| `/en/ja/dictionary` | `languageplayer://word?l2=ja` (dictionary tab) |
| `/en/ja/explore` | `languageplayer://explore?l2=ja` |
| `/en/ja/search` | `languageplayer://search?l2=ja` |
| `/en/ja/music` | `languageplayer://music?l2=ja` |
| `/en/ja/live-tv` | `languageplayer://live-tv?l2=ja` |
| `/en/ja/tv-shows` / `/tv-shows/[id]` | `languageplayer://tv-shows?l2=ja` / `tv-shows/[id]?l2=ja` |
| `/en/ja/local-media` | `languageplayer://local-media?l2=ja` |
| `/en/ja/watch-history` | `languageplayer://watch-history?l2=ja` |
| `/en/ja/liked-videos` | `languageplayer://liked-videos?l2=ja` |
| `/en/ja/playlists` / `/playlists/[id]` | `languageplayer://playlists?l2=ja` / `playlists/[id]?l2=ja` |
| `/en/ja/saved-words` | `languageplayer://saved-words?l2=ja` |
| `/en/ja/review` | `languageplayer://review?l2=ja` |
| `/en/ja/reader` | `languageplayer://reader?l2=ja` |
| `/en/ja/epub` | `languageplayer://epub?l2=ja` |
| `/en/ja/web-reader` | `languageplayer://web-reader?l2=ja` |
| `/en/ja/go-pro` | `languageplayer://go-pro?l2=ja` |
| `/en/ja/profile` | `languageplayer://profile?l2=ja` |
| `/en/ja/settings/...` | `languageplayer://settings/...?l2=ja` |
| `/en/ja/tokenizer` | `languageplayer://tokenizer-test?l2=ja` |
| `/en/ja/docs/[...slug]` | `languageplayer://docs?path=[slug]&l2=ja` (confirm mobile docs route param) |
| `/login`, `/register`, `/forgot-password`, `/password-reset`, `/verify-email` | same path, no `l2` |

## 5. Implementation steps

### 5.1 Serve verification files from the website

The files are committed under `apps/web/public/.well-known/` with placeholders
(`TEAM_ID_PLACEHOLDER`, `CHANGE_ME_APP_SIGNING_SHA256`) — replace the values
before deploying.

Add to `apps/web/public/.well-known/`:

- **`apple-app-site-association`** (iOS):
  ```json
  {
    "applinks": {
      "apps": [],
      "details": [{
        "appIDs": ["<TEAM_ID>.ca.zerotohero.go"],
        "components": [{ "/": "*" }]
      }]
    }
  }
  ```
  Replace `<TEAM_ID>` with the Apple Developer team ID (visible in
  App Store Connect / Apple Developer).

- **`assetlinks.json`** (Android):
  ```json
  [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "ca.zerotohero.go",
      "sha256_cert_fingerprints": ["<APP_SIGNING_SHA256>"]
    }
  }]
  ```
  The fingerprint is the **app signing key** shown in Play Console →
  App signing (not necessarily the upload key).

Netlify serves `apps/web/public` automatically, so these files go live with
the next web deploy. Confirm `https://languageplayer.io/.well-known/...`
returns both files with correct content types.

### 5.2 Mobile native config (`apps/mobile/app.json`)

```json
"ios": {
  "bundleIdentifier": "ca.zerotohero.go",
  "associatedDomains": ["applinks:languageplayer.io"]
},
"android": {
  "package": "ca.zerotohero.go",
  "intentFilters": [{
    "action": "VIEW",
    "autoVerify": true,
    "data": [{ "scheme": "https", "host": "languageplayer.io", "pathPrefix": "/" }],
    "category": ["BROWSABLE", "DEFAULT"]
  }]
}
```

Then regenerate native projects:

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=<target> npx expo prebuild --platform ios --no-install
EXPO_PUBLIC_API_URL=<target> npx expo prebuild --platform android --no-install
```

> This re-applies to the existing iOS dev build and Android dev build; both
> must be rebuilt after the config change (SPEC-064 for iOS, SPEC-068 Step 4/5
> for Android).

### 5.3 Web URL → mobile route mapper

Create `apps/mobile/lib/web-url-mapper.ts`:

- Parse `https://languageplayer.io/{l1}/{l2}/{path}`.
- Drop `l1`, convert `l2` to `?l2=...`.
- Map the remaining path using § 4.
- Handle `dictionary/entry/{dictId}/{entryId}` → `word/{entryId}` (replace
  commas with `~` for CEDICT-style IDs).
- Return `null` for unknown paths (let the browser handle them).

Wire it in `apps/mobile/app/_layout.tsx`:

- `Linking.getInitialURL()` for cold starts.
- `Linking.addEventListener('url', ...)` for warm starts.
- If L1/L2 are not set yet, store the mapped URL and resume after onboarding
  (ADR-0010 behavior).

### 5.4 Dictionary word search query param

The web `/dictionary/word/[word]` route searches by word text. Mobile has no
URL param for that yet, so add a `query` param to the dictionary tab
(`apps/mobile/app/(tabs)/(vocab)/index.tsx`) that seeds `doSearch(query)` on
mount, then map web word-search links to
`languageplayer://word?query=...&l2=ja`.

### 5.5 Confirm mobile docs route param

The mobile docs screen (`apps/mobile/app/(tabs)/(me)/docs.tsx`) needs to accept
a `path` param (or the web docs URLs should open the docs home). Confirm the
current implementation and add the param if missing.

## 6. Testing

### iOS (dev build)

```bash
xcrun simctl openurl booted "https://languageplayer.io/en/ja/watch/-tKVN2mAKRI"
```

Or tap the link on the device in Safari/Notes. Verify:

- Cold start and warm start both open the video.
- First launch without L1/L2 stored → onboarding → resumes to the video.
- Browser no longer opens when the app is installed.

### Android (dev build)

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "https://languageplayer.io/en/ja/watch/-tKVN2mAKRI"
```

Verify App Links verification:

```bash
adb shell pm verify-app-links --re-verify ca.zerotohero.go
adb shell dumpsys package domain-preferred-apps
```

### Regression

- Custom scheme deep links (`languageplayer://...`) keep working.
- Web links still open in the browser on desktop.
- The Go Pro / payment screens and auth screens open correctly when linked.

## 7. Release checklist

- [ ] `.well-known/apple-app-site-association` live on `languageplayer.io`
- [ ] `.well-known/assetlinks.json` live with the correct SHA-256
- [ ] `ios.associatedDomains` + `android.intentFilters` in `app.json`
- [ ] Native projects regenerated and dev builds rebuilt
- [ ] `web-url-mapper.ts` covers § 4 table
- [ ] Dictionary search + docs path params implemented
- [ ] iOS Universal Link verified on device
- [ ] Android App Link verified (`verify-app-links` shows success)

## 8. Open items / decisions

- Confirm the production domain (`languageplayer.io`) is configured in Netlify
  and serves the `.well-known` files.
- Obtain the Android app-signing SHA-256 fingerprint from Play Console.
- Decide whether to also support `language-player.netlify.app` (and any beta
  domains) in the intent filters/associated domains.
- Confirm the mobile docs screen param behavior.
- Confirm the exact web URL for the dictionary word search route.
