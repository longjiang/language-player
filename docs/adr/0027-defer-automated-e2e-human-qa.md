# ADR-0027: Defer Automated E2E Testing — Checklist-Based Human QA

**Date**: 2026-08-06
**Status**: accepted
**See also**: [SPEC-023](../specs/023-mobile-e2e-testing.md) (deferred),
[SPEC-048](../specs/048-mobile-release-plan.md),
[ADR-0013](0013-app-store-strategy.md)

## Context

[SPEC-023](../specs/023-mobile-e2e-testing.md) proposed a full **Maestro** E2E
suite for `apps/mobile/`: 98 test cases (78 automated, 20 human) intended to
gate commits and App Store submissions. The motivation was sound — the app has
30+ screens across 4 tabs, 9 React contexts, 20 hooks, and several native
modules, and it was heading to the App Store.

In practice, the automated route has been **expensive and fragile**:

1. **The native build itself consumed most of the effort.** Phase 1 needed
   **13–14 failed `npx expo run:ios` attempts (~4 h cumulative)** to reach a
   single successful dev build — a missing `EXEventEmitterService.h` header in
   Expo SDK 57 (fixed only via a Podfile `post_install` stub). Fourteen build
   attempts were spent on one prerequisite, most of them in Release config
   that E2E didn't even need.

2. **Maestro + New Architecture (Fabric) is a treadmill of framework-level
   workarounds.** Every Phase 2 "learning" was a fight with the toolchain:
   `hideKeyboard` fails on Fabric (needs a custom dismiss Pressable), coordinate
   taps/swipes are unreliable under Fabric, `when` only works inside `runFlow`,
   env vars require header defaults, `runScript` (GraalJS) has no `fetch`, iOS
   has no `clearState` (Keychain persists across uninstalls), and
   `router.replace` inside a modal corrupts the navigation stack. Each is
   documented, but each is also recurring maintenance cost.

3. **There is no CI gate.** Tests only ever run locally, per developer. A suite
   that requires constant babysitting — Keychain resets, network dependence,
   seed-data validation, a ~50 min full regression — becomes a tax on every
   release rather than a guarantee.

4. **First-release cadence pressure.** The app is shipping for the first time
   (SPEC-048). Blocking that first release on a 98-case Maestro suite that is
   still being debugged (Phase 3 unfinished, Phase 4–9 unwritten) trades a
   known, bounded manual QA step for an unproven automated one.

## Decision

**Defer the SPEC-023 automated Maestro E2E suite as a release gate.** Releases
are gated by **informal, checklist-based human testing** instead, documented in
[SPEC-048 § 1](../specs/048-mobile-release-plan.md#1-testing-strategy--informal-checklist-based-human-qa).

- The Maestro work under `apps/mobile/e2e/` is **kept as-is** (not deleted) —
  it remains a useful seed and a possible future path, but it is **not** a
  release blocker and is **not** part of the release checklist.
- [SPEC-023](../specs/023-mobile-e2e-testing.md) is marked **deferred**; its
  Tier 0–9 test-case catalog is reused as the source list for the human QA
  checklist in SPEC-048.
- SPEC-048 becomes the single release plan: **human QA checklist + Apple and
  Google distribution** (see also ADR-0013 for store strategy).

## Consequences

### Positive

- The first release is **not blocked** on E2E tooling — the human checklist can
  be executed with a real device + simulator on release day.
- No flaky-test maintenance, no Keychain/seed-data/network babysitting.
- QA effort is proportional: a focused human pass of the critical paths is
  cheaper than 78 flaky automated cases that nobody is set up to run in CI.

### Negative / trade-offs

- Regression coverage depends on **human diligence**; subtle cross-screen
  regressions can slip between releases.
- The Maestro suite will go **stale**; resuming SPEC-023 later requires
  re-validating every flow against whatever RN/Expo version exists then.
- Human testing is slower to repeat than automation, so frequent-iteration
  releases will feel the difference.

### Revisit criteria

Reconsider automated E2E when **all three** hold:

1. There is **CI** to run it (a cloud/local runner, not per-developer machines),
2. The native build is **stable** (no `pod install`/header churn — the
   `EXEventEmitterService.h` class of problem is gone), and
3. The app has a **steady release cadence** that makes the up-front
   investment and ongoing maintenance pay off.
