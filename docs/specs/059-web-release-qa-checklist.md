# SPEC-059: Web Release QA — Human Testing Checklist for `apps/web`

## Metadata

- **Spec ID**: SPEC-059
- **Feature**: Pre-release (informal, human) testing of `apps/web/` (Next.js)
- **Status**: draft
- **Created**: 2026-08-09
- **Scope**: `apps/web` only. The mobile counterpart is [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md).
- **Related**: [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) · [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) (deferred; source catalog) · [SPEC-025 — Payment E2E Testing (archived)](archive/025-payment-e2e-testing.md) · [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) · [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md) · [SPEC-030 — Radix UI Migration](030-radix-ui-migration.md)

## Overview

The web app is the production Next.js client. It shares product flows with
the mobile app (auth, media, dictionary & vocab, SRS review, reading,
settings, payments) but is a browser app: different rendering, different
layouts, YouTube/HTML5/HLS playback, and a Netlify deploy path.

Per **ADR-0027**, automated browser E2E is deferred. Web releases are gated by
a **human-executed QA checklist**, exactly like SPEC-048 does for mobile.
This spec is that checklist, derived from the same SPEC-023 Tier 0–9 catalog
and adjusted for the web surface area: header nav, responsive layouts,
multi-browser behavior, i18n, and URL sharing.

## 1. Testing strategy — informal, checklist-based human QA

No CI, no test runner. A reviewer runs the checklist against the target
deployment and ticks boxes, keeping notes in brackets.

### 1.1 How to run

- **Feature QA**: run against the local dev server (`next dev`, port 3000)
  with the local Flask backend (see § 1.4).
- **Release QA**: run the full checklist against the **exact build you intend
  to ship** — the deployed Netlify URL (or a `next start` production build
  that the user has built; per AGENTS.md, never run builds yourself).
- **Browsers**: Chrome is the primary browser — run the full checklist there.
  Safari and Firefox get the targeted subset in § 1.3. Use DevTools mobile
  viewport for the responsive rows, plus a real phone spot pass when possible.
- **Accounts**: use the Mary/Bob test credentials from AGENTS.md for login
  and data-dependent flows. Use a fresh disposable email for registration
  flows, and an account known to have **Pro** access for Pro-gated checks
  (AI Explain, subscription screens, payment success).
- **Backend**: the Flask server is the developer's responsibility to start,
  stop, or restart. Query its endpoints freely, never manage the process.

### 1.2 Pre-release QA checklist

Checklists are grouped by product flow (smoke/auth → language → media →
dictionary & vocab → review → reading → settings/docs → payments → web
platform). All rows start unchecked (`⬜`); tick them as you verify. Tester
comments go in brackets.

#### S. Smoke  **· SPEC-023 ref:** Tier 0 · **Run on:** Chrome

- ⬜ visit `/` → landing page renders (hero, features, public pricing
  comparison, classic notice); language cards link to `/{l1}/{l2}`;
  “Start watching” → login
- ⬜ legacy iOS Capacitor wrapper opening `languageplayer.io` redirects to
  `v2.languageplayer.io`
- ⬜ login → header renders (logo, Media / Reading / Vocab menus, search,
  language switcher, user menu)
- ⬜ logout via user menu → returns to login, no session residue

#### A. Auth & onboarding  **· SPEC-023 ref:** Tier 1 · **Run on:** Chrome

- ⬜ login — happy path (Mary/Bob)
- ⬜ login — wrong password → inline error, stays on login
- ⬜ logged out — saving a word from the dictionary popup or interface
  redirects to login
- ⬜ login — empty fields → validation error
- ⬜ login with `?callbackUrl=` → returns to the intended page after login
- ⬜ Go Pro while logged out → login → returns to Go Pro after login
  [go-pro links use `?redirect=` but the login form reads `callbackUrl` —
  currently mismatched, confirm or fix before release]
- ⬜ register — happy path incl. “how did you hear about us” survey step
- ⬜ register — duplicate email
- ⬜ register — email verification (code entry, resend, `/auth/verified`)
- ⬜ forgot password → email link → `/password-reset` → new password → login
- ⬜ delete account — type-to-confirm, subscription-blocked message,
  logout + account gone
- ⬜ new user → `/language-select` → selecting L1/L2 lands on Explore
- ⬜ session persists across full page reload and new tab

#### L. Language & i18n  **· SPEC-023 ref:** Tier 1 · **Run on:** Chrome

- ⬜ language switcher changes L1 → UI strings update without logout
- ⬜ changing L2 switches content (Explore feed, dictionary, reader)
- ⬜ URL reflects `/[l1]/[l2]/...` for every language-scoped page
- ⬜ invalid `l1`/`l2` in URL → 404 page, not a crash
- ⬜ spot-check 2–3 non-English locales (e.g. zh-Hans, ja, fr): no raw
  `msg.*` keys or English hardcodes visible
- ⬜ docs pages render `{$key}` references resolved per locale

#### M. Media  **· SPEC-023 ref:** Tier 2 · **Run on:** Chrome

- ⬜ Explore feed — loading skeletons, video cards, level filter seeded from
  saved level, infinite scroll, empty/error + retry states
- ⬜ Music page — same level filter + pagination via `/api/videos/recommend-music`
- ⬜ Video card → watch page; card shows title, channel, level
- ⬜ Live TV — channel list sorted by latency, category/country filters,
  HLS playback with native video controls, logo fallback, `?tvgID=` deep link
  restores channel
- ⬜ Channel page — info, subscribe/unsubscribe, channel videos
- ⬜ TV shows — list, search, sort (views/title/year), locale filter, show
  detail → episodes → watch
- ⬜ Search — title search results, tag cloud (show more/less), empty state,
  pasting a YouTube URL navigates straight to watch
- ⬜ Watch page — player loads, video meta, channel card, position resumes
  from localStorage
- ⬜ Watch controls — play/pause, rewind, prev/next line, seek bar, prev/next
  video, like, add-to-playlist dialog
- ⬜ Keyboard shortcuts — Space play/pause, ←/→ line seek, Shift+←/→ video
  switch, `R` rewind to line
- ⬜ Transcript mode — interactive tokenized transcript, click line to seek,
  tap word → dictionary popup, translations load progressively
- ⬜ Subtitles mode — karaoke overlay, transcript ↔ subtitles toggle,
  single-line/multiline rendering, smooth scroll setting honored
- ⬜ Auto-generated captions — raw captions load and normalize progressively
  (SPEC-029) without blocking the player
- ⬜ Video queue — queue panel lists next videos, prev/next switches
- ⬜ Like → appears in Liked Videos; unlike removes it
- ⬜ Playlists — create, rename, delete, add video from watch page,
  playlist detail page lists videos
- ⬜ Watch history — visits recorded and page lists entries
- ⬜ Local media — upload video + subtitle file, HTML5 playback, transcript,
  position resume

#### D. Dictionary & vocab  **· SPEC-023 ref:** Tier 3 · **Run on:** Chrome

- ⬜ Dictionary search — results list, single-result auto-redirect to entry,
  not-found message, recent searches + clear
- ⬜ Entry detail — head, definitions, inflections/phonetics, prev/next
  navigation, entry list sidebar
- ⬜ Save + unsave from entry card / popup; save context (form/text/title)
  recorded
- ⬜ Quick gloss — compact gloss with parens + smart spacing
- ⬜ Popup dictionary from transcript token tap — defs, save, speak
- ⬜ L1 ≠ en — definitions translate to the UI language
- ⬜ Traditional characters (zh), hanja (ko), hantu (vi) per display settings
- ⬜ Corpus tab — Collocations / Examples / Related / Mistakes pills,
  interactive tokenized text, bookmark related words, corpus source shown
- ⬜ Image search — Openverse grid with skeletons, query relaxation,
  compact strip in the popup dictionary
- ⬜ AI Explain — Pro-gated; streams explanation, follow-up buttons
  (inflection/morphemes/etymology/syntax/synonyms), copy
- ⬜ Subs-search — show-all list with translations, target form highlighted
- ⬜ Saved Words page — today/earlier groups, filter, entry cards with
  source/context/form, SRS status, export CSV, clear all (with confirm)

#### R. Review (SRS)  **· SPEC-023 ref:** Tier 4 · **Run on:** Chrome

- ⬜ No-cards-due state
- ⬜ Card front → reveal → back (definition, translation, phonetics)
- ⬜ Rate Again / Hard / Good / Easy + keyboard shortcuts 1–4
- ⬜ Space/Enter reveals and rates Good
- ⬜ Undo last rating via toast and Ctrl/Cmd+Z — card returns to deck
- ⬜ Daily new-card limit — newest saved words enter the blue deck within budget
- ⬜ All-done + stats state
- ⬜ Markdown rendered in translation; target form emphasized

#### E. Reading  **· SPEC-023 ref:** Tier 5 · **Run on:** Chrome

- ⬜ Notes reader — create, edit (debounced auto-save), rename, delete;
  note list in sidebar
- ⬜ Notes reader — markdown parsing, tokenized tap → dictionary popup,
  translation panel
- ⬜ EPUB — bookshelf per language, import valid EPUB, invalid-file error
  dialog, open straight to content, resume position
- ⬜ EPUB — chapter sidebar, prev/next chapter, in-book search with snippets,
  back history after TOC/search/link jumps
- ⬜ EPUB — internal links work; page-number estimates + progress shown
- ⬜ Web reader — suggested reading cards, load URL, title sniffing
  (`<title>` / og:title / first h1)
- ⬜ Web reader — article chrome stripped to markdown, links open in-app,
  visited sites tracked (title/date), rename/delete visited, back-to-home

#### P. Settings & profile  **· SPEC-023 ref:** Tier 6 · **Run on:** Chrome

- ⬜ Profile — name/email, level change for recommendations
- ⬜ Subscription card — free/Pro state, monthly/annual/lifetime, expiry,
  cancel auto-renewal, upgrade/renew links
- ⬜ Settings — sidebar sections + settings search
- ⬜ Display — theme light/dark/system, text size, font, show translation /
  gloss / phonetics / definitions, popup dictionary toggle, quiz mode,
  character set (traditional/simplified), hanja/hantu, tokenized preview
- ⬜ Playback — auto-pause, captions display (subtitles/transcript),
  karaoke, smooth scroll
- ⬜ Review settings — new cards per day
- ⬜ Speech — voice + rate (TTS on card reveal / speak buttons)
- ⬜ Delete account flow from profile
- ⬜ About dialog + privacy policy link

#### O. Docs  **· Run on:** Chrome

- ⬜ Docs home — sidebar categories, search, empty state
- ⬜ Doc page — renders headings, tables, code blocks, cross-links
- ⬜ Locale switching — docs translate (via `{$key}` and `docs-i18n`)

#### Pay. Payments  **· SPEC-023 ref:** SPEC-054 · **Run on:** Chrome + device

- ⬜ Go Pro page — three plans with USD prices loaded from Stripe
- ⬜ Credit card → Stripe Checkout session → redirect → payment
- ⬜ WeChat / Alipay payment links (CNY)
- ⬜ PayPal option when available
- ⬜ `/go-pro-success` polls subscription until Pro; `/go-pro-error` handles
  failure
- ⬜ Profile subscription reflects purchase; AI Explain unlocks
- ⬜ Cancel auto-renewal persists
- ⬜ Free-tier gates — non-Pro sees upgrade prompts, no crash

#### W. Web-platform  **· Run on:** Chrome + Safari + Firefox

- ⬜ Responsive — desktop ≥1280px, tablet ~768px, mobile ≤390px: header
  collapses to hamburger drawer, watch page switches between transcript and
  subtitles layouts, grids reflow
- ⬜ Narrow watch layout — subtitles band below player; wide layout — overlay
  subtitles; resizing mid-playback does not unmount the player
- ⬜ Safari — YouTube embed, HLS live TV, speech/audio
- ⬜ Firefox — general smoke pass (login, explore, watch, dictionary)
- ⬜ URL sharing — watch `/[l1]/[l2]/watch/[videoId]`, search `?q=`,
  live TV `?tvgID=`, docs slug all load from a fresh tab
- ⬜ Console — no uncaught errors; logs use `[LP Web]` prefix
- ⬜ Keyboard/accessibility spot-check — menus and dialogs focusable,
  Escape closes dialogs, aria-labels present on icon buttons
- ⬜ 404 + error boundary — bad routes show app-styled pages

### 1.3 Browser split — Chrome first, targeted subset

The checklist is **Chrome-first** (the `Run on` column assumes Chrome). You do
**not** run every row twice:

1. **Run the full checklist once in Chrome** — this covers all product logic
   (auth, media, dictionary, review, reading, settings, payments).
2. **On Safari and Firefox, run a targeted subset** — things that genuinely
   differ per browser:
   - YouTube iframe embed + playback (autoplay policies)
   - HLS live TV (`hls.js` native HLS vs MSE fallback)
   - Speech synthesis voices/rate
   - Clipboard (copy actions)
   - Font rendering / `-webkit-` styling quirks
   - Responsive behavior at the same viewport widths
3. **On a real phone/tablet**, do a light responsive smoke pass (launch,
   login, Explore, one watch page, one dictionary popup) and confirm the
   hamburger menu + narrow watch layout.

### 1.4 Local environment — concrete steps

**The local Flask backend** — start it on the Mac first (per AGENTS.md this
is the developer's job, not the agent's):

```bash
cd zerotohero-python-server && python3.10 app.py   # serves http://127.0.0.1:5001
```

**Web dev server:**

```bash
nvm use 22
cd apps/web && npm run dev        # or from the repo root: npx turbo dev
```

**API URL behavior** (`apps/web/src/lib/api-url.ts`):

- Local dev defaults to `http://127.0.0.1:5001`.
- `NEXT_PUBLIC_API_URL=https://pythonvps.zerotohero.ca` switches to the
  production backend — set it **before** starting the dev server or build.
- `next.config.js` rewrites `/api/python/*` → `http://localhost:5001/*` in
  dev; Netlify rewrites `/api/python/*` → `https://pythonvps.zerotohero.ca/*`
  in production (see `netlify.toml`).

**Release QA target:** use the deployed Netlify URL (or a production build
started with `npm run start` after the user runs the build). Verify the
production API host is actually being hit (Network tab), and that the
`/api/python/*` proxy rewrites work.

> Per AGENTS.md, **never run `next build` / `turbo build` yourself** — use
> `npm run build:check -w apps/web` for isolated build verification, and let
> the user run any production build they want tested.

### 1.5 Failure handling

- Any **blocking** failure (crash, broken login, wrong API host, corrupt
  data, broken checkout) stops the release — fix, rebuild, re-verify.
- Non-blocking cosmetic issues may ship but must be logged for the next
  release (same policy as SPEC-048 § 1.6).

## 2. Release checklist (web)

- [ ] Full QA checklist (§ 1.2) passed on Chrome
- [ ] Safari + Firefox subset (§ 1.3) passed
- [ ] Mobile/tablet responsive spot pass done
- [ ] `npx turbo typecheck` and `npm run build:check -w apps/web` passed
- [ ] If new UI strings were added: `translations.csv` updated and locale
  JSONs regenerated (`node scripts/sync-translations.mjs csv-to-json`);
  docs re-translated if docs changed (`node scripts/translate-doc.mjs`)
- [ ] Netlify env has `NEXT_PUBLIC_API_URL=https://pythonvps.zerotohero.ca`
  (or the app correctly falls back to production)
- [ ] Deployed URL smoke-tested: `/` landing page, login, Explore, one watch
  page, `/api/python/*` proxy verified

## Related docs

- [ADR-0027 — Defer Automated E2E — Human QA](../adr/0027-defer-automated-e2e-human-qa.md) — why releases use human QA, not browser automation
- [SPEC-023 — Mobile E2E Testing](023-mobile-e2e-testing.md) — deferred; source catalog for the checklist tiers
- [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) — the mobile checklist this spec mirrors
- [SPEC-054 — Subscription & Payment Testing](054-subscription-payment-testing.md) — detailed payment checklist
- [SPEC-014 — Subscription/Payment System](014-subscription-payment-system.md) — plan/pricing and gate behavior
- [AGENTS.md](../../AGENTS.md) — dev-server conventions, Node 22, “never run builds un-prompted”
