# Payment, Subscription & MailerLite — End-to-End Architecture

## Metadata

- **Arch ID**: ARCH-022
- **Feature**: Payment, subscription, free-trial, and MailerLite mailing-list architecture
- **Type**: as-built
- **Status**: draft
- **Created**: 2026-08-09
- **Last Updated**: 2026-08-10
- **ROADMAP Phase**: Cross-cutting (payment infrastructure)
- **Scope**: Python backend (active), Classic Nuxt (legacy), Next.js Web (active), React Native Mobile (active), Admin console (active)
- **Supersedes**: None
- **See also**:
  - [ARCH-015 — Payment Methods & Renewal Strategy](015-payment-methods-plan-support.md)
  - [SPEC-014 — Subscription & Payment System](../specs/014-subscription-payment-system.md)
  - [SPEC-054 — Subscription & Payment Testing](../specs/054-subscription-payment-testing.md)
  - [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)
  - [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md) (WS-6: subscriptions)
  - [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md)
  - [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)
  - `zerotohero-python-server/routes/payments.py` — payment routes
  - `zerotohero-python-server/routes/subscriptions.py` — subscription & email-verification routes
  - `zerotohero-python-server/app_stripe_checkout.py` — Stripe checkout, webhooks, renewal
  - `zerotohero-python-server/app_paypal_checkout.py` — PayPal verification
  - `zerotohero-python-server/app_in_app_purchase.py` — Apple receipt validation
  - `zerotohero-python-server/utils_subscription.py` — subscription CRUD + MailerLite group sync
  - `zerotohero-python-server/utils_mailer_lite.py` — MailerLite API helpers
  - `zerotohero-python-server/utils_subscription.py` — free trial + MailerLite enrollment (hooked into `/auth/verify-email`)
  - `zerotohero-python-server/auto_verify_email.py` — DreamHost support pipe (GoTrue-backed, SPEC-039 M5)
  - `zerotohero-python-server/data/prices.csv` — price definitions

---

## Overview

Language Player sells three Pro plans — monthly ($10), annual ($90), and lifetime ($169) — through Stripe (credit card, WeChat Pay, Alipay), PayPal, and Apple in-app purchase. The Python Flask backend is the single owner of subscription state: every frontend redirects the user to a payment provider, and the backend converts successful payment events into rows in the `user_subscriptions` table that gate Pro features everywhere.

Three ideas matter most for understanding this system:

1. **The backend is the source of truth.** Frontends never grant Pro themselves; they call `/user-subscription` to read state, and the backend writes subscriptions only after a verified payment callback or webhook.
2. **Stripe webhooks are the durable path.** The synchronous success redirect is convenient for UX, but `checkout.session.completed` and `invoice.paid` are what reliably create and renew subscriptions (especially for Payment Links, which have no return redirect).
3. **MailerLite sync is a side effect of subscription writes.** Every add/update/delete of a subscription tries to move the user's MailerLite subscriber into the matching group (`trial`, `monthly`, `annual`, `lifetime`, or `disengaged`), but a MailerLite failure never rolls back the subscription grant.

---

## Context

ARCH-015 documents the payment-method constraints and renewal strategy. SPEC-014 defines the unified implementation plan for web and mobile. This document describes how the system actually works today in `zerotohero-python-server/`, including the parts SPEC-014 leaves as future work (for example, mobile IAP is still not implemented).

Since ARCH-015 was written, SPEC-039 WS-6 moved subscriptions from Directus to Supabase (`public.user_subscriptions`). The utility functions in `utils_subscription.py` keep the same names and response shapes as the Directus era, so payment apps, routes, and the admin console use them unchanged. User ids are Supabase auth UUIDs, with legacy Directus numeric ids resolved through `user_id_map`.

---

## Plans, Prices & Payment Methods

`data/prices.csv` is the single source of truth for prices. `GET /stripe-prices` parses it and returns the live or test ids/links depending on the `test` query flag.

| Plan | USD | CNY | Stripe mode | Auto-renewal |
|---|---|---|---|---|
| Monthly | $10 | ¥73 | `subscription` (USD) / one-time `payment` (CNY) | ✅ Stripe credit card only |
| Annual | $90 | ¥653 | `subscription` (USD) / one-time `payment` (CNY) | ✅ Stripe credit card only |
| Lifetime | $169 | ¥1,227 | `payment` | ❌ one-time |

Payment-method support per ARCH-015:

| Method | Monthly | Annual | Lifetime | Auto-renewal |
|---|---|---|---|---|
| Stripe credit card | ✅ | ✅ | ✅ | ✅ |
| WeChat Pay / Alipay (Stripe Payment Links) | ✅ | ✅ | ✅ | ❌ one-time only |
| PayPal | ❌ | ❌ | ✅ | ❌ |
| Apple IAP | ❌ | ❌ | ✅ | ❌ non-consumable |

---

## Subscription Storage & Status

### Storage

Subscriptions live in Supabase `public.user_subscriptions` (one row per user record; `utils_subscription.update_or_add_subscription` updates the user's first existing row, or inserts one when none exists).

| Field | Description |
|---|---|
| `id` | Surrogate id — `GENERATED BY DEFAULT AS IDENTITY` (converted 2026-08-09; sequence set to `max(id)`) |
| `status` | Defaults to `draft`; not used by the status endpoint today |
| `user_id` | Supabase auth UUID (legacy Directus ids resolved through `user_id_map`) |
| `created_on` / `expires_on` | ISO timestamps; `expires_on` is `null` for lifetime |
| `type` | `monthly`, `annual`, `lifetime`, or `trial` |
| `payment_processor` | `stripe`, `paypal`, or `app-store` |
| `payment_method` | Optional method detail |
| `payment_email` | Email captured from the payment provider |
| `payment_id` | Stripe session id, PayPal pay id, or Apple transaction id |
| `payment_date` | When the payment was recorded |
| `notes` | Human-readable grant note |
| `payment_customer_id` | Stripe customer id (used for renewal lookup and cancellation) |

`payment_id` has a partial unique index (idempotency key; empty strings are
excluded), and `user_id` is a `uuid` FK to `auth.users` with `ON DELETE
CASCADE` so deleting an account removes subscriptions, acquisition rows, and
`user_id_map` entries.

### Status endpoint

`GET /user-subscription` authenticates the caller via Supabase JWT and returns the most recent active subscription — defined as `type == 'lifetime'` or `expires_on` in the future. If there are no active rows it returns the first row anyway; if the user has none at all it returns `{"subscription": null}`.

Web (`use-subscription.ts`, `SubscriptionProvider`) and mobile (`SubscriptionContext`) treat a user as Pro when the row is lifetime or has a future `expires_on`. Auto-renew is derived client-side as `monthly|annual && payment_customer_id != null && active`.

---

## Purchase Flows — How Successful Payments Raise the Subscription

All purchase paths converge on `update_or_add_subscription(payload)`:

- If the user already has a subscription row, the payload **updates** that row (new type, expiry, payment ids, customer id).
- If the user has no row, a new one is **inserted**.
- After either write, the row's owner email is assigned to the matching MailerLite group (see [MailerLite](#mailerlite-mailing-list-integration)).

### Purchase gating — active auto-renew blocks new purchases (SPEC-054 #20)

Web and mobile prevent a user from buying any plan while they have an
**active auto-renewing subscription** — matching Classic's
`hasActiveNonTrialSubscription`:

- Blocks when the user's subscription is non-trial, unexpired, **and has a
  `payment_customer_id`** (i.e., a live Stripe subscription with auto-renew).
- Trials are exempt.
- Cancelling auto-renew clears `payment_customer_id`, which lifts the block —
  the user keeps Pro until expiry but may buy a new plan (e.g., upgrade to
  lifetime) immediately.

Enforcement (implemented 2026-08-10):

- Web (`apps/web` go-pro) and mobile (`apps/mobile` go-pro) show a
  "cancel your existing subscription first" notice instead of payment
  methods, with a link to the profile page.
- `POST /create-stripe-checkout-session` returns **400** for blocked users,
  so the API can't be bypassed.
- Classic already gated in the UI; web/mobile now match.

Known limitation: CNY WeChat/Alipay **Payment Links** are opened directly on
Stripe, so a manipulated link can bypass the UI/API guard and complete a
purchase. The UI hides the links while blocked (same as Classic); a
webhook-side guard would be needed to close this fully.

### Pro feature gating — advertised vs implemented

What Classic's go-pro advertises (`FeatureComparison.vue`) and where the
limits are actually enforced:

| Advertised | Free | Pro | Implementation | Notes |
|---|---|---|---|---|
| Interactive transcript lines | first **10** lines | complete | `SyncedTranscript.vue` slices to `NON_PRO_MAX_LINES = 15`; the "you need Pro" prompt obscures 7, so ~8 lines are visible | ⚠️ advertised 10 ≠ implemented 15/8 |
| Word video examples | **2** examples (advertised) — actually first **5** corpus-wide subs-search hits | up to **500** hits (default 50 for speed; expandable via Settings → Subtitles Search → "Expand subtitles search results to 500 hits"), incl. TV-show filters | Classic `SearchSubsComp.vue` renders only `hitIndex < NON_PRO_MAX_SUBS_SEARCH_HITS = 5` for free; web/mobile `SubsSearchResults` apply the same slice and fetch `limit=50` (default) or `limit=500` when `settings_v2.search.expandSubsSearch` is on; powers the dictionary "examples" tab, phrasebook, compare | ⚠️ advertised 2 ≠ implemented 5; **corpus-wide search — no "current video" concept** |
| AI explanation ("Let DeepSeek Explain") | — | Pro-only | web `AiExplanation` (`apps/web/src/components/ai-explanation.tsx`) + Classic `WordBlockPopup.vue` | ⚠️ **not advertised on go-pro** — a real gate the marketing page omits |
| Videos/languages + dictionary | ✅ | ✅ | not gated | — |

The word-example limit **is** the subs-search hits mechanism — the two
advertised Pro gates map to exactly two code constants
(`NON_PRO_MAX_LINES`, `NON_PRO_MAX_SUBS_SEARCH_HITS`). The AI explanation is
a third, **non-advertised** gate.

In the new web/mobile apps the same caps are enforced in
`SubtitleDisplay` (first 10 transcript lines) and `SubsSearchResults`
(first 5 hits). Pro subs-search requests use the global
`settings_v2.search.expandSubsSearch` flag: off = fast default of 50 hits,
on = up to 500 hits. The flag is exposed in both apps under Settings →
Subtitles Search (matches Classic's `subsSearchLimit` toggle, inverted)
and is **Pro-only**: free users see it greyed out and off, and non-Pro
requests always use the 50-hit default even if a stored value is true.
See SPEC-054 C5 and the Settings V2 schema (`SearchSettings` in
`packages/shared/src/types.ts`).

Both are mismatched against the marketing copy (10 vs 15/8, 2 vs 5). SPEC-054
C5 asserts the advertised values, so before launch either align the
constants to 10/2 or update the go-pro copy to match the implemented limits.
The accepted gating strategy (10-line transcript cap, word-example copy
aligned to 5, hard Pro-only AI, SRS free cap of 20) is recorded in
[ADR-0034](../adr/0034-pro-gating-freemium-strategy.md).

### Stripe credit card (web, mobile, Classic)

```
Go Pro screen
  │ POST /create-stripe-checkout-session {price_id, user_id, host, mode}
  ▼
Stripe Checkout (hosted page)
  │ user pays
  ├──► redirect → GET /stripe_checkout_success?session_id&user_id&host
  │       • retrieve Checkout Session + line item
  │       • map price id → type (monthly/annual/lifetime)
  │       • expiry = now + 32/367 days (or null for lifetime)
  │       • update_or_add_subscription(...)
  │       • 302 → {host}/go-pro-success
  │           • page polls GET /user-subscription until Pro (up to 10 × 2s)
  └──► webhook → POST /webhook-stripe-checkout-session-completed
          • verify Stripe signature
          • same price→type/expiry mapping
          • update_or_add_subscription(...)
          • acts as idempotent fallback and is the reliable path for
            Payment Links (no return redirect)
```

The backend `stripe_checkout_success` handler is the single success callback for all frontends; the `host` parameter decides which app's `/go-pro-success` page receives the redirect.

### WeChat Pay / Alipay (Stripe Payment Links)

The Go Pro screen opens a pre-built Stripe Payment Link (CNY). After payment, Stripe fires `checkout.session.completed`; the webhook creates or updates the subscription. There is no redirect back to the app, so the user verifies the grant by polling `/user-subscription` (or by the app re-fetching on next launch).

### PayPal (Classic only, lifetime)

```
Classic go-pro → PayPal button (lifetime only)
  → user approves on PayPal
  → GET /paypal_checkout_success?pay_id&user_id&host
  → backend verifies payment state == "approved"
  → update_or_add_subscription({type: "lifetime", processor: "paypal", ...})
  → 302 {host}/go-pro-success (or /go-pro-error)
```

Web and mobile currently link out to Classic's go-pro page for PayPal rather than implementing a direct PayPal button.

### Apple IAP (Classic today; mobile per SPEC-014)

```
PurchaseiOS → Apple payment sheet → receipt
  → POST /in_app_purchase_success {user_id, receipt}
  → backend validates receipt with Apple via inapppy
    (bundle ca.zerotohero.go — new app replaces the GO listing, SPEC-048)
  → update_or_add_subscription({type: "lifetime", processor: "app-store", ...})
  → {type: "success"} → /go-pro-success
```

IAP is a non-consumable product and always grants lifetime. The new mobile
app purchases the GO listing's `pro_go` product (bundle `ca.zerotohero.go`);
Classic's IAP uses `pro` under `ca.zerotohero.app`.

### Admin grant

The admin console (`apps/admin`, SPEC-060 / ADR-0032) can grant a subscription directly:

`POST /admin/users/<user_id>/subscriptions` → `add_subscription(...)` with auto-computed expiry (`trial` = +7d, `monthly` = +30d, `annual` = +365d, `lifetime` = none). Because it reuses `utils_subscription`, the MailerLite group assignment is preserved.

---

## Renewal Flow — How Renewal Payments Renew a Subscription

Only Stripe credit card (USD) subscriptions auto-renew. When Stripe charges the card again it fires `invoice.paid`:

```
Stripe charges card
  → POST /webhook-stripe-subscription-invoice-paid
  → verify Stripe signature
  → find price id from invoice line items → type (monthly/annual)
  → find local subscription by payment_customer_id
  → compute new expires_on = now + 32d (monthly) or 367d (annual)
  → update_subscription(...) with new expires_on, payment_date, processor
  → MailerLite group re-assigned to monthly/annual
```

Note: the handler recomputes `expires_on` from the payment time (`now + 32/367 days`) rather than adding days to the previous expiry. Under normal period-end billing that behaves like an extension; an early renewal would reset the window.

---

## Free Trial — Granted on GoTrue Email Verification

New users get their trial from `POST /auth/verify-email` (SPEC-039 M1/M2,
resolved 2026-08-10). After GoTrue confirms the email, the route calls
`utils_subscription.grant_trial_and_enroll_mailerlite(email)`:

```
signup → POST /auth/register
  → verification link/code → POST /auth/verify-email
  → grant_trial_and_enroll_mailerlite(email)
      • give_free_trial_if_no_subscription_exists(user_id)
          - no subscription row of any type? → insert
            {type: "trial", expires_on: now + 7 days, notes: "Free trial subscription."}
          - any existing row (active, lifetime, or expired)? → no trial
      • new_mailer_lite_subscriber(email, first_name, last_name,
                                   role=metadata role,
                                   auth_user_id=auth UUID,
                                   group_name="trial" if a trial was granted)
```

Enrollment failures are logged and never fail the verification response. The
legacy `/verification_email*` HTTP flow was removed in SPEC-039 M5. The only
survivor is the DreamHost support pipe (`auto_verify_email.py`, reached via
`verify_email@zerotohero.ca`), which confirms the user through the GoTrue
admin API and calls the same `grant_trial_and_enroll_mailerlite` hook.

---

## Subscription Management

### User self-service

Every app's profile/me screen fetches `GET /user-subscription` and shows a subscription card: plan type, expiry (or lifetime), and whether it auto-renews. For monthly/annual Stripe subscriptions the card exposes **Cancel**:

```
Profile → Cancel
  → POST /cancel-subscription-at-end-of-period {customer_id}
  → Stripe: list active subscriptions for the customer
  → Stripe Subscription.modify(cancel_at_period_end=True)
  → update local row: payment_customer_id = null
      • MailerLite: monthly/annual without customer id → "disengaged"
  → frontend clears customer id / re-fetches /user-subscription
```

The Stripe subscription continues until the paid period ends; the local row stops advertising auto-renew (client `willAutoRenew` becomes false once `payment_customer_id` is null).

### Success-page polling

`/go-pro-success` (web and mobile) polls `GET /user-subscription` up to 10 times with a 2-second interval to confirm the webhook/redirect grant landed, then shows success or a "still processing" state.

### Admin management

- **Legacy Classic admin** (`zerotohero-nuxt/pages/admin/manage-subscriptions.vue`) uses the ungated `POST /admin/update_or_add_subscription` and `GET /admin/check_user_subscription?email=` endpoints.
- **New admin console** (`apps/admin`) uses the JWT-gated `routes/admin_users.py` endpoints: grant (`POST /admin/users/<user_id>/subscriptions`), change (`PATCH /admin/subscriptions/<id>`), and remove (`DELETE /admin/subscriptions/<id>`). Remove calls `delete_subscription`, which moves the MailerLite subscriber to `disengaged`.

---

## MailerLite Mailing-List Integration

### API helpers

`utils_mailer_lite.py` wraps the MailerLite API v2 using the `MAILER_LITE_TOKEN` environment variable:

| Helper | What it does |
|---|---|
| `new_mailer_lite_subscriber(...)` | Creates a subscriber with custom fields `role`, `last_name`, and `auth_user_id` (TEXT — GoTrue UUID); keeps the legacy numeric `user_id` when a Directus id is known; then optionally assigns a group |
| `fetch_subscriber_by_email(email)` | Looks up an existing subscriber |
| `assign_mailer_lite_subscriber_to_group(email, group_name)` | Fetches the subscriber and assigns them to the named group |
| `update_subscriber_auth_user_id(id, auth_user_id)` | Backfills/updates the `auth_user_id` field via the connect API (used by the SPEC-039 M2 backfill) |
| `forget_mailer_lite_subscriber(email)` | GDPR-forgets a subscriber via `POST /api/subscribers/{id}/forget` (SPEC-039 M6; called by delete-account) |

### Subscriber identity (SPEC-039 M2)

MailerLite has two user-id fields with different jobs:

- `user_id` (NUMBER) — legacy Directus numeric id, kept for imported records.
- `auth_user_id` (TEXT) — Supabase `auth.users` UUID; written for all new
  GoTrue subscribers and backfilled for existing Language Player group
  members (2026-08-10).

The backfill sources only the nine Language Player groups (CZH groups are
excluded; a subscriber who is in both an LP and a CZH group is still updated
because they are an LP user). The mapping comes from
`public.user_id_map`, with an email fallback to `auth.users`.

### Where sync happens

| Trigger | MailerLite action |
|---|---|
| Email verification (new user) | Create subscriber; assign to `trial` when a trial was granted |
| `add_subscription` | Assign subscriber to the new row's `type` |
| Delete account | GDPR-forget the subscriber (best-effort; never blocks deletion) |
| `update_subscription` | Assign subscriber to the new `type`; `monthly`/`annual` without `payment_customer_id` → `disengaged` |
| `delete_subscription` (admin remove) | Assign subscriber to `disengaged` |

### Automations (workflows)

Snapshot taken 2026-08-10 from `GET https://connect.mailerlite.com/api/automations` (current MailerLite API). The enabled automations that belong to Language Player are:

| Automation | MailerLite ID | Status | Workflow description |
|---|---|---|---|
| Onboarding Sequence | `61912654912947520` | enabled | Welcomes new trial users; openers move to `engaged`, non-openers to `disengaged`. |
| Sales Sequence | `62273710862632085` | enabled | 3-email nurture for `engaged` users; removes Pro users and moves remaining non-Pros to `disengaged`. |
| Once Pro, remove from other groups | `62432521040692992` | enabled | Removes users from non-Pro groups when they join a paid group. |
| Re-engagement Sequence | `62909029161109329` | enabled | Re-engagement emails to `disengaged` users; openers return to `re-engaged`, non-openers to `bucket`. |
| Resurrection Sequence | `121528698643940659` | enabled | Miss-you email to `bucket` users after 1 month; skips paid users, openers go to `re-engaged`, non-openers to `delete`. |

Automations that belong to the separate Chinese Zero to Hero website are excluded from the Language Player list, even when the workflow name lacks the CZH prefix.[^czh]

[^czh]: Enabled CZH automations (Chinese Zero to Hero site): CZH Free Students Main Welcome (`125958017445267029`), CZH Free Students Initial Welcome (`159592479797020241`), CZH popup Workflow (`159594997014856996`), Intro To Chinese Course Upsell (`175774798873363491`). Intro To Chinese Course Upsell has no CZH prefix but triggers on the `czh-intro-to-Chinese-students` group. The remaining CZH automations are currently disabled.

#### New-user flow through the automations

```text
NEW USER
  |
  v
trial group
  |
  v
Onboarding Sequence
  |  5 min -> welcome email
  |  3 days -> opened email?
  |
  +-- yes -> engaged group -> Sales Sequence
  |
  +-- no -> disengaged group -> Re-engagement Sequence

Sales Sequence (engaged group)
  |  7d -> sales email 1
  |  7d -> sales email 2
  |  7d -> sales email 3
  |
  +-- becomes monthly/annual/lifetime -> exit (Once Pro cleanup)
  |
  +-- still not paid after email 3 -> disengaged group -> Re-engagement Sequence

Re-engagement Sequence (disengaged group)
  |  7d -> "Plan your return" email
  |  6d -> "Watch Live TV" email
  |  6d -> opened either email?
  |
  +-- yes -> re-engaged group -> Sales Sequence 2nd Attempt
  |
  +-- no -> bucket group -> Resurrection Sequence

Sales Sequence 2nd Attempt (re-engaged group)
  |  7d -> email 1; then 3d between emails 2-4
  |
  +-- becomes monthly/annual/lifetime at any check -> exit
  |
  +-- not paid after email 4 -> end

Resurrection Sequence (bucket group)
  |  1 month -> "We miss you" email
  |  7 days -> opened email?
  |
  +-- yes -> re-engaged group
  |
  +-- no -> delete group (marked unsubscribed)

Side paths:
  Any stage: becomes monthly/annual/lifetime
    -> Once Pro, remove from other groups removes non-Pro groups
       (trial/engaged/disengaged/re-engaged/bucket);
       remaining email steps stop at the next paid check
  Monthly/annual cancellation -> disengaged group -> Re-engagement Sequence
```

### Group mapping

All Language Player MailerLite groups (CZH groups excluded — see the [Automations](#automations-workflows) footnote):

| Group | Active users | How subscribers enter | Role / what happens next |
|---|---|---|---|
| `trial` | 897 | New signup verified with a trial grant | Triggers Onboarding Sequence; openers → `engaged`, non-openers → `disengaged` |
| `engaged` | 192 | Opened the onboarding welcome email | Triggers Sales Sequence; Pro users are removed, remaining non-Pros → `disengaged` after email 3 |
| `disengaged` | 3,558 | Onboarding non-opener; non-Pro after Sales Sequence; cancelled monthly/annual; subscription removed | Triggers Re-engagement Sequence; openers → `re-engaged`, non-openers → `bucket` |
| `re-engaged` | 6,659 | Opened a re-engagement email | Triggers Sales Sequence 2nd Attempt; Pro users removed, others end after email 4 |
| `bucket` | 1,134 | Didn't open re-engagement emails | Triggers Resurrection Sequence; paid users skipped, openers → `re-engaged`, non-openers → `delete` |
| `delete` | 4,281 | Didn't open the resurrection email | Marked as unsubscribed |
| `monthly` | 243 | Monthly subscription granted | Pro group; `Once Pro, remove from other groups` removes non-Pro groups |
| `annual` | 41 | Annual subscription granted | Pro group; same |
| `lifetime` | 493 | Lifetime purchase granted | Pro group; same |
| **Total (sum)** | **17,498** | — | Sum of active counts across groups; not a unique-subscriber count because overlaps exist |

Active-user counts are a snapshot from 2026-08-10. All other groups in the account are CZH, legacy, or internal lists:[^other-groups]

[^other-groups]: **CZH (Chinese Zero to Hero):** `Affiliates - Chinese Zero To Hero`, `CZH buyer funnel nurture (students who bought our courses already)`, `czh-disengaged`, `czh-engaged-high-quality`, `CZH final funnel nurture`, `czh-free-course`, `czh-free-course-active`, `czh-free-course-inactive`, `czh-free-course-step1`, `czh-inactive-engaged`, `czh-intro-to-Chinese-students`, `czh-non-ultimate`, `czh-popup-leads`, `CZH post-welcome-funnel`. **Legacy/internal:** `missing_imported_from_directus_may_22_2024`, `paid-students-exclude-from-sales`, `ultimate-bundle-students`, `unknown`.

### Group exclusivity — intended vs actual

The lifecycle is designed so each subscriber sits in exactly one Language Player group at a time: transitions use `move_to_group` (which removes from the source group), and the "Once Pro, remove from other groups" automation removes non-Pro groups when someone becomes paid.

That intent does not match reality. A 2026-08-10 sample of up to 1,000 subscribers per group found **761 subscribers in more than one Language Player group**. Examples: 229 in `disengaged` + `re-engaged`, 144 in `bucket` + `re-engaged`, 128 in `disengaged` + `trial`, 60 in `disengaged` + `re-engaged` + `trial`, 15 in `lifetime` + `monthly`, and 5 in `annual` + `monthly`. Groups with more than 1,000 members were only partially sampled, so the true overlap is likely higher.

Why overlaps happen:

- `move_to_group` only removes from the source group named in the step, not from every other group.
- Some `remove_from_group` steps do not expose their target groups in the API and do not cover all combinations — paid groups overlap each other too.
- Backend group assignment (`assign_mailer_lite_subscriber_to_group`) adds a subscriber to a group without removing old groups first.
- Legacy imports and manual list management can leave subscribers in multiple groups.

Ways to mitigate:

1. Add explicit `remove_from_group` steps (or a single "move to canonical group" pattern) so every transition leaves all other Language Player groups.
2. Change the backend to remove the subscriber from the other Language Player groups before assigning the new one, or use a group-replacement operation if MailerLite supports one.
3. Make "Once Pro, remove from other groups" also remove from the other paid groups (`monthly`/`annual`/`lifetime`) so paid groups are exclusive too.
4. Run a one-time cleanup to find subscribers in multiple groups and move them to the group matching their current subscription/lifecycle state.
5. Add a recurring overlap check that compares group subscriber lists and flags new mismatches.

### Behavior notes

- The `role` custom field is copied from the user record at subscriber creation; the code comment documents `3` = Free User, `4` = Pro User.
- Subscriber creation now happens on the GoTrue `/auth/verify-email` path (SPEC-039 M1/M2), not the legacy Directus flow. Group assignment still only works if the email already exists as a MailerLite subscriber, so payment/renewal paths do not upsert missing subscribers yet (SPEC-054 B66).
- Every assignment call is wrapped in `try/except` in `utils_subscription.py`; a MailerLite error is logged and the subscription grant still succeeds. Subscriber creation inside `grant_trial_and_enroll_mailerlite` is also wrapped, so a MailerLite outage never fails email verification.

---

## Endpoint Reference

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/stripe-prices?test=` | Price ids / Payment Links from `prices.csv` | Public |
| POST | `/create-stripe-checkout-session` | Create Stripe Checkout Session, return `{url}` | Public (expects user id) |
| GET | `/stripe_checkout_success` | Verify session, grant subscription, redirect to success/error | Public (Stripe redirect) |
| POST | `/webhook-stripe-checkout-session-completed` | Stripe webhook — initial purchase | Stripe signature |
| POST | `/webhook-stripe-subscription-invoice-paid` | Stripe webhook — renewal | Stripe signature |
| GET | `/paypal_checkout_success` | Verify PayPal payment, grant lifetime, redirect | Public (PayPal redirect) |
| POST | `/in_app_purchase_success` | Validate Apple receipt, grant lifetime | Public (app call) |
| GET | `/user-subscription` | Return current subscription | Supabase JWT |
| POST | `/cancel-subscription-at-end-of-period` | Cancel Stripe subscription at period end | Public (app call) |
| POST | `/admin/update_or_add_subscription` | Legacy admin upsert by email | Ungated (Classic compat; see ADR-0032) |
| GET | `/admin/check_user_subscription?email=` | Legacy admin lookup | Ungated |
| POST | `/admin/users/<user_id>/subscriptions` | Admin grant | Admin JWT |
| PATCH | `/admin/subscriptions/<id>` | Admin change | Admin JWT |
| DELETE | `/admin/subscriptions/<id>` | Admin remove | Admin JWT |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Backend owns subscription state | One grant path for all frontends; apps only read status and redirect |
| Webhooks are the durable grant/renewal path | Payment Links have no return redirect; webhooks survive browser redirect failures |
| `prices.csv` + `/stripe-prices` as single price source | One place to change plans/prices; frontends never hardcode ids |
| Local row updates in place (`update_or_add_subscription`) | Simple state model: one current subscription per user |
| MailerLite sync as best-effort side effect | Mailing list must not block revenue-critical payment processing |
| Free trial logic lives on `/auth/verify-email` | One controlled, one-time 7-day entry point after GoTrue confirms the email (SPEC-039 M1/M2, resolved 2026-08-10) |

---

## Known Limitations & Notes

- **WeChat Pay / Alipay do not auto-renew.** Monthly/annual CNY purchases are one-time Payment Links; the user must re-purchase when the plan expires.
- **PayPal and Apple IAP are lifetime-only.**
- **Mobile IAP is not implemented yet** (SPEC-014); the React Native app still relies on web-based Stripe/Payment-Link flows.
- **Renewal recomputes expiry from payment time** (`now + 32/367 days`) rather than stacking onto the previous expiry.
- **MailerLite creation is limited to email verification**, so group assignment for pre-existing subscribers depends on them already being in MailerLite (SPEC-054 B66).
- **Legacy admin subscription endpoints are still ungated** server-side for Classic compatibility; gating/retiring them is tracked in ADR-0032.

---

## References

- [ARCH-015 — Payment Methods & Renewal Strategy](015-payment-methods-plan-support.md)
- [SPEC-014 — Subscription & Payment System](../specs/014-subscription-payment-system.md)
- [SPEC-054 — Subscription & Payment Testing](../specs/054-subscription-payment-testing.md)
- [SPEC-060 — Admin Console User Management](../specs/060-admin-console-user-management.md)
- [SPEC-039 — Full Database Migration to Supabase](../specs/039-full-database-migration-supabase.md)
- [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md)
- [ADR-0032 — Admin Console App](../adr/0032-admin-console-app.md)
