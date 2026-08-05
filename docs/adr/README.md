# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Language Player monorepo.

## What is an ADR?
An ADR documents a significant architectural decision: the context, the options considered, the decision made, and the consequences.

## Format
Each ADR is a numbered markdown file:
```
NNNN-title-with-dashes.md
```

## Active ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| 0001 | Use Turborepo + npm workspaces for monorepo | accepted | 2026-07-12 |
| 0002 | Use Next.js App Router (not Pages Router) | accepted | 2026-07-12 |
| 0003 | Do not share UI components between web and mobile | accepted | 2026-07-12 |
| 0004 | Directus user data token strategy | accepted | 2026-07-14 |
| 0005 | Payment methods plan support | proposed | 2026-07-14 |
| 0006 | Consolidated lexical data types | accepted | 2026-07-14 |
| 0007 | Dictionary Hub UX — persistent search bar & panel layout | proposed | 2026-07-19 |
| 0008 | GO app dictionary architecture — online lookup + offline download | proposed | 2026-07-21 |
| 0009 | GO app i18n migration to react-intl | proposed | 2026-07-21 |
| 0010 | Port Next.js web app to React Native — fresh start | proposed | 2026-07-22 |
| 0011 | Shared design tokens — CSS variables (web) + StyleSheet values (mobile) | proposed | 2026-07-22 |
| 0012 | Custom EPUB parser for mobile | proposed | 2026-07-24 |
| 0013 | App Store strategy | proposed | 2026-07-25 |
| 0014 | Interaction primitives strategy — headless UI for web + mobile | proposed | 2026-07-25 |
| 0021 | Migrate video content from Directus MySQL to Supabase Postgres | accepted | 2026-08-02 |
| 0022 | Keep epubjs on Web — layer the whole-book model on top | accepted | 2026-08-02 |
| 0023 | Proxy Supabase Auth (GoTrue) through Flask | accepted | 2026-08-03 |
| 0025 | Next.js 14 App Router → Next.js 16.3 (Turbopack + React 19.2) | accepted | 2026-08-04 |
| 0026 | Subs-search indexing for continua languages (monograms & bigrams) | proposed | 2026-08-05 |
