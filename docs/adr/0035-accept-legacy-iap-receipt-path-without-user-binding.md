# ADR-0035 — Accept legacy StoreKit 1 receipt path without user binding

**Status:** Accepted (2026-08-11)

## Context

The new mobile app (ARCH-024) binds every StoreKit 2 purchase to the
purchasing user via Apple's `appAccountToken`: the app sends `user.id` at
purchase time, and the backend rejects any JWS whose token is missing or
does not match the requesting `user_id`. This closes the "one purchase,
ten friends each restore it" grant hole.

However, `/in_app_purchase_success` still accepts a **legacy App Store
receipt** path (`_validate_receipt` → Apple's `verifyReceipt`) for StoreKit 1
clients. That path validates the receipt against Apple but grants by the
client-supplied `user_id` with **no user binding** — the same hole the JWS
path just closed.

The only client that can reach the legacy path is Classic (`zerotohero-nuxt`,
Capacitor, bundle `ca.zerotohero.app`, product `pro`), which uses the old
StoreKit 1 receipt flow.

## Decision

**Accept the legacy receipt path as-is.** Do not retrofit `appAccountToken`
binding onto it.

Rationale:

- Classic is scheduled for sunset: after launch, the new web app
  (`apps/web`) and new mobile app (`apps/mobile`) replace it. Classic is
  reference-only in this monorepo and will be retired.
- The legacy path is only reachable by Classic's native iOS build; no active
  client under development uses it.
- Retrofitting binding onto StoreKit 1 receipts would require Classic-side
  changes to a codebase we do not modify (reference-only), plus handling for
  receipts whose transactions predate any binding — for a short-lived path.
- The risk window is the remaining life of Classic, and Classic users
  sharing one purchase with friends is the same class of abuse the new
  binding prevents for the new app, but with a known, bounded, sunsetting
  surface.

## Consequences

- The known limitation stays documented in ARCH-024 ("User binding") and
  SPEC-054.
- If Classic outlives its sunset date, revisit this decision: either migrate
  Classic to StoreKit 2 / the JWS path, or add a per-request bundle+receipt
  binding check.
- New purchases in `apps/mobile` remain fully bound; the legacy path cannot
  be used to claim a new mobile transaction because the new app sends JWS
  only.

## References

- ARCH-024 — Mobile IAP Architecture (user binding, receipt vs JWS verdict)
- SPEC-054 — Subscription & Payment Testing (A2/A5, `appAccountToken`
  verification)
