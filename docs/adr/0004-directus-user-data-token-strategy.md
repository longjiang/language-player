# ADR-0004: Directus User Data — Token Strategy & `owner` Field

**Date**: 2026-07-13
**Status**: accepted

## Context

The `user_data` collection in Directus stores per-user data (saved words, progress, etc.). Our Flask API acts as a proxy between the Next.js client and Directus. We need to decide how to authenticate requests to Directus when reading/writing `user_data` records.

The `user_data` collection has an `owner` field of Directus type `owner` — a **system field** that tracks which Directus user owns the record.

## Directus Idiosyncrasies

### 1. `owner` is a system field, not a regular integer

Despite appearing as an integer in the database, the `owner` field is Directus's built-in ownership tracking type. Key behaviors:

- **Auto-assigned on create**: Directus sets `owner` to the authenticated user making the request. Passing `"owner": 85053` in the POST body is **silently ignored**.
- **Auto-filtered on read**: When a regular user queries a collection, Directus permissions automatically scope results to records where `owner` matches that user.
- **Cannot be set via API**: There is no way to create a record "on behalf of" another user via the REST API. The only way is to use that user's token.

### 2. Using the admin token backfires

If we use the admin token (from `.env`) for all Directus calls:
- Every `POST` to `user_data` would create a record with `owner=1` (admin)
- Since `owner` has a UNIQUE constraint, the second attempt fails with `"Duplicate key 1"`
- The admin already has a `user_data` record, so creates always fail

### 3. JWT is self-contained

Directus JWTs contain the user ID in their payload (`{"id": 85053, ...}`). We can extract it via base64-decode — no need to call `/users/me`.

## Options Considered

### Option A: Admin token for everything (original approach)
- **Pros**: Simple — one token, always available
- **Cons**: `owner` auto-assigns to admin (id=1). Creates always fail. Dead on arrival.

### Option B: Admin token for GET, user token for POST
- **Pros**: Admin can see all records; user token fixes create ownership
- **Cons**: Two code paths; still needs admin token loaded at the right time

### Option C: User token for everything (chosen)
- **Pros**: Directus handles ownership, filtering, and permissions automatically. No admin token needed at all for this endpoint. Simpler code — one set of headers.
- **Cons**: None identified. The user is already authenticated by the time they hit our Flask endpoint (they pass their Directus JWT in the `Authorization` header).

### Option D: Direct SQL INSERT (bypass Directus API)
- **Pros**: Can set any `owner` value
- **Cons**: Bypasses Directus hooks, validation, and permissions. Tight coupling to MySQL schema. Not portable if Directus backend changes.

## Decision

**Option C: User token for everything, JWT-decoded user ID, no admin token.**

All Directus calls (GET, POST, PATCH) for `user_data` use the end user's token. The user ID is extracted from the JWT payload via base64-decode — no `/users/me` API call.

### Implementation detail

```python
def _authenticated_user_id() -> tuple[str, str]:
    # Decode JWT payload to get user ID
    # Returns (user_id, user_token)
    ...

def _find_or_create_user_data(user_id: str, user_token: str) -> dict:
    # GET /items/user_data with user's token → Directus scopes to their records
    # If none found: POST /items/user_data (no "owner" in body) → auto-assigned
    ...
```

## Consequences

- **No dependency on admin token** for this endpoint. Eliminates the dotenv-vs-import-order race condition.
- **No `/users/me` API call**. Faster, no network failure point.
- **Directus permissions must allow** regular users to read/create/update their own `user_data` records. This is already configured.
- **If the user has no `user_data` record**, one is auto-created on first request. This is desired behavior — every user gets a record lazily.
- **PATCH for sync** also uses the user's token, so Directus can enforce that users only modify their own records.
