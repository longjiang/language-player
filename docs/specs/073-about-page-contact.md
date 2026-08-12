# SPEC-073: About Page (web + mobile)

## Metadata

- **Spec ID**: SPEC-073
- **Feature**: Update the About surface in `apps/web` and `apps/mobile` with
  contact information, docs, and tokenizer-test links
- **Status**: draft
- **Created**: 2026-08-12
- **ROADMAP Phase**: Phase 2.5 — UI Internationalization / general polish
- **See also**: [SPEC-071 — Classic Route Redirect Adapter](071-classic-route-redirect-adapter.md) · [SPEC-072 — Channels Directory + Subscriptions](072-channels-directory-and-subscriptions.md)

## 1. Overview

The About surface currently shows technical build metadata but no way to reach
support, the documentation, or the tokenizer test. This spec updates both apps:

- Remove the commit and branch display fields
- Add a contact block (email support + Discord server)
- Add a documentation link
- Add a tokenizer test link (new on web; mobile already has one)

## 2. Current State

### Web (`apps/web`)

- `AboutContent` is rendered inside the UserMenu's `AboutDialog`
  (`apps/web/src/components/about/about-content.tsx`,
  `apps/web/src/components/about/about-dialog.tsx`)
- Shows: version, build date, environment, **commit**, **branch**
- No contact, docs, or tokenizer links

### Mobile (`apps/mobile`)

- Dedicated screen `(tabs)/(me)/about.tsx`
- Shows: version, build date, environment
- No commit/branch fields (keep it that way)
- Has a dev-only tokenizer test link
- No contact or docs links

## 3. Requirements

### 3.1 Remove commit and branch

- Web: delete the two hardcoded `Commit` / `Branch` rows from `AboutContent`
- Mobile: no commit/branch fields exist — do not add them back

Keep the version, build date, and environment rows.

### 3.2 Contact block

Add a "Contact" card/section to both apps with:

| Item | Value |
|---|---|
| Email support | `jon.long@zerotohero.ca` (mailto link) |
| Discord server | `https://discord.gg/D7vKcuKXuA` (same link as Classic's contact page) |

Web rows are clickable links; mobile rows use `Linking.openURL`.

### 3.3 Documentation link

- Web: link to `/{l1}/{l2}/docs`
- Mobile: link to `(tabs)/(me)/docs`

Label: `title.docs`.

### 3.4 Tokenizer test link

- Web: link to `/{l1}/{l2}/tokenizer` (new)
- Mobile: existing link to `(tabs)/(me)/tokenizer-test`; make it visible in
  all builds (currently `__DEV__` only) for parity

Label: `title.tokenizer_test`.

## 4. Layout

Both apps keep the existing header (logo + app name + "About") and footer
(copyright), then render, in order:

1. Build info card (version, build date, environment — no commit/branch)
2. Contact card (email support, Discord server)
3. Links card (Documentation, Tokenizer Test)

## 5. i18n

Existing keys:

- `action.email_support`
- `action.contact_us`
- `title.docs`
- `title.tokenizer_test`
- `label.version`, `label.build_date`, `label.environment`

New key (added through the `translations.csv` workflow):

- `label.discord_server` — "Discord server"

## 6. Acceptance Criteria

- About no longer shows a commit hash or branch anywhere
- Email support row opens `mailto:jon.long@zerotohero.ca`
- Discord row opens `https://discord.gg/D7vKcuKXuA`
- Documentation link navigates to docs in both apps
- Tokenizer test link navigates to the tokenizer page/screen in both apps
- Mobile tokenizer link is no longer dev-only

## 7. Testing

- Web: typecheck, lint, existing Vitest suite, `npm run build:check -w apps/web`
- Mobile: typecheck (`cd apps/mobile && ./node_modules/.bin/tsc --noEmit`)
- Manual: open About from the user menu on web and from the Me tab on mobile;
  verify each link
