# Feature Specification: Subs Search Forms Filter

## Metadata
- **Spec ID**: SPEC-109
- **Feature**: Subs search forms filter — All forms / lemma pills + multi-select dialog
- **Status**: complete
- **Created**: 2026-11-08
- **ROADMAP Phase**: Media — Subtitle Search

## Overview
The subs-search quick filter bar (above the result list, on the dictionary entry's
Examples tab) has a forms filter. It shows **All forms** first, then the
dictionary lemma itself, then a **…** button. The button opens a multi-select
dialog — styled like the advanced search's category checklist — offering
**All forms**, **Lemma**, **Kana** (Japanese only), and **Conjugations**. The
selection decides which surface forms are sent as `terms` to `/subs-search`, so
a learner can search only a dictionary form, only its kana spelling, only its
conjugated forms, or any combination.

The filter replaces the old two-way "lemma / All forms" toggle, whose order and
binary model could not express partial form sets.

## User Stories
- As a learner, I want "All forms" first in the bar so the default choice is the
  leftmost, easiest target.
- As a learner, I want to search only the dictionary lemma so results aren't
  polluted by unrelated inflected forms.
- As a Japanese learner, I want to search only the kana reading of the head so
  kana-only subtitle lines are found.
- As a learner, I want to search only conjugated forms (without the lemma) so I
  see the word in actual use.

## How It Works in Classic (Nuxt)
Classic has no forms filter and no equivalent dialog; its subs search takes a
single term (`components/SearchSubsComp.vue`). The two-way exact-match toggle
was introduced in the Next.js rebuild.

## How It Works in GO (React Native)
Not applicable (legacy). The fresh mobile app ports the same forms filter in
`apps/mobile/components/video/SubsSearchResults.tsx`.

## Implementation Plan

### Route
No route changes. The filter lives inside `SubsSearchResults`, embedded in the
dictionary entry tabs (`apps/web/src/components/dictionary-entry-tabs.tsx`,
`apps/mobile/components/dictionary/DictionaryEntryTabs.tsx`).

### Data Flow
1. The entry's forms are built once per word by `useInflectedSearchTerms`
   (`apps/web/src/hooks/use-inflected-search-terms.ts`,
   `apps/mobile/hooks/use-inflected-search-terms.ts`): head + written variants
   (alternate script, Japanese kana, Chinese scripts), plus conjugated forms
   from the Python `/inflect-*` endpoints.
2. The hook exposes the form groups the dialog needs: `headTerm`, `kanaTerm`
   (Japanese only, null when absent or identical to the head), and
   `inflectedTerms` (conjugations + corpus-discovered surface forms). `allTerms`
   stays the fully pruned list used for "All forms" and highlighting.
3. Selecting forms runs `buildFormSearchTerms(allTerms, groups, selected)`
   (`packages/utils/src/search-terms.ts`): an empty selection returns
   `allTerms`; otherwise the union of the chosen groups is pruned with the same
   substring rules as `reduceSearchTerms`, and the head is only forced in when
   the learner selected it.
4. The component joins the result with commas into the existing
   `terms=` query parameter of `GET /subs-search`. Selecting a subset of the
   last fetched term set is served from a local cache (no request); a wider
   selection re-queries.

### Selection Semantics
Category-list semantics (matching `label.all_categories` behavior):

- An **empty selection means All forms**, and the "All forms" checkbox shows
  checked.
- Checking a group unchecks "All forms". Unchecking the last group restores it.
- Checking **every available group** normalizes back to All forms, so the
  summary never says "all" while the data says otherwise.
- The dialog edits a **draft**: checkboxes only change the draft. **Apply**
  commits the draft and closes; **Reset** restores All forms immediately; closing
  without Apply discards the draft.
- Changing to a different word resets the selection to All forms.

### Components
- `apps/web/src/components/video/subs-search-results.tsx` — `selectedForms`
  state, `formsFilterGroup` (All forms / lemma / **…**), `formsDialog`
  (checkbox list with per-group term counts, Reset/Apply), subset cache.
- `apps/mobile/components/video/SubsSearchResults.tsx` — the same filter and
  dialog using the native sheet dialog.
- `apps/web/src/hooks/use-inflected-search-terms.ts` — exposes `kanaTerm`,
  `inflectedTerms`; imports the shared inflection-endpoint map.
- `apps/mobile/hooks/use-inflected-search-terms.ts` — now fetches conjugations
  (previously written forms only), matching web.
- `packages/utils/src/search-terms.ts` — `INFLECTION_ENDPOINTS`,
  `inflectionEndpoint`, `entryKanaForm`, `SearchFormGroup(s)`,
  `buildFormSearchTerms`; covered by `search-terms.test.ts`.

### API Endpoints
- No new endpoints. Reuses `GET /subs-search?terms=…&l2=…` with the selected
  forms as the comma-separated `terms` value, and the existing `/inflect-*`
  endpoints to build the conjugations group.

### States
- **Loading**: the forms group is hidden until the form list resolves
  (`formsLoading` or fewer than two forms); the content pills stay usable.
- **Empty**: the nav bar (forms group + content pills) stays visible so the
  learner can widen the selection.
- **Error**: unchanged (error text only).
- **Edge cases**: a selected group with no terms (e.g. conjugations before they
  load) falls back to the head so the request never stalls; only Japanese shows
  the Kana row, and only when the kana differs from the head; the Conjugations
  row appears only when the language has conjugated forms; the **…** button is
  highlighted whenever a custom (non-all, non-lemma) selection is active.

## Internationalization
- New key: `label.forms_to_include` ("Forms to include") — dialog title and the
  **…** button's accessible name.
- Reused keys: `msg.all_forms` ("All forms"), `label.lemma` ("Lemma"),
  `word.kana` ("Kana"), `title.conjugations` ("Conjugations"). No new strings
  for the pill labels, so the quick bar and dialog share one source.

## Testing
- Unit: `packages/utils/src/search-terms.test.ts` covers `entryKanaForm`,
  `inflectionEndpoint`, and `buildFormSearchTerms` (all/lemma/kana/conjugated,
  pruning, empty-group fallback).
- Manual web: open a Japanese entry → toggle lemma → open **…** and select Kana
  only → Apply; results only match kana lines; Reset restores All forms.
- Manual mobile: same flow in the sheet dialog; confirm conjugations appear for
  inflectable languages (e.g. English, Japanese) and that the row is absent for
  Chinese.

## Open Questions
- None.
