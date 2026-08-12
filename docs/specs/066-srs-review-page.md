# SPEC-066 — SRS Review Page (Web + Mobile)

## Metadata

- **Spec ID**: SPEC-066
- **Feature**: SRS Review Page
- **Status**: in-progress
- **Created**: 2026-08-11
- **ROADMAP Phase**: Phase 6: User Features

## Overview

The Review page is the spaced-repetition (SRS) flashcard surface for saved
words. It turns the user's saved vocabulary into a per-language deck of due
cards, shows each word's context and dictionary entry, lets the user rate how
well they recalled it, and schedules the next review with an Anki-style
spaced-repetition algorithm (Anki's modified SM-2). The page exists in both
`apps/web` (route `/[l1]/[l2]/review`) and `apps/mobile` (tab route
`(tabs)/(vocab)/review`). This spec documents the intended behavior on both
platforms and records the current web ↔ mobile disparities.

## User Stories

- As a learner, I want to review the words I've saved so that I remember them.
- As a learner, I want to see the word in its original context, plus its
  definition, translation, and pronunciation, so I can recall it accurately.
- As a learner, I want to rate each card (Again / Hard / Good / Easy) so the
  app can schedule my next review.
- As a learner, I want to undo a mis-clicked rating so my schedule isn't
  corrupted.
- As a learner, I want a daily limit on new cards so the deck doesn't become
  overwhelming.
- As a free user, I want a clear upgrade path when I hit the free daily review
  cap.

When a learner opens Review for a language, they see the words they've saved,
presented one card at a time, starting with the ones due for review. Each card
first shows the word as it appeared in real content — the sentence it was saved
from, along with where it came from and when it was saved — so the learner can
try to recall the meaning before flipping the card over. Flipping reveals the
full picture: a dictionary-style entry with the definition, examples,
pronunciation, and related information, plus the translation of the original
sentence, with the target word highlighted. The learner then says how well they
remembered it using four choices — Again, Hard, Good, Easy — and the app
quietly adjusts when that word should come back: words that were forgotten
return sooner, while words recalled easily come back later. A rating can be
undone right away if it was a mistake. The session ends with a friendly
all-done screen telling the learner when the next review is due. If there are
no words saved yet, the page explains how to build a deck by saving words while
watching videos; if nothing is due, it shows how many cards are waiting and
when the next review will be. Free users can review up to a daily limit before
being invited to upgrade, and learners control how many new words join the deck
each day.

## Intended SRS Algorithm

The scheduling target is Anki's classic built-in scheduler — the modified SM-2
that ships with Anki, not textbook SM-2 and not FSRS. The four rating buttons
map one-to-one onto Anki's Again / Hard / Good / Easy, and every card moves
through Anki's states: **new** → **learning** → **review**, with failed
review cards dropping back into **relearning**.

Each saved word owns exactly one review card. The card tracks its state, the
current learning step, an ease factor, the current interval, a lapse count,
and timestamps for when it was created, last reviewed, and next due.

### SM-2 (background)

SM-2 is the spaced-repetition algorithm introduced by Piotr Woźniak in 1987
for the SuperMemo program. Its core idea is that the best time to review a
word is just before you're about to forget it: the better you remember
something, the longer the wait until the next review; the worse you remember
it, the sooner it comes back. SM-2 tracks a per-item "ease factor" and a
repetition streak, and after every review it uses a 0–5 quality rating (0 =
complete failure, 5 = effortless recall) to decide the next interval.

This feature does not follow textbook SM-2 directly. Anki keeps SM-2's ease
factor and interval-multiplication idea, but changes the rating scale, treats
learning-stage failures differently, and adds relearning for lapsed review
cards. The intended behavior is Anki's variant, described below.

### Target: Anki-style scheduler

**Card states**

- **New** — never rated; due as soon as it enters the deck.
- **Learning** — working through the initial steps (default `1m`, `10m`).
  Failures here do not affect the card's future ease.
- **Review** — graduated; scheduled in days.
- **Relearning** — a graduated card that was failed; works through the
  relearning step (default `10m`) before returning to Review.

**New / learning cards**

- First appearance: due immediately at step 1 (`1m`).
- **Again** — back to the first step (`1m`).
- **Hard** — repeats the current step (a blend between Again and Good; on the
  first step it behaves like Again).
- **Good** — advances one step; on the final step the card graduates to Review
  with the graduating interval (`1d`).
- **Easy** — graduates immediately with the easy interval (`4d`).
- Ease is unaffected by learning-stage ratings.

**Review cards**

| Rating | Effect |
|---|---|
| Again | Fail — enter Relearning (`10m`); ease −20 points (floor 130%); interval becomes current × 0.5 when the card exits relearning (min 1 day) |
| Hard | Pass — ease −15 points; interval × 1.2 |
| Good | Pass — interval × ease; ease unchanged |
| Easy | Pass — interval × ease × 1.3; ease +15 points |

Hard / Good / Easy are additionally multiplied by the interval modifier
(default 1.0). Ease is stored as a multiplier (2.5 default, 1.3 floor), and
intervals are rounded to whole days. Anki's other safeguards apply: a maximum
interval cap, no interval shorter than the previous one except on failure, and
small random "fuzz" so cards rated identically don't stick together.

**Relearning**

- A failed review card enters Relearning at the first step (`10m`).
- Again / Hard behave like the learning-stage buttons; they do not decrease
  ease further (the ease drop happened when the card failed).
- Good (or Easy) exits Relearning back to Review with the reduced interval
  (current × 0.5).

**Late reviews**

If a card is answered later than scheduled, the delay is factored into the
next interval as a small bonus, so returning after a break doesn't reset the
card — Anki's "delay" behavior.

**Queue order**

- Learning / relearning cards are time-critical and are served as they become
  due.
- Due Review cards are served oldest-due-first, so the most overdue word
  appears before anything scheduled later.
- New cards enter through the daily budget below and are interleaved with due
  cards during a session.

### How this differs from textbook SM-2 and from the current app

| | Textbook SM-2 | Anki (intended) | Current app (`sm2.ts`) |
|---|---|---|---|
| Answer scale | 0–5 quality | 4 buttons: Again / Hard / Good / Easy | 4 buttons mapped to qualities 0 / 2 / 4 / 5 |
| Hard on a review card | fail (quality < 3) | pass with slower growth | fail — same as Again |
| Again on a review card | reset to 1 day | relearn (`10m`), ease −20, interval × 0.5 | re-show in 1 minute, ease unchanged |
| First intervals | 1 day then 6 days | learning steps (`1m`, `10m`), graduate at `1d` | 1 day then 6 days |
| Ease on failure | unchanged | decreased (Again −20, Hard −15) | unchanged |
| Relearning | none | `10m` step; interval × 0.5 after a lapse | none |
| Progress counter | consecutive-success streak | lifetime review count + lapse count | consecutive-success streak |

### Current implementation (gap)

Today `packages/utils/src/sm2.ts` implements the textbook version: Again and
Hard are both failures, a failure re-queues the card in 1 minute without
touching ease, success graduates `1d` → `6d` → `interval × ease`, and there
are no learning / relearning states. The intended Anki-style scheduler is
**not yet implemented** on either platform — see [Documented Intent Not Yet
Implemented](#documented-intent-not-yet-implemented-both-platforms).

### New-deck budget

New words enter the deck through a daily budget. The "new" deck always holds
the `dailyNewLimit` most recently saved words that haven't been rated yet;
newer saves displace older unrated words when the budget is full. A card
entering the deck is due immediately, and as soon as a rated word leaves the
new deck, the next newest unrated word takes its place — the deck refills
during the session rather than waiting for the next day. Rated cards (whether
passed or failed) are never displaced by newer saves.

### Undo and the free cap

Undo restores the card to exactly the scheduling state it had before the last
rating (including its state and current step) and returns it to the front of
the session. For free users, each rating counts toward a daily cap of 20;
undoing a rating restores the card's schedule and should also release that
rating back to the daily budget (currently only the schedule is restored —
see [Documented Intent Not Yet
Implemented](#documented-intent-not-yet-implemented-both-platforms)). Both
platforms share this algorithm through the same utility implementation, so a
card rated on web and a card rated on mobile follow identical scheduling.

## Routes

- **Web**: `apps/web/src/app/[l1]/[l2]/review/page.tsx` (+ `loading.tsx`,
  `layout.tsx`); settings at
  `apps/web/src/app/[l1]/[l2]/settings/review/page.tsx`.
- **Mobile**: `apps/mobile/app/(tabs)/(vocab)/review.tsx` (Vocab tab);
  settings at `apps/mobile/app/(tabs)/(me)/settings/review.tsx`.

## Data Model

Store shapes and sync flows follow [ARCH-011 — Settings
Architecture](../arch/011-settings-architecture.md) and [ARCH-014 — Saved Words
Data Flow](../arch/014-saved-words-data-flow.md).

### Card fields (`SrsFields`)

Defined in `packages/utils/src/sm2.ts`. The current shape predates the
Anki-style target; the intended card tracks at least:

| Field | Meaning |
|---|---|
| `state` | `new` / `learning` / `review` / `relearning` (intended — not in the current model) |
| `step` | Index of the current learning / relearning step (intended — not in the current model) |
| `ease` | Ease factor as a multiplier (default 2.5, floor 1.3) |
| `interval` | Current interval in days (0 = new / learning) |
| `repetitions` | Today: consecutive successful reviews (streak), reset by any failure. Intended: replaced by an Anki-style lifetime review count + `lapses` |
| `lapses` | Times a review card failed and entered relearning (intended — not in the current model) |
| `nextReview` | Unix-ms timestamp when the card becomes due (minutes for learning steps, days for reviews) |
| `lastReview` | Unix-ms timestamp of the last rating |
| `createdAt` | Unix-ms timestamp of card creation (new-deck budgeting) |

### Ratings → scheduling effects

Intended Anki-style behavior:

| Rating | New / learning card | Review card |
|---|---|---|
| Again | Back to first step (`1m`); ease unaffected | Relearning (`10m`); ease −20; interval × 0.5 when it exits relearning |
| Hard | Repeats the current step; ease unaffected | Pass: ease −15; interval × 1.2 |
| Good | Next step; final step graduates at `1d` | Pass: interval × ease; ease unchanged |
| Easy | Graduates immediately at `4d` | Pass: interval × ease × 1.3; ease +15 |

The current implementation instead maps the buttons to SM-2 qualities
(Again → 0, Hard → 2, Good → 4, Easy → 5): Again and Hard both fail (60-second
re-queue, ease unchanged), Good and Easy both graduate `1d` → `6d` →
`interval × ease`, with Easy getting a larger ease bump. This is the gap
described in [Intended SRS Algorithm](#intended-srs-algorithm).

The 60-second re-queue means a failed card leaves the current queue with
`nextReview = now + 60s`. It is technically due again a minute later; the UI
recomputes the queue on the next store change (rating, removal) or page reload.

### Deck construction

1. `planNewDeck(savedWords, cards, dailyNewLimit)` computes the blue ("new")
   deck: the `dailyNewLimit` most recently saved words that have no card or an
   unreviewed blue card, newest-saved first.
2. Words in `toCreate` get a brand-new card with `nextReview = Date.now()`
   (due immediately).
3. Blue cards pushed out of the newest-`dailyNewLimit` window are removed
   (`toRemove`) so the deck doesn't grow unboundedly.
4. Rated cards (green/red) are never displaced.
5. Due cards = saved words whose card has `nextReview <= now`, sorted by
   `nextReview` ascending (oldest due first).
6. The header shows three counts:
   - blue = new — never rated;
   - red = again — currently a failed card (successful-review streak 0); with
     the intended Anki states this becomes learning / relearning;
   - green = review — currently a successful-review streak of 1 or more; with
     the intended Anki states this becomes `state: review`.

The current green count is a streak, not a lifetime total: any failure resets
it to 0, so even a frequently reviewed word that was just forgotten shows up
as red. Under the intended Anki model the classification follows the card's
state instead of the streak.

Note: the "no cards due" copy says queued words are "for tomorrow's batch", but
the deck actually fills as soon as a blue slot frees up — `planNewDeck` reruns
after each rating and introduces the next-newest unrated word as a due-now card.

The `remainingNewCardsToday()` / `countNewCardsToday()` helpers exist in
`packages/utils/src/sm2.ts` but are not currently rendered anywhere in either
app.

### Storage & sync

**Web**

- `useSavedWordsContext()` — saved words in localStorage, hydrated from
  `GET /saved-words` row API.
- `useSrs()` — `zthSrsProgress` in localStorage, hydrated from `GET /srs`,
  mutations via `PUT/DELETE /srs/cards`.
- `useSettingsContext()` — `display.translation` for the translation toggle.
- `useSubscriptionContext()` — `isPro` for the free cap.
- `useCloudUserData()` — guards against a misleading "no cards" flash while
  cloud hydration is pending.

**Mobile**

- `SavedWordsContext` — SecureStore `zthSavedWords`, hydrated from
  `GET /saved-words`, writes through the durable sync-engine outbox.
- `useSrs()` — SecureStore `zthSrsProgress`, hydrated from `GET /srs`, writes
  through the sync-engine outbox (`srs_card` upserts/deletes,
  `srs_settings`).
- `useSettingsContext()` — `review.dailyNewLimit` and `display.translation`.
- `useSubscription()` — `isPro` for the free cap.
- `useOfflineDictionaryAvailable()` / `getOfflineEntryById()` — offline
  dictionary resolution.

## Intended Page Behavior (both platforms)

### Session / deck entry

- The page is per L2 language pair.
- On load it hydrates saved words + SRS cards, auto-creates missing new cards,
  and prunes cards for words that are no longer saved (web today; mobile lacks
  the prune — see disparity 4).
- Cards are served oldest-due-first, with a small reveal delay so the previous
  card settles before the next appears.

### Card front

- Context sentence(s) from the saved word, tokenized and tappable.
- A text-action menu (copy / speak / AI explain / translate) on the context.
- Source attribution (video/book title + localized date).
- SRS info line: `{interval}d` (or "new"), ease (`2.5x`), reviewed count.
- A "Show Definition" action to flip the card.
- No tap-to-rate zones on the card — rating is only via the explicit buttons
  ([SPEC-049 §6](049-mobile-feature-parity.md#6-review-flashcards)).

### Card back (after flip)

- The full dictionary entry with tabs (definition, examples, inflections,
  AI explanation, corpus/images where available).
- Phonetics on the highlighted word (revealed on flip).
- Context translation below the context sentence when the
  `display.translation` setting is on.
- Target form emphasized in the review translation; markdown rendered
  ([SPEC-049 §6](049-mobile-feature-parity.md#6-review-flashcards)).

### Dictionary entry lookup

**Web**

- All due cards are enqueued through the shared batched lookup
  (`enqueueLookupWords` → `POST /dictionary/lookup-batch`, English
  definitions).
- The current card is resolved reactively from the shared cache, trying every
  saved form (`forms[]`) and matching by entry id.
- For non-English L1, the card back additionally fetches an L1-translated
  entry via `lookupL1Text` (deduped and cached per entry id).
- If no entry is available, show `review.no_definition_available`.

**Mobile**

- Current card resolves from the entry-by-id cache, the saved word's
  `canonicalEntry`, or the offline dictionary.
- The next 3 cards' context sentences are pre-tokenized and their lemmas
  pre-looked-up while the user reviews the current card.
- The current word's entry is enqueued through the same shared batched lookup.
- No entry → spinner while offline lookup runs, then
  `msg.offline_dictionary_required` / `msg.no_definition_offline` when the
  offline dictionary can't resolve it.

### Context translation

**Web**

- Fetched only after reveal (see [SPEC-021 §Pattern 3 —
  Context Translation](021-unifying-translation-display.md#pattern-3-context-translation--srs-review)),
  via `POST /translate` with `text`, `l1` (base),
  `l2`, and `form` so the server wraps the target term in `**bold**`.
- A skeleton is shown while translating.
- Saved translations render as plain text; on-the-fly translations render as
  markdown with `strong` → primary color.

**Mobile**

- Fetched as soon as `display.translation` is on (even before reveal), the
  same pattern as [SPEC-021 §Pattern 3 —
  Context Translation](021-unifying-translation-display.md#pattern-3-context-translation--srs-review),
  via `POST /translate` with `text`, `l1` (base), `l2` — but **no `form`**.
- No skeleton while translating.
- Renders `inst.form` in primary color followed by
  `renderTranslation(...)`, which strips an echoed leading form. Applied to
  both saved and on-the-fly translations.

### Rating

- Four buttons: Again (red), Hard (orange), Good (green), Easy (blue), each
  with a hint.
- After a rating: the Anki-style scheduler is applied, the card leaves the due
  queue, and a colored toast offers Undo for 3 seconds.
- Undo restores the card's previous `SrsFields`, clears the completed state if
  it was the last card, and returns the undone card to the top of the queue.
- When all due cards are rated, show "All Done for Now!" plus the next review
  date.

### Interaction & input

**Web**

- Keyboard shortcuts: `Space` / `Enter` reveal; after reveal `1` Again, `2`
  Hard, `3` Good, `4` Easy (`Space`/`Enter` also rate Good); `u` unsaves the
  current word; `Ctrl/Cmd+Z` undoes the last rating.
- Shortcuts are ignored while typing in inputs.

**Mobile**

- Touch only: no keyboard shortcuts; undo is available via the rating toast
  only.
- Rating buttons are pinned to the bottom with safe-area padding and are
  disabled + dimmed at the free cap.

### Empty states

- **No saved words**: "No Words to Review" + guidance to save words while
  watching videos.
- **No cards due**: card total + deck name, next review date (or "save more
  words"), and how many words are queued.
- **All done**: completion message + next review date.

### Loading states

- **Web**: spinner while auth/saved words/SRS/cloud hydration are pending;
  unauthenticated users see "Sign in to review words" + a sign-in CTA.
- **Mobile**: spinner while saved words/SRS/initial deck creation load; there
  is no in-screen sign-in gate (auth is handled by app-level contexts).
- Mobile is fully offline-capable: saved words, SRS cards, settings, and
  dictionary entries come from SecureStore/SQLite, and rating changes queue in
  the outbox ([SPEC-053](053-mobile-offline-mode.md)).

### Layout & responsiveness

- **Web**: `max-w-2xl` container with `p-4 sm:p-8` card padding.
- **Mobile**: `PageContainer` capped at `2xl` (672px), `p-4` on phones /
  `p-8` at ≥640px.
- Both follow [SPEC-052 — iPad large-screen
  parity](052-mobile-large-screen-ipad-layout-parity-with-web.md).

### Daily new limit & free tier

- The blue deck is capped at `dailyNewLimit` (default 20, range 1–200 from
  Settings → Review).
- Free users can complete 20 ratings per day (`FREE_SRS_DAILY_CAP = 20`,
  [ADR-0034 — Pro gating/freemium strategy](../adr/0034-pro-gating-freemium-strategy.md)).
  At the cap, ratings are blocked and an upgrade banner links to the Pro page.
- The counter is per user + per UTC day, keyed
  `lpSrsReviewsDone:<userId>:<YYYY-MM-DD>`.

## Web ↔ Mobile Disparities

| # | Area | Web | Mobile | Impact / intended |
|---|---|---|---|---|
| 1 | Context instances | Renders only `word.context` (single context); imports `normalizeInstances` but doesn't use it | Renders **all** `instances[]` ("Context 1", "Context 2", …), filtering empty contexts | **Web is correct** — multi-instance is a future feature ([ADR-0006](../adr/0006-consolidated-lexical-data-types.md)); single-context rendering is the intended behavior for now |
| 2 | No-context fallback | No visible word front (only SRS info + Show Definition) | Shows the headword centered as the card front | **Mobile is correct** — web should show the headword when a word has no context |
| 3 | Daily new limit source | Review reads `useSrs().dailyNewLimit` (SRS store: legacy `zthSrsProgress` / `GET /srs`) | Review reads `SettingsContext.review.dailyNewLimit` (`settings_v2` / `GET /user-settings`) | **Mobile is correct** — web should read `SettingsContext` ([SPEC-015](015-mobile-settings-completion.md)) so Settings → Review affects the page |
| 4 | Orphan pruning | `pruneOrphans()` removes cards for unsaved words on page load | No `pruneOrphans` in mobile `useSrs` | **Web is correct** — mobile should prune orphan cards so unsaved words don't resurrect |
| 5 | Keyboard shortcuts | 1–4, Space/Enter, `u`, Ctrl/Cmd+Z | None | Platform difference; mobile is touch-only |
| 6 | L1-translated definitions | Fetches L1-translated entry on reveal for non-English L1 | Uses cached/offline entries as-is | **Web is correct** — mobile should port the L1-translated entry lookup |
| 7 | Offline | Online-only: localStorage + row API + network fetches | Offline-first: SecureStore, SQLite dictionary, sync outbox | Intended per platform (SPEC-053) |
| 8 | Loading/flash guard | Guards authenticated hydration (`cloudLoaded`, `savedWordsEmpty`) to avoid a false "No words" flash | No equivalent guard; `loaded` is true after local load even while cloud hydration is pending | **Web is correct** — mobile should port the guard (commit `d2faf8f3` was never ported) |
| 9 | Free-cap UI | Buttons stay enabled at cap but `handleRate` no-ops; toast colors via sonner | Buttons disabled + dimmed at cap; toast colors via custom RN Toast config | Cosmetic parity gap |
| 10 | Rating settle delay | 400 ms before buttons re-enable | 600 ms | Minor timing difference |
| 11 | Entry-miss state | `review.no_definition_available` text | Spinner → offline-dictionary message | Web has no offline fallback, so states differ by design |
| 12 | Header | Back link to Explore + colored counts | "Review" title + colored counts (tab navigation) | Platform navigation difference |
| 13 | Auth gate | Explicit "Sign in to review words" screen | None in-screen | Web-only explicit gate |
| 14 | Empty-state CTA | Explore-videos button on no-words/no-due states | Text only, no CTA | Mobile missing the CTA |
| 15 | Language code | `baseCode(l2.code)` for SRS/saved-word keys | Raw `l2Lang.code` | No practical difference today (L2 codes are already base codes) |
| 16 | Unused/dead code | `fetchingEntries` never set; `handleSpeak` defined but never wired; `normalizeInstances` import unused | `removeWord` import unused | Dead code to clean up |
| 17 | `/srs/settings` row | `useSrs().updateSettings` exists but no UI calls it | `useSrs().setDailyLimit` exists but no UI calls it | Settings UI writes `settings_v2` on both; the SRS settings row is effectively orphaned (web still *reads* it for the deck limit — see #3) |

## Documented Intent Not Yet Implemented (Both Platforms)

- **Anki-style scheduling**: `packages/utils/src/sm2.ts` implements textbook
  SM-2 — Again and Hard both fail, failures re-queue in 1 minute without
  touching ease, success graduates `1d` → `6d` → `interval × ease`, and there
  are no learning / relearning states. The intended Anki-style scheduler
  (card states, learning steps, per-button ease effects, lapse handling) is
  not implemented on either platform.
- **All-done stats**: SPEC-023 R4, SPEC-048, and SPEC-059 describe an
  "all-done + stats" state, and `review.complete_desc` /
  `review.progress` translation keys exist — but neither page renders stats or
  a done/remaining progress line today.
- **"No more new cards today" message**: SPEC-023 R6 expects a message plus a
  remaining-new count of 0; neither page shows this (the blue count just drops
  to zero).
- **Backend free cap**: ADR-0034 D4 says the free 20-review cap is
  backend-enforced; both apps enforce it client-side only, and the Flask SRS
  routes have no cap logic.
- **Undo should decrement the free daily counter**: Undo currently restores the
  card's schedule but does **not** decrement `reviewsDoneToday` on either
  platform, so a free user can burn their 20-review cap on mis-clicks. Intended
  behavior: Undo restores the card **and** decrements the counter.

## Stale Related Docs

- **SPEC-053 inventory staleness**: the SPEC-053 syncable-data table says
  mobile SRS writes are direct row API calls with no queue, but current mobile
  `useSrs` writes through the durable outbox (commit `603833e8`). SPEC-053's
  "context sentence missing" review findings were also fixed in later mobile
  commits.

## Dependencies

- `packages/utils/src/sm2.ts` — `SrsFields`, `sm2`, `newCard`, `isNewCard`,
  `planNewDeck`, store types. Currently textbook SM-2; needs to become the
  Anki-style scheduler described in this spec.
- `packages/utils/src/dictionary-cache.ts` — shared batched lookup + entry
  cache.
- `apps/web/src/hooks/use-srs.ts` / `apps/mobile/hooks/use-srs.ts` — store +
  row-API wiring.
- Saved-words contexts (`apps/web/src/hooks/use-saved-words.ts`,
  `apps/mobile/contexts/SavedWordsContext.tsx`).
- `POST /translate` (Flask `routes/translate.py`) — on-the-fly context
  translation, optional `form` for server-side bold.
- `GET /srs`, `PUT/DELETE /srs/cards`, `GET/PUT /user-settings` — data sync.

Related docs: [SPEC-049 §6](049-mobile-feature-parity.md#6-review-flashcards),
[SPEC-021 §Pattern 3](021-unifying-translation-display.md#pattern-3-context-translation--srs-review),
[SPEC-023 Tier 4](023-mobile-e2e-testing.md),
[SPEC-048](048-mobile-release-plan.md),
[SPEC-052](052-mobile-large-screen-ipad-layout-parity-with-web.md),
[SPEC-053](053-mobile-offline-mode.md),
[SPEC-015](015-mobile-settings-completion.md),
[ADR-0010](../adr/0010-port-web-to-mobile-fresh-start.md),
[ADR-0034](../adr/0034-pro-gating-freemium-strategy.md),
[ARCH-001](../arch/001-classic-app-architecture.md),
[ARCH-011](../arch/011-settings-architecture.md),
[ARCH-014](../arch/014-saved-words-data-flow.md).

## Verification

- [SPEC-023 Tier 4](023-mobile-e2e-testing.md) (R1–R7) is the behavioral test
  matrix.
- [SPEC-048 §R](048-mobile-release-plan.md) (mobile) and
  [SPEC-059 §R](059-web-release-qa-checklist.md) (web) are the human QA
  checklists.
- After any change: `npx turbo typecheck`, and manually exercise card front →
  reveal → rate → undo, empty states, the free cap, and translation toggle on
  both apps.

## Open Questions

1. Should the all-done state show session stats (cards reviewed, time) using
   the existing `review.complete_desc` / `review.progress` keys?
2. Should web switch the review page to read `SettingsContext.review.dailyNewLimit`
   (matching mobile and SPEC-015), or should Settings → Review write through to
   the SRS store on both platforms?
3. Should mobile port the orphan-prune behavior so cards never resurrect after
   a word is removed? (Unsave itself already exists via the entry card's
   bookmark button, so no separate review-page unsave is needed.)
4. Should mobile port the L1-translated entry lookup for non-English L1 users?
5. Should the free daily cap move to Flask so web, mobile, and any future
   clients share one enforcement point (as ADR-0034 intended)?
6. Should web port mobile's headword fallback for words saved without context?
7. Should the Anki scheduler constants (learning steps, graduating / easy
   intervals, easy bonus, hard / new interval multipliers) stay fixed at
   Anki's defaults, or become user-configurable like Anki's deck options?
8. Should `repetitions` become Anki-style lifetime review + lapse counts, or
   stay a consecutive-success streak for the header classification?
