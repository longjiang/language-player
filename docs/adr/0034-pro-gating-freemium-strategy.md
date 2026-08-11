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

## Decision

### 1. Transcripts — keep per-video truncation, no daily quota yet

The per-video line cap remains the primary transcript gate. We will **not**
add a daily "open N full transcripts" quota at launch; the per-video sample
is the simplest, most honest gate. A daily quota is a fallback only if
conversion data later warrants it.

Align implementation to the advertised copy: **10 visible lines** for free
users. Concretely, set `NON_PRO_MAX_LINES = 17` so 10 lines remain visible
behind the 7-line upgrade prompt (or restyle the prompt so it doesn't obscure
content and set the constant to 10 — the visible count is the contract).

### 2. Word examples — keep corpus-wide search, align the copy to 5

Keep the existing behavior (free = first 5 corpus-wide hits; Pro = up to 500,
default 50 for speed, expandable in Settings). Align the go-pro copy from
"2 examples" to "5 examples" rather than reducing the free benefit. If the
product later wants 2, change the constant and the C5 test together.

### 3. Quota-based gating pattern (candidate features, staged rollout)

Adopt one pattern for new gates: **daily, backend-enforced, visible quota**,
with an upgrade prompt at the limit. Roll out incrementally and measure
conversion. Candidates, in priority order:

1. **AI explanations** — free daily quota (e.g., 5/day), Pro unlimited.
   Currently hard Pro-only; a quota converts the highest-wow feature into a
   "try then pay" lever.
2. **Saved words** — free cap (e.g., 30 total). Existing saved words stay
   readable (never hold data hostage); new saves blocked until upgrade.
3. **SRS daily reviews** — free daily cap (e.g., 20 reviews/day, matching
   the current default setting). Pro can raise the existing daily-max
   setting. Do **not** lock the setting control (Model B rejected); bound the
   effective daily count by plan instead.
4. **Full-text translation** — free daily character budget (e.g., 2,000
   chars/day), Pro unlimited. Also caps LLM/translation cost.

Quotas are enforced in the Flask backend (shared by web, mobile, and
Classic), using the same constant pattern as `NON_PRO_MAX_*`. The UI shows
remaining quota and the upgrade prompt; quotas reset daily per user.

### 4. Non-goals

- No paywalling of videos, languages, or the dictionary (core value stays
  free).
- Phrasebook gating — phrasebooks are not being implemented at this time.
- "Current-video-only" examples — no such concept exists; the subs search is
  corpus-wide by design.
- Locking the SRS setting or reducing the default below the free cap.

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
