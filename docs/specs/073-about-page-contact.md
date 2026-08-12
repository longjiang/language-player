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

The About surface is a modal dialog in both apps (web already uses one; mobile
currently has a dedicated route that becomes a dialog). It currently shows
technical build metadata but no way to reach support, the documentation, or
the tokenizer test. This spec updates both apps:

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

- Dedicated route `(tabs)/(me)/about.tsx`, opened from the UserMenu — becomes
  a modal dialog instead (same pattern as web)
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

The link lives inside the modal and closes it before navigating.

Label: `title.docs`.

### 3.4 Tokenizer test link

- Web: link to `/{l1}/{l2}/tokenizer` (new)
- Mobile: existing link to `(tabs)/(me)/tokenizer-test`; make it visible in
  all builds (currently `__DEV__` only) for parity

Label: `title.tokenizer_test`.

### 3.5 Modal behavior (mobile)

- Add a mobile `AboutDialog` component mirroring web's `AboutDialog`
- Render as a **bottom sheet on phones** and a **centered dialog on larger
  screens** (tablets, landscape) using the existing responsive breakpoint
  (e.g. `useResponsive().isSm`)
- Remove the `(tabs)/(me)/about` route from the Me stack layout and from the
  UserMenu's navigation; the UserMenu opens the dialog instead

## 4. Layout

Both dialogs keep the existing header (logo + app name + "About") and footer
(copyright), then render, in order:

1. Build info card (version, build date, environment — no commit/branch)
2. Contact card (email support, Discord server)
3. Links card (Documentation, Tokenizer Test)

## 5. Wireframes

### 5.1 Web dialog (centered modal, ~512px wide)

```
┌─────────────────────────────────────────────────┐
│                                          [X]    │
│                    ┌─────┐                      │
│                    │Logo │                      │
│                    └─────┘                      │
│               Language Player                   │
│                   About                         │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Version            v0.0.0                │  │
│  │ Build Date         2026-08-12            │  │
│  │ Environment        production            │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ Contact                                  │  │
│  │ ✉ Email support   jon.long@…        →    │  │
│  │ 💬 Discord server https://discord.gg/… → │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ Documentation                      →     │  │
│  │ Tokenizer Test                     →     │  │
│  │                                          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│            © 2026 Language Player               │
└─────────────────────────────────────────────────┘
```

### 5.2 Mobile dialog (bottom sheet, ~85vw wide)

```
┌──────────────────────────────┐
│ [X]            About         │
│           ┌─────┐            │
│           │Logo │            │
│           └─────┘            │
│        Language Player       │
│                              │
│  ┌────────────────────────┐  │
│  │ Version     v0.0.0     │  │
│  │ Build Date  2026-08-12 │  │
│  │ Environment development│  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Contact                │  │
│  │ ✉ Email support        │  │
│  │ 💬 Discord server      │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ Documentation          │  │
│  │ Tokenizer Test         │  │
│  └────────────────────────┘  │
│                              │
│   © 2026 Language Player     │
└──────────────────────────────┘
```

Notes:

- Email and Discord rows are tappable links; arrows indicate navigation on web,
  while mobile rows use the whole row as the tap target
- Documentation and Tokenizer Test rows close the dialog before navigating
- Mobile uses a bottom sheet with a close button on phones and a centered
  dialog on larger screens; web always uses a centered dialog

## 6. i18n

Existing keys:

- `action.email_support`
- `action.contact_us`
- `title.docs`
- `title.tokenizer_test`
- `label.version`, `label.build_date`, `label.environment`

New key (added through the `translations.csv` workflow):

- `label.discord_server` — "Discord server"

## 7. Acceptance Criteria

- About no longer shows a commit hash or branch anywhere
- About is a modal dialog in both apps (mobile no longer has an `/about` route)
- Mobile About renders as a bottom sheet on phones and a centered dialog on
  larger screens
- Email support row opens `mailto:jon.long@zerotohero.ca`
- Discord row opens `https://discord.gg/D7vKcuKXuA`
- Documentation link navigates to docs in both apps
- Tokenizer test link navigates to the tokenizer page/screen in both apps
- Mobile tokenizer link is no longer dev-only

## 8. Testing

- Web: typecheck, lint, existing Vitest suite, `npm run build:check -w apps/web`
- Mobile: typecheck (`cd apps/mobile && ./node_modules/.bin/tsc --noEmit`)
- Manual: open About from the user menu in both apps; verify each link
