# ADR-0034: Pro Gating — "Try Then Pay" Strategy

**Date**: 2026-08-10
**Status**: accepted (D4 revised 2026-09-16 — see [Revision History](#revision-history))
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
3. **SRS new cards** — free daily allowance of new cards per deck (e.g. 20,
   matching the current default setting). Pro can raise the existing daily-max
   setting. Reviewing cards already in the deck is never capped (Revision 1).
4. **Full-text translation** — free daily character budget (e.g., 2,000
   chars/day), Pro unlimited. Also caps LLM/translation cost.

Quotas would be enforced in the Flask backend (shared by web, mobile, and
Classic), using the same constant pattern as `NON_PRO_MAX_*`. The UI shows
remaining quota and the upgrade prompt; quotas reset daily per user.

### 4. SRS setting control

- **Bound the effective daily count by plan** — the setting stays adjustable
  for everyone (1–200); the backend bounds how many **new cards** a free user's
  deck can introduce per day (20), Pro can raise it. Since Revision 1 that is
  the only SRS Pro gate; reviews of existing cards are unlimited.
- **Lock the setting** — free users cannot change the daily-max setting (and
  the default may be lowered), with the control greyed out behind an upgrade
  prompt. *(Not adopted: Revision 1 keeps the slider usable up to 20 and denies
  only an attempt above it.)*

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
4. **D4 — SRS new cards (new): free daily allowance of 20.** The free tier
   bounds how many **new cards a deck may introduce per local day** (20);
   Pro/trial can raise the daily limit setting (1–200, the control is not
   locked, but a free user's attempt above 20 is denied with an explanation at
   Settings → Review). Reviewing a card that is already in the deck is **never**
   capped on any plan, and no review screen shows an upgrade gate.
   *(Revised 2026-09-16 — originally "free daily cap of 20 reviews, ratings
   blocked at the cap, backend-enforced".)*
5. **D5 — Paywalling core content: rejected** (closed).

Not adopted in this pass (deferred, future candidates): saved-words cap,
full-text translation budget, and the AI explanation quota.

## Consequences

- Constants, marketing copy, and SPEC-054 C5 agree on exact numbers:
  **10 visible transcript lines** and **5 word-example hits**.
- The SRS free daily new-card allowance (20) is backend-enforced and gains a
  SPEC-054 test row.
- AI explanations stay hard Pro-only (no quota change).
- Rollout stays small: transcript constant + copy, word-example copy, SRS
  allowance. Conversion impact can be measured before revisiting the deferred
  candidates.

## Revision History

### Revision 1 (2026-09-16) — D4 revised (accepted)

**What changed.** D4 originally bounded the number of *reviews* a free user
could complete per day (20 ratings), enforced in the Flask backend
(`FREE_SRS_DAILY_CAP`) and mirrored in both clients: at the cap, ratings were
blocked and review screens showed an upgrade banner.

That gate punished the wrong thing. A learner who had already saved words and
built a review habit hit a hard wall mid-session, and the wall appeared on the
review screen even in Offline Mode — where it was also indistinguishable from
the subscription-loading problem fixed the same day (a device with no network
fell back to `isPro: false`). Reviewing your own saved words is core content,
which D5 already refused to paywall; the cost that a free tier actually needs
to bound is **introducing new cards**, not revisiting existing ones.

**Decision now.** The free allowance (still 20, still
`FREE_SRS_DAILY_CAP`) counts **new cards added to a deck per local day**, per
language, using the user's local day (`dayStartHour` + device timezone):

- A write for a card that is already in the deck is a review → always accepted,
  on every plan. This covers the auto-init creations the clients make, so a
  free user's offline-queued reviews replay without being rejected.
- A write that **creates** the card counts against the allowance; past 20 in
  the local day, a free user's creation is rejected with
  `403 {"code": "srs_cap_reached"}`.
- Pro/trial users are unlimited, as before.
- The upgrade gate lives **only** on Settings → Review, where a free user's
  attempt to raise *new cards per day* above 20 is denied with an explanation
  (`msg.free_new_cards_limit`). The slider keeps its 1–200 range for everyone;
  free users simply cannot set more than 20, and the client clamps the
  effective limit to `min(configured, 20)`.
- No review screen shows an upgrade banner, and rating is never blocked.
- Undo no longer "releases a rating back to the daily budget": the card stays
  in the deck, so nothing is released. `voidRatingId` still voids the rating
  record.
- `count_srs_reviews_today` / `is_srs_review_logged` were dropped;
  `user_srs_review_log` remains as the append-only rating history (it feeds
  `repair_new_cards_with_review_log`, ADR-0044).

**Where.** `zerotohero-python-server/utils_user_data.py` (allowance counted
from `user_srs_cards.created_at`), `utils_sync.py`,
`routes/user_data_columns.py`, `apps/mobile/app/(tabs)/(vocab)/review.tsx`,
`apps/mobile/components/settings/ReviewSettings.tsx`,
`apps/web/src/app/[l1]/[l2]/review/page.tsx`,
`apps/web/src/components/settings/review-settings.tsx`,
`packages/utils/src/fsrs-scheduler.ts` (`effectiveDailyNewLimit`,
`FREE_SRS_DAILY_NEW_CARDS`). SPEC-066 § Daily new limit & free tier and
SPEC-054 C8 were updated with it.
