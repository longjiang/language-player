# SPEC-112: Coupon-driven sales (a sale is a featured coupon)

## Metadata

- **Spec ID**: SPEC-112
- **Feature**: Sales become coupon rows in the database instead of hardcoded
  client-side date windows; one public endpoint is the single authority for
  *when* a sale runs and *how much* it costs; a landing-page sale banner; and
  a verified answer for what this can and cannot do through the App Store and
  Google Play.
- **Status**: **draft — proposal only, nothing implemented.** Decisions in
  [Open decisions](#open-decisions) need product sign-off before code.
- **Created**: 2026-11-25
- **ROADMAP Phase**: Phase 10 — Admin Console / payments
- **See also**:
  - [ADR-0048 — Sale windows are gated on the client clock](0048-client-side-sale-window-gating.md)
    — **Decision 1 is superseded by this spec** (see
    [Documentation impact](#documentation-impact))
  - [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md)
    § *Mid-Autumn sale* — the current sale mechanism this replaces
  - [SPEC-102 — Affiliates and Coupon Codes](102-affiliates-and-coupons.md) —
    the coupon model this extends
  - [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md)
  - [ARCH-024 — Mobile In-App Purchase](../arch/024-mobile-iap-architecture.md)
  - [ADR-0013 — App store strategy](../adr/0013-app-store-strategy.md)
  - `packages/shared/src/sale.ts`, `zerotohero-python-server/utils_coupons.py`,
    `zerotohero-python-server/data/sale_windows.csv`,
    `zerotohero-python-server/data/prices.csv`,
    `apps/web/src/app/(public)/page.tsx`,
    `apps/web/src/components/landing/pricing-section.tsx`,
    `apps/web/src/app/[l1]/[l2]/go-pro/page.tsx`,
    `apps/web/src/components/sale-notice.tsx`,
    `apps/mobile/hooks/use-sale-pricing.ts`,
    `apps/mobile/app/(tabs)/(me)/go-pro.tsx`,
    `apps/admin/src/app/coupons/page.tsx`

## Summary

Today a sale is **three separate hardcoded things**: a client-side date window
(`packages/shared/src/sale.ts`), a set of discounted price rows
(`data/prices.csv`), and a historical window list used only for reporting
(`data/sale_windows.csv`). Running a campaign means editing constants, adding
price rows, and shipping a web deploy — plus a mobile build for the window to
change, because the same constants are compiled into the app.

This spec makes a sale **one row**: a coupon in `public.coupons` that is marked
as the public campaign. The coupon already carries the discount; it gains a
start time, a customer-facing title, and a "this is the public sale" flag. A new
public `GET /sale` endpoint exposes the active featured coupon, and every
surface — landing banner, pricing table, go-pro page, in-app upgrade prompts —
renders from that one response. Checkout already validates and reserves a
coupon server-side; it keeps doing that.

The result: changing a campaign's dates, code, title, or percentage is a
database/admin action, not a deploy. The advertised discount and the charged
discount come from the same row. And Stripe **test** mode can finally exercise a
sale, because coupons (unlike the `type=sale` price rows) have test Stripe
coupon ids.

The second half of the spec answers the store question, because a web coupon
cannot be redeemed through App Store or Play billing. The short answer, with
the evidence in [App Store and Google Play](#app-store-and-google-play--how-a-coupon-sale-actually-works-on-mobile):
**our `BF50` works only on web (Stripe card / PayPal, USD).** iOS and Android
have their own promo/offer mechanisms with different constraints, and they do
not read our database.

The concrete Black Friday campaign is just data — `BF50` is already in the
database; ops sets its window, title, and featured flag.

## Motivation

### Three authorities instead of one

| Authority | File | Answers | Problem |
|---|---|---|---|
| Client clock | `packages/shared/src/sale.ts` (`SALE_START_LOCAL`, `SALE_END_LOCAL`, `isSaleWindowOpen()`) | **When** is the sale? | Compiled into web **and** mobile; dates are constants. ADR-0048 chose per-device local time, so every device decides separately |
| Price rows | `data/prices.csv` `type=sale` rows | **How much**? | Static CSV: a time-bounded offer needs a hand flip; no `test_price_id`, so the sale is untestable in Stripe test mode (ADR-0048 consequence) |
| Reporting windows | `data/sale_windows.csv` | What did we *estimate* historically? | Also gates coupons via `utils_coupons._sale_active()`, so a coupon sale collides with its own window |

Three sources that must agree, none of which can start or end a sale on its
own. ADR-0048 already documented the failure mode: the backend `status` column
cannot express a window, so the sale was permanently off until the client
window was added — and then the amount came from the price row, not the window.

### What we already have

- **Coupons are implemented** (SPEC-102 v1): admin CRUD, public validation,
  reservation for 30 minutes, `coupon_redemptions`, Stripe coupons created
  lazily and cached (`stripe_coupon_id_live` / `_test`), PayPal support, and a
  `payment_events` ledger.
- **`BF50` already exists** in `public.coupons` (50% off, lifetime, USD) — the
  campaign can be run today by typing the code at checkout; it just has no way
  to advertise itself.
- **Checkout already sends `coupon_code`** from the go-pro page in both the
  Stripe and PayPal paths, reserves it, and confirms it on payment.
- **The UI already previews the discounted amount** from the server
  (`couponPreview.finalCents`), so "what you see is what is charged" for
  coupon purchases is already true.

### What is missing

1. Coupons have no **start** time and no **customer-facing** name — only
   `expires_at` and an `internal_name`.
2. Coupons have no way to say "this one is the public sale".
3. Coupons are **blocked while any `sale_windows.csv` window is open**
   (`_sale_active()`), and the go-pro page disables the coupon input while the
   client window is open — the sale and the coupon fight each other.
4. The sale headline is the literal translation key `msg.sale_mid_autumn`,
   hardcoded in go-pro, the pricing section, and `SaleNotice` (and mirrored by
   the `SALE_NAME_KEY` constant). A new campaign needs new code + new
   translations.
5. There is no sale banner on the landing page — the original request that
   started this work.

## Current state (as built)

- `apps/web/src/hooks/use-sale.ts` resolves the window in an effect after
  mount (never during SSR — a `'use client'` component is still server-
  rendered), re-checking every 60s.
- Consumers: `go-pro/page.tsx` (`showSale`, sale banner, sale price card,
  `coupon_not_with_sale` guard), `landing/pricing-section.tsx` (fetch prices
  only while the window is open), `sale-notice.tsx` (3 in-app upgrade
  prompts), and mobile's `SaleNotice`, `profile.tsx`, `go-pro.tsx`,
  `use-sale-pricing.ts`.
- `GET /stripe-prices` returns regular and `type=sale` rows;
  `findSalePrice()` deliberately ignores `status`.
- `POST /coupons/validate` and `/create-stripe-checkout-session` reject a
  coupon with `code: sale_active` whenever a `sale_windows.csv` window covers
  today (`utils_coupons._sale_active()`).
- CNY checkout uses prebuilt Stripe Payment Links, so it cannot accept a
  coupon — a coupon sale is **USD-only** (Stripe card and PayPal).
- Mobile sells lifetime Pro only through IAP (`pro_go`, non-consumable;
  iOS deployment target 16.4), and never claims a discount unless the store's
  own price is below our regular row (`hasStoreDiscount()`).

## Documentation impact

This spec is a proposal; **no ADR is edited until it is approved**, because
ADR-0048 is an accepted decision record. On approval:

| Document | Change |
|---|---|
| `docs/adr/0048-client-side-sale-window-gating.md` | **Superseded in part.** Decisions 1 (client clock is the authority for *when*) and the "sale ends by itself" rationale move to a server-owned window on the coupon row. Decisions 2–5 (amount from backend rows, derived percentage, store prices read-never-claimed) still hold. Write **ADR-0054 — Sale window is stored on the coupon row; one public endpoint serves it**, and mark ADR-0048 as superseded with a pointer. |
| `docs/specs/014-subscription-payment-system.md` | Replace § *Mid-Autumn sale* with § *Sales (coupon-driven)* and the behaviour matrix; keep the store-price sections but point at this spec for the store mechanisms. |
| `docs/specs/102-affiliates-and-coupons.md` | Extend the coupon model (`starts_at`, `featured`, `public_title`), remove "coupons cannot be combined with a sale" in favour of "the sale *is* a coupon", and replace the claim that store billing "cannot accept a coupon" with the verified store mechanisms (offer codes / discount offers). |
| `ROADMAP.md` | Phase 10 bullet for SPEC-112 while it is in progress. |
| `docs/README.md` | Spec index row (added with this draft). |

## Proposed design

### 1. One authority: the featured coupon

A campaign is a coupon row with:

- `featured = true` — this is the public sale; at most one at a time;
- `public_title` — the customer-facing name ("Black Friday"), rendered as data,
  not as a translation key;
- `starts_at` / `expires_at` — the window. **Both are UTC instants, evaluated
  by the server.** Display converts to the viewer's locale/timezone.

The coupon's own `percent_off` / `amount_off_cents` is the discount. The
featured coupon is valid on the same terms as every other coupon: lifetime
only, USD only, one redemption per user, `max_redemptions` cap.

> **Why UTC and not per-device local time (a deliberate change from ADR-0048).**
> A coupon's expiry is enforced by the server. If the banner used a per-device
> window, a user in UTC+13 could see "50% off" hours before the coupon is
> actually redeemable, and a user in UTC-10 could see it after expiry. One
> server instant is the only window that can match what checkout accepts.
> The *display* is still localised ("ends Nov 30" in the user's locale).

### 2. Data model

```sql
-- 202611250001_featured_sale_coupons.sql (proposed)
alter table public.coupons
  add column starts_at timestamptz,          -- null = usable immediately (back-compat)
  add column featured boolean not null default false,
  add column public_title text;              -- customer-facing, e.g. 'Black Friday'

-- At most one public sale at a time.
create unique index coupons_single_featured_idx
  on public.coupons ((featured)) where featured;

-- The public endpoint's lookup.
create index coupons_featured_window_idx
  on public.coupons (featured, active, starts_at, expires_at)
  where featured;
```

API-level constraints (in `utils_coupons.py`, not just the DB):

- A featured coupon must be `active`, `applies_to = 'lifetime'`,
  `currency = 'usd'`, and have both `starts_at` and `expires_at` with
  `starts_at < expires_at`.
- A featured coupon must have `public_title` (trimmed, ≤ 60 chars).
- `featured = true` on a second coupon is rejected with a clear error
  (the partial unique index is the backstop).
- Making a coupon featured does **not** change its discount. SPEC-102's rule
  ("code/discount immutable; archive and recreate") stays.

Backfill: existing coupons get `starts_at = created_at` (they are already
usable) and `featured = false`. `BF50` is then updated by ops:

```sql
-- ops, not a migration: the campaign values are data
update public.coupons
   set public_title = 'Black Friday',
       starts_at    = '2026-11-25T00:00:00Z',
       expires_at   = '2026-12-01T00:00:00Z',
       max_redemptions = 10000,
       featured     = true
 where lower(code) = 'bf50';
```

### 3. Public API: `GET /sale`

The only new endpoint. Unauthenticated, no user data, cacheable.

```json
{
  "offer": {
    "code": "BF50",
    "title": "Black Friday",
    "plan": "lifetime",
    "currency": "usd",
    "discountType": "percent",
    "percentOff": 50,
    "amountOffCents": null,
    "regularCents": 16900,
    "finalCents": 8450,
    "startsAt": "2026-11-25T00:00:00+00:00",
    "endsAt": "2026-12-01T00:00:00+00:00"
  }
}
```

When there is no sale, `{"offer": null}` (200, not 404 — the client renders
nothing, and a 404 would show up as an error in monitoring).

Rules:

- Resolve from **one row**: `featured AND active AND starts_at <= now() AND
  now() < expires_at` and `remaining > 0` (confirmed + live reservations).
- `regularCents` comes from the current regular lifetime-USD row (the same
  `lifetime_price_cents()` the validation path uses), so `finalCents` is
  computed by the same arithmetic as `/coupons/validate` — one rounding rule,
  one result.
- `percentOff` is **derived** for `amount` coupons
  (`round((1 − final/regular) × 100)`), so the banner never invents a
  percentage. For `percent` coupons it is the row's value.
- Expired / exhausted / deactivated coupons return `null`, so the banner
  disappears without a deploy.
- Headers: `Cache-Control: public, max-age=60, s-maxage=60,
  stale-while-revalidate=300`. The 60s cache bounds the start/end skew; that
  is acceptable and documented (a user at the boundary may see the offer up to
  60s stale, but checkout is still authoritative).
- **No** coupon counts, redemption data, or admin fields are exposed.

`/coupons/validate` and checkout keep the same shape. `_sale_active()` is
removed from the coupon path: the sale is now this coupon, so "cannot combine
with a sale" becomes "one offer per purchase" (already enforced by the
reservation and by one coupon per checkout).

### 4. Checkout (unchanged mechanics, one new source)

- `POST /coupons/validate` — unchanged, still auth-required, still previews
  `finalCents`.
- `POST /create-stripe-checkout-session` — unchanged: reserve → lazily create
  the Stripe coupon → `discounts: [{coupon}]`; remove the `sale_active`
  rejection. Stripe test mode works because the test coupon id is cached on
  the row.
- PayPal path — unchanged (already server-computed).
- CNY Payment Links — **cannot** carry a coupon. The go-pro page already hides
  the CNY links when a coupon is applied; the spec keeps that behaviour and
  states it in the UI copy (`msg.coupon_usd_only`).
- Webhook / success callback — unchanged: `confirm_redemption()` writes the
  confirmed redemption and the `payment_events` row.

### 5. Admin console

`apps/admin` → Coupons (`apps/admin/src/app/coupons/page.tsx`):

- Create/edit form gains **Starts at**, **Public title**, and
  **Feature on the landing page** (checkbox).
- Validation mirrors the API rules; the featured toggle warns that it replaces
  the current public sale.
- List shows a "Featured" badge and the window, so ops can see what is live.
- Archiving or deactivating the featured coupon ends the banner immediately
  (no separate switch to forget).

### 6. Web surfaces

| Surface | Change |
|---|---|
| `(public)/layout.tsx` | Render a slim `<SaleBanner />` above `<PublicHeader />`; the component renders only on `/` (pathname check), so login/docs/etc. are untouched |
| New `SaleBanner` | One line, full-width strip, brand background, centred text: **`{title} — {pct}% off lifetime Pro`** + `ends {date}` + the code; the whole strip links to go-pro. Static (no marquee); `role`/`aria-label` from the translation key. Network: `GET /sale` once on mount + refetch every 5 min |
| `landing/pricing-section.tsx` | Drive the sale row from `/sale` instead of `useSaleWindow()` + `/stripe-prices`; strike-through uses `regularCents`, sale price uses `finalCents`. No price fetch outside a sale |
| `go-pro/page.tsx` | Remove `useSaleWindow`, `showSale`, and the disabled-while-sale coupon input. Render the offer strip; prefill the code from `?coupon=` or the offer; auto-validate when prefilled; keep the manual input |
| `sale-notice.tsx` | Render from `/sale` (`title`, `pct`, `endsAt`) instead of `SALE_DISCOUNT` + `SALE_NAME_KEY`; renders nothing when no offer |
| `hooks/use-sale.ts` | **Deleted** |
| `packages/shared/src/sale.ts` | Remove `SALE_START_LOCAL`, `SALE_END_LOCAL`, `saleWindowStart/End`, `isSaleWindowOpen`, `isPlanOnSale`, `SALE_NAME`, `SALE_NAME_KEY`, `SALE_DISCOUNT`, `SALE_PLANS`. Keep `StripePrice`, `findSalePrice`, `findRegularPrice`, `getSaleDiscount`, `formatPriceAmount`, `hasStoreDiscount` (mobile store-price truth), `resolvePlanPriceForWindow` only if still used |
| `lib/prices.ts` | Keep for regular-price display; drop the sale-row fallbacks if unused |

**i18n.** The campaign *name* is data; the sentence around it is translated.
Reuse `msg.sale_discount` ("Save {pct}% on select plans!"), `msg.sale_offer_ends`
("Offer ends {date}"), and `msg.sale_lifetime_price` where a price is quoted.
One new key is needed for the banner strip — `msg.sale_use_code`
("Use code {code} at checkout") — added to `translations.csv` for all 18
locales and regenerated with `scripts/sync-translations.mjs csv-to-json`.
`msg.sale_mid_autumn` becomes unused (keep the row; other campaigns may use it)
and `SALE_NAME_KEY` is deleted.

### 7. Mobile (Phase 1: no web-sale chrome)

`BF50` is a Stripe coupon. It cannot be redeemed through StoreKit or Play
Billing (see the next section), so the app must not advertise it. Phase 1:

- Delete `apps/mobile/hooks/use-sale.ts` and `apps/mobile/components/SaleNotice.tsx`
  usage (or make `SaleNotice` render `null`), plus the `saleOpen`/sale-chrome
  branches in `app/(tabs)/(me)/go-pro.tsx` and `profile.tsx`.
- `use-sale-pricing.ts` keeps the store price as the only price and keeps
  `hasStoreDiscount()` for a truthful strike-through when the store's own
  number is below our regular row. No campaign banner, no code entry.
- `isPlanOnSale` disappears from mobile with the shared constants.
- This is a deliberate, visible regression: during a web-only sale the app
  simply shows the regular store price. It is the only behaviour that cannot
  misrepresent what the store will charge.

Phase 2 (separate spec, see [Store mirror](#store-mirror-option-b--separate-spec))
adds store-native offers when we want the discount in-app.

## App Store and Google Play — how a coupon sale actually works on mobile

**Verified 2026-11-25** from Apple and Google documentation (sources at the
end). This is the answer to "does BF50 work in the apps?".

### The store mechanisms are not our coupons

| Mechanism | Where configured | What it can express | Limits | Code entry |
|---|---|---|---|---|
| **Apple offer codes** | App Store Connect → In-App Purchases → Offers | A discount or free period for **all** IAP types — consumables, non-consumables, non-renewing, auto-renewable. Non-consumables (our `pro_go`) are supported from **iOS 16.3**; our deployment target is 16.4 | Up to **10 active offers** at a time; **1,000,000 codes per app per quarter** (10,000 sandbox codes/quarter). One-time-use codes: 500–25,000 per batch, expiry required, ≤ 6 months. **Custom codes** (`BF50` works) are named by you, have a redemption limit you set, can be redeemed via redemption URL or in-app (not typed into the App Store). The app must be *Ready for Distribution* and the IAP *Approved* to generate codes | In-app redemption sheet (`presentCodeRedemptionSheetIOS`), redemption URL, or (one-time-use codes) entering the code in the App Store |
| **Apple promo codes** | App Store Connect → Promo codes | **Free** copy only (no percentage discount) | **100 per IAP product**; **1,000 total per app per six months**; non-commercial use; codes expire **28 days** after generation | App Store redeem |
| **Google Play promo codes** | Play Console → Promo codes | **Free** one-time product, or a **free trial** for subscriptions — never a percentage discount | **500 promo codes per quarter** for one-time products; 10,000 one-time-use codes/quarter per subscription product; custom codes are subscriptions-only (2,000–99,999 redemptions) | Play Store redeem, in-app purchase-screen "Redeem", or `https://play.google.com/redeem?code=…` |
| **Google Play one-time product discount offers** | Play Console (purchase option → offer) | **Percentage or absolute discount**, with country/region eligibility, per-user purchase limit, and a limited time window | No code at all — eligible users see the offer; the app must pass its `offerToken` at purchase | No code |

Conclusion: **`BF50` is a Stripe coupon; none of the store mechanisms reads it.**
A user who taps "Buy" in the app pays whatever App Store Connect / Play Console
is configured to charge. The store can only discount through *its own* offer
objects, created in those consoles, with their own codes or eligibility rules.

### Store policy: what the app may say

- **Apple, Guideline 3.1.1(a)**: "These entitlements are not required for
  developers to include buttons, external links, or other calls to action in
  their **United States storefront** apps." And: "In all other storefronts,
  except for the United States storefront, where this prohibition does not
  apply, apps and their metadata **may not include buttons, external links, or
  other calls to action that direct customers to purchasing mechanisms other
  than in-app purchase**."
- **Apple, Guideline 3.1.1**: in-app unlocking must use in-app purchase; "apps
  may not use their own mechanisms to unlock content or functionality, such as
  license keys…". A coupon-entry field that grants Pro inside the app would be
  exactly that.
- **Google Play**: since **29 Oct 2025**, for users in the **United States**,
  Google does not prohibit communicating external pricing/payment options or
  linking out — through the *external content links* / *alternative billing*
  programs, with service fees and transaction/download reporting (fees from
  1 Oct 2026; download reporting until 1 Feb 2027). Outside that US-specific
  regime, Google Play Billing is still required for in-app digital goods.

So "use code BF50 on languageplayer.io" inside the app is defensible **only for
the US storefront**, and even there it is a program with fees and reporting.
Worldwide, it is a rejection/removal risk. That is why Phase 1 keeps the app
silent about the web sale.

### Store mirror (Option B — separate spec)

When we want the discount in the apps, it must be re-created in each console,
per campaign, and the app must handle store offers:

- **iOS**: create a **Paid Offer** on `pro_go` (50% off, one-time) in App
  Store Connect, then a **custom offer code** `BF50` with a redemption limit.
  Custom codes are named by you and redeemed through a redemption URL or the
  in-app sheet — not by typing into the App Store (that path exists for
  one-time-use codes). The app can present the system redemption sheet
  (`presentCodeRedemptionSheetIOS`, available in expo-iap 5.2.4). Custom-code
  redemption requires iOS 16.3+ (our minimum is 16.4). The backend's JWS
  verification must accept offer-code transactions (`offerType: code`) and
  still grant lifetime — it currently verifies bundle/product/transaction and
  does not branch on offers, so this needs a check, not necessarily a change.
- **Android**: create a **discount offer** on the one-time product (50% off,
  limited time, purchase limit 1). There is **no code**; all eligible users see
  the discounted price, and the app must purchase with the offer's
  `offerToken` (`requestPurchase` accepts `offerToken`; expo-iap 5.2.4 exposes
  it). This uses the newer one-time product purchase-option/offer model, so the
  bundled Play Billing version must be verified at implementation. Google Play
  promo codes cannot help (free only).
- **Consoles are authority**: the app can only display the store's own reported
  price/discount, exactly as `hasStoreDiscount()` does today. Both offers must
  be created before the campaign and expire on their own; Apple caps active
  offers at 10, Google's discount offer is per product/purchase option.
- **Redemption tracking splits**: an iOS `BF50` redeemed through the
  redemption URL or the in-app sheet is Apple's offer redemption (server
  notification `OFFER_REDEEMED` / `ONE_TIME_CHARGE`), not a
  `coupon_redemptions` row. Reporting must union the two.

This is real work and a separate approval; SPEC-113 (proposed) would cover it.

### Options considered

| Option | What happens in the app | Verdict |
|---|---|---|
| **A. Web-only sale** (Phase 1, recommended) | App sells at the store price and says nothing about BF50 | Zero review risk, no build, honest pricing. Loses in-app conversion during the campaign |
| **B. Mirror offers in both stores** | iOS offer code `BF50` + Android discount offer; app displays store prices/offers | Works, but per-campaign console setup and a build; tracking splits |
| **C. Remove IAP; web checkout only** | App links to the website for purchases | Rejected: removes the only in-app purchase path, and steering rules still apply in most storefronts |

## Migration plan (task items)

Each item is a commit on its own; no item ships without its documentation.

1. **Schema + admin + `/sale`** — migration, `utils_coupons` changes
   (featured validation, `public_sale()`), `GET /sale`, remove
   `_sale_active()` from the coupon path, admin form fields, tests.
2. **Web** — banner above the header on `/`, pricing section, go-pro, sale
   notice, prefill `?coupon=`, delete `use-sale.ts`, trim `sale.ts`,
   `translations.csv` key + regenerate locales, ADR-0054 + SPEC-014/102
   amendments.
3. **Mobile de-chrome** — remove window-based sale UI, keep store-price truth;
   docs updated.
4. **Store mirror (optional, separate spec)** — iOS offer + Android discount
   offer, purchase/verification handling, reporting.

## Acceptance criteria

- With a featured coupon whose window contains now, `/` shows a one-line sale
  strip above the header with the coupon's `public_title`, a percentage
  derived from the coupon, the end date in the viewer's locale, and the code;
  the rest of the public pages show nothing.
- The strip disappears without a deploy when the coupon expires, is archived,
  is exhausted, or `featured` is turned off.
- The advertised percentage and the checkout amount agree: both come from the
  same coupon row and the same server arithmetic (verified for a `percent` and
  an `amount` coupon).
- A featured coupon can be changed (title, code, dates, percentage, cap) from
  the admin console and the landing page reflects it within 60 seconds.
- The go-pro page no longer disables coupon entry during a sale; `BF50`
  validates, applies, and checks out (Stripe **test** mode included).
- A second featured coupon is rejected; an invalid featured coupon (missing
  window/title, CNY, non-lifetime) is rejected at create/update time.
- Mobile shows the live store price and never mentions BF50 or claims a
  discount the store will not charge.
- No user-facing English is hardcoded; `translations.csv` has the new key for
  all 18 locales.

## Test plan

- **Unit (Flask)**: window boundaries (`starts_at` inclusive, `expires_at`
  exclusive), exhausted/archived/inactive → `null`, amount→percent
  derivation, featured validation errors, `GET /sale` excludes admin/count
  fields, cache headers present.
- **Integration (Stripe test)**: create a featured test coupon → `/sale` →
  `/coupons/validate` → create checkout session → confirm redemption via the
  success/webhook path → the same user re-applying gets `already_used`; an
  exhausted coupon returns `exhausted`; an expired one returns `expired`.
- **Web**: banner renders only on `/`; hidden outside the window; link
  carries `?coupon=BF50` and go-pro prefills/validates it; pricing table
  shows `US$169` struck through with `US$84.50`; refetch after the 60s cache
  boundary flips the display.
- **Mobile**: go-pro shows the store price; no coupon field; no "50% off"
  claim; upgrade prompts show no sale chrome.
- **Manual (Phase 4 only)**: sandbox Apple offer-code redemption and a Play
  test purchase using a discount offer token.
- **Docs**: `npm run check:docs` passes; the spec index and ROADMAP are
  updated.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Public endpoint is hot / abusable | It returns one public offer with no counts; 60s CDN cache; no DB write path |
| Code shared on deal sites | Intended; bounded by `max_redemptions` and one-use-per-user |
| Start/end skew (up to 60s) | Documented; checkout is still authoritative; `max-age` small |
| A refunded coupon purchase cannot be re-used (unique `(coupon_id, user_id)`) | Existing SPEC-102 rule; support can release the redemption; note it in the spec |
| Two campaigns at once | Partial unique index + admin error |
| Featured coupon with a bad price/plan | API validation (lifetime, USD, window, title); admin copy |
| Removing `sale.ts` breaks mobile | Mobile change ships in the same task item; grep the exports |
| Stripe test-mode preview can differ from the test charge: `lifetime_price_cents()` reads the **live** regular amount while checkout uses the test `price_id` | Keep test and live regular prices equal, or let `lifetime_price_cents()` take the mode; called out in the test plan |
| CNY customers cannot use the sale | Stated in UI (`msg.coupon_usd_only`); the old CNY sale price link is no longer advertised |
| Misleading store claims | Phase 1 removes web-sale chrome from the app entirely; Phase 4 only displays store-reported prices |

## Open decisions

1. **Schema**: extend `public.coupons` (recommended) vs a new `sales` table
   referencing a coupon. Extending reuses validation, reservations, Stripe
   coupons, and the admin UI.
2. **Window semantics**: one UTC instant worldwide (recommended, matches how
   the coupon is enforced) vs per-device local time (ADR-0048's choice).
3. **Mobile now**: web-only sale with no in-app mention (recommended) vs
   mirroring in the stores immediately (SPEC-113).
4. **Legacy removal**: delete the client window and stop gating coupons on
   `sale_windows.csv` now (recommended) vs keep both for a release.
5. **Banner**: above the header, landing only, static, not dismissible, links
   to go-pro with the code prefilled (recommended) — confirm.
6. **BF50 campaign values**: `public_title = "Black Friday"`, window, cap, and
   expiry. The dates are data; the current draft uses
   `2026-11-25 → 2026-12-01` (UTC) as an example only.

## Sources

- Apple — [Supporting offer codes in your app](https://developer.apple.com/documentation/storekit/supporting-offer-codes-in-your-app)
  (all IAP types, iOS 16.3 for non-consumables, 10 active offers, 1,000,000
  codes/app/quarter, redemption APIs)
- Apple — [Promo codes overview](https://help.apple.com/app-store-connect/en.lproj/dev50869de4a.html)
  (free only; 100 per IAP product; 1,000 per app/6 months; 28-day expiry;
  non-commercial)
- Apple — [App Review Guidelines 3.1.1 / 3.1.1(a)](https://developer.apple.com/app-store/review/guidelines/)
  (US storefront external links; prohibition elsewhere; no in-app unlock via
  keys/codes)
- Google — [Promo codes (Play Billing)](https://developer.android.com/google/play/billing/promo)
  (free products/trials; 500/quarter for one-time products; 10,000 one-time-use
  codes per subscription product per quarter; deep link)
- Google — [One-time product purchase options and offers](https://developer.android.com/google/play/billing/one-time-product-multi-purchase-options-offers)
  (percentage/absolute discount offers, country targeting, purchase limits,
  time windows, `offerToken`)
- Google — [Update on Play policies for developers serving users in the US](https://support.google.com/googleplay/android-developer/answer/15582165)
  (29 Oct 2025 injunction changes; external content links / alternative
  billing programs; fees and reporting)
- expo-iap 5.2.4 (installed): `presentCodeRedemptionSheetIOS`,
  `openRedeemOfferCodeAndroid`, `offerToken` in `requestPurchase`
