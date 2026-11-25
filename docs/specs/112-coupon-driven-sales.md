# SPEC-112: Coupon-driven sales (a sale is a featured coupon)

## Metadata

- **Spec ID**: SPEC-112
- **Feature**: Sales become a **featured coupon** in the database instead of a
  hardcoded client-side date window; a public endpoint serves it to the landing
  banner, the pricing table, the go-pro page, and the in-app upgrade prompts;
  the admin console gains the expiry **time zone** and **LLM-assisted,
  editable translations** of the public sale title.
- **Status**: **implemented 2026-11-25** — backend, admin console, landing
  banner and the mobile de-chrome. Ops still apply the migration and set the
  `BF50` campaign row; the store-offer mirror is out of scope.
- **Created**: 2026-11-25
- **ROADMAP Phase**: Phase 10 — Admin Console / payments
- **See also**:
  - [ADR-0048 — Sale windows are gated on the client clock](0048-client-side-sale-window-gating.md)
    — **decision 1 is superseded by this spec** (see
    [Documentation impact](#documentation-impact))
  - [SPEC-014 — Subscription & Payment System](014-subscription-payment-system.md)
    § *Mid-Autumn sale* — the sale mechanism this replaces
  - [SPEC-102 — Affiliates and Coupon Codes](102-affiliates-and-coupons.md) —
    the coupon model this extends
  - [SPEC-101 — Admin Transactions](101-admin-transactions.md) — its
    `sale_windows.csv` estimate adjustment is sunset by this spec
  - [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md)
  - [ARCH-024 — Mobile In-App Purchase](../arch/024-mobile-iap-architecture.md)
  - `packages/shared/src/sale.ts`, `zerotohero-python-server/utils_coupons.py`,
    `zerotohero-python-server/routes/coupons.py`,
    `zerotohero-python-server/routes/admin_transactions.py`,
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
(`data/sale_windows.csv`) that also *blocks coupons* while any window is open.
Running a campaign means editing constants and shipping a web deploy, plus a
mobile build for the window to change.

This spec makes a sale **one coupon row**, marked as the public sale. Coupons
already exist (SPEC-102 v1) with redemption limits, a 30-minute reservation,
lazy Stripe coupons, and per-user uniqueness; `BF50` is already in the
database. The coupon gains a customer-facing title, its per-locale
translations, a `featured` flag, and the expiry's time zone. A new public
`GET /coupons/featured` returns the active featured coupon, and every surface
renders from that one response. Checkout does not change: it already validates,
reserves, applies, and confirms the coupon.

The benefits:

- **No redeploy per campaign.** Dates, code, title, discount, and cap are data.
- **One authority.** The advertised and the charged discount come from the same
  row, via the same server arithmetic.
- **Coupons start when created/featured and end at `expires_at`** — no separate
  client clock, and therefore no per-device timezone disagreement.
- **Testable.** Coupons have test Stripe coupon ids, so Stripe test mode can
  finally exercise a sale (the `type=sale` price rows never could).
- **`sale_windows.csv` is sunset** so a sale no longer disables the coupon that
  *is* the sale.

Classic/Nuxt is deliberately out of scope: it keeps its own hardcoded sale
constant, and the new coupon-driven sale will not appear there.

## Current state (as built)

- **Coupons (SPEC-102 v1) are implemented** in `utils_coupons.py` and
  `routes/coupons.py`: admin CRUD, `POST /coupons/validate`, 30-minute
  reservations, `coupon_redemptions`, lazily-created and cached Stripe coupons
  (`stripe_coupon_id_live` / `_test`), PayPal support, and a `payment_events`
  ledger.
- **`BF50` already exists** in `public.coupons` (50% off, lifetime, USD). While
  it is active and unexpired it is redeemable at checkout with no way to
  advertise itself.
- **Checkout already sends `coupon_code`** from go-pro in the Stripe and PayPal
  paths, reserves it, and confirms it on payment.
- **The UI already previews the discounted amount** from the server
  (`couponPreview.finalCents`), so "what you see is what is charged" for coupon
  purchases is already true.
- **Coupons are blocked while any `sale_windows.csv` window is open**
  (`utils_coupons._sale_active()`, error code `sale_active`), and the go-pro
  page disables the coupon input while the client window is open — the sale and
  the coupon fight each other.
- **The sale headline is the literal translation key `msg.sale_mid_autumn`**,
  hardcoded in go-pro, the pricing section, and `SaleNotice`; a new campaign
  needs new code and new translations.
- **Mobile has no coupon field** (confirmed: zero coupon references under
  `apps/mobile`). It does have window-driven sale chrome (`SaleNotice`, go-pro
  sale banner, strikethrough) — this spec removes it.
- **Classic/Nuxt** has its own `lib/utils/variables.js` sale constant and is not
  touched.

## Documentation impact

This spec is a proposal; **no ADR is edited until it is approved**, because
ADR-0048 is an accepted decision record. On approval:

| Document | Change |
|---|---|
| `docs/adr/0048-client-side-sale-window-gating.md` | **Superseded in part.** Decision 1 (the client clock is the authority for *when*) and the "sale ends by itself" rationale move to the coupon row's `expires_at`, served by one public endpoint. Decisions 2–5 (amount from the backend, derived percentage, store prices read-never-claimed) still hold. Write **ADR-0054 — The sale window lives on the coupon row; one public endpoint serves it**, and mark ADR-0048 superseded with a pointer. |
| `docs/specs/014-subscription-payment-system.md` | Replace § *Mid-Autumn sale* with § *Sales (coupon-driven)* and the behaviour matrix; keep the store-price text but point at this spec. |
| `docs/specs/102-affiliates-and-coupons.md` | Extend the coupon model (`featured`, `public_title`, `public_title_i18n`, `expires_timezone`); replace "coupons cannot be combined with a sale" with "the sale *is* a coupon"; correct the claim that store billing can never accept a coupon (stores have their own offer mechanisms — noted, not implemented here). |
| `docs/specs/101-admin-transactions.md`, `docs/specs/100-admin-signup-analytics.md`, `docs/arch/022-payment-subscription-mailerlite.md` | Remove the `sale_windows.csv` estimate adjustment and its documentation. |
| `ROADMAP.md` / `docs/README.md` | Phase 10 bullet (added with this draft) and spec index row (added). |

## Design

### 1. One authority: the featured coupon

A sale is a coupon row where:

- `featured = true` — this is the public sale; **at most one at a time**;
- `public_title` — the customer-facing name ("Black Friday"), **data, not a
  translation key**;
- `public_title_i18n` — per-locale translations of that title, edited in the
  admin console (LLM-assisted, manually adjustable);
- `expires_at` — the end of the sale.

**Start = now.** There is no `starts_at`: a coupon is usable from creation, and
featuring it is the start action. To run a campaign later, create/feature it
when the campaign should begin.

**Window = `featured AND active AND now < expires_at`** (and still redeemable:
`remaining > 0`). Evaluated by the server against UTC instants, so every device
agrees with checkout. The banner displays the end date in the viewer's locale;
the campaign's own time zone is stored for the admin's benefit
(see [Admin console](#5-admin-console)).

The coupon's `percent_off` / `amount_off_cents` is the discount. All SPEC-102
rules apply unchanged: lifetime only, USD only, one redemption per user,
`max_redemptions` cap, immutable code/discount (archive and recreate).

### 2. Data model

Extend `public.coupons` — **no new table**. `public_title` is only meaningful
on the single featured coupon, exactly as you described:

```sql
-- 202611250001_featured_sale_coupon.sql (proposed)
alter table public.coupons
  add column featured boolean not null default false,
  add column public_title text,
  add column public_title_i18n jsonb not null default '{}'::jsonb,
  add column expires_timezone text not null default 'UTC';

-- One public sale at a time.
create unique index coupons_single_featured_idx
  on public.coupons ((featured)) where featured;

create index coupons_featured_idx
  on public.coupons (featured, active, expires_at)
  where featured;
```

API-level validation (`utils_coupons.py`, not only the DB):

- `featured` requires `active`, `applies_to = 'lifetime'`, `currency = 'usd'`,
  a **percentage** discount (the banner quotes a percentage), a non-empty
  `public_title` (≤ 60 chars), and `expires_at` in the future.
- `public_title_i18n` must be an object whose keys are supported locales and
  whose values are non-empty strings (≤ 120 chars); unknown locales are
  rejected.
- `expires_timezone` must be a valid IANA zone (`zoneinfo.ZoneInfo`); the
  default is `UTC`.
- Two featured coupons are rejected with a clear error (the partial unique
  index is the backstop).
- Unfeaturing keeps the title and translations, so a campaign can be rerun by
  toggling `featured` and extending `expires_at`.

Backfill: existing coupons get `featured = false`, empty `public_title_i18n`,
`expires_timezone = 'UTC'`.

Campaign seed (ops, not a migration — the values are data):

```sql
-- Black Friday 2026. Translations deliberately empty: they are entered through
-- the admin "translate" button, which is what we want to exercise.
update public.coupons
   set featured         = true,
       public_title     = 'Black Friday',
       public_title_i18n = '{}'::jsonb,
       -- The admin form converts 2026-12-01 00:00 America/Vancouver to its
       -- UTC instant and stores both (07:00Z with the current tz database).
       expires_at       = '2026-12-01T07:00:00Z',
       expires_timezone = 'America/Vancouver'
 where lower(code) = 'bf50';
```

### 3. Public API: `GET /coupons/featured`

**Your naming is correct.** A sale has no fields or lifecycle of its own: it is
a coupon plus the public/featured flag. `/coupons/featured` names the resource
truthfully, sits beside `/coupons/validate` and the admin `/admin/coupons`
routes, and keeps the response key as `coupon`, so the data model is obvious
from the URL. `featured` is documented as "the one public sale coupon" (the
partial unique index enforces the singular). If a future "featured but not on
sale" concept appears, that is the point to revisit the name — not before.

Response:

```json
{
  "coupon": {
    "code": "BF50",
    "publicTitle": "Black Friday",
    "publicTitleI18n": {},
    "plan": "lifetime",
    "currency": "usd",
    "discountType": "percent",
    "percentOff": 50,
    "amountOffCents": null,
    "regularCents": 16900,
    "finalCents": 8450,
    "expiresAt": "2026-12-01T07:00:00+00:00",
    "expiresTimezone": "America/Vancouver"
  }
}
```

No active sale: `{"coupon": null}` (200, not 404 — the client renders nothing
and a 404 would be an error in monitoring).

Rules:

- Resolve from **one row**: `featured AND active AND now < expires_at` and
  `remaining > 0` (confirmed + live reservations).
- `regularCents` comes from the same `lifetime_price_cents()` that validation
  uses; `finalCents` uses the same `_discount_cents()` clamp, so the banner and
  the checkout cannot disagree.
- `percentOff` is **derived** for amount coupons
  (`round((1 − final/regular) × 100)`), so the banner never invents a
  percentage. For percent coupons it is the row value.
- Expired / archived / exhausted / unfeatured coupons return `null`.
- `Cache-Control: public, max-age=60, s-maxage=60,
  stale-while-revalidate=300`. The 60s cache bounds start/end skew; checkout
  remains authoritative.
- **No** `id`, redemption counts, Stripe ids, or other admin fields are
  exposed.
- `publicTitleI18n` is returned whole; the client picks its locale and falls
  back to `publicTitle`.

### 4. Checkout and `sale_windows`

Checkout mechanics do not change: `/coupons/validate` (auth-required preview),
then `/create-stripe-checkout-session` or the PayPal path (reserve → lazily
create the Stripe coupon → apply), then `confirm_redemption()` on payment.

Changes:

- **Remove `_sale_active()`** and the `sale_active` rejection from
  `validate_coupon()` / `reserve_coupon()`. The sale *is* a coupon, so "cannot
  combine with a sale" becomes "one coupon per purchase" (already enforced).
- **Sunset `sale_windows`.** Delete `zerotohero-python-server/data/sale_windows.csv`,
  `routes/admin_transactions.py`'s `sale_windows()` / `_sale_multiplier()` and
  the `windows` plumbing, and stop adjusting historical price estimates by a
  sale multiplier. **Consequence to be aware of:** pre-ledger Transactions and
  Analytics revenue estimates for past sale dates revert to the regular price
  (they will read higher). New purchases come from `payment_events` exact
  amounts, so the effect is limited to rows recorded before the ledger. If
  preserving the historical adjustment matters, freeze the CSV as
  `data/historical_sale_windows.csv` and keep only the estimation read — but no
  gating.
- **USD only.** CNY's prebuilt Stripe Payment Links cannot carry a coupon, so a
  coupon sale is available on Stripe card and PayPal (USD). The go-pro page
  already hides the CNY links when a coupon is applied (`msg.coupon_usd_only`).
- `msg.coupon_not_with_sale` and its UI branch are removed; the CSV row can stay
  unused, like other retired keys.

### 5. Admin console

`apps/admin` → Coupons (`apps/admin/src/app/coupons/page.tsx`).

**Expiry with an explicit time zone.** The admin picks a local date/time and an
IANA zone through a searchable picker (city, country, IANA name, or UTC offset;
reusable `TimezoneSelect` on cmdk + `@vvo/tzdb`, default: the browser's zone).
The API accepts
`expiresAtLocal` + `expiresTimezone` and converts to a UTC instant with
`zoneinfo` server-side, so DST is resolved on the backend, not in the browser.
The form shows the resolved instant back:

> Expires **2026-12-01 00:00** `America/New_York` (EST, UTC−5)
> → stored as **2026-12-01T05:00:00Z**

Ambiguous/nonexistent local times (DST fold) resolve deterministically and the
resolved UTC line makes the result visible before saving.

**Public title translations, one click + manual editing.**

- One English `public_title` input.
- A translations grid for the 18 locales (`SUPPORTED_L1S`), each row: locale
  name, an editable input (prefilled from `public_title_i18n`), a per-row
  **Translate** button, and a **Translate all missing** button.
- Translation calls a new admin endpoint
  `POST /admin/coupons/translate-title` with `{ title, locale }`, which calls
  the existing `chatgpt_translate_text_array` (context: "Public sale campaign
  name shown in a banner; keep campaign/brand names such as Black Friday if
  that is natural in the target locale"). The console loops the 18 locales with
  a small concurrency, so one slow locale cannot fail the batch.
- Results land in the editable inputs; the admin can correct any of them before
  saving. Nothing is persisted until **Save**.
- **Preview.** A panel renders the exact banner copy for each locale from the
  current values: translated title, `msg.sale_banner`, `msg.sale_offer_ends`
  (date formatted with `Intl.DateTimeFormat(locale)`), and `msg.sale_use_code`.
  This is how the LLM output is reviewed before it goes live.
- The preview templates come from `packages/shared/locales/*.json`. The coupons
  page becomes a small server component that imports those 18 files, extracts
  the three keys, and passes them to the client form — so no extra API route and
  no bundle bloat.
- List view: a "Featured" badge, the window with its zone, and the end instant.
- Archiving/deactivating or unfeaturing ends the banner immediately — no
  separate switch to forget.

### 6. Web surfaces

| Surface | Change |
|---|---|
| `(public)/layout.tsx` | Render a slim `<SaleBanner />` above `<PublicHeader />`; the component renders only on `/` (pathname check), so login/docs/etc. are untouched |
| New `SaleBanner` | One line, full-width strip, brand background, centred: **`{title}: {pct}% off lifetime Pro`** · `ends {date}` · `Use code {code}`. The whole strip links to go-pro with `?coupon=` prefilled. Static (no marquee). Fetches `GET /coupons/featured` on mount, re-checks every 60s (matching the cache TTL) and on tab visibility |
| `landing/pricing-section.tsx` | Sale row driven by `/coupons/featured`; strike-through uses `regularCents`, sale price `finalCents`; sale row links to go-pro with the code; no price fetch outside a sale |
| `go-pro/page.tsx` | Remove `useSaleWindow`/`showSale` and the disabled-while-sale coupon input. Render the offer strip from `/coupons/featured`; prefill from `?coupon=` or the offer; auto-validate when a session exists; keep the manual input |
| `sale-notice.tsx` | Render from `/coupons/featured` (title, pct, end, code) instead of `SALE_DISCOUNT` + `msg.sale_mid_autumn`; renders nothing when there is no coupon |
| `hooks/use-sale.ts` | **Deleted**; replaced by `use-featured-coupon.ts` |
| `packages/shared/src/sale.ts` | Remove the window constants, sale name/keys, `isSaleWindowOpen`, `isPlanOnSale`, `findSalePrice`, `getSaleDiscount`, `resolvePlanPriceForWindow`, `hasStoreDiscount`, `isSaleActive`. Keep `StripePrice`, `findRegularPrice`, `formatPriceAmount` (and the `StorePrice` type); trim `sale.test.ts` with it |
| `lib/prices.ts` | Keep for regular prices; drop the sale-row notes |

**Banner copy (i18n).** Two new keys in `translations.csv`, all 18 locales:
`msg.sale_banner` = "{title}: {pct}% off lifetime Pro" and
`msg.sale_use_code` = "Use code {code}". Reuse `msg.sale_offer_ends` for the
date. `public_title` itself is data and is translated in the admin console —
the English title is the fallback when a locale is empty (which is exactly the
state we start in, so the one-click translate feature is exercised).

CTA target: `/{lastL1}/{lastL2}/go-pro?coupon={code}` when a last language pair
exists (the existing `getLastLanguagePair()` helper), otherwise
`/language-select` — the same fallback `getExploreUrl()` uses.

### 7. Mobile

**Confirmed:** mobile currently has **no coupon code field** (coupon validation
is web-only, USD-only, SPEC-102), and its sale promotion elements are entirely
window-driven. **We are not running sales in the mobile apps**: store-billed
purchases are charged at the console price and cannot be discounted by a Stripe
coupon. After consideration, the app simply shows the store price.

Changes:

- Remove `SaleNotice` from the three upgrade prompts (`ReviewSettings`,
  `SubtitleDisplay`, `SubsSearchResults`) and the sale banner/strikethrough
  branches from `go-pro.tsx` and `profile.tsx`.
- `hooks/use-sale-pricing.ts` is still used (by go-pro and profile) for the
  **store price** and the regular USD prices of the non-IAP cards. Keep that,
  drop the sale half: rename to `hooks/use-store-pricing.ts`, returning
  `prices`, `storePrice`, `loadingPrices`, `priceError`, and `priceFor()`
  (lifetime = StoreKit/Play `displayPrice`; monthly/annual = regular USD row).
  Delete `saleOpen`, `endsAt`, `salePct`, `discountConfirmed`, and the
  strikethrough (`DisplayPrice.regular`).
- `apps/mobile/hooks/use-sale.ts` and the `isPlanOnSale`/`SALE_*` imports are
  deleted with the shared constants.
- Net effect: the app never claims a discount, and shows exactly what the store
  will charge.

### 8. Classic/Nuxt

Not touched. Its `lib/utils/variables.js` window stays as-is; the coupon-driven
sale will not appear there (and its last hardcoded window already ended
2026-09-27). Classic remains reference-only per `AGENTS.md`.

## Migration plan (task items)

Each item is its own commit with its documentation.

1. **Schema + admin backend + public endpoint** — migration, `utils_coupons`
   validation and `featured_coupon()` lookup, `GET /coupons/featured`,
   `POST /admin/coupons/translate-title`, expiry-zone conversion,
   remove `_sale_active()`, delete `sale_windows.csv` and its estimate
   adjustment, tests.
2. **Admin console UI** — expiry zone picker + resolved-instant line, title
   translations grid with LLM translate and manual edit, per-locale banner
   preview, featured toggle/badge.
3. **Web** — `use-featured-coupon`, banner above the header on `/`, pricing
   section, go-pro prefill, sale notice, delete the client window, trim
   `sale.ts`, add the two translation keys, ADR-0054 + SPEC-014/102/101/100 and
   ARCH-022 updates.
4. **Mobile de-chrome** — remove sale promo elements, `use-store-pricing.ts`,
   docs update.

## Acceptance criteria

- `/` shows a one-line sale strip **above the header** while a featured coupon
  is active and unexpired; no other public page shows it; the strip contains
  the translated title, the derived percentage, the end date, and the code, and
  links to go-pro with `?coupon=BF50` when a language pair is known
  (otherwise `/language-select`).
- The strip disappears within 60 seconds of the coupon expiring, being archived,
  being exhausted, or being unfeatured — with no deploy.
- Featuring a coupon starts the sale immediately (no `starts_at` anywhere).
- The percentage and amount shown equal what Stripe charges (same row, same
  arithmetic), for both percentage and amount coupons.
- The admin can enter an expiry as local time + IANA zone, sees the resolved
  UTC instant, and the stored value round-trips when the form is reopened.
- In the admin, one click fills the 18 title translations via the LLM; every
  value is editable; the preview shows the banner sentence in each locale
  before saving; saving and reloading preserves manual edits.
- `BF50` validates, applies, and checks out in Stripe **test** mode.
- No `sale_active` rejection exists; no `sale_windows.csv` is read; the
  Transactions/Analytics pages still render (estimates no longer apply a sale
  multiplier).
- Mobile has no coupon field and no sale promotion elements; go-pro shows the
  live store price only.
- Classic/Nuxt is unchanged.

## Test plan

- **Unit (Flask)**: featured validation (missing title, past expiry, non-lifetime,
  non-USD, second featured, bad zone, bad i18n keys); `featured_coupon()`
  returns null for archived/expired/exhausted/unfeatured; percent derivation
  for amount coupons; cache headers; `expiresAtLocal` + zone → UTC across a DST
  boundary.
- **Integration (Stripe test)**: create a featured test coupon → `GET
  /coupons/featured` → `/coupons/validate` → checkout session → confirm
  redemption → same user gets `already_used`; expired and exhausted cases.
- **Admin**: translate one locale, translate all, manual override, preview
  matches the locale templates, save/reload preserves values, time-zone
  round-trip.
- **Web**: banner renders on `/` only; hidden outside the window; `?coupon=`
  prefill; pricing strikethrough; 60s cache flip.
- **Mobile**: go-pro and profile show store price, no sale chrome; no coupon
  entry.
- **Docs**: `npm run check:docs`; the spec index and ROADMAP are updated.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Historical revenue estimates change when `sale_windows` is deleted | Called out as a consequence; the ledger supplies exact amounts for new purchases; the alternative (frozen historical CSV, no gating) is documented |
| Public endpoint is hot | One public offer, no counts/writes, 60s CDN cache |
| Code shared on deal sites | Intended; `max_redemptions` + one-per-user bound the exposure |
| Start/end skew (≤ 60s) | Documented; checkout is authoritative |
| A refunded coupon purchase cannot be re-used (unique `(coupon_id, user_id)`) | Existing SPEC-102 rule; support releases the redemption |
| Two campaigns at once | Partial unique index + admin error |
| LLM title translation is odd or keeps English where it should not | Every value is editable and the preview shows the final sentence; nothing goes live before Save |
| DST makes an expiry ambiguous | Converted server-side with `zoneinfo` and the resolved UTC instant is shown in the form |
| Stripe test-mode preview vs charge use different regular amounts (`lifetime_price_cents()` reads live) | Keep test and live regular prices equal, or make `lifetime_price_cents()` mode-aware |
| CNY customers cannot use the sale | Stated in the UI (`msg.coupon_usd_only`); the old CNY sale link is not advertised |

## Decisions (approved 2026-11-25)

| Topic | Decision |
|---|---|
| Schema | **Extend `public.coupons`**; no `sales` table. `public_title` etc. live on the featured coupon |
| Start time | **None.** A coupon is usable from creation; featuring it starts the sale |
| On-sale condition | `featured AND active AND now < expires_at` (+ remaining redemptions) |
| Window timezone | Server-evaluated UTC instant; expiry entered as local + IANA zone in admin |
| Public API | **`GET /coupons/featured`**, response `{ coupon: ... }` |
| `sale_windows` | Sunset: gating removed and the CSV/estimate mechanism deleted (historical-estimate consequence accepted) |
| Banner | Above the header, landing `/` only, static, not dismissible, links to go-pro with code prefilled |
| Mobile | **No sales in the apps**; remove sale promo elements; store price only; no coupon field |
| Classic | **Untouched**; sales stop working there by design |
| Admin i18n | Public title translated with one click (LLM), manually editable, with a per-locale preview |
| BF50 | `public_title = "Black Friday"`, expiry `2026-12-01 00:00 America/Vancouver` (stored instant computed by the admin form), translations **left empty** so the admin translate flow can be tested |

## Open questions

None blocking. One consequence to confirm before implementation: deleting
`sale_windows.csv` removes the sale adjustment from **historical** revenue
estimates on the Transactions/Analytics pages. If that history must keep its
sale-adjusted numbers, say so and we freeze the CSV for estimation only (no
gating) instead of deleting it.

## References

- [ADR-0048](0048-client-side-sale-window-gating.md), [SPEC-014](014-subscription-payment-system.md),
  [SPEC-102](102-affiliates-and-coupons.md), [SPEC-101](101-admin-transactions.md)
- [Apple offer codes](https://developer.apple.com/documentation/storekit/supporting-offer-codes-in-your-app)
  and [Google Play promo codes](https://developer.android.com/google/play/billing/promo)
  — background for why the apps do not reference the web coupon

## Implementation status

| Item | Status |
|---|---|
| Migration `202611250001_featured_sale_coupons.sql` | written — **ops must apply it** (and set `BF50`) |
| `utils_coupons` (featured validation, expiry zone, `featured_coupon()`, `translate_public_title()`) | done |
| `GET /coupons/featured`, `POST /admin/coupons/translate-title` | done |
| `sale_active` rejection removed; `sale_windows.csv` + estimate adjustment deleted | done |
| Admin console UI (time zone, title translations, preview) | done |
| Web (banner, pricing, go-pro, sale notice, client-window removal, i18n keys) | done |
| Mobile de-chrome (`use-store-pricing`) | done |
