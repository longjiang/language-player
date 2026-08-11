# ADR-0034: Pro Gating — "Try Then Pay" Strategy

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
- Word examples (i.e., Subtitles Search): free users see **2 examples**.

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
free experience feel broken. For this pass we want to **ship quickly and
minimize change**.

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

### 2. Word examples (i.e., Subtitles Search)

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

## Decisions

To ship quickly, we adopt the minimal set of changes now:

1. **D1 — Transcript gating: Option A.** Per-video line cap, **10 visible
   lines** for free users (e.g., `NON_PRO_MAX_LINES = 17` with the 7-line
   prompt overlay, or 10 with a non-obscuring prompt — the visible count is
   the contract). No daily full-transcript quota in this pass.
2. **D2 — Word examples (i.e., Subtitles Search): align the copy to the
   implementation.** Keep free = first 5 corpus-wide hits; update go-pro
   copy from "2 examples" to "5 examples".
3. **D3 — AI explanations: hard Pro-only.** Keep the current hard gate; do
   not add a free daily quota in this pass.
4. **D4 — SRS daily reviews (new): free daily cap of 20.** Bound the
   effective daily review count for free users at 20; Pro can raise the
   existing daily-max setting (the control is not locked).
5. **D5 — Paywalling core content: rejected** (closed).

Not adopted in this pass (deferred, future candidates): saved-words cap,
full-text translation budget, and the AI explanation quota.

## Consequences

- Constants, marketing copy, and SPEC-054 C5 agree on exact numbers:
  **10 visible transcript lines** and **5 word-example hits**.
- The SRS free daily cap (20) is backend-enforced and gains a SPEC-054 test
  row.
- AI explanations stay hard Pro-only (no quota change).
- Rollout stays small: transcript constant + copy, word-example copy, SRS
  cap. Conversion impact can be measured before revisiting the deferred
  candidates.
