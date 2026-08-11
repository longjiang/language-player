# Language Player — Developer Documentation

Master index of all project documentation. All docs live under `docs/` with a consistent numbering system.

## Directory Structure

```
docs/
├── README.md                  ← this file
├── specs/                     ← feature specifications (3-digit: 001–999)
├── adr/                       ← architecture decision records (4-digit: 0001–9999)
└── arch/                      ← architecture analyses & references (3-digit: 001–999)
```

## Numbering Conventions

| Doc Type | Dir | Prefix | Range | Purpose |
|---|---|---|---|---|
| **Specs** | `specs/` | `NNN` (3-digit) | 001–999 | Feature/phase implementation plans |
| **ADRs** | `adr/` | `NNNN` (4-digit) | 0001–9999 | Architecture decisions with context, options, consequences |
| **Arch docs** | `arch/` | `NNN` (3-digit) | 001–999 | Codebase analysis, reference maps, database schemas |

---

## Specs

| ID | Title | Phase | Status |
|----|-------|-------|--------|
| 001 | [Language Selection & Routing](specs/001-language-selection.md) | 1 | ✅ Complete |
| 002 | [Repository Migration Strategy](specs/002-repo-migration.md) | 1–9 | 🔄 In progress |
| 003 | [Phase 2 — Auth + Core Navigation](specs/003-phase2-auth-navigation.md) | 2 | ✅ Complete |
| 004 | [Phase 3 — Explore + Video Player](specs/004-phase3-explore-video.md) | 3 | ✅ Complete |
| 005 | [Phase 2.5 — UI Internationalization (i18n)](specs/005-phase2.5-i18n.md) | 2.5 | ✅ Complete |
| 006 | [Translation](specs/006-translation.md) | 3 | ✅ Complete |
| 009 | [Reader Layout System](specs/009-reader-layout.md) | 5 | ✅ Complete |
| 010 | [Subtitles Mode — Dual-View Watch Page](specs/010-subtitles-mode.md) | 4 | ✅ Complete |
| 048 | [Mobile Release Plan — Human QA + App Store & Play Store](specs/048-mobile-release-plan.md) | — | 🔄 In progress |

## ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| 0001 | [Use Turborepo + npm workspaces for monorepo](adr/0001-monorepo-tooling.md) | accepted | 2026-07-12 |
| 0002 | [Use Next.js App Router (not Pages Router)](adr/0002-nextjs-app-router.md) | accepted | 2026-07-12 |
| 0003 | [Do not share UI components between web and mobile](adr/0003-no-shared-ui.md) | accepted | 2026-07-12 |
| 0004 | [Directus user data token strategy](adr/0004-directus-user-data-token-strategy.md) | accepted | 2026-07-14 |
| 0005 | [Payment methods plan support](adr/0005-payment-methods-plan-support.md) | proposed | 2026-07-14 |
| 0006 | [Consolidated lexical data types](adr/0006-consolidated-lexical-data-types.md) | accepted | 2026-07-14 |
| 0007 | [Dictionary Hub UX — persistent search bar & panel layout](adr/0007-dictionary-hub-ux.md) | proposed | 2026-07-19 |
| 0008 | [GO app dictionary architecture — online lookup + offline download](adr/0008-go-dictionary-architecture.md) | proposed | 2026-07-21 |
| 0009 | [GO app i18n migration to react-intl](adr/0009-go-i18n-migration-react-intl.md) | proposed | 2026-07-21 |
| 0010 | [Port Next.js web app to React Native — fresh start](adr/0010-port-web-to-mobile-fresh-start.md) | proposed | 2026-07-22 |
| 0011 | [Shared design tokens — CSS variables (web) + StyleSheet values (mobile)](adr/0011-shared-design-tokens.md) | proposed | 2026-07-22 |

## Architecture Docs

| ID | Title | Description |
|----|-------|-------------|
| 001 | [Classic App Architecture](arch/001-classic-app-architecture.md) | Full analysis of Nuxt 2 Classic web app — pages, components, stores, patterns |
| 002 | [GO App Architecture](arch/002-go-app-architecture.md) | Full analysis of React Native GO mobile app — screens, components, patterns |
| 003 | [Python Backend Architecture](arch/003-python-backend-architecture.md) | Full analysis of Flask backend — routes, utilities, patterns |
| 004 | [Python Dictionary DB Schema](arch/004-python-dictionary-db-schema.md) | Database schema for the dictionary system |
| 005 | [Translation Keys Reference](arch/005-translation-keys-reference.md) | Reference for all i18n translation keys and their usage |
| 006 | [Classic Dictionary Architecture](arch/006-classic-dictionary-architecture.md) | Dictionary system architecture in the Classic Nuxt app |
| 007 | [Next.js Dictionary Architecture](arch/007-nextjs-dictionary-architecture.md) | Dictionary system architecture in the Next.js app |
| 008 | [Docs i18n Pipeline](arch/008-docs-i18n-pipeline.md) | Build pipeline for translating documentation to 31 locales |
| 009 | [Shared i18n Pipeline](arch/009-shared-i18n-pipeline.md) | Single-source-of-truth i18n workflow for web + mobile |
| 010 | [Video Loading Pipeline](arch/010-video-loading-pipeline.md) | End-to-end data flow: subtitles → lemmatization → translation → dictionary |
| 011 | [Settings Architecture](arch/011-settings-architecture.md) | Cross-app settings analysis: storage, mutation, sync patterns |
| 012 | [Metro Debugging Process](arch/012-metro-debugging-process.md) | Mobile debugging workflow: Metro, idb, iOS Simulator |
| 020 | [Sketch Engine Architecture](arch/020-sketch-engine-architecture.md) | Corpus features (collocations, examples, thesaurus, mistakes) — Classic PHP proxy ported to Flask with server-side parsing for web/mobile |
| 022 | [Payment, Subscription & MailerLite](arch/022-payment-subscription-mailerlite.md) | End-to-end payment/subscription flows, free trial, renewal, subscription management, and MailerLite group sync |
| 025 | [Language Content Audit](arch/025-language-content-audit.md) | Aggregated L2 content library, study activity, and popular-L2 picker evidence |

## Quick Reference

- **Adding a new spec**: copy `specs/_template.md`, use next available `NNN` number
- **Adding a new ADR**: see `adr/README.md` for format; use next available `NNNN` number
- **Adding a new arch doc**: use next available `NNN` number, prefix with `NNN-`

## See Also

- [`ROADMAP.md`](../ROADMAP.md) — project plan with phase tracking
- [`AGENTS.md`](../AGENTS.md) — instructions for AI coding agents
