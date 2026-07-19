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
| URL reflects state via search params (`?q=`, `?entry=`, `?view=`) | Deep-linkable; refresh restores state |
| Sidebar always present, collapsible | Consistent layout; sidebar shows saved words (default) or a specific word list context |
| Saved words page remains standalone | `/saved-words` is not part of the dictionary flow and keeps its own layout |

---

## Layout Architecture

### Full-Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Page container: h-[calc(100vh-var(--header-h))]        │
│  flex flex-col overflow-hidden                           │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  SearchBar (flex-shrink-0, h-14, border-b)         ││
│  │  ┌───────────────────────────────────────────────┐  ││
│  │  │ 🔍 input ...                          [Go] [×]│  ││
│  │  └───────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────┘│
│  ┌──────────────────────┬──────────────────────────────┐│
│  │  Main Panel          │  Sidebar Panel               ││
│  │  flex-1 min-w-0      │  w-56 flex-shrink-0          ││
│  │  overflow-y-auto     │  overflow-y-auto             ││
│  │  rounded-xl border   │  rounded-xl border           ││
│  │  border-border       │  border-border               ││
│  │  bg-card             │  bg-card                     ││
│  │                      │  (collapsible → w-0          ││
│  │                      │   overflow-hidden)           ││
│  └──────────────────────┴──────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

Both panels use the same visual treatment as the Reader page panels (`rounded-xl border border-border bg-card`), establishing a consistent "panel" metaphor across the app.

### Component Tree

```
DictionaryHub (page.tsx)                   ← single page, client component
├── PersistentSearchBar                    ← always rendered, never unmounts
│   ├── Input (with clear button when query present)
│   ├── Submit button
│   └── Back button (when detail view active)
│
├── PanelArea (flex-1, flex, overflow-hidden)
│   ├── MainPanel (flex-1, min-w-0)
│   │   ├── EmptyState                     ← view === 'empty'
│   │   │   ├── RecentSearches
│   │   │   └── DictionaryInfo
│   │   │
│   │   ├── ResultsList                    ← view === 'results'
│   │   │   ├── ResultsHeader (count, term)
│   │   │   └── ResultCard[] (compact variant)
│   │   │
│   │   └── DetailView                     ← view === 'detail'
│   │       ├── DefinitionsPanel           ← left column (wide) or top (narrow)
│   │       │   ├── Head, pronunciation, POS, levels
│   │       │   ├── Definitions list
│   │       │   ├── Source line
│   │       │   └── Save / Speak buttons
│   │       │
│   │       └── TabsPanel                  ← right column (wide) or bottom (narrow)
│   │           ├── Tab: Dictionary
│   │           ├── Tab: Examples from Videos (SubsSearchResults)
│   │           ├── Tab: Conjugations (InflectionTable)
│   │           └── Tab: Let DeepSeek Explain (AiExplanation)
│   │
│   └── SidebarPanel (w-56, collapsible)
│       └── WordListSidebar                ← saved words (default) or context list
│           └── WordListItem[] (click → detail in-place)
```

---

## State Machine

```typescript
type DictionaryView =
  | { kind: 'empty' }
  | { kind: 'results'; query: string }
  | { kind: 'detail'; entryId: string; previousView: DictionaryView; sourceLabel: string }
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

### URL Synchronization

All views update the URL via `router.replace` (no history push for panel changes):

| View | URL |
|---|---|
| Empty | `/[l1]/[l2]/dictionary` |
| Results | `/[l1]/[l2]/dictionary?q=manger` |
| Detail | `/[l1]/[l2]/dictionary?entry=cedict-123` |

On page load, the URL params are read to restore the correct view. The legacy `/dictionary/entry/[dict]/[id]` route redirects to `?entry=`.

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

### Screen 3A: Entry Detail — Wide Layout (≥ `lg` breakpoint)

Definitions panel and Tabs panel side-by-side at the same visual level. NOT tabs nested inside definitions. Back button shows destination label.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ ← Dictionary   🔍 Search dictionary...              [Go] │ ║
║ └──────────────────────────────────────────────────────────┘ ║
║ ┌──────────────────┬───────────────────┬──────────────────┐ ║
║ │ Definitions      │ Tabs              │  ┌─ Saved Words ┐│ ║
║ │ Panel            │ Panel             │  │  📖 bonjour   ││ ║
║ │ ┌──────────────┐ │ ┌───────────────┐ │  │  📖 être      ││ ║
║ │ │ manger       │ │ │ [Dict│Examples│ │  │  ...          ││ ║
║ │ │ /mɑ̃.ʒe/      │ │ │  Conj│DeepSeek]│ │  └──────────────┘│ ║
║ │ │ verb · A1    │ │ ├───────────────┤ │                    │ ║
║ │ │              │ │ │               │ │                    │ ║
║ │ │ 1. to eat    │ │ │ YouTube Player│ │                    │ ║
║ │ │ 2. to consume│ │ │ + Subs Display│ │                    │ ║
║ │ │              │ │ │               │ │                    │ ║
║ │ │ 📖 Le Robert │ │ │ (scrollable)  │ │                    │ ║
║ │ │ ⭐ Save 🔊   │ │ │               │ │                    │ ║
║ │ └──────────────┘ │ └───────────────┘ │                    │ ║
║ └──────────────────┴───────────────────┴──────────────────┘ ║
╚══════════════════════════════════════════════════════════════╝
```

### Screen 3B: Entry Detail — Narrow Layout (< `lg` breakpoint)

Definitions panel on top, Tabs panel below (stacked vertically). Sidebar hidden or accessible via drawer. Both scroll within the main panel.

```
╔══════════════════════════════════════════════════════════════╗
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ ← Dictionary  🔍 Search...                          [Go] │ ║
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
| Default / empty state / search results | **Saved words** (mini list, current L2) |
| User came from a specific word list | That word list (stored via `setWordListNav`) |
| Entry detail | Whatever the user was viewing before entering detail |

**Search results are NEVER shown in the sidebar.** They appear only in the main panel. Showing them in both places is redundant.

---

## Back Button Logic

The back button appears only in the detail view, at the left side of the search bar area. Its label reflects the destination:

| Detail was reached from... | Back button label | Key used |
|---|---|---|
| Search results | `← Dictionary` | `title.dictionary` |
| Saved words sidebar | `← Saved Words` | `title.saved_words` |
| Named word list | `← {List Name}` | List's title |

The back button restores the `previousView` — the main panel returns to whatever was shown before detail (results or empty state), and the sidebar content is unchanged. No full page navigation occurs.

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
| Back button | `action.back` (combined with context label) |
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
- **Word list → search → detail flow** — The hub supports this conceptually (sidebar shows the word list, user types in search bar, results appear in main panel), but the initial implementation focuses on the empty → results → detail and sidebar-word → detail flows.

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
- **Entry detail route URLs change** — existing `/dictionary/entry/[dict]/[id]` routes become redirects to `?entry=`. Bookmarks and shared links must be handled via redirect logic in the legacy entry page.

### Migration Path
1. Build the hub page in `apps/web/src/app/[l1]/[l2]/dictionary/page.tsx` (replacing current search page).
2. Keep `/dictionary/entry/[dict]/[id]/page.tsx` as a redirect to `?entry=`.
3. Keep `/dictionary/word/[word]/page.tsx` as-is (already redirects to `?q=`).
4. Keep `/saved-words/page.tsx` unchanged.
5. Remove the `word-list-navigation.ts` sessionStorage pattern — sidebar state is now managed by the hub's React state.
