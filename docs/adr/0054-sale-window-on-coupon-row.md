# ADR-0054 — A sale is a featured coupon; the window lives on the coupon row

**Status:** Accepted (2026-11-25)
**Supersedes:** [ADR-0048](0048-client-side-sale-window-gating.md) — decision 1
(the client clock is the authority for *when* a sale runs) and the parts that
assume a single compiled-in Mid-Autumn window. Decisions 2–5 of ADR-0048 still
hold: the amount comes from the backend, the displayed percentage is derived,
and store prices are read, never claimed.
**See also:**
- [SPEC-112: Coupon-driven sales](../specs/112-coupon-driven-sales.md) — the
  implementation plan this record authorises
- [SPEC-102: Affiliates and coupon codes](../specs/102-affiliates-and-coupons.md)
  — the coupon model this extends
- [SPEC-014: Subscription & payment system](../specs/014-subscription-payment-system.md)
  § *Sales (coupon-driven)*

---

## Context

ADR-0048 split a sale into two questions: *when* (a client-side date window,
resolved against each device's clock) and *how much* (backend price rows). It
worked, but its own consequences were the problem:

- Changing the dates needed a web deploy, and a mobile build for the native
  window.
- Every device decided the window for itself, so web and checkout could
  disagree with the coupon system.
- The sale could not be exercised in Stripe test mode, because the `type=sale`
  price rows have no test ids.
- `utils_coupons._sale_active()` rejected coupons while any historical window in
  `data/sale_windows.csv` was open — so the sale and the coupon disabled each
  other.
- The sale name was a hardcoded translation key, so every campaign needed new
  code and new translations.

Meanwhile SPEC-102 shipped coupons: a coupon row already has a discount, an
expiry, redemption limits, a per-user uniqueness rule, reservations, lazily
created Stripe coupons, and a payment ledger. `BF50` already exists in
`public.coupons`.

## Decision

**A sale is a coupon.** No new table, no compiled-in dates.

1. **The coupon row is the authority**, via three fields:
   `featured` (this is the public sale), `public_title` (customer-facing name),
   `public_title_i18n` (per-locale name). A partial unique index allows at most
   one featured coupon.
2. **There is no start time.** A coupon is usable from creation; featuring it
   starts the sale, and `expires_at` ends it. Scheduling a future campaign means
   featuring it when it should begin.
3. **One UTC instant worldwide.** The server evaluates
   `featured AND active AND now < expires_at`. The admin enters the expiry as
   local wall-clock time plus an IANA zone; the backend converts with
   `zoneinfo` and stores the UTC instant and the zone. Per-device local time is
   gone: it could show a sale the coupon had not opened yet, or after expiry.
4. **One public endpoint serves it:** `GET /coupons/featured` returns the
   coupon or `null`, computed with the same arithmetic as `/coupons/validate`,
   cached for 60 seconds. The landing banner, pricing table, go-pro page and
   upgrade prompts all render from it.
5. **The sale no longer blocks coupons.** `_sale_active()` and the
   `sale_active` error are deleted; the sale *is* the coupon.
6. **`sale_windows.csv` is sunset.** The file, its loader and the historical
   estimate multiplier are deleted. Exact amounts for new purchases come from
   `payment_events` (SPEC-102); pre-ledger rows are estimated at the regular
   price.
7. **No sales in the mobile apps.** StoreKit and Play Billing charge their own
   console prices and cannot redeem a Stripe coupon. The app removes its
   window-driven sale chrome and shows the live store price only. A future
   store-offer mirror would be a separate decision.
8. **Classic/Nuxt is untouched.** Its hardcoded window stays as-is; new sales do
   not appear there.
9. **Campaign names are data, translated in the admin console** with one-click
   LLM translation, manual editing, and a per-locale preview of the banner
   sentence.

## Consequences

**Good**

- Running a campaign is an admin action: code, title, dates, discount and cap
  are data, with no deploy.
- Advertised amount and charged amount come from one row and one arithmetic.
- Stripe test mode can exercise a sale (coupons have test coupon ids).
- On-sale state is identical for every user and timezone, and it ends by itself.
- The sale can no longer be blocked by a stale historical window list.
- The mobile app cannot misrepresent a store price.

**Costs / limits**

- Pre-ledger revenue estimates lose their historical sale adjustment, so old
  sale-period rows read higher on the admin Transactions/Analytics screens.
- A refunded coupon purchase stays consumed for that user (unique
  `(coupon_id, user_id)`); support releases the redemption.
- CNY (WeChat/Alipay Payment Links) cannot carry a coupon, so a coupon sale is
  USD-only.
- Changing a campaign early requires an admin action rather than editing a
  constant, and the public endpoint's 60s cache means start/end can be up to a
  minute stale.
- The 18 public-title translations are LLM-generated unless an editor corrects
  them; the admin preview is the review step.

## Alternatives considered

**Keep the client window and add a coupon.** Rejected twice: the two
authorities disagree at the edges, and the coupon is blocked while a window is
open.

**A separate `sales` table referencing a coupon.** Rejected: a sale has no
fields of its own beyond the coupon's (`featured`, `public_title`, expiry). A
second table would duplicate the window and require joins for every read.

**Keep `starts_at` on the coupon.** Rejected: coupons are usable from creation;
scheduling is an admin action ("feature this when the campaign begins"), and a
start time would add a second validity rule to every coupon lookup.

**Per-device local window (ADR-0048's rule) with a server-validated coupon.**
Rejected: the client would show a discount that checkout rejects at the
boundary, in both directions depending on the device's timezone.

**Mirror the sale in the app stores now (Apple offer codes, Play discount
offers).** Not rejected on merit; deferred. It needs per-campaign console setup,
a client build, and split redemption tracking. The app currently claims no
discount at all, which is always truthful.
