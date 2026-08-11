# ADR-0034: Pro Gating — "Try Then Pay" Options

**Date**: 2026-08-10
**Status**: proposed — decisions open
**See also**:
- [SPEC-054 — Subscription & Payment Testing](../specs/054-subscription-payment-testing.md) (C5 gates)
- [ARCH-022 — Payment, Subscription & MailerLite](../arch/022-payment-subscription-mailerlite.md) (gating matrix)
- [ARCH-001 — Classic App Architecture](../arch/001-classic-app-architecture.md) (`NON_PRO_MAX_*` constants)
- [SPEC-014 — Subscription & Payment System](../specs/014-subscription-payment-system.md)

## Context

Classic's go-pro page advertises two Pro gates:

- Interactive transcripts: free users see the **first 10 lines**.
- Word video examples: free users see **2 examples**.

The implementation does not match the copy:

- `SyncedTranscript.vue` slices free transcripts to `NON_PRO_MAX_LINES = 15`
  and obscures ~7 lines with the upgrade prompt → **~8 visible lines**.
- `SearchSubsComp.vue` limits free subs-search hits (the "word examples")
  to `NON_PRO_MAX_SUBS_SEARCH_HITS = 5`, not 2. The search is **corpus-wide**
  (dictionary "examples" tab, phrasebook, compare) — there is no "current
  video" scope.
- "Let DeepSeek Explain" (AI explanation) is Pro-only and **not advertised**
  on go-pro at all.

SPEC-054 C5 asserts the advertised values (10 lines, 2 examples), so the
mismatch is testable and will fail.

The product goal: let users try the value, then pay — without making the
free experience feel broken.

## Options

### 1. Transcript gating

- **Option A — per-video line cap.** Every free transcript is truncated to
  the visible line count. Simple, backend-free (client-side constant).
  Sub-variants: keep the current ~8 visible lines, or align to the
  advertised 10 visible lines.
- **Option B — daily full-transcript quota.** Free users may open a small
  number of full transcripts per day (e.g., 3), then fall back to Option A.
  Requires a backend daily counter per user.

New users already get a **7-day full free trial** (granted on GoTrue email
verification; see ARCH-022 "Free Trial" and SPEC-039 M1). Option B would
extend a "taste of the full product" to free users *after* their trial
expires — it does not replace the trial.

### 2. Word examples

- **Align the copy to the implementation (5 hits).** Keep free = first 5
  corpus-wide hits and Pro = up to 500 (default 50 for speed, expandable in
  Settings); update go-pro copy from "2 examples" to "5 examples".
- **Reduce the implementation to the copy (2 hits).** Change
  `NON_PRO_MAX_SUBS_SEARCH_HITS = 2` and update SPEC-054 C5 accordingly;
  shrinks the free benefit.

### 3. Quota-based gating pattern (candidate features)

One pattern for new gates: **daily, backend-enforced, visible quota**, with
an upgrade prompt at the limit. Candidate features, in priority order:

1. **AI explanations** — free daily quota (e.g., 5/day), Pro unlimited.
   Currently hard Pro-only; a quota converts the highest-wow feature into a
   "try then pay" lever.
2. **Saved words** — free cap (e.g., 30 total). Existing saved words stay
   readable (never hold data hostage); new saves blocked until upgrade.
3. **SRS daily reviews** — free daily cap (e.g., 20 reviews/day, matching
   the current default setting). Pro can raise the existing daily-max
   setting.
4. **Full-text translation** — free daily character budget (e.g., 2,000
   chars/day), Pro unlimited. Also caps LLM/translation cost.

Quotas would be enforced in the Flask backend (shared by web, mobile, and
Classic), using the same constant pattern as `NON_PRO_MAX_*`. The UI shows
remaining quota and the upgrade prompt; quotas reset daily per user.

### 4. SRS setting control

- **Bound the effective daily count by plan** — the setting stays adjustable
  for everyone; the backend caps how many reviews actually complete per day
  on the free tier (e.g., 20), Pro can raise it.
- **Lock the setting** — free users cannot change the daily-max setting (and
  the default may be lowered), with the control greyed out behind an upgrade
  prompt.

### 5. Paywalling core content (rejected)

Paywalling videos, languages, or the dictionary was considered and rejected:
the core value stays free — paywalling it would shrink the audience before
the paid features can convert anyone.

## Open Decisions

- **D1 — Transcript gate.** OPEN: choose Option A (per-video line cap) or
  Option B (daily full-transcript quota, or A+B). If A, pick the visible line
  count (current ~8 vs advertised 10).
- **D2 — Word-example gate.** OPEN: align the copy to 5 hits, or reduce the
  constant to 2.
- **D3 — Quota gates.** OPEN: adopt the quota-based pattern? If yes, which
  features and limits (AI 5/day, saved words 30, SRS 20/day, translation
  2,000 chars/day), and the rollout order.
- **D4 — SRS setting control.** OPEN: bound the effective daily count by
  plan, or lock the setting.
- **D5 — Paywalling core content.** CLOSED: rejected.
