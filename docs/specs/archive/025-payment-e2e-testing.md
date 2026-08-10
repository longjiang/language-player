# SPEC-025: Payment & Pro Gates E2E Testing (Archived)

## Metadata
- **Spec ID**: SPEC-025
- **Feature**: End-to-End Testing for Payment Flows (Stripe, IAP, WeChat Pay, Alipay, PayPal)
- **Status**: **superseded**
- **Created**: 2026-07-27
- **Archived**: 2026-08-09
- **Superseded by**: [SPEC-054 — Payment Testing Across Classic, Web & Mobile](../054-payment-testing.md)

## Overview

Payment and subscription E2E testing has been separated from [SPEC-023](./023-mobile-e2e-testing.md) (the general mobile E2E plan) because:

1. **Every payment flow requires human verification** — Maestro cannot reliably interact with embedded third-party web views (Stripe Checkout, WeChat Pay, Alipay) or Apple App Store sandbox dialogs (IAP).
2. **Payment flows need a real device** — IAP requires Apple sandbox on a physical device; simulator IAP is unreliable.
3. **Revenue-critical** — payment bugs directly impact revenue. A dedicated, focused testing plan ensures thorough coverage before every release.
4. **Needs a mocked payment backend** — before any payment test can be automated, the Flask backend needs a `/mock-stripe-checkout`, `/mock-wechat-pay`, etc. that returns success without calling the real payment processor.

**Current status**: All payment tests are **human-only**. Automation will be revisited after a mock payment backend is built (likely a future Phase of SPEC-024 or a dedicated payment mock spec).

## Test Case Catalog

### Tier P1 — Free Tier Gates

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P1 | Free tier — transcript truncated | Login as free user → open video → scroll transcript | Only first 10 lines visible; "Upgrade to Pro" prompt shown |
| P2 | Free tier — word examples limited | Tap a word in subtitles → popup shows examples | Only 2 examples shown; "Go Pro for more" link |
| P3 | Go Pro — plan display | Open Go Pro screen | Plans listed with prices: Monthly $10/mo, Annual $90/yr, Lifetime $169 |

### Tier P2 — Pro User Features

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P4 | Pro user — full transcript | Login as pro user → open video | Full transcript visible, no truncation |
| P5 | Pro user — unlimited examples | Pro user taps word in subtitles | All examples shown |
| P6 | Pro user — cancel subscription | Me tab → Subscription → Cancel | Confirmation shown; subscription cancels at period end |

### Tier P3 — Stripe Credit Card Checkout

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P7 | Stripe — monthly checkout | Tap Monthly plan → Stripe payment sheet opens → enter test card (4242...) → submit | Payment success screen; Pro features unlocked |
| P8 | Stripe — annual checkout | Tap Annual plan → complete Stripe flow | Payment success; Pro features unlocked |
| P9 | Stripe — card declined | Enter declined test card (4000 0000 0000 0002) → submit | Error message shown; stays on payment screen |

### Tier P4 — Alternative Payment Methods

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P10 | WeChat Pay — checkout | Select WeChat Pay → QR code or redirect appears → complete payment | Payment succeeds; Pro granted |
| P11 | Alipay — checkout | Select Alipay → complete payment | Payment succeeds; Pro granted |
| P12 | PayPal — lifetime checkout | Select PayPal → complete payment | Lifetime Pro granted; no subscription, no expiry |

### Tier P5 — In-App Purchase (Apple)

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P13 | IAP — purchase | Go Pro → IAP flow → App Store sandbox dialog → confirm purchase | Receipt validated by Flask backend → Pro granted |
| P14 | IAP — restore purchase | Settings → Restore Purchases → App Store sign-in | Receipt re-validated → Pro restored |
| P15 | IAP — purchase failure | IAP flow → cancel or fail | Returned to Go Pro screen; no Pro access |

### Tier P6 — Edge Cases

| # | Flow | Steps | Assertions |
|---|---|---|---|
| P16 | Subscription expiry | Wait for subscription to expire (or mock) → open app | Free-tier limits re-applied |
| P17 | Concurrent purchase | Purchase on web → open mobile app | Pro status syncs; features unlocked |
| P18 | Free trial expiry | Trial ends → open app | Prompt to subscribe; features locked |

## Test Execution

| Trigger | Tests | Device | Expected Time |
|---|---|---|---|
| Before every App Store submission | All P1-P18 | Real iPhone + real iPad + simulator (web views) | ~45min |
| Weekly (scheduled) | P1-P6 (non-payment flows) | Simulator | ~10min |
| After payment backend changes | P7-P15 (checkout + IAP) | Real device | ~30min |

## Mock Payment Backend (Future)

Before any payment test can be automated, the Flask backend needs mock endpoints:

```
POST /mock-stripe-checkout    → { success: true, planType: "monthly" }
POST /mock-wechat-pay          → { success: true, planType: "annual" }
POST /mock-alipay              → { success: true, planType: "lifetime" }
POST /mock-paypal              → { success: true, planType: "lifetime" }
POST /mock-iap-verify          → { success: true, planType: "monthly" }
```

These return success responses that match the real endpoint shapes but skip the actual payment processor calls. The Flask backend would toggle between real and mock mode via an environment variable (`MOCK_PAYMENTS=true`).

## Open Questions

- **IAP sandbox stability**: Apple's IAP sandbox environment is notoriously flaky. Should we test IAP only on TestFlight builds (real Apple servers, real sandbox accounts)?
- **WeChat Pay / Alipay test accounts**: Do we have test merchant accounts for these payment methods? Without them, these flows are permanently human-only.
- **Stripe test mode in CI**: Can we point the mock Flask server at Stripe test mode for integration tests, or should we keep it fully mocked?

## Success Criteria

1. All free-tier gate checks pass (P1-P3)
2. All pro-user feature checks pass (P4-P6)
3. Stripe checkout completes with test cards (P7-P9)
4. Alternative payment methods complete successfully (P10-P12)
5. IAP purchase and restore work on a real device (P13-P15)
6. Edge cases verified before every release (P16-P18)
7. Payment regression checklist completed before every App Store submission
