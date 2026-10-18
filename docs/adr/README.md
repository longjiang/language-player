# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Language Player monorepo.

## What is an ADR?
An ADR documents a significant architectural decision: the context, the options considered, the decision made, and the consequences.

## Format
Each ADR is a numbered markdown file:
```
NNNN-title-with-dashes.md
```

Every ADR carries a Metadata block with **Date** and **Status** (`accepted`, `superseded`, or `proposed`). The table below is generated from those blocks; keep it in sync when adding or superseding an ADR (the master index is [../README.md](../README.md)).

## ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| 0001 | [Monorepo Tooling — Turborepo + npm Workspaces](0001-monorepo-tooling.md) | accepted | 2026-07-12 |
| 0002 | [Next.js App Router (not Pages Router)](0002-nextjs-app-router.md) | accepted | 2026-07-12 |
| 0003 | [Do Not Share UI Components Between Web and Mobile](0003-no-shared-ui.md) | accepted | 2026-07-12 |
| 0004 | [Directus User Data — Token Strategy & `owner` Field](0004-directus-user-data-token-strategy.md) | superseded | 2026-07-13 |
| 0005 | Payment methods plan support — moved to [ARCH-015](../arch/015-payment-methods-plan-support.md) | moved | 2026-07-14 |
| 0006 | [Consolidated Lexical Data Types](0006-consolidated-lexical-data-types.md) | accepted | 2026-07-14 |
| 0007 | [Dictionary Hub UX — Persistent Search Bar & Panel-Based Layout](0007-dictionary-hub-ux.md) | accepted | 2026-07-19 |
| 0008 | [Mobile App Dictionary Architecture — Online Lookup + Offline Download](0008-go-dictionary-architecture.md) | accepted | 2026-07-21 |
| 0009 | [GO App i18n Migration — i18n-js → react-intl (ICU MessageFormat)](0009-go-i18n-migration-react-intl.md) | accepted | 2026-07-21 |
| 0010 | [Port Next.js Web App to React Native — Fresh Start](0010-port-web-to-mobile-fresh-start.md) | accepted | 2026-07-22 |
| 0011 | [Shared Design Tokens — CSS Custom Properties (Web + Mobile)](0011-shared-design-tokens.md) | accepted | 2026-07-22 |
| 0012 | [Build Custom EPUB Parser (Mobile) Rather Than Using epubjs](0012-custom-epub-parser-mobile.md) | accepted | 2026-07-25 |
| 0013 | [App Store Strategy & Product Naming](0013-app-store-strategy.md) | accepted | 2026-07-25 |
| 0014 | [Interaction Primitives Strategy — Headless UI for Web + Mobile](0014-rn-primitives-interaction-primitives.md) | accepted | 2026-07-25 |
| 0015 | [Settings UI and Search — List→Detail Pattern for Web & Mobile](0015-settings-ui-and-search.md) | accepted | 2026-07-25 |
| 0016 | [Mobile Animations — LayoutAnimation + Animated API over react-native-reanimated](0016-mobile-animations-layoutanimation.md) | accepted | 2026-07-26 |
| 0017 | [Unified Language Picker — Onboarding + Header, Single Responsive Component](0017-unified-language-picker.md) | accepted | 2026-07-26 |
| 0018 | [Tokenizer Selection: Prefer Simplemma/LemmatizationList Over spaCy](0018-tokenizer-prefer-simplemma-over-spacy.md) | superseded | 2026-07-26 |
| 0019 | [Chinese Script Conversion at Render Layer](0019-chinese-script-conversion-at-render-layer.md) | accepted | 2026-07-26 |
| 0020 | [Use Radix for Web Interaction Primitives](0020-radix-web-interaction-primitives.md) | accepted | 2026-08-01 |
| 0021 | [Migrate Video Content from Directus MySQL to Supabase Postgres](0021-migrate-video-content-to-supabase.md) | accepted | 2026-08-02 |
| 0022 | [Keep epubjs on Web — Layer the Whole-Book Model on Top](0022-epub-web-book-model-on-epubjs.md) | accepted | 2026-08-02 |
| 0023 | [Proxy Supabase Auth (GoTrue) Through Flask](0023-proxy-supabase-auth-through-flask.md) | accepted | 2026-08-03 |
| 0024 | [Use DuckDuckGo Image Search for Word Photos (After Google, Openverse, and Bing)](0024-use-bing-image-search.md) | accepted | 2026-08-03 |
| 0025 | [Web Framework — Next.js 14 App Router → Next.js 16.3 (Turbopack + React 19.2)](0025-nextjs-16-turbopack-upgrade.md) | accepted | 2026-08-04 |
| 0026 | [Subs-Search Indexing for Continua Languages (Monograms & Bigrams)](0026-continua-subs-search-indexing.md) | accepted | 2026-08-05 |
| 0027 | [Defer Automated E2E Testing — Checklist-Based Human QA](0027-defer-automated-e2e-human-qa.md) | accepted | 2026-08-06 |
| 0028 | [Consolidate Modern Standard Arabic (`arb`) into Arabic (`ar`)](0028-consolidate-arb-into-ar.md) | accepted | 2026-08-08 |
| 0029 | [LEMMATIZER_REGISTRY is the Single Source of Truth for Lemmatizer Selection](0029-registry-single-source-of-truth.md) | accepted | 2026-08-08 |
| 0030 | [Data-Driven Popular Target-Language (L2) List](0030-popular-l2-list-usage-data.md) | accepted | 2026-08-09 |
| 0031 | [Full Offline Dictionary Downloads (Remove the 125k Cap)](0031-full-offline-dictionary-downloads.md) | accepted | 2026-08-09 |
| 0032 | [Admin Console as a Separate Next.js App](0032-admin-console-app.md) | accepted | 2026-08-09 |
| 0033 | [UI Translation Locale Support List](0033-ui-translation-locale-support.md) | accepted | 2026-08-10 |
| 0034 | [Pro Gating — "Try Then Pay" Strategy](0034-pro-gating-freemium-strategy.md) | accepted | 2026-08-10 |
| 0035 | [Accept legacy StoreKit 1 receipt path without user binding](0035-accept-legacy-iap-receipt-path-without-user-binding.md) | accepted | 2026-08-11 |
| 0036 | [Channel avatars fetched live via `/channel-thumbnail`](0036-live-channel-avatars.md) | accepted | 2026-08-12 |
| 0037 | [Remove legacy `user_srs_settings` table and `/srs/settings` API](0037-remove-legacy-user-srs-settings.md) | accepted | 2026-08-13 |
| 0038 | [Native Ruby Text Rendering on Mobile](0038-native-ruby-text-rendering.md) | accepted | 2026-08-15 |
| 0039 | [Flat Ruby Run on Web](0039-flat-ruby-run-web.md) | accepted | 2026-08-16 |
| 0040 | [Harden the web SRS sync outbox](0040-srs-sync-outbox-hardening.md) | accepted | 2026-08-17 |
| 0041 | [Render subtitle `[n]` notes inside TokenizedText](0041-subtitle-notes-in-tokenized-text.md) | accepted | 2026-09-06 |
| 0042 | [Settings is a modal, routes are deep-link targets](0042-settings-modal-container.md) | accepted | 2026-09-09 |
| 0043 | [Serve textbook media from the existing shared host behind `ASSET_BASE_URL`](0043-textbook-media-hosted-on-shared-host.md) | accepted | 2026-09-11 |
| 0044 | [Textbook exercise state is local-only, with an append-only attempt log in SRS's shape](0044-textbook-exercise-state-local-only.md) | accepted | 2026-09-11 |
| 0045 | [Mock apps are sandboxed, self-contained HTML behind a frozen bridge](0045-mock-apps-as-sandboxed-html.md) | accepted | 2026-09-11 |
| 0046 | [The web app loads no third-party host that mainland China blocks](0046-china-blocked-third-party-hosts.md) | accepted | 2026-09-15 |
| 0047 | [Mobile inputs stay visible: a keyboard-aware layout, not a bigger scroll area](0047-mobile-keyboard-aware-inputs.md) | accepted | 2026-09-17 |
| 0048 | [Sale windows are gated on the client clock; sale amounts stay in the backend price rows](0048-client-side-sale-window-gating.md) | accepted | 2026-09-22 |
| 0049 | [A web EPUB/PDF record that can no longer be read is badged and removed, never silently deleted](0049-unreadable-epub-record-recovery.md) | accepted | 2026-10-16 |
