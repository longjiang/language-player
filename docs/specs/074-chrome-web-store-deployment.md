# SPEC-074 — Chrome Web Store Deployment

## Metadata
- **Spec ID**: SPEC-074
- **Feature**: Publish the Language Player Chrome extension to the Chrome Web Store
- **Status**: in-progress
- **Created**: 2026-08-12
- **ROADMAP Phase**: Chrome Extension

## Overview

Publish `apps/chrome-extension/` (Language Player — interactive dual subtitles for language learning on streaming sites) to the Chrome Web Store. This spec captures the exact store requirements, listing copy, packaging steps, and the upload flow so the extension can be published and then updated repeatably.

## Extension Snapshot (2026-08-12)

| Item | Value |
|---|---|
| Name | Language Player |
| Manifest | MV3, version `1.0.77` |
| Locales | 18 (`_locales/`) |
| Streaming sites | Netflix, YouTube, Prime Video, Disney+, Hulu, Max |
| Target languages | 110 (CONTENT_L2S) |
| Backend | `https://pythonvps.zerotohero.ca` |
| Privacy policy | `https://language-player.netlify.app/en/en/docs/privacy-policy` |

## Store Listing Requirements (Chrome Web Store)

### Graphic assets

| Asset | Size | Required | Status |
|---|---|---|---|
| Extension icon (in ZIP) | 128×128 PNG (artwork 96×96 + 16px transparent padding) | ✅ | ✅ `icons/icon128.png` (RGBA) |
| Screenshots | 1280×800 or 640×400, full bleed, no padding | ✅ ≥1 (max 5) | ❌ **TODO** |
| Small promo tile | 440×280 PNG/JPEG | ✅ | ❌ **TODO** |
| Marquee promo tile | 1400×560 PNG/JPEG | optional | ❌ optional |
| Promo video | YouTube URL | recommended | ❌ optional |

### Text fields

| Field | Limit | Copy |
|---|---|---|
| Name | 75 chars | Language Player |
| Summary | 132 chars | Interactive dual subtitles for language learning on Netflix, YouTube, Prime Video, Disney+, Hulu, and Max. (132 chars) |
| Detailed description | 16,000 chars | See [Description](#description) below |
| Category | — | Education |
| Language | — | English (en) |
| Homepage URL | — | `https://languageplayer.io` |
| Support URL | — | `https://language-player.netlify.app/en/en/docs` (or contact) |

### Description (draft)

```
Language Player turns the subtitles of the shows you already watch into an
interactive language lesson.

Click any word in the transcript to see its meaning, save it to your
vocabulary list, and get an AI explanation of how it's used in context.

Works on:
• Netflix
• YouTube
• Prime Video
• Disney+
• Hulu
• Max

Features:
• Interactive, time-synced transcript panel for the video you're watching
• Tap any word for an instant dictionary definition
• Save words to your Language Player account and review them later
• AI explanations of words in context (Pro)
• Supports 110 target languages
• 18 interface languages
• Works with your free or Pro Language Player account

Learn a language with the shows you already love.
```

### Permissions & justification (from manifest)

| Permission | Why |
|---|---|
| `host_permissions: http://*/*, https://*/*` | Intercept subtitle files and inject the transcript panel on the six supported streaming sites |
| `webRequest` | Capture subtitle network requests on streaming sites |
| `downloads` | Download transcript/subtitle exports |
| `storage` | Persist language preferences and session (`chrome.storage`) |
| `scripting` | Inject the content script and Netflix MAIN-world hook |

## Data collection (Privacy tab — must certify)

The extension:
1. **Authenticates users** via the Flask API (email/password → Supabase JWT stored in `chrome.storage.local`).
2. **Sends subtitle text** to the backend for tokenization/dictionary/translation (and to AI providers when the user uses those features).
3. **Reads the current video page's subtitles only** — does not collect browsing history or other pages.
4. **Stores locally**: language prefs, settings, session (chrome.storage.local/sync).

Privacy policy updated 2026-08-12 (`packages/docs/content/privacy-policy.md`) with a **Browser extension data** section covering the above. Regenerated in all 18 locales.

Privacy practices form answers:
- Does this comply with the Single Purpose policy? → Yes
- Uses privacy policy? → Yes → `https://language-player.netlify.app/en/en/docs/privacy-policy`
- Data usage: **User authentication** (email/password), **User-provided content** (subtitle text), **Website content** (reads current page subtitles). Not sold, not for ads, not for personalization/analytics beyond the product.

## Packaging

```bash
# Build (must be run after any src/ change — auto-bumps patch version)
node apps/chrome-extension/build.mjs

# Create upload ZIP (manifest.json must be at ZIP root)
VERSION=$(node -p "require('./apps/chrome-extension/manifest.json').version")
rm -rf /tmp/lp-ext-pkg && mkdir -p /tmp/lp-ext-pkg
cp -R apps/chrome-extension/{manifest.json,src,dist,_locales,icons} /tmp/lp-ext-pkg/
cd /tmp/lp-ext-pkg && rm -rf src/content.js   # legacy dead file
zip -r -X /tmp/language-player-extension-v$VERSION.zip . -x "*.DS_Store"
```

**ZIP contents**: `manifest.json`, `src/`, `dist/` (content.js, content.css, netflix-main-world.js, lang-names.json, popup-options.js), `_locales/` (18), `icons/`.

Built ZIP: `/tmp/language-player-extension-v1.0.77.zip` (373 KB, 2026-08-12).

## Upload Flow

1. Go to `https://chrome.google.com/webstore/devconsole` (Chrome Web Store Developer Dashboard).
2. Register developer account if not already registered ($5 one-time fee, developer@zerotohero.ca account).
3. **Add new item** → upload the ZIP.
4. Fill the Store listing tab (name, summary, description, category=Education, language=en).
5. Upload graphic assets: ≥1 screenshot, 440×280 small promo tile.
6. Fill the Privacy practices tab (certify data usage, privacy policy URL).
7. Set distribution (public by default).
8. Submit for review.

### ✅ Completed 2026-08-13 (user signed in via passkey)

- Sign-in to `https://chrome.google.com/webstore/devconsole` done (longjiang2005@gmail.com).
- Publisher account already existed: **longjiang2005**, Publisher ID `650ad6b1-a9d4-43b6-9ff5-a8ae11ada6ad`, member `龙江 (longjiang2005@gmail.com)` Admin since 2015.
- **Contact email added + verified**: `jon.long@zerotohero.ca` (publicly displayed).
- **Trader declaration**: selected "This is a trader account" + agreed to marketplace rules (the checkbox is required — Next stays disabled until both are set).

### ✅ Publisher settings gate COMPLETED 2026-08-13 (with user)

- Trader declaration = **trader account** + marketplace-rules checkbox (both required).
- Address on file: **Zero to Hero Education, 2955 Atlantic Ave, Unit 602, Coquitlam, BC V3B 0H9, CA** (pre-existing).
- Payments profile selected: **Jiang Long** (Individual, 2955 Atlantic Ave #602, Coquitlam, BC V3B 0H9 — same profile used by Google Play Apps / Chrome Web Store).
- Identity verification flow entered; user uploading ID (Driver's License front/back) + proof-of-address. Earlier upload attempt showed "Couldn't verify identity — make sure your ID document shows your full name as Jiang Long" → likely name-mismatch; re-upload or update payments-profile verified name as needed.

### ✅ Extension ZIP uploaded + draft created 2026-08-13

- Item ID: **`cbkhenammkocfidciagbbibkleoenbej`**, status **Draft**, name "Language Player".
- Store listing partially filled + saved:
  - Title: Language Player (from manifest) · Summary (from manifest): "Interactive dual subtitles for language learning on Prime Video, YouTube, Netflix, Disney+, Hulu, and Max."
  - **Description** (723/16,000): full copy from this spec ✅
  - **Category: Education** ✅
  - **Homepage URL**: https://languageplayer.io ✅
  - **Support URL**: https://language-player.netlify.app/en/en/docs ✅
  - **Store icon** 128×128 uploaded (apps/chrome-extension/icons/icon128.png) ✅

### Remaining (2026-08-13)
- [ ] **Identity verification completion (MANUAL, user)** — re-upload ID (name must read "Jiang Long") + proof of address; may need to "change the verified name" in the payments profile if the ID name differs.
- [ ] **Screenshots** (≥1, max 5; 1280×800 or 640×400, JPEG or 24-bit PNG no-alpha) — none exist; capture the extension UI in action (transcript panel on a streaming show, dictionary popup on word click, popup UI).
- [ ] **Small promo tile 440×280** (JPEG/PNG no-alpha) — recommended.
- [ ] **Privacy tab** (Privacy practices) — certify data usage + privacy policy URL.
- [ ] **Submit for review** (button enabled once required fields are done).

## Update Process (future versions)

1. Edit `apps/chrome-extension/src/` → run `node apps/chrome-extension/build.mjs` (auto-bumps patch version in `manifest.json`).
2. Rebuild the ZIP (see [Packaging](#packaging)).
3. Developer Dashboard → the item → **Package** → upload new ZIP → submit.
4. Note: `content.css`, `popup.html`, `popup.css`, `_locales/`, `icons/` are NOT bundled — they're loaded directly, so changes to those only need a new ZIP + resubmit (no build step).

## Open Questions
- [ ] Do we want a promo video (YouTube) for the listing?
- [ ] Marquee tile (1400×560) — only needed if seeking featured placement.
- [ ] Which email registers the developer account (jon.long@zerotohero.ca?) and is the $5 fee accepted?
