# ADR-0042 — Settings is a modal, routes are deep-link targets

**Status:** Accepted (2026-09-09)
**Supersedes:** ADR-0015 Decision 1 (Layout Pattern — List → Detail), for the
*container* only; Decision 2 (search keys) is unchanged and still governs.
**See also:**
- [ADR-0015: Settings UI and Search](../adr/0015-settings-ui-and-search.md) — list→detail + `SETTINGS_SEARCH_KEYS`
- [ADR-0003: No Shared UI](../adr/0003-no-shared-ui.md) — one implementation per platform
- [SPEC-052: Mobile large-screen / iPad layout parity](../specs/052-mobile-large-screen-ipad-layout-parity-with-web.md) — breakpoints + bottom-sheet policy
- [SPEC-073: About page contact](../specs/073-about-page-contact.md) — the "modal UI, route as URL target" precedent
- [SPEC-086: Chrome extension side panel redesign](../specs/086-chrome-extension-side-panel-redesign.md) §4 — the same two-panel settings modal
- [ARCH-011: Settings architecture](../arch/011-settings-architecture.md) — storage/sync (unchanged)

---

## Context

ADR-0015 put settings on **routes**: `/[l1]/[l2]/settings` was the list,
`/[l1]/[l2]/settings/<category>` a detail page, and wide screens rendered the
list as a persistent sidebar via `settings/layout.tsx`. Mobile mirrored it with
expo-router screens plus a `>=1024` split view (SPEC-015, SPEC-052).

That container has three problems in practice:

1. **It leaves the page.** Opening settings from the user menu (web) or the Me
   tab (mobile) navigates away from whatever the learner was doing — a video, a
   reader page, a review session. Every settings visit is a context switch and a
   back-navigation.
2. **The wide layout is a page layout, not a surface.** On web the sidebar only
   existed because the route tree rendered it; the detail pages carried their
   own `max-w-lg py-12` page chrome and an `h1`, which is wrong inside any
   surface that is not a page.
3. **The shapes we actually want are already the house patterns elsewhere.**
   The popup dictionary is a small dialog, the subs-search playback modal is a
   large one, mobile bottom sheets are the narrow-screen convention, and the
   Chrome extension already ships settings as a two-panel list→detail modal
   (SPEC-086 §4).

## Decision

**Settings is a modal on both platforms. The routes stay, but only as deep-link
URL targets.**

### Container

| | Narrow (< 768) | Wide (≥ 768) |
|---|---|---|
| **Web** | small centered dialog, popup-dictionary scale (`w-[28rem] max-w-[90vw]`, `max-h-[85vh]`) | large modal like the subs-search playback modal (`md:max-w-5xl`, `h-[85vh]`), `grid-cols-[280px_1fr]` |
| **Mobile** | `Dialog.SheetContent` bottom sheet, like the popup dictionary | large centered `Dialog.Content` (`max-w-5xl`, 85% height), sidebar + detail |

- **768 px (`md`)** is the small/large boundary on both platforms — the same
  boundary as SPEC-052's bottom-sheet policy (sheets < `md`, centered dialogs
  ≥ `md`). ADR-0015's `768` web / `600pt` mobile split values are retired;
  SPEC-052's `≥1024` settings split value is retired too.
- **Narrow screens drill down inside the modal**: list → detail with a back
  control, exactly like the popup dictionary's single-surface flow.
- **Wide screens show the list as a sidebar** (search bar + grouped rows) with
  the selected category's detail on the right. The category list is the same
  component in both shapes.

### Routes are deep-link targets

`/[l1]/[l2]/settings` and `/[l1]/[l2]/settings/<category>` (web) and
`/settings`, `/settings/<category>` (mobile) render **the modal**, not a page:

- the route mounts the dialog open on its category (web: `settings-route.tsx`;
  mobile: `SettingsRoute` + `SettingsDialogProvider` in the root layout),
- closing the modal leaves the route (web replaces to Explore, mirroring
  SPEC-073's About dialog; mobile `router.back()` when it can, else the Me tab),
- opening settings from the user menu / Me tab / sync badge happens **in place**
  with no navigation at all.

This keeps every documented URL working: `/en/ja/settings/display` bookmarks,
`languageplayer://settings/display` universal links (SPEC-048, SPEC-069) and the
Classic redirect adapter.

### Unchanged

- `SETTINGS_SEARCH_KEYS` in `packages/shared/` and the three-tier match
  (title → subtitle → control labels), pre-resolved per locale (ADR-0015
  Decision 2).
- Settings state access: `useSettingsContext()` / `useSettings()` — no prop
  drilling; persistence, cloud sync, and the anti-reset guards (ARCH-011).
- One implementation per platform (ADR-0003): the dialog, list, and detail
  components are separate web and mobile files sharing only logic.

### File layout (as built)

```
apps/web/src/components/settings/
├── settings-dialog.tsx       ← modal (small dialog / large sidebar modal)
├── settings-list.tsx         ← search + grouped rows (list view & sidebar)
├── settings-detail.tsx       ← category → detail component
├── settings-route.tsx        ← deep-link trigger (renders the dialog)
├── settings-categories.ts    ← category keys + title keys
├── DisplaySettings.tsx …     ← per-category content (moved out of route pages)
└── SearchBar/SectionHeader/SegmentedRow/SliderRow/ToggleRow.tsx  ← row primitives

apps/web/src/app/[l1]/[l2]/settings/
├── layout.tsx                ← metadata only
├── page.tsx                  ← <SettingsRoute />
└── <category>/page.tsx       ← <SettingsRoute category="…" />

apps/mobile/components/settings/
├── SettingsDialog.tsx        ← modal (bottom sheet / large dialog)
├── SettingsList.tsx          ← list view & sidebar
├── SettingsDetail.tsx        ← category → detail component
├── SettingsRoute.tsx         ← deep-link trigger
├── settings-categories.ts
└── DisplaySettings.tsx …     ← per-category content (moved out of route files)

apps/mobile/contexts/SettingsDialogContext.tsx  ← app-wide host + openSettings()
apps/mobile/app/(tabs)/(me)/settings/*.tsx      ← <SettingsRoute … /> wrappers
```

## Consequences

### Positive

- Settings no longer costs the learner their place: it opens over the current
  screen and closes back into it.
- One container per platform, two shapes each, both already-proven patterns
  (popup dictionary, subs-search modal, bottom sheet).
- Detail components lost their page chrome (`max-w-lg py-12` + `h1`), so they
  render identically in a modal on both platforms — web finally mirrors
  mobile's "component, not page" detail screens.
- Deep links, bookmarks, and the redirect adapter keep working.

### Negative

- The modal is a client-only surface: the settings UI now renders after a
  width probe (`matchMedia`), so a deep-linked settings URL paints an empty
  route for one frame before the dialog appears.
- Web lost the persistent wide-screen page sidebar as a URL-addressable pane —
  switching categories no longer changes the URL (the route still selects the
  initial category).
- Category selection is modal state, so a page refresh returns to the
  deep-linked category rather than the last-viewed one.

### Neutral

- `SettingsDialog` is mounted per entry point (web user menu + each route page;
  mobile once at the root). Radix / `@rn-primitives` render nothing while
  closed, so the extra mount points are inert.
- Mobile's "Settings saved" pill moved from `settings/_layout.tsx` into the
  dialog, where the settings that trigger it are visible.
