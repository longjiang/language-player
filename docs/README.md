# Language Player — Developer Documentation

Master index of all project documentation. All docs live under `docs/` with a consistent numbering system.

## Directory Structure

```
docs/
├── README.md                  ← this file
├── specs/                     ← feature specifications (3-digit: 001–999)
│   └── archive/               ← superseded specs, kept for history
├── adr/                       ← architecture decision records (4-digit: 0001–9999)
├── arch/                      ← architecture analyses & references (3-digit: 001–999)
│   └── archive/               ← superseded arch docs, kept for history
├── issues/                    ← open investigation write-ups (ISSUE-NNN)
├── versioning/                ← build ledger (one row per commit)
└── email-templates/           ← Supabase auth email templates
```

## Numbering Conventions

| Doc Type | Dir | Prefix | Range | Purpose |
|---|---|---|---|---|
| **Specs** | `specs/` | `NNN` (3-digit) | 001–999 | Feature/phase implementation plans |
| **ADRs** | `adr/` | `NNNN` (4-digit) | 0001–9999 | Architecture decisions with context, options, consequences |
| **Arch docs** | `arch/` | `NNN` (3-digit) | 001–999 | Codebase analysis, reference maps, database schemas |

**Status vocabulary** (specs and ADRs): ✅ Complete · 🔄 In progress · ⬜ Draft · ⛔ Superseded. Every doc carries its status in a Metadata block at the top; the tables below are generated from those blocks.

---

## Specs

| 001 | [Language Selection & Routing](specs/001-language-selection.md) | 2 | ✅ Complete |
| 002 | [Repository Migration Strategy](specs/002-repo-migration.md) | — | 🔄 In progress |
| 003 | [Phase 2 — Auth + Core Navigation](specs/003-phase2-auth-navigation.md) | 2 | ✅ Complete |
| 004 | [Phase 3 — Explore + Video Player](specs/004-phase3-explore-video.md) | 3 | ✅ Complete |
| 005 | [Phase 2.5 — UI Internationalization (i18n)](specs/005-phase2.5-i18n.md) | 2.5 | ✅ Complete |
| 006 | [Translation](specs/006-translation.md) | 4 | ✅ Complete |
| 009 | [Reader Layout System](specs/009-reader-layout.md) | 4 | ✅ Complete |
| 010 | [Video Watch Page Layout and UI](specs/010-video-watch-page-layout-and-ui.md) | 3 | 🔄 In progress |
| 011 | [Language Switcher UI](specs/011-language-switcher-ui.md) | — | ✅ Complete |
| 012 | [EPUB Image Rendering (Mobile)](specs/012-epub-image-rendering.md) | 4 | 🔄 In progress |
| 013 | [Mobile Offline Dictionary — Online/Offline Hybrid Architecture](specs/013-mobile-offline-dictionary.md) | 7 | ✅ Complete |
| 014 | [Subscription & Payment System](specs/014-subscription-payment-system.md) | — | 🔄 In progress |
| 015 | [Mobile Settings — Full Parity Completion](specs/015-mobile-settings-completion.md) | 7 | ✅ Complete |
| 016 | [Interaction Primitives — Headless UI Migration (Web + Mobile)](specs/016-interaction-primitives-migration.md) | 7 | ✅ Complete |
| 017 | [Settings — List→Detail Pattern with Search (Web + Mobile)](specs/017-settings-list-detail-search.md) | 7 | ⛔ Superseded |
| 018 | [Mobile Local Tokenization & Lemmatization](specs/018-local-tokenization-mobile.md) | — | 🔄 In progress |
| 019 | [Mobile Tokenization & Batch Lookup — Completion](specs/019-mobile-tokenization-batch-lookup-completion.md) | 7 | ✅ Complete |
| 020 | [iPad & Responsive Layout — Full Compatibility](specs/020-ipad-responsive-layout.md) | 8 | ⛔ Superseded |
| 021 | [Unifying Translation Display](specs/021-unifying-translation-display.md) | 3 | ✅ Complete |
| 022 | [Tokenizer Auto-Download UI](specs/022-tokenizer-auto-download-ui.md) | — | ✅ Complete |
| 023 | [Mobile End-to-End Testing Plan](specs/023-mobile-e2e-testing.md) | — | ⬜ Draft |
| 024 | [Consolidate Directus Calls to Python Backend](specs/024-consolidate-directus-calls.md) | — | ⬜ Draft |
| 026 | [Unified Transcript Auto-Scroll](specs/026-unified-transcript-autoscroll.md) | — | ✅ Complete |
| 027 | [Chrome Extension — Implicit Auto-Open Toggle for Transcript Panel](specs/027-chrome-extension-auto-open-toggle.md) | — | ⛔ Superseded |
| 028 | [Chrome Extension Translation Pipeline - MANUAL Key Audit](specs/028-chrome-ext-translation-pipeline.md) | 18 | ✅ Complete |
| 029 | [Caption Normalization (LLM cleanup of auto-generated captions)](specs/029-caption-normalization.md) | — | ✅ Complete |
| 030 | [Radix UI Migration — Web Primitives & Sidebar Consistency](specs/030-radix-ui-migration.md) | 4 | ✅ Complete |
| 031 | [Web Reader Reading Suggestions](specs/031-reading-suggestions.md) | 4 | 🔄 In progress |
| 032 | [EPUB Reader Re-Engineering — Whole-Book Model](specs/032-epub-reader-re-engineering.md) | 4 | ✅ Complete |
| 033 | [Native Text Selection Dictionary (Web)](specs/033-selection-actions.md) | 4 | ✅ Complete |
| 034 | [Saved Words — Supabase Row-Level Migration (Complete)](specs/034-saved-words-supabase-migration.md) | 9 | ✅ Complete |
| 035 | [AI Explanation Follow-ups](specs/035-ai-explanation-follow-ups.md) | 4 | ✅ Complete |
| 036 | [Phrase Extraction Endpoint](specs/036-phrasal-lemmatization-endpoint.md) | — | ✅ Complete |
| 037 | [Two-Tier Remote Cache with Cold Offload](specs/037-two-tier-remote-cache-offload.md) | 9 | ✅ Complete |
| 038 | [Video Content — Directus MySQL → Supabase Postgres (Complete)](specs/038-video-content-supabase.md) | 9 | ✅ Complete |
| 039 | [Full Database Migration — Directus → Supabase (Remaining Workstreams)](specs/039-full-database-migration-supabase.md) | 9 | 🔄 In progress |
| 040 | [Video Likes + Playlist Management](specs/040-video-like-playlist-management.md) | 6 | ✅ Complete |
| 041 | [Delete Account](specs/041-delete-account.md) | 6 | ✅ Complete |
| 042 | [Registration Acquisition Survey](specs/042-registration-acquisition-survey.md) | 2 | ✅ Complete |
| 043 | [Recommendation Pipeline Performance & Quality Optimization](specs/043-recommendation-performance.md) | 9 | ⬜ Draft |
| 044 | [Subs-Search Database Optimizations (Supabase)](specs/044-subs-search-db-optimizations.md) | 9 | 🔄 In progress |
| 045 | [Continua Subs-Search N-Gram Token Index (Supabase)](specs/045-continua-subs-search-ngram-tsv.md) | 4 | ⛔ Superseded |
| 046 | [Brand Design: Primary Color, Play Button Logo & Typography](specs/046-brand-design-primary-color.md) | 10 | ✅ Complete |
| 047 | [Corpus Tab (Sketch Engine) in the Web Dictionary](specs/047-corpus-tab-sketch-engine.md) | 4 | ✅ Complete |
| 048 | [Mobile Release Plan — Human QA + App Store & Play Store Distribution](specs/048-mobile-release-plan.md) | — | ✅ Complete |
| 049 | [Web → Mobile Feature Parity (since `f0bad902a9`)](specs/049-mobile-feature-parity.md) | 4 | 🔄 In progress |
| 050 | [Mobile Sidebar & Video Layout Parity with Web](specs/050-mobile-sidebar-video-parity.md) | 6 | ✅ Complete |
| 051 | [Mobile Text-Scale Parity with Web](specs/051-mobile-text-scale-parity.md) | 6 | ✅ Complete |
| 052 | [Mobile Large Screen (iPad) Layout Parity with Web](specs/052-mobile-large-screen-ipad-layout-parity-with-web.md) | 8 | 🔄 In progress |
| 053 | [Mobile Offline Mode & Offline Sync](specs/053-mobile-offline-mode.md) | — | 🔄 In progress |
| 054 | [Subscription & Payment Testing](specs/054-subscription-payment-testing.md) | — | 🔄 In progress |
| 055 | [Local Tokenizer Testing Checklist (Spot-Check)](specs/055-local-tokenizer-testing.md) | — | ⬜ Draft |
| 056 | [Automated Tokenization / Lemmatization Evaluation Suite (19 Popular L2s)](specs/056-automated-tokenization-eval.md) | — | ⬜ Draft |
| 057 | [Alternative Tokenizer / Lemmatizer Research for Low-Scoring L2s (ar, he, hi, id, tr)](specs/057-alternative-tokenizers-difficult-l2s.md) | — | ⬜ Draft |
| 058 | [Automated Mobile Offline Tokenization Evaluation Suite (19 Popular L2s)](specs/058-mobile-tokenization-eval.md) | — | ⬜ Draft |
| 059 | [Web Release QA — Human Testing Checklist for `apps/web`](specs/059-web-release-qa-checklist.md) | — | ⬜ Draft |
| 060 | [Admin Console — User Management](specs/060-admin-console-user-management.md) | 10 | ✅ Complete |
| 061 | [Supabase-Backed Video Lemmatization + Cache ID Rebinding](specs/061-video-lemmatization-supabase-cache.md) | 9 | ✅ Complete |
| 062 | [Saved Words Sync Debugging — Cross-Device Divergence & Account Pollution](specs/062-saved-words-sync-debugging.md) | 9 | 🔄 In progress |
| 063 | [UI Translation Locale Trim (31 → 18)](specs/063-ui-translation-locale-trim.md) | 18 | ✅ Complete |
| 064 | [iOS Development Build Runbook](specs/064-ios-development-build-runbook.md) | 7 | ✅ Complete |
| 065 | [EPUB Reading Progress Sync (Server + Mobile Offline)](specs/065-epub-progress-sync.md) | 6 | ⬜ Draft |
| 066 | [SRS Review Page (Web + Mobile)](specs/066-srs-review-page.md) | 6 | ✅ Complete |
| 067 | [Language Player 3 — Google Play Release Runbook](specs/067-google-play-release-runbook.md) | — | ✅ Complete |
| 068 | [Google Play Billing — Implementation & Test Plan](specs/068-google-play-billing-implementation.md) | — | 🔄 In progress |
| 069 | [Web → Mobile Universal Links & App Links](specs/069-web-mobile-universal-links.md) | — | ⬜ Draft |
| 070 | [Prepare Graphics for App Stores](specs/070-store-graphics-checklist.md) | — | ✅ Complete |
| 071 | [Classic (Nuxt) Route Redirect Adapter for apps/web](specs/071-classic-route-redirect-adapter.md) | 8 | ✅ Complete |
| 072 | [Channels Directory + Subscribed-Content Feed (web + mobile)](specs/072-channels-directory-and-subscriptions.md) | 5 | ✅ Complete |
| 073 | [About Page (web + mobile)](specs/073-about-page-contact.md) | 2.5 | ✅ Complete |
| 074 | [Chrome Web Store Deployment](specs/074-chrome-web-store-deployment.md) | — | ✅ Complete |
| 075 | [Chrome Extension — Webpage Tokenization & Popup Dictionary](specs/075-webpage-tokenization.md) | — | ✅ Complete |
| 076 | [Versioning & Build Number Strategy](specs/076-versioning-strategy.md) | — | ✅ Complete |
| 077 | [CSS-Columns Paginated Reader Panel (Shared Across All Readers)](specs/077-css-columns-paginated-reader.md) | 4 | ⬜ Draft |
| 078 | [Resizable Text\|Translation Splitter in the Readers](specs/078-resizable-text-translation-splitter.md) | 5 | ✅ Complete |
| 079 | [Subs Search Content Filter Pills](specs/079-subs-search-content-filter-pills.md) | — | ✅ Complete |
| 080 | [Web: `lang` Attribute Rules for Correct CJK Glyph Rendering](specs/080-web-lang-attribute-glyph-rendering.md) | — | ✅ Complete |
| 081 | [Subs Search "Sort by AI" — Meaning/Pattern Grouping](specs/081-subs-search-ai-sort.md) | — | ✅ Complete |
| 082 | [Mobile–Web Parity — Reader, Subs Search, SRS Sync (2026-08 web cluster)](specs/082-mobile-web-parity-reader-subs-sync.md) | — | ✅ Complete |
| 083 | [Unified Markdown Parsing & Rendering — Web + Mobile (SPEC-083)](specs/083-mobile-unified-markdown.md) | — | ✅ Complete |
| 084 | [Mobile Native Text Selection Dictionary (SPEC-033 port)](specs/084-mobile-selection-dictionary.md) | — | 🔄 In progress |
| 085 | [EBook Reader Interface — Full-Screen Tap Surface, Chrome Clearance, and Fixed-Height Modals](specs/085-ebook-reader-interface.md) | 5 | 🔄 In progress |
| 086 | [Chrome Extension — Web-Parity Side Panel Redesign](specs/086-chrome-extension-side-panel-redesign.md) | — | ✅ Complete |
| 087 | [Paginated Reader](specs/087-paginated-reader.md) | 5 | ✅ Complete |
| 088 | [CJK Glyph Rendering](specs/088-cjk-glyph-rendering.md) | — | ✅ Complete |
| 089 | [PDF & Image Reader](specs/089-pdf-and-image-reader.md) | 5 | 🔄 In progress |
| 090 | [Image Reader](specs/090-image-reader.md) | 5 | 🔄 In progress |
| 091 | [Subtitle HTML-Entity Decoding at the Server](specs/091-subtitle-html-entity-decoding.md) | — | ✅ Complete |
| 092 | [Media Metadata Localization & TV Show Badge](specs/092-media-metadata-localization-tv-show-badge.md) | 3 | ✅ Complete |
| 093 | [Video Subtitle Notes (`[n]` Markers)](specs/093-video-subtitle-notes.md) | 3 | ✅ Complete |
| 094 | [Popup Dictionary External Search Panel](specs/094-external-search.md) | 4 | ✅ Complete |
| 095 | [Interactive Textbook](specs/095-interactive-textbook.md) | 5 | ✅ Complete |
| 096 | [Admin Video Ingestion (YouTube id / channel / playlist → DB)](specs/096-admin-video-ingestion.md) | 9 | ✅ Complete |
| 097 | [Payment Endpoint User Binding](specs/097-payment-user-binding.md) | 9 | ✅ Complete |
| 098 | [Video Discovery](specs/098-video-discovery.md) | 9 | ✅ Complete |
| 099 | [Admin Console — Content Management (videos / channels / TV shows / talks by L2)](specs/099-admin-content-management.md) | 10 | ✅ Complete |
| 100 | [Admin Console — Analytics (New Signups & Revenue)](specs/100-admin-signup-analytics.md) | 10 | ✅ Complete |
| 101 | [Admin Console — Transactions](specs/101-admin-transactions.md) | 10 | ✅ Complete |
| 102 | [Affiliates and Coupon Codes](specs/102-affiliates-and-coupons.md) | 10 | 🔄 In progress |
| 103 | [Literary Chinese (lzh) — CEDICT Definitions, HSK Levels, and Modern Chinese Translation](specs/103-lzh-cedict-and-modern-zh.md) | 4 | ✅ Complete |
| 104 | [Rare Han Glyph Display via On-Demand Font Subsets + Chip Fallback](specs/104-rare-han-glyph-subsets.md) | — | 🔄 In progress |
| 105 | [Video Content Index Cleanup & Schema Reproducibility](specs/105-video-content-index-cleanup.md) | 9 | ⬜ Draft |
| 106 | [Derived Content Data Maintenance — One Pipeline, Cheapest Guarantee](specs/106-derived-data-maintenance.md) | 9 | ⬜ Draft |
| 107 | [Tag Search and Video-Tag Pills](specs/107-tag-search-and-video-tag-pills.md) | 3 | ✅ Complete |

## ADRs

| 0001 | [Monorepo Tooling — Turborepo + npm Workspaces](adr/0001-monorepo-tooling.md) | accepted | 2026-07-12 |
| 0002 | [Next.js App Router (not Pages Router)](adr/0002-nextjs-app-router.md) | accepted | 2026-07-12 |
| 0003 | [Do Not Share UI Components Between Web and Mobile](adr/0003-no-shared-ui.md) | accepted | 2026-07-12 |
| 0004 | [Directus User Data — Token Strategy & `owner` Field](adr/0004-directus-user-data-token-strategy.md) | superseded | 2026-07-13 |
| 0005 | [Payment methods plan support](arch/015-payment-methods-plan-support.md) — moved to ARCH-015 | moved | 2026-07-14 |
| 0006 | [Consolidated Lexical Data Types](adr/0006-consolidated-lexical-data-types.md) | accepted | 2026-07-14 |
| 0007 | [Dictionary Hub UX — Persistent Search Bar & Panel-Based Layout](adr/0007-dictionary-hub-ux.md) | accepted | 2026-07-19 |
| 0008 | [Mobile App Dictionary Architecture — Online Lookup + Offline Download](adr/0008-go-dictionary-architecture.md) | accepted | 2026-07-21 |
| 0009 | [GO App i18n Migration — i18n-js → react-intl (ICU MessageFormat)](adr/0009-go-i18n-migration-react-intl.md) | accepted | 2026-07-21 |
| 0010 | [Port Next.js Web App to React Native — Fresh Start](adr/0010-port-web-to-mobile-fresh-start.md) | accepted | 2026-07-22 |
| 0011 | [Shared Design Tokens — CSS Custom Properties (Web + Mobile)](adr/0011-shared-design-tokens.md) | accepted | 2026-07-22 |
| 0012 | [Build Custom EPUB Parser (Mobile) Rather Than Using epubjs](adr/0012-custom-epub-parser-mobile.md) | accepted | 2026-07-25 |
| 0013 | [App Store Strategy & Product Naming](adr/0013-app-store-strategy.md) | accepted | 2026-07-25 |
| 0014 | [Interaction Primitives Strategy — Headless UI for Web + Mobile](adr/0014-rn-primitives-interaction-primitives.md) | accepted | 2026-07-25 |
| 0015 | [Settings UI and Search — List→Detail Pattern for Web & Mobile](adr/0015-settings-ui-and-search.md) | accepted | 2026-07-25 |
| 0016 | [Mobile Animations — LayoutAnimation + Animated API over react-native-reanimated](adr/0016-mobile-animations-layoutanimation.md) | accepted | 2026-07-26 |
| 0017 | [Unified Language Picker — Onboarding + Header, Single Responsive Component](adr/0017-unified-language-picker.md) | accepted | 2026-07-26 |
| 0018 | [Tokenizer Selection: Prefer Simplemma/LemmatizationList Over spaCy](adr/0018-tokenizer-prefer-simplemma-over-spacy.md) | superseded | 2026-07-26 |
| 0019 | [Chinese Script Conversion at Render Layer](adr/0019-chinese-script-conversion-at-render-layer.md) | accepted | 2026-07-26 |
| 0020 | [Use Radix for Web Interaction Primitives](adr/0020-radix-web-interaction-primitives.md) | accepted | 2026-08-01 |
| 0021 | [Migrate Video Content from Directus MySQL to Supabase Postgres](adr/0021-migrate-video-content-to-supabase.md) | accepted | 2026-08-02 |
| 0022 | [Keep epubjs on Web — Layer the Whole-Book Model on Top](adr/0022-epub-web-book-model-on-epubjs.md) | accepted | 2026-08-02 |
| 0023 | [Proxy Supabase Auth (GoTrue) Through Flask](adr/0023-proxy-supabase-auth-through-flask.md) | accepted | 2026-08-03 |
| 0024 | [Use DuckDuckGo Image Search for Word Photos (After Google, Openverse, and Bing)](adr/0024-use-bing-image-search.md) | accepted | 2026-08-03 |
| 0025 | [Web Framework — Next.js 14 App Router → Next.js 16.3 (Turbopack + React 19.2)](adr/0025-nextjs-16-turbopack-upgrade.md) | accepted | 2026-08-04 |
| 0026 | [Subs-Search Indexing for Continua Languages (Monograms & Bigrams)](adr/0026-continua-subs-search-indexing.md) | accepted | 2026-08-05 |
| 0027 | [Defer Automated E2E Testing — Checklist-Based Human QA](adr/0027-defer-automated-e2e-human-qa.md) | accepted | 2026-08-06 |
| 0028 | [Consolidate Modern Standard Arabic (`arb`) into Arabic (`ar`)](adr/0028-consolidate-arb-into-ar.md) | accepted | 2026-08-08 |
| 0029 | [LEMMATIZER_REGISTRY is the Single Source of Truth for Lemmatizer Selection](adr/0029-registry-single-source-of-truth.md) | accepted | 2026-08-08 |
| 0030 | [Data-Driven Popular Target-Language (L2) List](adr/0030-popular-l2-list-usage-data.md) | accepted | 2026-08-09 |
| 0031 | [Full Offline Dictionary Downloads (Remove the 125k Cap)](adr/0031-full-offline-dictionary-downloads.md) | accepted | 2026-08-09 |
| 0032 | [Admin Console as a Separate Next.js App](adr/0032-admin-console-app.md) | accepted | 2026-08-09 |
| 0033 | [UI Translation Locale Support List](adr/0033-ui-translation-locale-support.md) | accepted | 2026-08-10 |
| 0034 | [Pro Gating — "Try Then Pay" Strategy](adr/0034-pro-gating-freemium-strategy.md) | accepted | 2026-08-10 |
| 0035 | [Accept legacy StoreKit 1 receipt path without user binding](adr/0035-accept-legacy-iap-receipt-path-without-user-binding.md) | accepted | 2026-08-11 |
| 0036 | [Channel avatars fetched live via `/channel-thumbnail`](adr/0036-live-channel-avatars.md) | accepted | 2026-08-12 |
| 0037 | [Remove legacy `user_srs_settings` table and `/srs/settings` API](adr/0037-remove-legacy-user-srs-settings.md) | accepted | 2026-08-13 |
| 0038 | [Native Ruby Text Rendering on Mobile](adr/0038-native-ruby-text-rendering.md) | accepted | 2026-08-15 |
| 0039 | [Flat Ruby Run on Web](adr/0039-flat-ruby-run-web.md) | accepted | 2026-08-16 |
| 0040 | [Harden the web SRS sync outbox](adr/0040-srs-sync-outbox-hardening.md) | accepted | 2026-08-17 |
| 0041 | [Render subtitle `[n]` notes inside TokenizedText](adr/0041-subtitle-notes-in-tokenized-text.md) | accepted | 2026-09-06 |
| 0042 | [Settings is a modal, routes are deep-link targets](adr/0042-settings-modal-container.md) | accepted | 2026-09-09 |
| 0043 | [Serve textbook media from the existing shared host behind `ASSET_BASE_URL`](adr/0043-textbook-media-hosted-on-shared-host.md) | accepted | 2026-09-11 |
| 0044 | [Textbook exercise state is local-only, with an append-only attempt log in SRS's shape](adr/0044-textbook-exercise-state-local-only.md) | accepted | 2026-09-11 |
| 0045 | [Mock apps are sandboxed, self-contained HTML behind a frozen bridge](adr/0045-mock-apps-as-sandboxed-html.md) | accepted | 2026-09-11 |
| 0046 | [The web app loads no third-party host that mainland China blocks](adr/0046-china-blocked-third-party-hosts.md) | accepted | 2026-09-15 |
| 0047 | [Mobile inputs stay visible: a keyboard-aware layout, not a bigger scroll area](adr/0047-mobile-keyboard-aware-inputs.md) | accepted | 2026-09-17 |
| 0048 | [Sale windows are gated on the client clock; sale amounts stay in the backend price rows](adr/0048-client-side-sale-window-gating.md) | accepted | 2026-09-22 |
| 0049 | [A web EPUB/PDF record that can no longer be read is badged and removed, never silently deleted](adr/0049-unreadable-epub-record-recovery.md) | accepted | 2026-10-16 |

## Architecture Docs

| 001 | [Language Player Classic — App Architecture Reference](arch/001-classic-app-architecture.md) | Classic (Nuxt 2) web app — pages, components, stores, and patterns |
| 002 | [Language Player GO — App Architecture Reference](arch/002-go-app-architecture.md) | GO (React Native / Expo) mobile app — screens, components, and patterns |
| 003 | [Language Player — Python Backend Architecture Reference](arch/003-python-backend-architecture.md) | Python (Flask) backend — blueprints, routes, utilities, and data access |
| 004 | [Python Dictionary Database Schema](arch/004-python-dictionary-db-schema.md) | SQLite dictionary database schema (`data/dictionaries.db`) built from raw dictionaries |
| 005 | [Translation Keys Reference](arch/005-translation-keys-reference.md) | Translation-key reference for `translations.csv` (every key except `lang.*`) |
| 006 | [Dictionary Architecture — Classic Nuxt App](arch/006-classic-dictionary-architecture.md) | Dictionary system in the Classic (Nuxt) app |
| 007 | [Next.js Dictionary Architecture](arch/007-nextjs-dictionary-architecture.md) | Dictionary system in the Next.js web app |
| 008 | [Documentation i18n Pipeline](arch/008-docs-i18n-pipeline.md) | Docs i18n pipeline (`packages/docs/content` → `packages/docs/i18n/*.json`) |
| 009 | [Shared i18n Pipeline — Single Source of Truth](arch/009-shared-i18n-pipeline.md) | Shared UI i18n pipeline — `translations.csv` → `packages/shared/locales/*.json` |
| 010 | [Video Loading Pipeline — Subtitle, Lemmatization, Translation, Dictionary](arch/010-video-loading-pipeline.md) | End-to-end video loading — subtitles → lemmatization → translation → dictionary |
| 011 | [Settings Architecture](arch/011-settings-architecture.md) | Settings storage, mutation, and synchronization |
| 012 | [Metro Debugging Process](arch/012-metro-debugging-process.md) | This document standardizes the debugging workflow for the React Native mobile app (`apps/mobile/`). It covers server startup, log… |
| 013 | [EPUB Reader Architecture](arch/013-epub-reader-architecture.md) | EPUB reader — parsing, pagination, ruby, progress sync (web + mobile) |
| 014 | [Saved Words — End-to-End Data Flow](arch/014-saved-words-data-flow.md) | Saved words — save, store, sync, retrieve, display, and enrich with dictionary/LLM entries |
| 015 | [Payment Methods — Supported Plans & Renewal Strategy](arch/015-payment-methods-plan-support.md) | Payment methods, supported subscription plans, and auto-renewal behavior |
| 016 | [Server-Side Tokenization Pipeline](arch/016-server-tokenization.md) | Server-side tokenization and lemmatization pipeline (all L2 languages) |
| 017 | [Tokenization & Batch Lookup Pipeline](arch/017-tokenization-batch-lookup-pipeline.md) | Lemmatization, dictionary batch lookup, and request optimization strategies |
| 018 | [Local Tokenization Strategy](arch/018-local-tokenization-strategy.md) | Per-language tokenization and lemmatization strategy for on-device execution |
| 019 | [Chrome Extension Architecture](arch/019-chrome-extension-architecture.md) | Language Player Chrome Extension — transcript panel, subtitle interception, interactive dictionary |
| 020 | [Sketch Engine Architecture — Corpus Features (Collocations, Examples, Thesaurus, Mistakes)](arch/020-sketch-engine-architecture.md) | Sketch Engine corpus integration — word sketch, concordance, thesaurus, Chinese learner mistakes |
| 021 | [Language Study Activity Analysis](arch/021-language-study-activity-analysis.md) | Language study activity analytics — top languages studied (rolling month, calendar month, annual, cumulative) |
| 022 | [Payment, Subscription & MailerLite — End-to-End Architecture](arch/022-payment-subscription-mailerlite.md) | Payment, subscription, free-trial, and MailerLite mailing-list architecture |
| 023 | [L1 / Interface Language Usage Analysis](arch/023-l1-interface-language-analysis.md) | L1 (native / UI language) usage analysis — top interface languages actually used by active learners |
| 024 | [Mobile In-App Purchase (IAP) Architecture](arch/024-mobile-iap-architecture.md) | Mobile in-app purchase — StoreKit 2 (iOS) and Play Billing (Android), receipt verification and guardrails |
| 025 | [Language Content Audit — Library, Study Activity, and Popular L2](arch/025-language-content-audit.md) | Point-in-time audit of L2 content availability vs. learner activity vs. the popular-L2 picker list |
| 026 | [Mobile WebView Tokenizer Architecture](arch/026-mobile-webview-tokenizer-architecture.md) | Hidden WebView tokenizer — kuromoji (ja) and dict-based segmentation (Chinese/SEA) off the RN JS thread |
| 027 | [Per-Aspect Logging (Log Domains)](arch/027-per-aspect-logging.md) | Per-aspect log domains with per-domain level overrides |
| 028 | [Local Development Runbook](arch/028-local-development-runbook.md) | Local development runbook for every app in the monorepo |
| 029 | [Production Deployment Runbook](arch/029-production-deployment-runbook.md) | End-to-end production deployment runbook for every shipped surface of Language Player |
| 030 | [Native Ruby Text Rendering & The logLineFragments Incident](arch/030-ruby-text-native-rendering.md) | Native ruby (furigana/pinyin/jyutping) rendering on mobile — architecture, pitfalls, and the 2026-08-16 Debug-only paint failure |
| 031 | [TTS Voice Selection — Cross-Platform Quality Ranking](arch/031-tts-voice-selection.md) | Voice auto-selection for text-to-speech (Settings → Speech "Auto", word pronunciation, sentence playback) |
| 032 | [YouTube Video Difficulty](arch/032-youtube-video-difficulty.md) | Video `difficulty` score (`lex_div / word_freq`) and its 1–7 level mapping |
| 033 | [Difficulty → Level Bucketing](arch/033-difficulty-level-bucketing.md) | Per-language difficulty thresholds — geometric bucketing of the catalog into 1–7 levels |
| 034 | [Video Lemmatization Cache](arch/034-video-lemmatization-cache.md) | The whole-video lemmatization cache — server storage, two-tier offload, key rebinding, and the client in-memory token cache |
| 035 | [Caption Selection — which transcript a video resolves to](arch/035-caption-selection.md) | The single rule the Python backend uses to choose a YouTube caption track for a language — locale candidates,… |
| 036 | [Subs-Search Architecture](arch/036-subs-search-architecture.md) | Subs-search — how dictionary "Examples" find and display matching video subtitles |
| 037 | [Video Content Schema & Index Inventory](arch/037-video-content-schema.md) | As-built `youtube_videos` columns, indexes, constraints and search routing |

## Quick Reference

- **Adding a new spec**: copy `specs/_template.md`, use next available `NNN` number
- **Adding a new ADR**: see `adr/README.md` for format; use next available `NNNN` number
- **Adding a new arch doc**: use next available `NNN` number, prefix with `NNN-`
- **Checklist**: update ROADMAP.md and add/update the ADR when a decision changes

## See Also

- [`ROADMAP.md`](../ROADMAP.md) — project plan with phase tracking
- [`AGENTS.md`](../AGENTS.md) — instructions for AI coding agents
