# SPEC-066 — SRS Review Page (Web + Mobile)

## Metadata

- **Spec ID**: SPEC-066
- **Feature**: SRS Review Page
- **Status**: implemented (2026-08-11)
- **Created**: 2026-08-11
- **ROADMAP Phase**: Phase 6: User Features

## Overview

The Review page is the spaced-repetition (SRS) flashcard surface for saved
words. It turns the user's saved vocabulary into a per-language deck of due
cards, shows each word's context and dictionary entry, lets the user rate how
well they recalled it, and schedules the next review with FSRS — Anki's
current spaced-repetition algorithm — via the `ts-fsrs` package. The page
exists in both `apps/web` (route `/[l1]/[l2]/review`) and `apps/mobile` (tab
route `(tabs)/(vocab)/review`). This spec documents the intended behavior on
both platforms and records the current web ↔ mobile disparities.

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
undone right away if it was a mistake. The session ends with a simple
"no more cards to review" message and the next review time. If there are no
words saved yet, the page explains how to build a deck by saving words while
watching videos; if nothing is due, it shows how many cards are waiting and
when the next review will be. Free users can review up to a daily limit before
being invited to upgrade, and learners control how many new words join the deck
each day.

## Intended SRS Algorithm

The scheduling target is FSRS (Free Spaced Repetition Scheduler) — Anki's
current built-in algorithm — implemented with the maintained `ts-fsrs`
package. The four rating buttons map one-to-one onto FSRS's Again / Hard /
Good / Easy, and every card moves through the same states as Anki:
**new** → **learning** → **review**, with failed review cards dropping back
into **relearning**.

Each saved word owns exactly one review card. The card tracks its state, the
current learning step, an FSRS memory state (difficulty + stability), the
desired-retention target, a due time, review/lapse counters, and timestamps
for when it was created and last reviewed. There is no ease factor.

### SM-2 (background)

SM-2 is the spaced-repetition algorithm introduced by Piotr Woźniak in 1987
for the SuperMemo program. Its core idea is that the best time to review a
word is just before you're about to forget it: the better you remember
something, the longer the wait until the next review; the worse you remember
it, the sooner it comes back. SM-2 tracks a per-item "ease factor" and a
repetition streak, and after every review it uses a 0–5 quality rating (0 =
complete failure, 5 = effortless recall) to decide the next interval.

Anki's classic scheduler was a modified SM-2, and Anki's current scheduler
(FSRS) is a different, model-based algorithm. This feature follows Anki's
current algorithm, described below.

### Target: FSRS (Anki's current scheduler)

FSRS is based on the "Three Component Model of Memory". Each card has:

- **Difficulty (D)** — how inherently hard the word is to retain.
- **Stability (S)** — how long the memory lasts: the time for recall
  probability to fall from ~100% to 90%.
- **Retrievability (R)** — the estimated probability of recalling the card
  today, which decreases as time passes.

A rating updates D and S through FSRS's learned parameters, and the next
interval is the time until R is expected to fall to the **desired retention**
target (default 90%). `ts-fsrs` ships with well-tested default parameters
(trained on hundreds of millions of real reviews) and owns the whole state
machine; the app persists the card state it returns.

**Card states**

- **New** — never rated; due as soon as it enters the deck.
- **Learning** — working through the initial steps (default `1m`, `10m`).
- **Review** — graduated; scheduled in days.
- **Relearning** — a graduated card that was failed; works through the
  relearning step (default `10m`) before returning to Review.

**New / learning cards**

- First appearance: due immediately at step 1 (`1m`).
- **Again** — back to the first step (`1m`).
- **Hard** — repeats the current step (a blend between Again and Good; on the
  first step it behaves like Again).
- **Good** — advances one step; on the final step the card graduates to
  Review.
- **Easy** — graduates immediately.
- Learning-stage ratings do not update the memory state.

**Review cards**

| Rating | Effect |
|---|---|
| Again | Fail — enter Relearning (`10m`); stability drops significantly, difficulty increases |
| Hard | Pass — stability increases slightly (or stays the same); difficulty increases moderately |
| Good | Pass — stability increases; difficulty changes very little |
| Easy | Pass — stability increases significantly; difficulty decreases moderately |

The next interval is derived from the updated stability and the desired
retention target, not from interval multipliers.

**Relearning**

- A failed review card enters Relearning at the first step (`10m`).
- Again / Hard behave like the learning-stage buttons; they do not make the
  memory state worse again (the damage happened when the card failed).
- Good (or Easy) exits Relearning back to Review.

**Late reviews**

FSRS handles late reviews natively: retrievability is computed from actual
elapsed time, so returning after a break naturally reschedules the card
without resetting it.

**Queue order**

- Learning / relearning cards are time-critical and are served as they become
  due.
- Due Review cards are served oldest-due-first, so the most overdue word
  appears before anything scheduled later.
- New cards enter through the daily budget below and are interleaved with due
  cards during a session.

**Settings**

Scheduler parameters stay at `ts-fsrs` defaults: desired retention 90%,
learning steps `1m`/`10m`, relearning step `10m`. The only user-facing
scheduling setting is the daily new-card limit
(`SettingsContext.review.dailyNewLimit`, default 20). Per-user FSRS parameter
optimization is a future enhancement, not required initially.

### How this differs from the SM-2 variants and the current app

| | Textbook SM-2 | Anki classic SM-2 | Anki FSRS (intended) | Current app (`sm2.ts`) |
|---|---|---|---|---|
| Answer scale | 0–5 quality | 4 buttons | 4 buttons | 4 buttons mapped to 0 / 2 / 4 / 5 |
| Hard on a review card | fail (quality < 3) | pass with slower growth | pass with a small stability gain | fail — same as Again |
| Again on a review card | reset to 1 day | relearn (`10m`), ease −20, interval × 0.5 | relearn (`10m`); stability drops sharply | re-show in 1 minute, ease unchanged |
| Core variable | ease factor | ease factor | difficulty + stability | ease factor |
| First intervals | 1 day then 6 days | learning steps (`1m`, `10m`), graduate at `1d` | learning steps (`1m`, `10m`), graduate per FSRS | 1 day then 6 days |
| Retention tuning | none | interval modifiers / easy bonus | desired retention target | none |
| Relearning | none | `10m` step; interval × 0.5 after a lapse | `10m` step; memory state already reduced | none |
| Progress counter | consecutive-success streak | lifetime review count + lapse count | lifetime review count + lapse count | consecutive-success streak |

### Current implementation (as of 2026-08-11)

FSRS-6 via `ts-fsrs` is implemented in `packages/utils/src/fsrs-scheduler.ts`
and wired into both review pages (Phase 2). The textbook SM-2 implementation
was retired in Phase 6; deprecated `ease` / `interval` / `repetitions` /
`nextReview` fields are still written on every card for the legacy-client
compatibility window.

### New-deck budget

New words enter the deck through a daily budget. The "new" deck always holds
the `dailyNewLimit` most recently saved words that haven't been rated yet;
newer saves displace older unrated words when the budget is full. A card
entering the deck is due immediately, and as soon as a rated word leaves the
new deck, the next newest unrated word takes its place — the deck refills
during the session rather than waiting for the next day. Rated cards (whether
passed or failed) are never displaced by newer saves.

**"No more new cards today" (Phase 0 definition)** — this state means the
unrated pool is empty: every saved word has a card and no card is still `new`.
Because the deck refills during a session, the daily limit caps the deck size,
not how many new cards can be reviewed today. The message is shown in the
all-done / no-due states (with the blue count at 0). SPEC-023 R6 is updated to
this definition.

`remainingNewCardsToday()` is rewritten to count the unrated pool (saved words
with no card or a `state: new` card); it is used only for this message.

### Undo and the free cap

Undo restores the card to exactly the scheduling state it had before the last
rating (including its memory state and current step) and returns it to the
front of the session. For free users, each rating counts toward a daily cap
of 20; undoing a rating restores the card's schedule and should also release
that rating back to the daily budget (currently only the schedule is
restored — see [Documented Intent Not Yet
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

### Card fields

The current `SrsFields` (in `packages/utils/src/sm2.ts`) predates the FSRS
target. Intended: persist the card state returned by `ts-fsrs`, plus deck
bookkeeping:

| Field | Meaning |
|---|---|
| `state` | `new` / `learning` / `review` / `relearning` |
| `step` | Index of the current learning / relearning step |
| `difficulty` | FSRS difficulty (D) — how hard the word is to retain |
| `stability` | FSRS stability (S) — how long the memory lasts (days) |
| `due` | When the card becomes due (minutes for learning steps, days for reviews) |
| `lastReview` | Unix-ms timestamp of the last rating |
| `reps` | Lifetime review count |
| `lapses` | Times a review card failed and entered relearning |
| `createdAt` | Unix-ms timestamp of card creation (new-deck budgeting) |

The classic SM-2 fields (`ease`, `interval`, `repetitions`) are replaced by
the FSRS memory state. The persisted card stores the **full ts-fsrs `Card`**
(`state`, `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`,
`learning_steps`, `reps`, `lapses`, `last_review`) with dates as Unix ms, plus
the app fields above — not just the reduced table below.

**Phase 0 decision — legacy compatibility window.** Deprecated `ease`,
`interval`, `repetitions`, and `nextReview` fields are also written on every
card for one release cycle so old installed clients can still read them. New
code ignores them; removal is scheduled for the release after this one.

### Ratings → scheduling effects

Intended FSRS behavior (learning steps applied by the app, memory-state
updates by `ts-fsrs`):

| Rating | New / learning card | Review card |
|---|---|---|
| Again | Back to first step (`1m`); memory state untouched | Relearning (`10m`); stability drops significantly, difficulty increases |
| Hard | Repeats the current step; memory state untouched | Pass: stability increases slightly, difficulty increases moderately |
| Good | Next step; final step graduates | Pass: stability increases, difficulty changes very little |
| Easy | Graduates immediately | Pass: stability increases significantly, difficulty decreases moderately |

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
2. Words in `toCreate` get a brand-new card with `due = Date.now()`
   (due immediately).
3. Blue cards pushed out of the newest-`dailyNewLimit` window are removed
   (`toRemove`) so the deck doesn't grow unboundedly.
4. Rated cards (green/red) are never displaced.
5. Due cards = saved words whose card has `due <= now`, sorted by
   `due` ascending (oldest due first).
6. The header shows three counts:
   - blue = new — never rated;
   - red = again — learning / relearning;
   - green = review — `state: review`.
   Counts are computed from the whole language deck (saved words only), not
   just the current due queue, so cards waiting on a learning step or
   scheduled for later still appear.

The classification follows the card's state (new / learning / review), not a
success streak. The current streak-based counts are a by-product of the
textbook implementation and disappear with the FSRS migration.

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
- SRS info line: `{interval}d` (or "new") and reviewed count.
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
- After a rating: `ts-fsrs` updates the card's memory state, the card leaves
  the due queue, and a colored toast offers Undo for 3 seconds.
- Undo restores the card's previous scheduling state (memory state and step),
  clears the completed state if it was the last card, and returns the undone
  card to the top of the queue.
- When all due cards are rated, show "No more cards to review" plus the next
  review time (current behavior).

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
- **All done**: "No more cards to review" + next review time (current
  behavior; no session stats or progress line — the blue/red/green header
  counts are the progress indicator).

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

**Backend cap contract (Phase 0 decision).** The free 20-review cap is counted
at a rating boundary, never on generic `PUT /srs/cards` sync writes (undo
restores and offline outbox replays are also PUTs and would double-count).
Each interactive rating carries a client-generated rating id recorded in a
per-user review log so replays/retries count once; undo writes a matching void
event so the cap is restored. Trial users are Pro-equivalent while active
(mirroring the clients' `isPro` logic from `user_subscriptions`).

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
| 16 | Unused/dead code | Cleaned up in Phase 6 (`fetchingEntries`, `handleSpeak`, unused imports removed) | `removeWord` intentionally unused: unsaving happens from saved-words/dictionary surfaces, not Review (2026-08-11) | Intended — no delete control on the card; orphan pruning removes the card (disparity 4) |
| 17 | `/srs/settings` row | `useSrs().updateSettings` exists but no UI calls it | `useSrs().setDailyLimit` exists but no UI calls it | Settings UI writes `settings_v2` on both; the SRS settings row is effectively orphaned (web still *reads* it for the deck limit — see #3) |

## Implementation Status (2026-08-11)

- ✅ **FSRS scheduling via `ts-fsrs`** — implemented (Phases 1–2):
  `fsrs-scheduler.ts` owns the state machine; both review pages, both `useSrs`
  hooks, and the saved-words status dots use the shared wrapper.
- ✅ **"No more new cards today" message** — implemented (Phase 6): shown in
  the all-done / no-due states when the unrated pool is exhausted
  (`msg.no_more_new_cards_today`).
- ✅ **Backend free cap** — implemented (Phase 5): Flask counts interactive
  ratings through an idempotent `user_srs_review_log`; undo writes a void
  event; replays never double-count; Pro/trial are unlimited (SPEC-054 C8).
- ✅ **Undo decrements the free daily counter** — implemented (Phase 4): undo
  restores the card and releases the rating back to the UTC-day budget.

## Stale Related Docs

- **SPEC-053 inventory staleness** — fixed (2026-08-11): the syncable-data
  table now says mobile SRS writes go through the durable outbox, and the
  deprecated `srs_settings` entity is noted.

## Dependencies

- `ts-fsrs` — the FSRS scheduler (MIT, actively maintained by the Open
  Spaced Repetition community; the same algorithm Anki uses today).
- `packages/utils/src/fsrs-scheduler.ts` — the `ts-fsrs` wrapper
  (`newCard`, `rate`, `isDue`, `planNewDeck`, migration, LWW merge).
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

## Prebuilt Scheduler Packages (Research)

Researched 2026-08-11. Decision: **adopt `ts-fsrs`** — MIT-licensed,
actively maintained TypeScript implementation of FSRS (v5.4.1, FSRS-6), the
same algorithm Anki uses today. Alternatives reviewed and rejected:

- [anki-sm-2](https://github.com/open-spaced-repetition/anki-sm-2) (Python) —
  Anki's classic SM-2 algorithm; not JS/TS and AGPL-3.0.
- [dolphinsr](https://www.npmjs.com/package/dolphinsr) (JS) — Anki-flavored
  SM-2 with learning/relearning; unmaintained since 2017, Flow types, and it
  deviates from Anki.
- [@open-spaced-repetition/sm-2](https://github.com/open-spaced-repetition/sm-2-ts)
  and [supermemo](https://www.npmjs.com/package/supermemo) (TS) — textbook
  SM-2 only (0–5 ratings, no Anki states).

## Implementation Work Plan

Phases are ordered so the monorepo stays green (typecheck + unit tests) after
every phase. The only phases that change the persisted card shape are 1 and 2;
everything after that is incremental. **Status: all phases implemented
(2026-08-11).**

### Phase 0 — Spec & verification reconciliation (no production code)

Purpose: remove contradictions between the intended behavior, the behavioral
test matrix, and the backend-cap contract before any code changes. All three
files must agree before Phase 2 starts.

1. **Reconcile SPEC-023 Tier 4 with this spec.** Decisions (recorded in this
   spec, 2026-08-11):
   - All-done: keep "No more cards to review" + next review time, no stats.
     SPEC-023 R4 updated to match.
   - "No more new cards today": the unrated pool is empty (every saved word
     rated at least once), shown in the all-done/no-due states. SPEC-023 R6
     updated to that definition. No `createdAt`-based counter — it contradicts
     `planNewDeck`'s rolling-deck semantics.
2. **Fix `remainingNewCardsToday()` semantics.** Decision: rewrite it to count
   the unrated pool (saved words with no card or a `state: new` card), used
   only for the "no more new cards" message.
3. **Backend free-cap counting contract (needed by Phase 5).** Decision:
   ratings are counted at a rating boundary with a client-generated rating id
   recorded in a per-user review log (replays/retries count once); undo writes
   a void/decrement event; the backend mirrors the clients' `isPro` logic
   (`user_subscriptions`; an active trial is Pro-equivalent); free = 20
   reviews per UTC day.
4. **Legacy-field compatibility window.** Decision: keep writing deprecated
   `ease`, `interval`, `repetitions`, `nextReview` fields alongside FSRS
   fields for one release cycle so old installed clients don't crash on
   new-shape cards and old clients don't clobber FSRS state with malformed
   cards. Removal is scheduled for Phase 6 / the following release.
5. **Add the missing SPEC-054 test row** for the SRS free cap (ADR-0034 D4
   says it should exist; SPEC-054 C5 currently doesn't cover SRS). Added as
   C8 in this phase.
6. Note: the translation-key cleanup (`review.complete_desc`,
   `review.progress`) is already done and needs no further action.

Gate: SPEC-023, SPEC-054, and this spec agree; no code changes.

### Phase 1 — Additive FSRS core (`packages/utils`)

Build the scheduler and migration utilities without wiring them into any app.
Old `sm2.ts` stays untouched, so web and mobile keep compiling and passing
tests.

1. **Add `ts-fsrs` to `packages/utils`** (v5.4.1, FSRS-6). Verify
   `package-lock.json` keeps the cross-platform optional binaries after
   install (npm prune gotcha in AGENTS.md). Local npm cache on this machine
   currently has a root-owned-cache `EPERM`; install with a fresh cache dir or
   fix cache ownership before starting.
2. **Deduplicate the card type.** `SrsFields` is currently declared twice —
   `packages/shared/src/types.ts` and `packages/utils/src/sm2.ts`. Move the
   single source of truth into `packages/shared`, re-export it from
   `packages/utils`, and make `sm2.ts` import it. Consumers already import
   from both packages, so a single declaration prevents silent drift.
3. **Create `packages/utils/src/fsrs-scheduler.ts`** exposing:
   - `newCard()` — wraps `createEmptyCard()`, sets `lastReview`/`createdAt` to
     now so the existing `lastReview`-based LWW merge keeps working, `due` =
     now (due immediately).
   - `rate(card, rating)` — maps Again/Hard/Good/Easy to `ts-fsrs` `Rating`,
     calls `scheduler.next(card, now, rating)`, returns a serialized card.
   - `isDue(card)` / `getDueCards(...)` — due-time comparisons.
   - `isNewCard(card)` — `state === 'new'` (this changes `planNewDeck`
     semantics from reps-based to state-based; verify the deck-refill tests
     still pass).
   - `serializeSrsCard(card)` / `deserializeSrsCard(json)` — persist the
     **full** ts-fsrs `Card` (`state`, `due`, `stability`, `difficulty`,
     `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`,
     `last_review`) with Dates as Unix ms, plus app fields (`createdAt`,
     `lastReview`). Do not persist only the 8-field table in this spec —
     ts-fsrs needs the derived fields to compute the next state.
   - `normalizeSrsCard(card)` — legacy (`ease`/`interval`/`repetitions`/
     `nextReview`) → FSRS: unreviewed cards become `new` with `due =
     createdAt/now`; graduated cards keep their existing `nextReview` as `due`
     and seed `stability` from the SM-2 interval (e.g. `stability = interval`
     days) with default difficulty. Never reset due times during migration.
   - `migrateSrsStore(store)` / `versionSrsStore(store)` — store-level
     migration to `v: 2`.
4. **Unit tests** (`packages/utils/src/fsrs-scheduler.test.ts` or alongside
   the sm2 tests):
   - Full state machine: new → learning → review → relearning, all four
     ratings on each state.
   - Late-review rescheduling.
   - Serialization round-trip (Date → ms → Date).
   - Legacy → FSRS migration, including the "preserve due" rule.
   - `planNewDeck` with state-based `isNewCard` (rated cards leave the blue
     deck; unrated pool refills).
   - LWW merge with mixed old/new shapes (newer `lastReview` wins but output
     is always normalized FSRS).
5. **Verification:** `npx turbo typecheck`; targeted `vitest` run for the new
   tests.

Gate: tree green, no production behavior changed.

### Phase 2 — Atomic cutover (shared shape + stores + both apps)

This is one coordinated change, not per-platform sequential steps: every
consumer of `SrsFields` (both `useSrs` hooks, both review pages, saved-words
page, api-client, tests) changes together. Landing it as a single commit/PR
is the only ordering where typecheck stays green throughout.

1. **Store versioning & migration on read.** Add `v: 2` to `SrsProgressStore`.
   Run `normalizeSrsCard`/`migrateSrsStore` at **every** read boundary:
   - Web `useSrs` localStorage parse and `GET /srs` merge.
   - Mobile `useSrs` SecureStore parse and `GET /srs` merge.
   - Mobile pull-merge bridge (`getEntityCache('srs_card')` rows) — normalize
     each payload state before it enters the store, and merge rather than
     blindly replacing the whole cards record so mixed old/new shapes can't
     resurrect.
   - Outbox enqueue: validate the serialized state shape before
     `enqueueSyncOp` (the sync-entities schema already requires `state:
     object`; add shape validation in the hook).
2. **Update `useSrs` on both platforms:**
   - `updateCard` writes the full serialized FSRS card.
   - Remove mobile's malformed fallback default (`{ ease: 2.5, ...,
     lastReview: '', nextReview: '' }` — string timestamps break LWW); use
     `newCard()` as the fallback.
   - Web's `reps === 0` data-loss warning needs FSRS semantics (`review → new`
     transitions only), or it will false-positive on undo.
   - Keep `lastReview` updated on every rating so multi-device merge still
     works.
3. **Update both review pages:**
   - Replace `sm2()`/`RATING_MAP` with `rate(card, rating)`.
   - Header counts (blue/red/green) computed from the **whole language deck**
     (`store.cards[l2Code]` filtered to saved words), not the due-only `cards`
     array — otherwise learning/relearning cards waiting on `1m`/`10m` steps
     and future review cards disappear from the counts.
   - SRS info line: show "new" or the interval derived from `due`, drop
     `ease`; keep the reviewed count from `reps`.
   - Web reads `SettingsContext.review.dailyNewLimit` (disparity 3); mobile
     already does.
   - Undo stores and restores the full previous serialized card (memory state
     + step + due), not just `nextReview`.
   - All-done/no-due next-review calculations use `due` instead of
     `nextReview`.
   - Keep legacy compat fields written on every card (Phase 0 decision).
4. **Update the saved-words page** `getSrsStatus()` — it reads old fields and
   its "new" check (`nextReview === 0`) is already dead. Map to FSRS
   state/due (`new`/`learning`/`review`/`relearning` → existing dot colors).
5. **Update tests:** rewrite the `sm2()`-dependent blocks in
   `apps/web/src/hooks/use-srs.test.ts`; add store migration + normalization +
   mixed-shape merge tests. `npx turbo typecheck` alone is not sufficient —
   run `vitest`.
6. **Manual QA (both apps):** migrate a real account with existing saved
   words/cards; card front → reveal → rate (all four) → undo; empty states;
   no-context card; free cap; translation toggle; cross-device merge (web +
   mobile on the same account); offline rating on mobile, then sync.

Gate: typecheck + unit tests green; manual migration/QA pass on web and
mobile.

### Phase 3 — Mobile parity & guard fixes

Independent, small commits after the cutover.

1. **Real cloud-hydration guard (disparity 8).** `useCloudUserData().loaded`
   on web is a placeholder that flips true immediately, and the review page's
   `savedWordsEmpty` condition can trap a genuinely empty account in an
   infinite spinner. Add a `cloudHydrated` flag to the web saved-words
   provider and the mobile `SavedWordsContext`, set when the row-API fetch
   completes (even for an empty response), and gate the review pages on it.
   Port that flag, not the current condition.
2. **Mobile orphan pruning (disparity 4).** Add `pruneOrphans()` to mobile
   `useSrs` (mirror web) and call it from the review screen on load; wire the
   review screen's unsave path to remove the SRS card too. Note (2026-08-11):
   the review-screen unsave button added here was removed again as redundant —
   unsaving happens from saved-words/dictionary surfaces, and `pruneOrphans`
   deletes the orphaned card automatically on the next Review load.
3. **L1-translated entry lookup (disparity 6).** Mobile's
   `lib/dictionary-cache.ts` already re-exports the L1 cache helpers; add a
   mobile `lookupL1Text()` (port of web's `apps/web/src/lib/l1-lookup.ts`,
   using `POST /dictionary/lookup` with `l1`) and fetch on reveal for
   non-English L1, deduped/cached per entry id, with the offline fallback
   retained.
4. **No-context headword on web (disparity 2).** Mobile already shows the
   headword as the card front; add the same fallback to web.
5. **Empty-state CTA on mobile (disparity 14).** Add the Explore-videos action
   to mobile's no-words/no-due states.

Gate: typecheck + manual pass on both platforms for each item.

### Phase 4 — Free-cap client fixes & undo

1. **Undo decrements the daily counter** on both platforms: restore the card's
   schedule (already implemented) **and** release the rating back to the free
   budget (`reviewsDoneToday` and the `lpSrsReviewsDone:<userId>:<date>` key).
2. **Fix the UTC-midnight rollover.** Web memoizes the counter key on
   `session?.user?.id` only, so it never recomputes at midnight without a
   remount; mobile recomputes per render but nothing forces a render at the
   boundary. Add a day-boundary tick (or derive the key during render and
   re-read it on a timer) on both platforms.
3. **Web cap UI (disparity 9).** Disable + dim rating buttons at the cap like
   mobile (currently they stay enabled and `handleRate` no-ops).
4. **Unit tests** for counter increment/decrement/rollover (extract the
   counter logic into a small shared helper if needed for testability).

Gate: typecheck + manual free-user session crossing the cap and undoing across
the boundary.

### Phase 5 — Backend free cap

Depends on the Phase 0 contract. This is a separate, larger change; do not
combine it with Phase 4.

1. **Schema:** per-user review-log table (or equivalent) keyed by the client
   rating id, with the UTC-day count for free users; void/decrement rows for
   undo.
2. **Flask:** enforce the cap at the rating boundary (not on generic
   `PUT /srs/cards`, which also carries sync replays and undo restores).
   Return an explicit 429/403-style response the clients can render as the
   upgrade banner. Mirror the clients' Pro/trial determination from
   `user_subscriptions`.
3. **Clients:** keep the local counter as a UX hint only; reconcile from the
   server response so a failed/rejected rating doesn't permanently burn the
   budget. Update the free-cap UI copy to match the server response.
4. **Tests:** backend tests in `zerotohero-python-server/test_app.py` (cap
   counting, idempotent replays, undo decrement, trial exemption) plus the
   SPEC-054 row added in Phase 0.

Gate: backend tests pass; web + mobile manual free-session QA against the local
Flask API (server started by the user, per repo rules).

### Phase 6 — Dead code & backward-compat cleanup

1. **Remove dead imports/helpers** flagged in disparity 16 (`fetchingEntries`
   is referenced by a render branch that never fires — remove the branch too;
   `handleSpeak` either wire it or delete it; unused `normalizeInstances`
   import; the mobile `removeWord` import is used by Phase 3, so only what
   remains).
2. **Retire the textbook SM-2 implementation** (`sm2()`, old `SrsFields`
   docs) once no code or test references it; keep the deck-budgeting helpers
   (`planNewDeck`, `createSrsStore`, `getLanguageCards`) with FSRS semantics.
3. **Deprecate `/srs/settings` (disparity 17), don't delete it.** Old
   installed clients still enqueue `srs_settings` ops; keep the Flask route
   and the `utils_sync.py` handler accepting writes (or turn it into a no-op
   like the bookshelf handler) until old clients are phased out. Stop
   reading/writing it from new code, update the admin page's
   `srs.dailyNewLimit` display, and remove the `srs_settings` entity from new
   sync writes.
4. **Remove or rewrite `remainingNewCardsToday()`/`countNewCardsToday()`** per
   the Phase 0 decision.
5. **Docs:** mark SPEC-066 complete/current, update SPEC-053's syncable-data
   table (SRS writes already go through the outbox), and note the
   legacy-field removal version.

Gate: `rg` shows no app code references the removed helpers; typecheck + full
test suite green.

## Verification

- [SPEC-023 Tier 4](023-mobile-e2e-testing.md) (R1–R7) is the behavioral test
  matrix, as revised in Phase 0.
- [SPEC-048 §R](048-mobile-release-plan.md) (mobile) and
  [SPEC-059 §R](059-web-release-qa-checklist.md) (web) are the human QA
  checklists.
- Each phase has its own gate above: typecheck + unit tests + manual QA before
  moving to the next phase.
- Run `npx turbo typecheck` after every phase and `npx vitest run` for the
  package/web test suites. Never run `npx tsc` from the repo root (heap OOM /
  silent-failure warning).
- Phase 2 is the single cutover: run typecheck + the full unit suite
  immediately before and after it, and manually exercise card front → reveal →
  rate → undo, empty states, the free cap, translation toggle, and legacy-data
  migration on both apps.
