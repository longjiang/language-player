# SPEC-041: Delete Account

## Metadata
- **Spec ID**: SPEC-041
- **Feature**: Permanent account deletion with confirmation
- **Status**: complete
- **Created**: 2026-08-04
- **ROADMAP Phase**: Phase 6: User Features

## Overview

Authenticated users can permanently delete their account from the profile page.
The flow uses a destructive confirmation dialog with a loud, irreversible-data
warning and requires typing `DELETE` before the action is enabled. Users with
an active auto-renewing subscription are asked to cancel it first.

## User Stories

- As a user, I want to delete my account and all of my data.
- As a user, I want a clear warning that deletion is permanent and cannot be undone.
- As a user, I want a confirmation step so I don't delete my account accidentally.

## How It Works in Classic (Nuxt)

- `zerotohero-nuxt/pages/delete-account.vue` — confirm-by-typing flow.
- `zerotohero-nuxt/plugins/directus.js` — `DELETE /auth/delete-account`.

## Implementation (Next.js)

### Route

- `/[l1]/[l2]/profile` — Delete Account danger section + confirmation dialog.

### Data Flow

1. The profile page loads the user's subscription.
2. If an active auto-renewing subscription exists, deletion is blocked until it is cancelled.
3. The user opens the confirmation dialog, reads the permanent-deletion warning, and types `DELETE`.
4. The client calls `DELETE /auth/delete-account` (Flask → GoTrue admin delete).
5. On success, local user data is cleared and the user is signed out.

### API Endpoints

- `DELETE /auth/delete-account` — existing Flask endpoint (SPEC-039 5.7).

### States

- **Blocked**: active auto-renewing subscription — shows cancel-first message.
- **Confirm**: dialog with permanent-deletion warning; delete button disabled until `DELETE` is typed.
- **Deleting**: spinner on the delete button.
- **Error**: inline error message if deletion fails.

## Dependencies

- SPEC-039 5.7 GoTrue account deletion endpoint.

## Open Questions

None.
