# ADR 0007: Dictionary Hub UX — Persistent Search Bar & Panel-Based Layout

> **Status:** Proposed
> **Date:** 2026-07-19
> **Replaces:** Current `apps/web/src/app/[l1]/[l2]/dictionary/page.tsx` (search page) and `apps/web/src/app/[l1]/[l2]/dictionary/entry/...` (entry detail) full-page navigation model
> **See also:**
> - `docs/adr/lp-nextjs-dictionary-architecture.md` — Backend lookup architecture
> - `docs/adr/lp-classic-dictionary-architecture.md` — Classic Nuxt reference

---

## Context

The current Next.js dictionary has three problems:

1. **Search bar is not persistent.** It disappears or changes position when navigating from the search page to an entry detail page (full route change via `router.push`).
2. **Full page navigations on every click.** Each result click triggers a Next.js route change, losing context, resetting scroll position, and requiring a re-render of the entire page tree.
3. **No unified flow.** The saved words page (`/saved-words`) is a completely separate route with its own layout and no bridge to the dictionary search — users can't easily go from "browse saved words" → "search for a new word" → "see detail" in one continuous experience.

The design principles are:

> - **Persistent search bar** — always there, never moves
> - **Flow:** search → results → details, or word list → details, or word list → results → details

---

## Decision

**Replace the separate search and entry-detail pages with a single Dictionary Hub page that manages all views via client-side state.** The page fills the viewport (no page-level scrolling), the search bar is always visible at the top, and below it are resizable panels for the main content and a collapsible sidebar.

### Key Architectural Choices

| Choice | Rationale |
|---|---|
| Single page, client-side view switching | Eliminates full route navigations; search bar never remounts |
| No page-level scroll (`overflow-hidden`, `h-[calc(100vh-var(--header-h))]`) | Panels scroll internally; the hub feels like an SPA within the Next.js shell |
| Search bar at layout level, never unmounts | Rendered once in the page component, always sticky |
| Detail opens in-place (no full nav) | Client-side state change updates the main panel only |
| Clean path-segment URLs (`/dictionary/entry/cedict/0`) | Uses Next.js layout persistence — layout stays mounted, page slot swaps without full refresh |
| Sidebar always present, collapsible | Consistent layout; sidebar shows saved words (default) or a specific word list context |
| Saved words page remains standalone | `/saved-words` is not part of the dictionary flow and keeps its own layout |

---

## Layout Architecture

### How Clean URLs Work Without Page Refresh

Next.js App Router keeps **layouts** mounted when navigating between sibling pages within the same layout segment. This is the foundation of the hub design:

```
/app/[l1]/[l2]/dictionary/
├── layout.tsx              ← SearchBar + Sidebar live HERE — never unmount
├── page.tsx                ← empty state / search results
└── entry/
    └── [dict]/
        └── [id]/
            └── page.tsx    ← entry detail (same layout wraps it)
```

When `router.push('/en/zh/dictionary/entry/cedict/0')` fires:
- `layout.tsx` stays mounted → **search bar survives, sidebar survives**
- Only the `page.tsx` slot swaps → `entry/[dict]/[id]/page.tsx` mounts
- Shared state (results list, query, scroll position) lives in a context provider in `layout.tsx`, so it survives page transitions within the dictionary section.

### Full-Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Page container: h-[calc(100vh-var(--header-h))]        │
│  flex flex-col overflow-hidden                           │
│ ┌── layout.tsx ────────────────────────────────────────┐│
│ │ ┌───────────────────────────────────────────────────┐││
│ │ │  SearchBar (flex-shrink-0, h-14, border-b)       │││
│ │ │  ┌─────────────────────────────────────────────┐  │││
│ │ │  │ 🔍 input ...                        [Go] [×]│  │││
│ │ │  └─────────────────────────────────────────────┘  │││
│ │ └───────────────────────────────────────────────────┘││
│ │ ┌──────────────────────┬────────────────────────────┐││
│ │ │  Main Panel          │  Sidebar Panel             │││
│ │ │  flex-1 min-w-0      │  w-56 flex-shrink-0        │││
│ │ │  overflow-y-auto     │  overflow-y-auto           │││
│ │ │  rounded-xl border   │  rounded-xl border         │││
│ │ │  border-border       │  border-border             │││
│ │ │  bg-card             │  bg-card                   │││
│ │ │                      │  (collapsible → w-0        │││
│ │ │                      │   overflow-hidden)         │││
│ │ │  {children} ← page   │                            │││
│ │ │  slot swaps here     │                            │││
│ │ └──────────────────────┴────────────────────────────┘││
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

Both panels use the same visual treatment as the Reader page panels (`rounded-xl border border-border bg-card`), establishing a consistent "panel" metaphor across the app.

### Component Tree

```
DictionaryLayout (layout.tsx)               ← client component, persists
├── <DictionaryProvider>                    ← context for shared state
│   │
├── PersistentSearchBar                    ← lives in layout, never unmounts
│   ├── Input (always has [×] clear button)
│   │   └── Shows head word when detail view is active
│   │   └── Clearing the input returns to empty state (recent searches)
│   ├── Submit / Search button
│   └── Back button (only when detail was reached via search results)
│
├── PanelArea (flex-1, flex, overflow-hidden)
│   ├── MainPanel (flex-1, min-w-0)
│   │   └── {children}                     ← page.tsx OR entry/.../page.tsx
│   │       │
│   │       ├── page.tsx (index route)
│   │       │   ├── EmptyState             ← view === 'empty'
│   │       │   │   ├── RecentSearches
│   │       │   │   └── DictionaryInfo
│   │       │   │
│   │       │   └── ResultsList            ← view === 'results'
│   │       │       ├── ResultsHeader (count, term)
│   │       │       └── ResultCard[] (compact variant)
│   │       │
│   │       └── entry/[dict]/[id]/page.tsx
│   │           ├── DefinitionsPanel       ← left column (wide) or top (narrow)
│   │           │   ├── Head, pronunciation, POS, levels
│   │           │   ├── Definitions list
│   │           │   ├── Source line
│   │           │   └── Save / Speak buttons
│   │           │
│   │           └── TabsPanel              ← right column (wide) or bottom (narrow)
│   │               ├── Tab: Dictionary
│   │               ├── Tab: Examples from Videos (SubsSearchResults)
│   │               ├── Tab: Conjugations (InflectionTable)
│   │               └── Tab: Let DeepSeek Explain (AiExplanation)
│   │
│   └── SidebarPanel (w-56, collapsible)   ← lives in layout, never unmounts
│       └── WordListSidebar
│           └── WordListItem[] (click → detail via router.push)

---

## Search Bar Behavior

The search bar always reflects what's on screen:

| View | Search bar shows |
|---|---|
| Empty state (recent searches) | Placeholder text, empty input |
| Search results | The queried term (e.g., "manger") |
| Entry detail | The entry's head word (e.g., "manger") |

The search bar **always** has a clear [×] button. Clicking it clears the input and resets the view to the empty state (recent searches), regardless of what was showing before.

## State Machine

```typescript
type DictionaryView =
  | { kind: 'empty' }
  | { kind: 'results'; query: string }
  | { kind: 'detail'; entryId: string; cameFromSearch: boolean; previousView: DictionaryView }
```

### View Transitions

```
           ┌──────────┐
           │  EMPTY   │  ← recent searches, tips
           └────┬─────┘
                │ submit search
                ▼
           ┌──────────┐
           │ RESULTS  │  ← search results in main panel
           └────┬─────┘
                │ click result (or sidebar word)
                ▼
           ┌──────────┐
           │ DETAIL   │  ← definitions + tabs in main panel
           └────┬─────┘
                │ back button
                ▼
           previousView  ← returns to RESULTS or EMPTY
```

### URL Scheme

Navigation uses Next.js `router.push` with clean path-segment URLs. The layout stays mounted, so only the page slot swaps — no full page refresh:

| View | URL | Page slot |
|---|---|---|
| Empty | `/en/zh/dictionary` | `page.tsx` (empty state) |
| Results | `/en/zh/dictionary?q=manger` | `page.tsx` (results list) |
| Detail | `/en/zh/dictionary/entry/cedict/0` | `entry/[dict]/[id]/page.tsx` |

- Results and empty state share `page.tsx` — they are client-side view states within the same page, toggled by the search bar interaction. The `?q=` param is read on mount to restore the results view.
- Detail is a separate page route under `entry/` — Next.js swaps the page slot without unmounting the layout.
- Shared state (query, results, search history) lives in a `<DictionaryProvider>` context at the layout level, so the detail page can read the results that led to it (for the sidebar) and the results page can restore its state when navigating back.

---

## Screen Designs

### Screen 1: Empty State

Sidebar shows saved words (default). Main area shows recent searches and dictionary info.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ 🔍 Search the French dictionary...                  [Go] │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║ ┌─────────────────────────────┬────────────────────────────┐ ║
║ │                             │  ┌─ Saved Words ─── [✕] ─┐ │ ║
║ │  Recent Searches   [Clear]  │  │  📖 bonjour    hello   │ │ ║
║ │  🕐 manger                  │  │  📖 être       to be   │ │ ║
║ │  🕐 être                    │  │  📖 avoir      to have │ │ ║
║ │  🕐 bonjour                 │  │  ...                   │ │ ║
║ │  📖 142,000 words           │  └────────────────────────┘ │ ║
║ │  💡 wildcard tips           │                              │ ║
║ └─────────────────────────────┴────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════╝
```

### Screen 2: Search Results

Sidebar remains saved words (results are NOT duplicated in the sidebar). Main area shows compact result cards. Clicking a card opens detail in-place. Clicking a word in the sidebar also opens its detail in-place.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ 🔍 manger                                           [×] │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║ ┌─────────────────────────────┬────────────────────────────┐ ║
║ │  5 results for "manger"     │  ┌─ Saved Words ─── [✕] ─┐ │ ║
║ │                             │  │  📖 bonjour    hello   │ │ ║
║ │  ┌───────────────────────┐  │  │  📖 être       to be   │ │ ║
║ │  │ manger    verb A1  ▶ │  │  │  ...                   │ │ ║
║ │  │ /mɑ̃.ʒe/  to eat       │  │  └────────────────────────┘ │ ║
║ │  │ 📖 Le Robert          │  │                              │ ║
║ │  └───────────────────────┘  │                              │ ║
║ │  ┌───────────────────────┐  │                              │ ║
║ │  │ mangeaille  noun   ▶ │  │                              │ ║
║ │  │ food (colloquial)     │  │                              │ ║
║ │  └───────────────────────┘  │                              │ ║
║ │  ┌───────────────────────┐  │                              │ ║
║ │  │ mangeoire   noun   ▶ │  │                              │ ║
║ │  │ trough, manger        │  │                              │ ║
║ │  └───────────────────────┘  │                              │ ║
║ └─────────────────────────────┴────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════╝
```

### Screen 3A: Entry Detail — Wide Layout (≥ `lg` breakpoint), reached from search

Definitions panel and Tabs panel side-by-side at the same visual level. NOT tabs nested inside definitions. Back button says "← All Results" because the user came through search results. Search bar shows the head word "manger". Sidebar shows the search results that led here.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ ← All Results   🔍 manger                           [×] │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║ ┌──────────────────┬───────────────────┬──────────────────────┐ ║
║ │ Definitions      │ Tabs              │  ┌─ 5 results ─────┐ │ ║
║ │ Panel            │ Panel             │  │                  │ │ ║
║ │ ┌──────────────┐ │ ┌───────────────┐ │  │ 📖 manger     ◀ │ │ ║
║ │ │ manger       │ │ │ [Dict│Examples│ │  │    /mɑ̃.ʒe/       │ │ ║
║ │ │ /mɑ̃.ʒe/      │ │ │  Conj│DeepSeek]│ │  │    to eat        │ │ ║
║ │ │ verb · A1    │ │ ├───────────────┤ │  │                  │ │ ║
║ │ │              │ │ │               │ │  │ 📖 mangeaille    │ │ ║
║ │ │ 1. to eat    │ │ │ YouTube Player│ │  │    food           │ │ ║
║ │ │ 2. to consume│ │ │ + Subs Display│ │  │                  │ │ ║
║ │ │              │ │ │               │ │  │ 📖 mangeoire     │ │ ║
║ │ │ 📖 Le Robert │ │ │ (scrollable)  │ │  │    trough         │ │ ║
║ │ │ ⭐ Save 🔊   │ │ │               │ │  └──────────────────┘ │ ║
║ │ └──────────────┘ │ └───────────────┘ │                      │ ║
║ └──────────────────┴───────────────────┴──────────────────────┘ ║
╚══════════════════════════════════════════════════════════════╝
```

### Screen 3B: Entry Detail — Narrow Layout (< `lg` breakpoint), reached from search

Definitions panel on top, Tabs panel below (stacked vertically). Sidebar hidden or accessible via drawer. Both scroll within the main panel. Back button shown (came via search results), search bar shows head word.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ ← All Results   🔍 manger                           [×] │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │  Definitions Panel                                       │ ║
║ │  ┌────────────────────────────────────────────────────┐  │ ║
║ │  │ manger  /mɑ̃.ʒe/  verb · A1                         │  │ ║
║ │  │ 1. to eat    2. to consume                         │  │ ║
║ │  │ 📖 Le Robert    ⭐ Save   🔊 Pronounce              │  │ ║
║ │  └────────────────────────────────────────────────────┘  │ ║
║ │                                                          │ ║
║ │  Tabs Panel                                              │ ║
║ │  ┌────────────────────────────────────────────────────┐  │ ║
║ │  │ [Examples from Videos | Conjugations | DeepSeek]   │  │ ║
║ │  │                                                    │  │ ║
║ │  │ [active tab content — scrollable within panel]     │  │ ║
║ │  └────────────────────────────────────────────────────┘  │ ║
║ └──────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Sidebar Rules

The sidebar is always present (collapsible). Its content depends on context:

| Context | Sidebar Content |
|---|---|
| Empty state | **Saved words** (mini list, current L2) |
| Search results screen (Screen 2) | **Saved words** — results are already in the main panel; showing them in both places is redundant |
| Entry detail, reached from search results | **Dictionary search results** — the results that led to this entry, so the user can click another result without going back |
| Entry detail, reached from a specific word list | That word list (stored via `setWordListNav`) |
| Entry detail, reached from saved words sidebar | **Saved words** |

---

## Back Button Logic

The back button appears **only** if the user reached the entry detail through dictionary search results at any point in their navigation path. For example:

```
page 1 (recent searches) → page 2 (search results) → page 3 (entry detail)  ✅ back button shown
page 1 (saved words) → page 2 (entry detail)                                  ❌ no back button
page 1 (search results) → page 2 (entry A) → page 3 (entry B)                 ✅ back button shown
```

When shown, the back button:
- Appears at the left side of the search bar area
- Is labeled **"← All Results"**
- Returns the main panel to the most recent search results view
- The sidebar content is unchanged. No full page navigation occurs.

When NOT shown, the browser's native back button handles navigation.

| Detail was reached via... | Back button? | Label |
|---|---|---|
| Search results (anywhere in path) | ✅ Yes | `← All Results` |
| Saved words sidebar only (no search) | ❌ No | — |
| Named word list only (no search) | ❌ No | — |
| Direct link / bookmark | ❌ No | — |

---

## Tabs Panel Detail

The tabs in the detail view use the existing `TabbedPanel` component. Tabs are at the same visual level as the definitions — they are NOT nested inside the definitions panel. Both are sibling "panels" with the same card styling.

| Tab Key | Label Key | Component |
|---|---|---|
| `word` | `title.dictionary` | Definitions + metadata inline (no separate tab content — the definitions panel handles this) |
| `examples` | `title.examples_from_videos` | `<SubsSearchResults>` (embedded YouTube player + subtitle display) |
| `inflections` | `title.conjugations` | `<InflectionTable>` |
| `deepseek` | `action.let_ai_explain` | `<AiExplanation>` |

The `word` tab is essentially the definitions panel content repeated — this tab exists for consistency with the existing `DictionaryEntryCard` component's tab structure. When space allows (wide layout), the definitions panel is always visible alongside the tabs, and the active tab's content renders in the tabs panel. In narrow layout, the definitions panel is above, and the tab bar + active tab content appears below it.

---

## Translation Keys

**No new translation keys are introduced.** All UI text uses existing keys:

| UI Element | Key |
|---|---|
| Page title | `title.dictionary` |
| Search placeholder | `placeholder.dictionary_search` |
| Search button | `action.search` |
| Recent searches heading | `title.recent_searches` |
| Clear recent | `action.clear_recent_searches` |
| Saved words heading | `title.saved_words` |
| Back button ("All Results") | `action.back_to_results` (new key needed) |
| Result count | `msg.result_count` |
| "for {term}" | `msg.for_term` |
| Tab: Dictionary | `title.dictionary` |
| Tab: Examples from Videos | `title.examples_from_videos` |
| Tab: Conjugations | `title.conjugations` |
| Tab: DeepSeek | `action.let_ai_explain` |
| Empty state prompt | `msg.dictionary_empty_state` |
| Description | `msg.lookup_words_desc` |
| Loading | `msg.loading` |
| No results | `msg.no_results` |
| No dictionary entry | `msg.no_dictionary_entry` + `error.entry_not_found` |
| Save word | `action.save_word` |
| Search images | `action.search_images` |
| AI generated label | `label.ai_generated` |
| DeepSeek says | `label.ai_says` |
| Conjugation label | `label.conjugation` |

---

## Out of Scope

- **Saved Words page** (`/saved-words`) — remains a standalone page with its own layout. Not part of the dictionary hub.
- **SRS dots in word lists** — deferred for future implementation.
- **Popup dictionary** (`DictionaryPopup`) — unchanged; continues to work independently of the hub.


---

## Consequences

### Positive
- **Zero page refreshes** during dictionary usage — the search bar never unmounts, panel transitions are instant.
- **Unified sidebar** — saved words are always one click away, regardless of what the main panel shows.
- **Consistent panel styling** — matches the Reader page's visual language (`rounded-xl border border-border bg-card`).
- **Deep-linkable** — every view has a stable URL via search params.
- **No new translation keys** — reuses all existing i18n infrastructure.

### Negative
- **Increased client-side complexity** — the hub page manages three view states plus sidebar logic in a single component. This should be mitigated by extracting view-specific logic into sub-components.
- **Scroll restoration** — since the page itself doesn't scroll, each panel must manage its own scroll position. When switching views (e.g., results → detail → results), the results panel's scroll position should be restored. This requires a `useRef` or state-based scroll tracking.
- **Entry detail page is refactored** — the existing `/dictionary/entry/[dict]/[id]/page.tsx` is rewritten to use the layout's shared context rather than fetching independently. The route path itself does not change.

### Migration Path
1. Create `apps/web/src/app/[l1]/[l2]/dictionary/layout.tsx` with the persistent search bar, sidebar, and `<DictionaryProvider>` context.
2. Refactor `page.tsx` (search/empty/results) to use the shared context from layout.
3. Refactor `entry/[dict]/[id]/page.tsx` (detail) to use the shared context from layout (reads results for sidebar, reads query for search bar).
4. Remove the `word-list-navigation.ts` sessionStorage pattern — sidebar state is now managed by the layout's React state.
5. Keep `/dictionary/word/[word]/page.tsx` as-is (already redirects to `?q=`).
6. Keep `/saved-words/page.tsx` unchanged.
