# SPEC-066 — SRS Review Page (Web + Mobile)

## Metadata

- **Spec ID**: SPEC-066
- **Feature**: SRS Review Page
- **Status**: implemented (2026-08-11); `dailyNewLimit` semantics corrected
  to match Anki/FSRS (2026-08-13), with reversible limit changes (2026-08-21)
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

> **Correction (2026-08-13):** The original wording of this section was
> wrong. It described `dailyNewLimit` as a rolling deck-size cap that refills
> during a session. The correct Anki/FSRS behavior is a daily quota: up to
> `dailyNewLimit` new cards per local day, with no refill until the next day.
> The code (`planNewDeck`, both review pages, and the
> `remainingNewCardsToday()` helpers) still implements the old incorrect
> behavior and must be updated to match this spec.

> **Correction (2026-08-13):** The day boundary was originally UTC midnight.
> Anki uses a **local** day that starts at a configurable hour (default
> 4 AM, "next day starts at"). This spec now matches Anki: the new-card
> budget, the free-review counter, and the backend cap all roll over at
> `review.dayStartHour` (default 4) in the device's local timezone. This was
> implemented the same day (`localDayStartMs()` / `msUntilNextDay()` in
> `packages/utils/src/day-boundary.ts`, and the backend's `_day_start_ms()`).

> **Correction (2026-08-13):** The original wording of the header-counts step
> below was also wrong. It described the blue/red/green numbers as an
> inventory of the whole deck (`countDeckStates()`), which is why a deck can
> show 33 red/green cards while nothing is due. Anki/FSRS show **due-today**
> counts: blue = today's remaining new-card budget, red = learning/relearning
> cards due on a step right now, green = review cards due now (including
> overdue). This spec was corrected and implemented today:
> `countDeckStates()` and both review pages now match this definition.

### New-deck budget

New words enter the deck through a daily budget. Each local day (Anki "next
day starts at", default 4 AM), up to `dailyNewLimit` unrated saved words are
made available as new cards (default 20). ~~The "new" deck always holds the
`dailyNewLimit` most recently saved
words that haven't been rated yet; newer saves displace older unrated words
when the budget is full. A card entering the deck is due immediately, and as
soon as a rated word leaves the new deck, the next newest unrated word takes
its place — the deck refills during the session rather than waiting for the
next day.~~ Rated cards (whether passed or failed) are never displaced by
newer saves.

A card entering the deck is due immediately. Once today's new-card budget is
used up, no more new cards are introduced until the next local day — the deck
does **not** refill during the session.

**"No more new cards today"** — this state means today's new-card budget is
exhausted (or every saved word has been rated at least once). ~~Because the
deck refills during a session, the daily limit caps the deck size, not how
many new cards can be reviewed today.~~ The message is shown in the all-done /
no-due states (with the blue count at 0). SPEC-023 R6 is updated to this
definition.

`remainingNewCardsToday()` counts the remaining daily budget: `max(0,
dailyNewLimit − cards introduced today − older unrated cards still in the blue
deck)`. It drives both the blue count and the "no more new cards today"
message. "Older unrated cards still in the blue deck" means cards that were
in the blue deck at the start of the local day — a pre-existing blue card
keeps occupying its slot for the whole day even after it is rated, so rating
it does not open a slot for a replacement card (`getNewCardBudget()` counts a
card minted before today if it is still new or has been rated at any point
today, keeping the budget monotone for the local day).

### Undo and the free cap

Undo restores the card to exactly the scheduling state it had before the last
rating (including its memory state and current step) and returns it to the
front of the session. For free users, each rating counts toward a daily cap
of 20; undoing a rating restores the card's schedule and should also release
that rating back to the daily budget. Both
platforms share this algorithm through the same utility implementation, so a
card rated on web and a card rated on mobile follow identical scheduling.

The rating buttons and the post-rating toast show the rating label on the first
line and the newly scheduled interval on the second line. The interval rounds
up and uses minutes, hours, or days as appropriate. The **toast** keeps the
full form ("Next review in 3 days"); the **mobile rating buttons** use the
compact form without the prefix ("1 minute", "3 hours", "2 days" —
`msg.next_review_minutes` / `msg.next_review_hours` / `msg.next_review_days`,
2026-08-24).

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
   deck for today: the most recently saved words that have no card or an
   unreviewed blue card, newest-saved first, but never more than today's
   remaining new-card budget.
2. Words in `toCreate` get a brand-new card with `due = Date.now()`
   (due immediately) and count against today's budget.
3. Blue cards outside the newest-`dailyNewLimit` window are soft-deactivated
   for review selection. They remain persisted as unrated cards, so changing
   the limit does not issue one DELETE request per card and raising the limit
   later can restore them without recreating their state. The review window
   (`getActiveNewCardIds()`) selects only saved words that already have a
   `state: new` card — a cardless saved word is a creation candidate, never a
   window occupant, so newer cardless words cannot push real blue cards out
   of review selection.
4. Rated cards (green/red) are never displaced.
5. Due cards = saved words whose card has `due <= now`, sorted by
   `due` ascending (oldest due first).
6. The header shows three counts:
   - blue = unrated (`state: new`) cards in the blue deck — the deck is
     prefilled with today's new-card budget, so this is the remaining budget:
     it counts down as each new card is rated and does not refill until the
     next local day (`countDeckStates()` caps it at `dailyNewLimit`);
   - red = again — learning / relearning cards currently due on a step
     (`due <= now`);
   - green = review — `state: review` cards currently due
     (`due <= now`, including overdue).
   Counts are due-today counts (Anki parity), not whole-deck state
   inventory: cards waiting on a future learning step or scheduled for a
   later review do **not** appear until they become due. The count matching
   the current card's state is underlined (Anki-style).

The classification follows the card's state (new / learning / review), not a
success streak, and red/green are only counted while their card is actually
due. The current streak-based counts are a by-product of the textbook
implementation and disappear with the FSRS migration.

~~Note: the "no cards due" copy says queued words are "for tomorrow's batch",
but the deck actually fills as soon as a blue slot frees up — `planNewDeck`
reruns after each rating and introduces the next-newest unrated word as a
due-now card.~~

Note: once today's budget is exhausted, `planNewDeck` must not create another
card until the next local day, even after a rated card leaves the blue deck.

~~The `remainingNewCardsToday()` / `countNewCardsToday()` helpers exist in
`packages/utils/src/sm2.ts` but are not currently rendered anywhere in either
app.~~ The local-day budget helpers (`remainingNewCardsToday()`,
`countNewCardsToday()`) drive the blue count and the "no more new cards
today" message.

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
- **Pull-merge reconciliation (2026-08-30):** `useSrs.refreshFromCache()`
  merges offline `entity_cache` rows back into the deck so another device's
  changes apply on load, but it now keeps an `srs_card` row only if the
  authoritative `GET /srs` deck contains the card **or** a pending/error outbox
  op exists for it (unsynced local work). Rows that are neither — stale
  local-only cards never persisted to the server and with nothing queued to push
  them — are dropped. This stops mobile from retaining server-absent cards that
  web (server-authoritative) never shows, so the new/again/review header counts
  converge between platforms after hydration. The server deck is captured during
  row-API hydration and the reconcile re-runs right after it; it's skipped
  per-language until that language's server deck has loaded, so legitimate
  offline cards are never dropped before cloud hydration.

## Intended Page Behavior (both platforms)

### Session / deck entry

- The page is per L2 language pair.
- On load it hydrates saved words + SRS cards, auto-creates missing new cards
  up to today's remaining new-card budget, and prunes cards for words that are
  no longer saved. Pruning only runs after the cloud saved-words hydration
  completes — an empty-but-loading list must never be treated as "no saved
  words" (this previously wiped the whole deck when the page opened before
  hydration finished).
- Cards are served oldest-due-first, with a small reveal delay so the previous
  card settles before the next appears.

### Card front

- Context sentence(s) from the saved word, tokenized and tappable.
  The saved target is highlighted by surface form **or lemma**, so inflected
  forms (e.g. 押し切られ → 押し切る) stay highlighted even when the tokenizer
  splits the surface form. Multi-token selections saved from the web text
  selection feature (e.g. "got even with me" saved under the canonical "to get
  even with someone") are merged into atomic tokens and highlighted from the
  per-instance surface forms. Since 2026-09-02 (SPEC-033 cross-boundary
  retokenization) a saved form that starts or ends **inside** a token — e.g.
  掘藏 in 想掘｜藏 — is also highlighted: the web review context runs the
  same split stage as the source text, splitting the straddled tokens into an
  atomic phrase token plus re-lemmatized fragments. The highlighted keyword
  gets a **text background** for notability, matching the rest of the app
  (web: `bg-primary/15` + ring in `token-span.tsx`; mobile: `bg-primary/20`
  in all `TokenizedText` render paths, parity added 2026-08-24; the
  cross-boundary split is web-only for now — see SPEC-033 Open Questions).
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
- On reveal, if the exact saved entry is not in the cache yet (common for
  LLM-generated entries), it is fetched by its id
  (`GET /dictionary/entry?dict=&id=`) and cached; the back side shows a
  spinner until the exact entry arrives instead of a mismatched one.
- If the exact saved id no longer resolves (stale EDICT row after a
  dictionary update), the back side falls back to the best text-lookup entry
  for the same head; the bookmark reflects the current entry id.
- For non-English L1, the card back additionally fetches an L1-translated
  entry via `lookupL1Text` (deduped and cached per entry id).
- If no entry is available, show `review.no_definition_available`.

**Mobile**

- Current card resolves from the entry-by-id cache, the saved word's
  `canonicalEntry` (only when its id matches the saved word id), or the
  offline dictionary. On reveal, the exact entry is fetched by id if missing
  (offline first, then network), so a saved LLM-generated entry never shows a
  different entry as "not saved".
- The exact-entry fetch requests L1 definitions (`l1` param) and promotes the
  result to the L1 entry, so the back side shows translated definitions as
  soon as the saved entry loads instead of falling back to English.
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
  via `POST /translate` with `text`, `form`, `l1` (base), `l2` — matching web.
- No skeleton while translating.
- On-the-fly translations render the server's `**bold**` marker in primary
  color inside the sentence; saved translations render as plain text (web
  parity). The manual prepend/echo-strip behavior was removed (2026-08-11).

### Rating

- Four buttons: Again (red), Hard (orange), Good (green), Easy (blue), each
  with a hint.
- **Buttons appear only after the card back is revealed** — never while the
  front is showing. Recall mode reveals via Show Definition; choose mode reveals
  after the final question is answered; spell mode reveals after the answer is
  submitted. (Web gates on `showDefinition`; mobile gates on the back being
  shown, parity added 2026-08-24.)
- After a rating: `ts-fsrs` updates the card's memory state, the card leaves
  the due queue, and a colored toast offers Undo for 3 seconds.
- Undo restores the card's previous scheduling state (memory state and step),
  clears the completed state if it was the last card, and returns the undone
  card to the top of the queue.
- When all due cards are rated, show "No more cards to review" plus the next
  review time (current behavior).

### Choose mode

Choose mode (formerly **test mode**) asks one multiple-choice question per
aspect — a **definition question** and, for deep-orthography L2s
(`needsPronunciationTest`, e.g. ja with kanji), a **pronunciation question** —
generated from the context sentence via `buildSrsQuestionPrompt` (shared
`packages/utils/src/srs-test-mode.ts`). Questions render one at a time;
answering the final question reveals the card back and the rating buttons.

- **Start Test gate (2026-08-25)** — in choose mode the card front shows the
  context sentence plus a "Start Test" button; no question is shown
  (and no questions are generated for the current card) until the user taps
  it, so they can read the context and reflect on the word's usage first.
  Pressing Space/Enter also starts the test.
  **Reveal is button/keyboard-only (2026-09-02):** tapping the card no longer
  reveals the back (recall mode) or starts the test (choose mode) — accidental
  taps revealed the answer before the learner was ready. The explicit "Show
  Definition" / "Start Test" buttons and the Space/Enter shortcuts are the
  only reveal paths.
- **Progress bar (2026-08-25)** — after Start Test, a progress bar counts
  down a total budget of **T = 10 s × totalTests** (totalTests = the number
  of test slots for the card, 1 or 2). It is **blue** while more than
  **5 s × totalTests** remain — i.e. still inside the fast window that earns
  the +1 bonus — and **green** once past that threshold (racing the
  10 s/test slow mark). The bar follows the same session timer
  (`testSessionStartRef`) used by `scoreTestResult`, so per-test
  regeneration restarts it.
- **Pronunciation targets the lemma (2026-08-25)** — the pronunciation test
  asks for the reading of the **lemma** (dictionary/head form, e.g. 押し切る),
  never the inflected surface form (押し切られ). The definition test keeps the
  surface form as its target. Shared helpers: `lemmaFormOf` (lemma) and
  `surfaceFormOf` (surface). Both the current-card generation and the
  prefetch use the same target, so prefetched pronunciation tests are cache
  hits when the card is tested.
- **Question and answer name the same word (2026-09-02 fix)** — the lemma was
  previously inferred from `forms[0]` of the saved record when no explicit
  head exists, but `forms[]` is length-sorted at save time, so `forms[0]`
  can be a kana/inflected variant (研ぎすまし, 見せつけ) while the ground-truth
  reading comes from the resolved entry's true lemma (研ぎ澄ます → とぎすます,
  見せつける → みせつける) — the question probed one word and the correct
  answer belonged to another. The pronunciation target is now the **resolved
  dictionary entry's headword** whenever an entry resolves (`pronunciationTargetOf`
  in `packages/utils/src/srs-test-mode.ts`, used by both loadSlot and the
  prefetch on web and mobile); the record inference remains only the
  fallback for cards whose entry cannot be resolved. Cache keys include the
  word form, so previously-generated mismatched questions regenerate once.
- **Japanese surface-form gate (2026-08-25)** — for Japanese, the
  pronunciation test only appears when the **surface form as it appears in
  the context sentence** contains kanji (e.g. 然るべき). A kana-only surface
  (しかるべき) suppresses the test even when the lemma (然るべき) contains
  kanji — the learner reads the surface, which already reveals the reading.
- **One test at a time (2026-08-25)** — tests are handled **strictly
  sequentially, both generated and answered one at a time**: the pronunciation
  test is loaded (from the cache or fresh) and answered first; the definition
  test is only loaded after the pronunciation one is answered, then answered
  itself; only then can the card be rated. Only ONE generation
  request is ever in flight for the card, so an error in one test is
  isolated to that test — the other test's loading/answering is never
  blocked by it (and no tokens are wasted on a parallel request that would
  be discarded). A test that fails after the automatic retry shows its error
  box and must be retried (or skipped) before the card can be rated; the
  already-answered pronunciation test is not affected.
- **Error display (2026-08-25)** — on a generation error the UI
  automatically shows "There was a problem, trying again…" and retries
  **exactly once**. If it still fails, the test shows a generic error
  (no error specifics) with a **Retry** button and a **Skip** button, plus a
  very small **Diagnostic** link that reveals — in plain text — the prompt
  sent to the LLM, the raw LLM response, and the error.
- **Skip (2026-08-25)** — a failed test can be **skipped** instead of
  retried. The skipped test is excluded from the flow and **does not count
  toward the scoring** (`totalTests` is the number of non-skipped tests), so
  the card can be rated on the remaining tests alone. Skipped slots render a
  "Skipped" label.
- **Terse language-specific prompts (2026-08-25)** — `buildSrsQuestionPrompt`
  is kept short and names the L2 in the opening line ("…tests the
  pronunciation of a Japanese phrase"); the answer notation is chosen from
  the L2 (hiragana for Japanese, pinyin for Chinese), so a Japanese prompt
  never mentions Chinese rules and vice versa. Each client-side rejection
  (bad JSON, wrong kind, blank question, non-hiragana, duplicate choices,
  substring "obvious wrongs", derived/inflected forms) is prevented by one
  short directive. The auto-retry hint in the manager is equally terse and
  language-specific.
- **Pronunciation question is app-owned (2026-08-26)** — for the
  pronunciation test the app composes the question text and, when the
  dictionary has a kana reading, the correct answer; the LLM supplies only the
  3 distractor readings. The question text is deterministic via
  `buildPronunciationQuestionText` (always the headword, L1-localized via
  `PRONUNCIATION_QUESTION_I18N`), so it can never drift into asking about a
  compound's components (e.g. 「手」和「落ち」 for 手落ち). The correct answer is
  the headword's ground-truth reading from `pronunciationReadingOf` — for EDICT
  it reads `alternate` / `phonetic_detail.kana` (the `pronunciation` field is
  romaji like "soru", not the kana the test needs); CEDICT uses pinyin. The
  manager assembles `correctAnswer` from the supplied reading and `prompt` from
  `buildPronunciationQuestionText`.
- **Pronunciation hybrid (2026-08-26)** — when a Japanese word has NO kana
  reading (e.g. an LLM entry whose only reading is romaji, like 羽交い締め), the
  app cannot supply a ground-truth answer, so the model generates BOTH the
  `correct_answer` and the confounders — still anchored to the lemma headword
  (the prompt always names the lemma, never the surface form or a compound's
  sub-components). This keeps a pronunciation question for every deep-orthography
  word instead of dropping it. The manager keys the test cache on the
  ground-truth mode (`gt=<reading>`) so a grounded and an ungrounded question
  never collide. The definition test is
  unchanged — the model still returns question + correct answer + confounders,
  since a word has several definitions and the model must pick the
  contextually appropriate one.
- **Definition confounders confound answer length (2026-08-30)** — the
  definition prompt (`buildSrsQuestionPrompt`, definition branch) adds a
  **length-mixing directive**: each option must be comparable in length and
  precision, and no single option may be noticeably longer, shorter, or more
  precisely worded than the rest, so answer length cannot reveal the correct
  answer. The manager additionally runs a conservative client-side guard
  (`validateSrsDefinitionChoices` in `packages/utils/src/srs-test-mode.ts`)
  that rejects — triggering the existing one-shot auto-retry — only the
  egregious case where the correct answer is the **unique longest** option and
  at least **1.5×** the length of the next-longest. This stops the learner from
  cheating by always picking the longest/precisely-worded option.
- **Card-test cache + prefetch (2026-08-25)** — all test generation,
  regeneration, and retry requests route through the shared
  `SrsTestManager` (`packages/utils/src/srs-test-manager.ts`): a
  **single-flight priority queue** (one LLM call at a time; precedence
  user-initiated regeneration > current card > prefetch), a **per-card test
  cache** (keyed `l2:l1:cardId:kind`, persisted per platform — localStorage
  on web, AsyncStorage on mobile) used throughout, **automatic one-shot
  retries**, and **prefetching of the next two cards' tests** whenever test
  mode is active, so the next Start Test is instant. Stale prefetches for
  cards the user has left behind are cancelled instead of burning tokens.
- **Marking rules (2026-08-25)** — `scoreTestResult(correctCount,
  totalTests, totalMs)` (shared `packages/utils/src/srs-test-mode.ts`):
  - each test scores **0 (wrong) / 1 (right)**;
  - the total is **scaled so a perfect score would be 2**
    (`round(correctCount * 2 / totalTests)`), so single- and multi-test cards
    share one 0–2 scale;
  - a scaled score above 1 (all tests correct) is **time-adjusted**:
    slower than **10 s × totalTests** deducts a point (slow), faster than
    **5 s × totalTests** adds one point (fast);
  - map the points → **again (0) / hard (1) / good (2) / easy (3)**.
- **Regeneration (2026-08-25)** — each question block carries its own
  "Regenerate" control (web + mobile). Tapping it replaces **that** test
  (definition or pronunciation) with a fresh cache-busted variation, clears
  the regenerated question's answer and every later answer/score, restarts
  the test from that question, and hides the revealed back so the user
  re-answers before rating. The whole-test retry (Try Again) remains for
  generation failures.
- **Pronunciation confounders (2026-08-25)** — confounders are validated
  against `isObviousPronunciationWrong()` / `validateSrsPronunciationChoices()`:
  a confounder that contains the correct reading as a substring (e.g.
  `つきものぬ`/`つきものだ` from `つきもの`) or is a truncated fragment is
  rejected, and the pronunciation question is auto-retried once with a strict
  hint. The prompt additionally instructs: for **mixed kana/kanji words** the
  written-kana part is fixed — confounders must keep it identical and vary
  only the kanji readings with real or plausible readings of the same kanji
  (e.g. `憑き物` = `つきもの` → `つきぶつ`, `つきもつ`, `つきもち`), and must
  never extend/truncate/reorder the correct reading.

### Spell mode

Spell mode asks the learner to **type the exact word that was blanked** in the
context sentence — the surface/inflected form as it appears there (e.g.
押し切られ, not the lemma 押し切る). It is graded by string similarity, then
time-adjusted by the countdown, then mapped to the same four rating buttons as
choose mode.

- **Pre-test state** — the card front shows the context sentence with the
  target term rendered as a **blank** (the highlighted term's text is hidden,
  replaced by a width-matched blank), plus the context translation with the
  target term bolded (identical to the other modes). This is the only review
  mode where the translation is shown *before* the card back is revealed.
- **Start Test gate** — a "Start Test" button (Space/Enter also works) begins
  the session. Until it is pressed the input is not shown, so the learner can
  read the sentence and reflect first (matching the choose-mode gate).
- **Countdown progress** — after Start Test the same blue/green progress bar
  from choose mode counts down a budget of **T = 10 s × totalTests** (spell
  mode has exactly one test → T = 10 s), blue while more than 5 s remain.
- **Input + hint** — a text input with a **Submit** button, plus a muted hint
  underneath that shows **the first character of the pronunciation of the
  lemma** when the entry has a pronunciation (`pronunciationReadingOf`), or
  otherwise **the first character of the lemma** — but only when the lemma is
  more than one character long (a single-char lemma's first char IS the whole
  word and would give the answer away). Shared helper: `spellHintOf`.
- **Grading** — on submit, `stringSimilarity` compares the submission to the
  correct surface form (normalized Levenshtein ratio) and maps it to a base
  score of 1–3:
  - **≥ 0.9** → 3 (essentially exact),
  - **≥ 0.5** → 2 (a few character edits),
  - else → 1 (wrong).
- **Timer adjustment** — the countdown always adjusts the base score, using the
  same per-test thresholds as choose mode: **faster than 5 s adds +1**,
  **slower than 10 s deducts −1**. (Unlike choose mode, which only time-adjusts
  a perfect score, spell mode time-adjusts a graded base.) The result is
  clamped to 0–3 and mapped **again(0) / hard(1) / good(2) / easy(3)** — the
  same button mapping as choose mode. Shared helper: `scoreSpellResult`
  (`packages/utils/src/srs-test-mode.ts`).
- **Reveal** — submitting reveals the card back (the dictionary entry) and the
  rating buttons, and shows a Correct/Incorrect line plus the correct answer.

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

- **Web**: spinner while auth, settings, saved words, SRS, or cloud hydration
  are pending;
  unauthenticated users see "Sign in to review words" + a sign-in CTA.
- **Mobile**: spinner while settings, saved words, SRS, or initial deck
  creation load; there is no in-screen sign-in gate (auth is handled by
  app-level contexts).
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

- ~~The blue deck is capped at `dailyNewLimit` (default 20, range 1–200 from
  Settings → Review).~~
- Up to `dailyNewLimit` new cards are introduced per local day (default 20,
  range 1–200 from Settings → Review). The blue count shows how many of
  today's new cards remain; it drops as you work through them and does not
  refill until the next local day.
- The review day starts at `review.dayStartHour` (0–23, default 4, Anki's
  "next day starts at") in the device's local timezone — not UTC midnight.
- Free users can complete 20 ratings per day (`FREE_SRS_DAILY_CAP = 20`,
  [ADR-0034 — Pro gating/freemium strategy](../adr/0034-pro-gating-freemium-strategy.md)).
  At the cap, ratings are blocked and an upgrade banner links to the Pro page.
- The counter is per user + per local day, keyed
  `lpSrsReviewsDone:<userId>:<YYYY-MM-DD>`.

**Backend cap contract (Phase 0 decision).** The free 20-review cap is counted
at a rating boundary, never on generic `PUT /srs/cards` sync writes (undo
restores and offline outbox replays are also PUTs and would double-count).
Each interactive rating carries a client-generated rating id recorded in a
per-user review log so replays/retries count once; undo writes a matching void
event so the cap is restored. Trial users are Pro-equivalent while active
(mirroring the clients' `isPro` logic from `user_subscriptions`). Pro
detection mirrors `/user-subscription`: lifetime is unconditional, and other
types count while unexpired — there is no `status` filter.

## Web ↔ Mobile Disparities

| # | Area | Web | Mobile | Impact / intended |
|---|---|---|---|---|
| 1 | Context instances | Renders only `word.context` (single context) | Rendered **all** `instances[]`; fixed (2026-08-13) to render only the latest context | Both now render a single context; multi-instance remains a future feature ([ADR-0006](../adr/0006-consolidated-lexical-data-types.md)) |
| 2 | No-context fallback | No visible word front (only SRS info + Show Definition) | Shows the headword centered as the card front | **Mobile is correct** — web should show the headword when a word has no context |
| 3 | Daily new limit source | Reads `SettingsContext.review.dailyNewLimit` (`settings_v2` / `GET /user-settings`) | Reads `SettingsContext.review.dailyNewLimit` (`settings_v2` / `GET /user-settings`) | **Resolved** — both apps read `settings_v2` since ADR-0037 (2026-08-13); the legacy SRS settings row is removed |
| 4 | Orphan pruning | `pruneOrphans()` removes cards for unsaved words on page load | `pruneOrphans()` removes cards for unsaved words on page load | **Resolved** — both apps implement `pruneOrphans`; mobile added it 2026-08-11 (`235c162e`) |
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
- ✅ **Dictionary card review-status dot (2026-08-30)** — the shared
  `getSrsReviewStatus(card)` (in `@langplayer/utils`) maps a card to
  `new` / `learning` / `review` / `null` and is used by the `DictionaryEntryCard`
  on both apps to render the SRS status dot next to the level badges in **both
  compact and full** mode (blue = new, red = learning/relearning, green =
  review). Previously the web saved-words page had a page-local `getSrsStatus`
  (due/overdue/ok colors) shown only in compact mode.
- ✅ **"No more new cards today" message** — implemented (Phase 6): shown in
  the all-done / no-due states when today's new-card budget is exhausted
  (`msg.no_more_new_cards_today`); trigger updated with the local-day quota
  (2026-08-13).
- ✅ **Local-day new-card quota** — implemented (2026-08-13):
  `planNewDeck()` / `remainingNewCardsToday()` and both review pages now stop
  introducing new cards once today's budget is exhausted; the blue count
  counts down instead of refilling during a session.
- ✅ **Anki-style local day boundary** — implemented (2026-08-13): the
  new-card budget, the free-review counter, and the backend cap roll over at
  `review.dayStartHour` (default 4 AM) in the device's local timezone instead
  of UTC midnight (`localDayStartMs()` / `dayKey()` / `msUntilNextDay()` in
  `packages/utils/src/day-boundary.ts`; `_day_start_ms()` in the Flask
  backend). Web/mobile send `timezone` + `dayStartHour` with SRS card writes,
  and Settings → Review exposes the "next day starts at" slider.
- ✅ **Anki due-today header counts** — implemented (2026-08-13):
  `countDeckStates()` now counts red = learning/relearning cards due on a
  step right now and green = review cards due now (including overdue); blue =
  unrated new cards capped by `dailyNewLimit`. Future-dated learning/review
  cards no longer inflate the header, so an all-done deck shows 0 even when
  the language has future cards waiting.
- ✅ **L1 definition translation on reveal** — fixed (2026-08-13): an English
  cache hit no longer blocks the exact `/dictionary/entry` L1 fetch, and the
  L1 text lookup tries every saved form/head before giving up. Inflected
  surface forms (e.g. 顰めらせられる) previously resolved to a different LLM
  entry id, so the card back fell back to English definitions; it now shows
  the saved entry's translated definitions on both web and mobile.
- ✅ **Review front highlight by entry id (mobile)** — fixed (2026-08-13):
  mobile `TokenizedText` now supports `highlightEntryIds` and highlights any
  token whose lemma resolves to the saved dictionary entry, matching web.
  Inflected surfaces (e.g. 忠実な for a saved 忠実) now highlight on mobile
  review cards instead of only exact surface-form matches.
- ✅ **SRS hydration race guard** — implemented (2026-08-13): both review
  pages wait for `useSrs().cloudHydrated` before auto-initializing new cards;
  web retries failed `GET /srs` fetches.
- ✅ **Web SRS pending-op queue** — implemented (2026-08-13): failed
  `PUT/DELETE /srs/cards` writes are queued in localStorage, replayed before
  hydration, and retried every 10 seconds; 403 cap rejections still surface
  the upgrade banner.
- ✅ **Web saved-words hydration retry** — implemented (2026-08-13): hydration
  no longer completes on failure, retries every 5 seconds, filters server rows
  that have an unacked local delete, and retries pending saved-word ops every
  10 seconds.
- ✅ **Mobile SRS hydration retry** — implemented (2026-08-13): failed
  `GET /srs` fetches retry every 5 seconds when online; Offline Mode and
  detected-offline use the local store.
- ✅ **Mobile cap-rejection reconciliation** — implemented (2026-08-13):
  `srs_cap_reached` rejections revert the unsynced card and surface the
  upgrade banner instead of silently dropping the rating.
- ✅ **Reversible daily-limit changes** — implemented (2026-08-21):
  changing `dailyNewLimit` no longer deletes blue cards outside the active
  window. Both review pages soft-deactivate those cards during selection;
  orphan pruning still deletes cards whose saved words were actually removed.
- ✅ **Server-side tombstone guard** — implemented (2026-08-13): stale
  saved-word / SRS-card upserts are rejected against `user_sync_log` deletes,
  and direct web writes carry client timestamps for LWW.
- ✅ **Reset-card repair from review log** — implemented (2026-08-13):
  `GET /srs` rebuilds cards that are `new` but have unvoided review history
  as previously reviewed and logs the repair to `user_sync_log`.
- ✅ **Reviewed-card merge guard** — implemented (2026-08-13): a reviewed
  server card (`reps > 0`) can no longer be overwritten by a local unrated
  `new` card during hydration, and mobile merges cache rows instead of
  replacing the deck.
- ✅ **Duplicate-instance guard** — implemented (2026-08-13): saved-word
  instances dedupe by `form + context.text` regardless of save date, existing
  duplicates are cleaned up, and mobile renders a single context.
- ✅ **Backend free cap** — implemented (Phase 5): Flask counts interactive
  ratings through an idempotent `user_srs_review_log`; undo writes a void
  event; replays never double-count; Pro/trial are unlimited (SPEC-054 C8).
  The mobile outbox acknowledges `srs_cap_reached` as an expected rejection,
  so over-cap ratings never surface as Sync Status errors.
- ✅ **Undo decrements the free daily counter** — implemented (Phase 4): undo
  restores the card and releases the rating back to the local-day budget.
- ✅ **Per-test regeneration** — implemented (2026-08-25, web `367f211e`,
  mobile `1d2f784f`): each test question (definition / pronunciation) has its
  own Regenerate control that replaces just that test.
- ✅ **Pronunciation confounder intelligence** — implemented (2026-08-25,
  `951f6f1d` + the two review pages): obvious-wrong confounders are rejected
  and auto-retried, and mixed kana/kanji words keep their written-kana part
  constant across choices.
- ✅ **Choose-mode marking rules** — implemented (2026-08-25, shared
  `scoreTestResult` + both review pages): each test 0/1, scaled so perfect = 2,
  time-adjusted via the 10 s/test slow and 5 s/test fast thresholds → again /
  hard / good / easy.
- ✅ **Start Test gate + progress bar** — implemented (2026-08-25, both review
  pages): the card front in choose mode shows the context + a "Start Test"
  button; after Start Test a blue/green progress bar counts down T =
  10 s × totalTests (blue while more than 5 s × totalTests remain).
- ✅ **Sequential one-test-at-a-time flow** — implemented (2026-08-25,
  both review pages); pronunciation-first ordering added 2026-08-26: the
  pronunciation test is loaded and answered first; the definition test is
  only loaded after it, then answered, then the card is rated. An error in
  one test is isolated to that test and never blocks the other's
  loading/answering.
- ✅ **Pronunciation targets the lemma; Japanese surface-form gate** —
  implemented (2026-08-25, shared `lemmaFormOf`/`surfaceFormOf` + both
  review pages): the pronunciation test asks for the lemma's reading, and
  for Japanese it only appears when the surface form in the context
  contains kanji.
- ✅ **Terse language-specific prompts** — implemented (2026-08-25, shared
  `buildSrsQuestionPrompt` + manager retry hints): prompts are short, name
  the L2 in the opening line, use L2-specific answer notation, and each
  short directive prevents one client-side rejection (including the
  "derived/inflected forms" confounder rule).
- ✅ **Skip a failed test** — implemented (2026-08-25, both review pages):
  the error box gains a Skip button next to Retry; a skipped test is
  excluded from the flow and from the scoring (`totalTests` counts only
  non-skipped tests).
- ✅ **Auto-retry-once + generic error + Diagnostic link** — implemented
  (2026-08-25, both review pages): on error, "There was a problem, trying
  again…" + exactly one automatic retry; a second failure shows a generic
  error + Retry and a tiny Diagnostic link (prompt / raw response / error).
- ✅ **Card-test cache, prefetch, single-flight queue** — implemented
  (2026-08-25, shared `SrsTestManager` + both review pages): all test
  generation/regeneration routes through one priority queue
  (user > current > prefetch), the card-test cache is used throughout
  (persisted per platform), the next two cards' tests are prefetched in test
  mode, and stale prefetches are cancelled.
- ✅ **test → choose rename** — implemented (2026-09-06, both review pages +
  i18n): the SRS "test mode" is renamed to **choose mode**; the mode toggle is
  now Recall / Choose / Spell, and the previously stored `'test'` value is
  migrated to `'choose'` on read. The old `review.test_mode` label is replaced
  by `review.choose_mode`.
- ✅ **Spell mode** — implemented (2026-09-06, both review pages + shared
  utils): blank the term in the context sentence, show the bolded translation,
  then Start Test shows a countdown bar, a text input + submit, and a muted
  first-char hint. Grading via `stringSimilarity`/`scoreSpellResult` (1–3 base,
  time-adjusted, mapped to again/hard/good/easy) and `spellHintOf` in
  `packages/utils/src/srs-test-mode.ts`. The context blanking uses a new
  `blankHighlighted` prop on both `TokenizedText` implementations (web
  `token-span.tsx`, mobile `TokenizedText.tsx`).

## Known Issues & Resolutions (2026-08-13)

The following issues were found during cross-device review testing on
iPad/iPhone Safari (web) and the mobile app. All are implemented/resolved as
of 2026-08-13; the struck text records the original behavior and each section
notes the fix that landed.

### Shared: rated cards can be reset to "new" before cloud hydration finishes

Both review pages auto-create missing new cards as soon as the local stores
load ([web review page](<../../apps/web/src/app/[l1]/[l2]/review/page.tsx>),
[mobile review page](<../../apps/mobile/app/(tabs)/(vocab)/review.tsx>)) and do not
wait for `GET /srs` (or SRS cloud hydration) to finish. If saved-words
hydration lands first — or `GET /srs` fails — `planNewDeck` sees a missing
local card, creates `fsrs.newCard()` with `lastReview = now`, and writes it to
the server. The later cloud merge keeps the new card because `mergeSrsCards()`
uses newer-`lastReview`-wins, so a previously rated card can be replaced by a
blue "new" card.

Fix direction: expose a real SRS cloud-hydrated flag, gate auto-init on both
cloud sources, and retry failed SRS fetches.

✅ **Fixed (2026-08-13):** both `useSrs` hooks now expose `cloudHydrated`, both
review pages wait for SRS cloud hydration before auto-initializing cards, and
web retries a failed `GET /srs` instead of proceeding with stale local state.

### Web: SRS writes are fire-and-forget

`useSrs.updateCard()` optimistically updates localStorage and calls
`PUT /srs/cards` without a durable queue. A transient failure (network,
token-refresh race, 403 cap) leaves the rating only on the local device, so
another device or reload sees a missing card and creates a new one. Saved
words have a pending-op queue; SRS does not.

Fix direction: add a durable retry/outbox for SRS card writes, or reuse the
mobile outbox pattern.

✅ **Fixed (2026-08-13):** web SRS upserts/deletes now go through a durable
`zthSrsProgressPendingOps` queue in localStorage and are replayed before SRS
hydration and on a 10-second retry timer after failures. A backend 403 still
dispatches the `lp:srs-cap-reached` event so the review page shows the cap
banner.

### Web: hydration can fall back to stale local data and strand pending deletes

`useSavedWords` sets `cloudHydrated = true` even when hydration fails, so the
review page can render stale local saved words. If a pending delete fails
during hydration, the server row is fetched and re-added to local state, and
the failed delete is not retried until the next mutation or hydration.

Fix direction: don't mark hydration complete on failure; keep retrying pending
deletes; do not re-add server rows for words with an unacked local delete.

✅ **Fixed (2026-08-13):** web hydration now stays incomplete and retries every
5 seconds on failure; server rows with an unacked local delete are filtered
out of hydration, and failed saved-word ops retry every 10 seconds.

### Mobile: same auto-init race and no retry on failed SRS fetch

`useSrs` marks the user as cloud-loaded before `GET /srs` completes and never
retries a failed fetch. The mobile review screen now waits for `cloudHydrated`
before auto-initializing (2026-08-13), but a failed fetch still needs a retry;
auto-init can otherwise run after a failed fetch and push new cards over rated
server cards. Mobile SRS writes do go through the durable outbox.

✅ **Fixed (2026-08-13):** mobile `GET /srs` now retries every 5 seconds when
online; Offline Mode / detected-offline falls back to the local store instead
of blocking the review screen.

### Mobile: cap rejections are silently dropped

When the backend rejects a rating with `srs_cap_reached`, the sync engine
treats it as an expected rejection, acks/drops the outbox op, and the review
UI never learns the rating failed. The card stays "rated" locally but is
missing on the server, so it can reappear as new on web or other devices.

✅ **Fixed (2026-08-13):** the sync engine emits a cap-rejection event; mobile
`useSrs` reverts the unsynced card (local store + entity cache), and the review
screen reconciles `reviewsDoneToday` to the cap so the upgrade banner appears.
The flag resets on the next local day.

### Shared backend: no server-side tombstone for saved words or SRS cards

`DELETE /saved-words/...` and `DELETE /srs/cards/...` hard-delete rows. The
sync log records the delete, but a stale upsert (web pending op or mobile
outbox) can recreate the row because the push handlers don't check for a newer
delete. This is the "unsaved word comes back" path. The mobile outbox can also
push a stale upsert after pulling a remote delete because the pull only sets a
local tombstone and does not cancel the queued op.

Fix direction: tombstone saved words and SRS cards (or reject upserts older
than the latest delete in `user_sync_log`), and have the direct row endpoints
use client timestamps for LWW.

✅ **Fixed (2026-08-13):** the server now rejects saved-word / SRS-card
upserts whose client timestamp is not newer than the latest delete in
`user_sync_log` (direct row endpoints and `/sync/push`). Web row-API calls now
send `updatedAt` / `lastReview` so stale offline ops cannot resurrect deleted
items.

### Daily new-card budget

The old rolling-deck semantics were wrong and have been corrected in
[New-deck budget](#new-deck-budget). ~~The code still needs to be updated to
the daily-quota definition.~~ Implemented (2026-08-13): `planNewDeck()`,
`remainingNewCardsToday()`, and both review pages now enforce the local-day
quota.

### Review back side: fallback lookup only tried `forms[0]`

Some legacy saved words have a placeholder or non-lookupable first form
(`"?"` or an inflected surface the dictionary lookup can't match), so the
back side showed "This word is not found in our dictionary" even though
another saved form, the head, the context form, or an instance form resolved.

✅ **Fixed (2026-08-13):** both review pages now collect every saved form,
head, context form, and instance form, and try each one through the cache and
text lookup before showing the no-definition state.

### Review back side: ID-cache-only entries were skipped

An entry could exist in the shared ID cache while the text cache for the
card's forms was still empty. `currentEntry` stayed null, the exact-entry
effect bailed out early, and the back side showed the no-definition state.

✅ **Fixed (2026-08-13):** the web review card now reads the reactive
`useEntryByIdCache` before falling back to text-cache lookups, so a cached
entry by saved ID always renders.

### Previously-reviewed cards reset to "new"

The hydration race could overwrite a reviewed card with a brand-new state,
and the prevention fix does not retroactively repair cards that were already
reset. The server's `user_srs_review_log` retains the rating history, so the
reset cards can be detected.

✅ **Fixed (2026-08-13):** `GET /srs` now runs a one-time repair pass. Any
card still in the `new` state with unvoided review-log entries is rebuilt as
previously reviewed — `Review` if the last rating passed, `Relearning` if it
was Again — with `reps`/`lapses` restored from the log and `lastReview` bumped
to the repair time so the repaired state wins LWW merges. The repair also
appends to `user_sync_log` so mobile devices receive the repaired card via
pull. This is best-effort: ratings recorded before `user_srs_review_log`
existed cannot be recovered.

### Reviewed cloud card vs newer local "new" card

`mergeSrsCards()` used `lastReview`-wins, so a stale local auto-created `new`
card (with a newer `lastReview`) could beat a repaired, already-reviewed
server card during hydration.

✅ **Fixed (2026-08-13):** a reviewed card (`reps > 0`) now always beats a
`new` card on either side of the merge, regardless of timestamps. Mobile's
pull-merge bridge also merges cache rows into the existing store instead of
replacing the whole deck, so a stale cached "new" card can't suddenly displace
the current review card.

### Duplicate saved-word instances

The backend dedupe key included the save timestamp, so saving the same
sentence again (even on a different date) created a second instance, and
mobile rendered every instance on the card front. There is no UI to
deliberately add another instance yet.

✅ **Fixed (2026-08-13):** instance identity is now `form + context.text`
(timestamp excluded), `upsert_word` removes any pre-existing identical
instance before inserting, a one-time cleanup deletes existing duplicates,
and mobile renders only the latest context sentence.

### Web outbox audit follow-up (2026-08-17, ADR-0040)

A follow-up audit of the web pending-op queue found five defects, all fixed
in ADR-0040:

1. **In-flight flush dropped newly enqueued ops** — the flush snapshotted the
   queue and overwrote it with its `remaining` list, erasing ops enqueued
   while it ran. The deck auto-init loop (up to `dailyLimit` synchronous
   `updateCard` calls) lost every card after the first each session; rapid
   ratings and unsaves lost the same way. The queue now lives in
   `apps/web/src/lib/srs-pending-queue.ts` and re-reads/merges the queue
   after each flush pass (multi-pass, bounded), so no op is lost.
2. **A 403 cap rejection blocked the whole queue all day** — the failing op
   (and everything after it) was re-queued with 10s retries that the server
   keeps rejecting until the next local day. 403s are now detected on the
   normalized `ApiError.code` (the old `err.response.status` check never
   matched), the op is dropped (rating stays local-only, banner fires), and
   the rest of the queue keeps flushing.
3. **Undo did not propagate** — the restored card's older `lastReview` made
   the server's LWW guard reject the restore, so the undone rating
   re-applied on the next hydration. `PUT /srs/cards` now timestamps
   `voidRatingId` writes as fresh writes (`now_ms`), fixing web and mobile
   alike.
4. **Stale queued deletes could destroy newer ratings** — `DELETE
   /srs/cards/...` now accepts `?updatedAt=<client unsave time>` and the
   server drops the delete (no tombstone) when the row was written more
   recently.
5. **`removeCardFromStorage` left ghost cards in mounted hook stores** —
   unsave paths now dispatch `lp:srs-card-removed`; `useSrs` listens and
   drops the card, so the persist effect can't resurrect it.

## Stale Related Docs

- **SPEC-053 inventory staleness** — fixed (2026-08-11): the syncable-data
  table now says mobile SRS writes go through the durable outbox, and the
  deprecated `srs_settings` entity is noted.

## Dependencies

- `ts-fsrs` — the FSRS scheduler (MIT, actively maintained by the Open
  Spaced Repetition community; the same algorithm Anki uses today).
- `packages/utils/src/fsrs-scheduler.ts` — the `ts-fsrs` wrapper
  (`newCard`, `rate`, `isDue`, `planNewDeck`, migration, LWW merge).
- `packages/utils/src/srs-test-manager.ts` — the card-test cache +
  single-flight priority queue + auto-retry + diagnostics shared by both
  review pages (2026-08-25).
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

> **Correction (2026-08-13):** The Phase 0 new-deck decisions below were
> wrong and are superseded by the daily-quota definition in
> [New-deck budget](#new-deck-budget).

1. **Reconcile SPEC-023 Tier 4 with this spec.** Decisions (recorded in this
   spec, 2026-08-11):
   - All-done: keep "No more cards to review" + next review time, no stats.
     SPEC-023 R4 updated to match.
   - ~~"No more new cards today": the unrated pool is empty (every saved word
     rated at least once), shown in the all-done/no-due states. SPEC-023 R6
     updated to that definition. No `createdAt`-based counter — it contradicts
     `planNewDeck`'s rolling-deck semantics.~~
   - "No more new cards today": today's new-card budget is exhausted (or the
     unrated pool is empty), shown in the all-done/no-due states. SPEC-023 R6
     updated to this definition.
2. **Restore a local-day new-card budget.** ~~Decision: rewrite
   `remainingNewCardsToday()` to count the unrated pool (saved words with no
   card or a `state: new` card), used only for the "no more new cards"
   message.~~ Decision: `remainingNewCardsToday()` = `max(0, dailyNewLimit −
   cards introduced today − older unrated cards still in the blue deck)`, and
   `planNewDeck` must not create cards beyond today's budget.
3. **Backend free-cap counting contract (needed by Phase 5).** Decision:
   ratings are counted at a rating boundary with a client-generated rating id
   recorded in a per-user review log (replays/retries count once); undo writes
   a void/decrement event; the backend mirrors the clients' `isPro` logic
   (`user_subscriptions`; an active trial is Pro-equivalent); free = 20
   reviews per local day.
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
     semantics from reps-based to state-based; verify the daily-quota tests
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
     deck; no new cards are created once today's budget is exhausted).
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
   - ~~Header counts (blue/red/green) computed from the **whole language
     deck** (`store.cards[l2Code]` filtered to saved words), not the due-only
     `cards` array — otherwise learning/relearning cards waiting on
     `1m`/`10m` steps and future review cards disappear from the counts.~~
   - Header counts (blue/red/green) are Anki-style due-today counts
     (corrected 2026-08-13): blue = remaining new-card budget, red =
     learning/relearning cards due now, green = review cards due now
     (including overdue). Future-dated cards are not counted.
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
   rating id, with the local-day count for free users; void/decrement rows for
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
4. **Rewrite `remainingNewCardsToday()`/`countNewCardsToday()` as the local-day
   new-card budget**, and update `planNewDeck` + both review pages to stop
   refilling after the daily quota is exhausted.
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
