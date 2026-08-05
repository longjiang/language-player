# SPEC-042: Registration Acquisition Survey

## Metadata

- **Spec ID**: SPEC-042
- **Feature**: "How did you hear about us?" survey on the registration screen
- **Status**: complete
- **Created**: 2026-08-05
- **ROADMAP Phase**: Phase 2: Auth + Core Navigation

## Overview

New users must answer a short "How did you hear about us?" survey before they can
create an account. The answer is stored per-user so marketing can see which
channels drive signups. The survey is required and lives on the **registration
screen** (not the email-verification screen).

## User Stories

- As a new user, I want to tell Language Player how I heard about it while
  signing up.
- As a marketer, I want every new user's acquisition source stored so I can
  measure channel performance.

## How It Works in Classic (Nuxt)

- `zerotohero-nuxt/pages/register.vue` renders the required `<select>` on the
  registration form with the same option values (`word_of_mouth`, `instagram`,
  `bilibili`, `google_ads`, `hsk_courses`, `app_store`, `google_play`,
  `google_search`, `youtube`, `other`) plus a "Please specify" input when
  **Other** is chosen. After `/auth/register` succeeds it posts the answer to
  `/acquisition_survey` with the returned user id. (Moved here from
  `verify-email.vue` in 2026-08-05; the old verify-email flow also dropped the
  fields from the request during the SPEC-039 5.7 GoTrue migration, so Classic
  had stopped persisting answers until this change.)

## Implementation (Next.js + Mobile)

### Shared

- `packages/shared/src/constants.ts` — `ACQUISITION_SOURCES` exports the
  option list (value + `labelKey` into `translations.csv`), so web and mobile
  stay in sync with each other and with Classic.

### Data Flow

1. The user picks a source (and types details when **Other** is selected).
2. `POST /auth/register` creates the GoTrue account and returns the user id.
3. The client immediately calls `POST /acquisition_survey` with
   `{ user_id, acquisition_source, acquisition_details }` (existing Flask
   endpoint, SPEC-039 5.6) which upserts into `user_acquisition`.
4. Failure to store the survey is logged (`[LP Web]` / `[LP Mobile]`) but does
   not block registration.

### Screens

- **Web**: `apps/web/src/app/register/page.tsx` — required shadcn `Select`
  added to the registration form step; "Please specify" input appears for
  **Other**. Submitting without a selection shows `msg.please_select_option`.
- **Mobile**: `apps/mobile/app/register.tsx` — required expandable option list
  (Pressable dropdown, same pattern as `VoicePicker`); "Please specify" input
  appears for **Other**. Same client-side validation.

### API Endpoints

- `POST /auth/register` — existing Flask endpoint (SPEC-039 5.7); returns
  `{ user: { id, ... } }`.
- `POST /acquisition_survey` — existing Flask endpoint; requires `user_id` and
  `acquisition_source`.

### Validation

- Registration is blocked until a source is selected.
- **Other** requires non-empty details.
- Error copy uses the new key `msg.please_select_option`
  ("Please select an option.", all 31 locales).

## Dependencies

- SPEC-039 5.6 `user_acquisition` table and `/acquisition_survey` endpoint.
- Existing translation keys `title.how_did_you_hear`, `option.*`, and
  `placeholder.please_specify`.

## Open Questions

None.
