# ADR-0034: Pro Gating — Quota-Based "Try Then Pay" Strategy

**Date**: 2026-08-10
**Status**: accepted
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

## Options Considered

### 1. Transcript gating

- **Option A — per-video line cap.** Every free transcript is truncated to
  the visible line count. Simple, backend-free (client-side constant), and
  honest.
- **Option B — daily full-transcript quota.** Free users may open a small
  number of full transcripts per day (e.g., 3), then fall back to Option A.
  Requires a backend daily counter per user. Gives a real taste of the full
  product after the 7-day trial expires.

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

### 3. Quota-based gating pattern

One pattern for new gates: **daily, backend-enforced, visible quota**, with
an upgrade prompt at the limit. Candidate features, in priority order:

1. **AI explanations** — free daily quota (e.g., 5/day), Pro unlimited.
   Currently hard Pro-only; a quota converts the highest-wow feature into a
   "try then pay" lever.
2. **Saved words** — free cap (e.g., 30 total). Existing saved words stay
   readable (never hold data hostage); new saves blocked until upgrade.
3. **SRS daily reviews** — free daily cap (e.g., 20 reviews/day, matching
   the current default setting). Pro can raise the existing daily-max
   setting. The alternative — locking the setting control and dropping the
   default to 10 (Model B) — was considered and rejected.
4. **Full-text translation** — free daily character budget (e.g., 2,000
   chars/day), Pro unlimited. Also caps LLM/translation cost.

Quotas would be enforced in the Flask backend (shared by web, mobile, and
Classic), using the same constant pattern as `NON_PRO_MAX_*`. The UI shows
remaining quota and the upgrade prompt; quotas reset daily per user.

### 4. Other options considered (rejected)

- **Paywalling videos, languages, or the dictionary.** Rejected: the core
  value stays free — paywalling it would shrink the audience before the
  paid features can convert anyone.
- **Locking the SRS setting / reducing its default below the free cap.**
  Rejected: instead, the free tier is bounded by the effective daily review
  count, while Pro users can keep adjusting the existing daily-max setting.

## Consequences

- Constants, marketing copy, and SPEC-054 C5 agree on exact numbers:
  **10 visible transcript lines** and **5 word-example hits**.
- New quota gates are backend-enforced and testable (SPEC-054 gains quota
  rows alongside C5).
- Free users get a consistent "sample, hit the limit, upgrade" experience;
  no feature is paywalled outright except AI explanations (which gets a
  quota instead of a hard gate).
- Rollout is staged (AI quota first), so conversion impact can be measured
  before adding more gates.

## Decision

1. **Transcripts: adopt Option A.** Keep the per-video line cap as the only
   transcript gate at launch; do not ship a daily full-transcript quota yet.
   Set the visible count to **10 lines** (e.g., `NON_PRO_MAX_LINES = 17`
   with the 7-line prompt overlay, or 10 with a non-obscuring prompt — the
   visible count is the contract). Revisit Option B only if post-trial
   conversion data warrants it.
2. **Word examples: keep the corpus-wide search and align the copy to 5.**
   Free users keep 5 hits; Pro keeps up to 500 (default 50, Settings
   expandable). Marketing copy changes from "2 examples" to "5 examples";
   SPEC-054 C5 asserts 5.
3. **Adopt the quota-based pattern** for the candidate gates, rolled out
   incrementally starting with **AI explanations (5/day)**:
   - AI explanations — 5/day free, unlimited Pro.
   - Saved words — 30 free, unlimited Pro (existing words stay readable).
   - SRS reviews — 20/day free; Pro can raise the existing setting (control
     is not locked).
   - Full-text translation — 2,000 chars/day free, unlimited Pro.
   Enforcement is backend-side with daily reset and visible remaining quota.
4. **Rejected:** paywalling core content and locking the SRS setting.
