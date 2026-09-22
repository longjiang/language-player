# ADR-0048 — Sale windows are gated on the client clock; sale amounts stay in the backend price rows

**Status:** Accepted (2026-09-22)
**See also:**
- [SPEC-014: Subscription & payment system](../specs/014-subscription-payment-system.md) — the flows and identifiers this prices
- [ARCH-015: Payment methods — supported plans & renewal strategy](../arch/015-payment-methods-plan-support.md) — the plan/payment-method matrix
- [ARCH-022: Payment, subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md) — as-built checkout/webhook architecture
- [ADR-0013: App store strategy](0013-app-store-strategy.md) — "the single source of truth for pricing is the backend's `/stripe-prices`"
- `zerotohero-nuxt/lib/utils/variables.js` — Classic's `SALE` / `SALE_DISCOUNT` constants, the pattern this follows
- `zerotohero-python-server/data/prices.csv` — the price rows, including the `type=sale` rows

---

## Context

Mid-Autumn 2026 needs a lifetime-Pro sale: **50% off, 0 hours Sep 21 to 23:59:59
Sep 27, in the user's own timezone** — a window with a defined start *and* end.

Classic already does exactly this, in `lib/utils/variables.js`:

```js
export const SALE_START_DATE = new Date(2026, 1, 9);                 // local time
export const SALE_END_DATE   = new Date(2026, 1, 20, 23, 59, 59, 999);
export const SALE = new Date() >= SALE_START_DATE && new Date() <= SALE_END_DATE;
export const SALE_DISCOUNT = 0.5;
```

`new Date(y, m, d)` is the **device's** local timezone, so Classic's window is
per-user — which is what the requirement asks for. `Sale.vue` and `Pricing.vue`
gate on the `SALE` boolean.

ADR-0013 and ARCH-015 say the opposite thing about pricing: *"The single source
of truth for pricing is the Python backend's `/stripe-prices` endpoint."* And
web/mobile honour it — `isSaleActive()` in `packages/shared/src/sale.ts` was a
pure function of the fetched rows:

```ts
prices.some((p) => p.type === 'sale' && p.status === 'current')
```

**That status signal cannot express a window, and against the real data it was
permanently false.** `data/prices.csv` carries the sale rows as `archived`
between runs:

```
archived,lifetime,sale,payment,usd,84.5,price_1QN5p2G5EbMGvOafLuatCuKc,,,
archived,lifetime,sale,payment,cny,608,price_1QN5svG5EbMGvOafHQIDjVr4,https://buy.stripe.com/9AQ3fD2krfM7aKk7sM,,
```

So before this change the mobile sale banner could not appear (`isSaleActive`
false), `getSaleDiscount()` returned `null`, and the sale price rows were
invisible to every `status === 'current'`-filtered lookup. A static CSV column
is also the wrong shape for a time-bounded offer: flipping it to `current`
starts the sale but cannot end it, and nothing in the file can say *when*.

Meanwhile the **amount** genuinely does belong to the backend. The checkout is
priced by the Stripe `price_id` (USD) or Payment Link (CNY) the client sends to
`/create-stripe-checkout-session`, and those ids exist only in `prices.csv`.
Classic's client-side `Math.ceil(plan.amount * SALE_DISCOUNT)` display is
already a latent mismatch with them: it renders **$85** while the live sale
price is **84.50**, and CNY 608 is not exactly 50% of 1227 (613.50).

Store billing adds a third authority. Apple IAP and Google Play Billing charge
the price configured in App Store Connect / Play Console, which the app cannot
change or discount: `pro_go` stays whatever the console says. `apps/mobile`'s
go-pro screen was rendering `lifetimeSalePrice` (the Stripe sale amount) next to
the Apple Pay button, so turning the sale on would have advertised **$84.50**
while Apple billed **$169**.

## Decision

**Split the two questions and give each to the authority that can actually
answer it.**

1. **WHEN the sale runs → the client clock**, one shared definition
   (`packages/shared/src/sale.ts`): `SALE_START_LOCAL` / `SALE_END_LOCAL` as
   local wall-clock time, `isSaleWindowOpen(now)` / `isPlanOnSale(plan, now)`
   pure and injectable. Web resolves it in an effect after mount (a client
   component is still server-rendered, so a render-time `new Date()` would be
   the *server's* timezone and mismatch on hydration); mobile resolves it in an
   effect and re-checks every 60s. Bounds are inclusive on both ends.

2. **HOW MUCH it costs → the backend price rows, read status-agnostically.**
   `findSalePrice()` deliberately does NOT filter on `status`, because `status`
   is an ops flag that is `archived` outside a run and must not be able to hide
   a discount the window has opened. Rows with an empty `id` are skipped, since
   `load_prices(test=True)` yields an empty id for a row with no `test_price_id`
   and an empty price id fails the Stripe checkout.

3. **One decision, two consumers.** `resolvePlanPriceForWindow(prices, plan,
   currency, saleOpen)` returns the row whose `id`/`paymentLink` the checkout
   must send *and* what the UI displays. The web go-pro page passes the same
   `saleOpen` boolean to the card it renders and the checkout it fires, so the
   advertised amount and the charged amount cannot drift.

4. **The displayed percentage is derived, never declared.** `getSaleDiscount()`
   computes it from the rows (169 → 84.50 = 50%; 1227 → 608 = 50%), so a banner
   cannot promise a discount a checkout will not honour. `SALE_DISCOUNT = 0.5`
   stays as documented intent and as the fallback for surfaces that quote no
   price at all — which is what Classic's `Sale.vue` does with its own constant.

5. **Store-billed prices are read, never claimed.** `getStorePrice()` in
   `apps/mobile/lib/iap.ts` returns StoreKit / Play Billing's own
   `displayPrice` for `pro_go`, and `hasStoreDiscount()` compares the store's
   numeric amount against our regular row for the same currency. The mobile UI
   shows the store price as the price and only strikes through a regular price
   when the store's own number proves a reduction. It therefore never claims a
   discount the purchase sheet cannot deliver.

6. **The sale ends by itself.** Nothing server-side is flipped to start or stop
   it, so there is no state to forget to revert. The only manual, out-of-band
   step is the store prices, which must be lowered before Sep 21 and restored
   after Sep 27 (see SPEC-014 § Mid-Autumn sale).

## Consequences

**Good**

- The window honours the requirement: per-device local time, inclusive start and
  end, and it cannot drift out of sync between web and mobile because both read
  one definition.
- Charged amounts match displayed amounts, because one `saleOpen` boolean feeds
  both. This is the bug the status-gated design was one ops-omission away from.
- The web banner no longer has a display/charge mismatch: it quotes 84.50, which
  is what Stripe charges, rather than Classic's computed 85.
- Mobile can never misrepresent store pricing, whatever the consoles say, and
  the sale chrome cannot outlive the window even if a console price is left low.
- No backend change is needed to run the sale, and none is needed to end it.

**Costs / limits**

- **`prices.csv` is no longer the sole arbiter of an active sale.** Client
  clocks are user-controlled: changing the device date shows the sale outside
  the window. Combined with (2), that would let a user check out at the sale
  price by moving their clock — accepted, because the sale price is a legitimate
  published price and the exposure is bounded by the sale price being one we
  will happily honour. Closing it would mean enforcing the window server-side in
  `create-stripe-checkout-session`.
- The client learns the window only by shipping new code, so an unplanned change
  to the dates requires a web deploy (`apps/mobile` needs a build for a native
  window change, though the shared constant would ride an OTA update).
- The `status` column's meaning narrows: the sale rows' `status` is now
  informational for these clients, which is why `findSalePrice()` ignores it.
  Do not reintroduce a status check there — that is the regression this ADR
  exists to prevent.
- Stripe **test** mode cannot exercise the sale at all: the sale rows have no
  `test_price_id`, so `findSalePrice()` returns nothing and checkout falls back
  to the regular price. The web page logs that fallback so it is visible. Adding
  test ids for the sale rows is the fix if sale testing in test mode is wanted.
- The store-price step is manual and outside this repository. Its failure mode
  is designed to be safe (no discount claimed) rather than loud.
- `hasStoreDiscount()` needs a regular row in the storefront's own currency, and
  `prices.csv` holds USD and CNY only. In a EUR/GBP/JPY/… storefront the mobile
  UI shows the store price with no strike-through and claims no percentage, even
  if the console price was lowered. Conservative — it cannot overclaim — but the
  discount is invisible there until regular rows for more currencies exist.

## Alternatives considered

**Gate on the backend (`status=current`), no client window.** Rejected: a CSV
column cannot express a start *and* end, so the sale would have to be turned on
and off by hand — losing the "ends 23:59 Sep 27" requirement — and it leaves the
sale either off (today's state, silently) or on forever.

**Client-computed discount only, Classic-style, with no price-id change.**
Rejected: the banner would advertise 50% off while Stripe charged the regular
price, because the amount is fixed by the `price_id` the client sends.

**Enforce the window server-side in `/create-stripe-checkout-session`.**
Not rejected on merit — it is the more robust design and the natural way to
close the clock-tampering gap above. Deferred because it requires a change to
the Flask backend's pricing logic, which is outside the scope of the requested
web/mobile work.

**Ask the backend to expose the window (a `/sale` endpoint) instead of
hardcoding it in the client.** Rejected for now: it adds a round trip before any
sale UI can render, and a hardcoded date pair matches the existing Classic
pattern and the requested definition. Worth revisiting if sale dates start
changing often.

**Show the discounted Stripe price on the mobile IAP button.** Rejected: it
misrepresents what Apple/Google will charge, and it is the exact defect this ADR
documented in `go-pro.tsx`. The store price is the only price that button may
show.
