# SPEC-030: Radix UI Migration — Web Primitives & Sidebar Consistency

## Metadata

- **Spec ID**: SPEC-030
- **Feature**: Migrate `apps/web` interaction primitives from `@base-ui/react` to `@radix-ui/react`, and consolidate the four hand-rolled sidebars onto one shared primitive
- **Status**: draft
- **Created**: 2026-08-01
- **ROADMAP Phase**: Phase 4 — Dictionary (pilot); cross-cutting for the full migration
- **See also**:
  - [SPEC-016: Interaction Primitives — Headless UI Migration](016-interaction-primitives-migration.md) — the original headless-UI migration; the web portion of this spec is **superseded** by SPEC-030
  - [ADR-0014: Use @rn-primitives for Mobile Interaction Primitives](../adr/0014-rn-primitives-interaction-primitives.md)
  - [ADR-0011: Shared Design Tokens](../adr/0011-shared-design-tokens.md)
  - [ADR-0003: No shared UI between web and mobile](../adr/0003-no-shared-ui.md)
  - Commit `b88fb45b` — dictionary sidebar rebuilt on Radix Dialog (pilot for this spec)

---

## Overview

The web app's interaction primitives sit on `@base-ui/react` (7 wrappers in `apps/web/src/components/ui/`), while the mobile app already uses `@rn-primitives` — the React Native port of the **Radix** component API — in a mirrored `components/ui/` folder. That means the two platforms speak different headless-UI dialects for the same components, which makes the port-exactly workflow harder than it needs to be and leaves the web app outside the shadcn/ui ecosystem it is already structurally imitating.

This spec pivots the web app to `@radix-ui/react`, one primitive at a time, and — because the visible consistency problem is bigger than the library choice — consolidates the four hand-rolled sidebar implementations onto a single shared, Radix-backed sidebar primitive first. The dictionary sidebar was rebuilt on Radix Dialog in commit `b88fb45b` as the pilot; this spec turns that pilot into a repeatable pattern and a full migration plan.

### Target architecture

| Platform | Headless library | Styling |
|---|---|---|
| Web (current) | `@base-ui/react` | Tailwind CSS + shared tokens |
| Web (target) | `@radix-ui/react-*` | Tailwind CSS + shared tokens |
| Mobile (unchanged) | `@rn-primitives` (Radix API for RN) | NativeWind + shared tokens |

The design language does not change. All styling stays token-driven Tailwind/NativeWind; the migration is a headless-API change with behavior and accessibility as the user-visible delta.

---

## Current State Audit

### Web primitives (`apps/web/src/components/ui/`)

| Wrapper | Headless backend | Consumers | Migration risk |
|---|---|---|---|
| `dialog.tsx` | `@base-ui/react/dialog` | `language-switcher.tsx`, `dictionary-popup.tsx`, `about-dialog.tsx` | Low — same API family as the piloted sheet |
| `sheet.tsx` | `@base-ui/react/dialog` | `reader/page.tsx`, `epub/page.tsx`, `web-reader/page.tsx` | Low |
| `popover.tsx` | `@base-ui/react/popover` | `user-menu.tsx`, `text-action-menu.tsx` | Low |
| `tabs.tsx` | `@base-ui/react/tabs` | `tabbed-panel.tsx` | Low |
| `switch.tsx` | `@base-ui/react/switch` | settings `ToggleRow.tsx` | Low |
| `hover-card.tsx` | `@base-ui/react/preview-card` | **None** (wrapper is unused) | None — migrate for consistency or delete |
| `select.tsx` | `@base-ui/react/select` | `language-level-select.tsx`, `voice-picker.tsx` | **High** — Select APIs differ the most |

`button.tsx` uses only `class-variance-authority` + Tailwind (no headless lib); `sonner.tsx` wraps the sonner library. These are untouched.

`@base-ui/react` is imported only by the seven wrappers above (plus a stale comment in `tabbed-panel.tsx`) — no feature code depends on it directly, so the migration surface is contained.

### Sidebar inventory (`apps/web`)

| Sidebar | File | Pattern | Shared primitive? |
|---|---|---|---|
| Dictionary | `components/dictionary/word-list-sidebar.tsx` | Desktop collapsible right panel + mobile Radix Dialog sheet | ✅ Radix (pilot, `b88fb45b`) |
| Reader notes | `components/reader/notes-sidebar.tsx` | Desktop right panel + Base UI `Sheet` | ❌ Hand-rolled |
| EPUB chapters | `components/reader/epub-chapter-sidebar.tsx` | Desktop right panel + Base UI `Sheet` | ❌ Hand-rolled |
| Web reader | inline in `app/[l1]/[l2]/web-reader/page.tsx` | Desktop right panel + Base UI `Sheet` | ❌ Inline |
| Settings | `app/[l1]/[l2]/settings/_components/SettingsSidebar.tsx` | Left nav in desktop aside | ❌ Different pattern (nav) |
| Docs | `app/[l1]/[l2]/docs/doc-sidebar.tsx` | Left nav with search | ❌ Different pattern (nav) |

The four content sidebars (dictionary, notes, EPUB, web-reader) implement the same collapsible-panel + mobile-sheet pattern independently. That duplication is the primary UX-consistency problem this spec addresses.

---

## User Stories

- As a **keyboard/screen-reader user**, I want every dialog, sheet, popover, select, tab, and switch to trap focus, restore focus, and announce itself consistently, so overlays never strand me.
- As a **user on any device**, I want Escape, backdrop-tap, and the close button to dismiss every overlay the same way.
- As a **developer**, I want to add a dropdown or modal without re-implementing portal rendering, focus management, and keyboard dismiss.
- As a **maintainer**, I want the web app on the same component ecosystem as upstream shadcn/ui and the same headless API family as the mobile app's rn-primitives, so porting and upgrading are mechanical.
- As a **user**, I want the dictionary, reader, and web-reader sidebars to look and behave identically, whether they're showing words, notes, or chapters.

---

## Implementation Plan

### Phase 0 — Shared Sidebar primitive (consistency first)

**Goal**: one Radix-backed sidebar primitive used by all content sidebars.

1. **Create `apps/web/src/components/ui/sidebar.tsx`** — a shadcn-style wrapper around `@radix-ui/react-dialog` (and plain Tailwind for the collapse toggle) that provides:
   - Desktop: persistent collapsible right panel (expand/collapse, animated width, `aria-expanded` on the toggle)
   - Mobile: Radix Dialog sheet (focus trap, scroll lock, Escape, backdrop dismiss, slide-in/out animation)
   - Shared panel chrome: header with title + close button, scrollable body, empty state slot, token styling (`bg-card`, `border-border`, `text-muted-foreground`, …)
   - Stable props so feature content stays in the consumer: `open`, `onOpenChange`, `sidebarOpen`, `title`, `emptyState`, `children`
2. **Rework the dictionary sidebar** onto the primitive (`word-list-sidebar.tsx` + `dictionary/layout.tsx`) — the pilot's Radix dialog logic moves into the primitive; the dictionary keeps its saved-words/results content.
3. **Migrate the reader sidebars**: `notes-sidebar.tsx`, `epub-chapter-sidebar.tsx`, and the inline web-reader panel become thin content components rendered inside the shared primitive. Their feature content (notes CRUD, TOC tree, markdown outline) stays in place.
4. **Consistency fixes inside the migrated sidebars** (library-independent, but do them here):
   - Replace raw `<button>` elements with `ui/button`
   - Replace native `prompt()`/`confirm()` in `NotesSidebar` with an app-level dialog
   - Standardize header, close, empty-state, and scroll behavior across all four
5. **Evaluate separately** (Phase 0.5, optional): the Settings and Docs left-nav sidebars are a different pattern; migrate them onto the primitive only if the primitive supports both sides without contortion, otherwise leave them and note the divergence.

### Phase 1 — Dependency setup

```bash
npm install -w apps/web \
  @radix-ui/react-dialog@^1.1.20 \
  @radix-ui/react-popover \
  @radix-ui/react-tabs \
  @radix-ui/react-switch \
  @radix-ui/react-hover-card \
  @radix-ui/react-select
```

Notes:
- `@radix-ui/react-dialog@1.1.20` is already hoisted in `node_modules` (transitive via mobile's rn-primitives/vaul) and is now declared directly by the web app; the install is offline-safe.
- Animation: `tailwindcss-animate` is already configured. Base UI uses `data-[open]`/`data-[closed]`; Radix uses `data-[state=open]`/`data-[state=closed]`. The plugin supports both — this is a class rename, not a new dependency.
- Each Radix package is self-contained and tree-shaken per package; expect no meaningful bundle delta (verify in Phase 3).

### Phase 2 — Primitive-by-primitive migration

General rule for every wrapper: **keep the public component API identical** so feature call sites do not change. The work lives inside the wrapper files, plus a QA pass on each consumer.

#### API mapping (Base UI → Radix)

| Base UI | Radix |
|---|---|
| `Portal` | `Portal` |
| `Popup` | `Content` |
| `Positioner` | `Content` (inside `Portal`) |
| `Backdrop` | `Overlay` |
| `render` prop | `asChild` |
| `data-[open]` / `data-[closed]` | `data-[state=open]` / `data-[state=closed]` |
| Select: `Root` / `Trigger` / `Portal` / `Positioner` / `Popup` | Select: `Root` / `Trigger` / `Value` / `Content` / `Item` / `ItemText` / `ItemIndicator` (structure differs most) |

#### Order (riskiest last)

1. **Dialog + Sheet** — rewrite `ui/dialog.tsx` and `ui/sheet.tsx` on `@radix-ui/react-dialog`. Consumers unchanged (`language-switcher`, `dictionary-popup`, `about-dialog`, reader/epub/web-reader sheets). The dictionary sidebar already validates this exact pattern.
2. **Popover** — rewrite `ui/popover.tsx`; consumers unchanged (`user-menu`, `text-action-menu`).
3. **Tabs** — rewrite `ui/tabs.tsx`; refactor `tabbed-panel.tsx` internals if the wrapper API needs adjustment.
4. **Switch** — rewrite `ui/switch.tsx`; settings `ToggleRow.tsx` unchanged.
5. **Hover card** — rewrite `ui/hover-card.tsx` for consistency, or delete it (zero consumers). Also decide `DictionaryPopup` placement: it is click/tap-triggered, so `Popover` is likely the correct primitive (see Open Questions).
6. **Select (last)** — rewrite `ui/select.tsx` on `@radix-ui/react-select`; refactor `language-level-select.tsx` and `voice-picker.tsx` if their usage maps to Radix's `Value`/`Item` model. Verify typeahead, scroll-to-selected, and any search/filter behavior in `VoicePicker` before committing — if Radix Select cannot host the search UI, use a Dialog-based list (same fallback SPEC-016 chose for mobile).

### Phase 3 — Consistency pass, cleanup, and documentation

- Sweep feature code for raw `<input type="checkbox">`, `<select>`, `<input type="range">`, and raw `<button>` styling that now has a ui primitive; replace with the primitives.
- Remove native `prompt()`/`confirm()` calls app-wide (the sidebar pass covers the known one; grep for others).
- Remove `@base-ui/react` from `apps/web/package.json` once the last wrapper is migrated; run `npm install` and confirm no remaining imports.
- Update SPEC-016 to mark the web portion superseded by SPEC-030.
- Add an ADR (e.g., ADR-0020: Use Radix for Web Interaction Primitives) recording the decision and the rn-primitives symmetry rationale.
- Update `ROADMAP.md` with the completed migration phases.
- Verify bundle size before/after for the web app and record it in the ADR.

---

## API Endpoints

None. All changes are client-side primitives and layout components.

---

## States

Each migrated overlay/primitive must handle:

| State | Handling |
|---|---|
| Open | Portal rendered, backdrop visible, focus trapped inside |
| Closed | Portal unmounted, focus restored to trigger |
| Opening/closing | Radix `data-[state=*]` animations via `tailwindcss-animate` |
| Nested overlay | Only one open at a time; opening a second closes the first |
| Keyboard/screen reader | Escape dismisses, ARIA roles correct, focus order contained |
| Empty content (sidebar) | Shared empty-state slot from the primitive |

---

## Testing Checklist

### Sidebars (Phase 0)
- [ ] Dictionary: desktop collapse/expand preserves panel width fix (`w-full`); mobile sheet traps focus, Escape closes, backdrop closes
- [ ] Reader notes: rename/delete flows work without native `prompt()`/`confirm()`
- [ ] EPUB: TOC navigation works from desktop panel and mobile sheet
- [ ] Web-reader: outline works in both desktop panel and mobile sheet
- [ ] All four: header, close button, scroll, and empty state look identical

### Primitives (Phase 2)
- [ ] Dialog: focus trap + restore, Escape, backdrop dismiss, scroll lock
- [ ] Sheet: slide animation, Escape, focus trap
- [ ] Popover: opens near trigger, never clipped, click-outside dismiss
- [ ] Tabs: arrow-key navigation, `tablist`/`tab`/`tabpanel` roles
- [ ] Switch: keyboard toggle, `switch` role announced
- [ ] Hover card: (if kept) delay open/close, dismiss on hover-out
- [ ] Select: typeahead, arrow/Enter/Escape, scroll-to-selected, VoicePicker search UI if present

### Regression
- [ ] `npx turbo typecheck` and `npm run build:check -w apps/web` per PR (build check per AGENTS.md before commits)
- [ ] No `@base-ui/react` imports remain after Phase 3

---

## Migration Order (PR list)

1. Shared Sidebar primitive + dictionary rework (follow-up to `b88fb45b`)
2. Reader + EPUB + web-reader sidebars onto the primitive
3. `ui/dialog.tsx` + `ui/sheet.tsx` → Radix
4. `ui/popover.tsx` → Radix
5. `ui/tabs.tsx` → Radix
6. `ui/switch.tsx` → Radix
7. `ui/hover-card.tsx` → Radix (or delete)
8. `ui/select.tsx` → Radix (riskiest)
9. Cleanup: drop `@base-ui/react`, update SPEC-016 + ADR + ROADMAP

Each PR is independently deployable: wrapper APIs stay stable, so feature call sites only change where explicitly noted. Reverting any PR restores the previous wrapper file with no data or state migration.

---

## Dependencies

- `@radix-ui/react-dialog`, `-popover`, `-tabs`, `-switch`, `-hover-card`, `-select` (new; dialog already declared)
- `tailwindcss-animate` (existing), `shadcn` CLI (existing, for future component additions)
- `packages/shared/tokens.ts` (ADR-0011) for styled wrappers
- SPEC-016 (web portion superseded), ADR-0014 (mobile symmetry), ADR-0011 (tokens), ADR-0003 (no shared UI across platforms)

---

## Open Questions

- **Sidebar primitive shape**: adapt shadcn/ui's official Sidebar (left-nav oriented, brings its own provider/context) vs. extract our own right-panel primitive from the piloted `WordListSidebar`. Default: own primitive, since all four content sidebars are right-side panels.
- **DictionaryPopup**: `Popover` vs `HoverCard` — it is click/tap-triggered, so `Popover` is likely correct; confirm during Phase 2.5.
- **VoicePicker**: can `@radix-ui/react-select` host its UX (search/filter if present)? Fallback: Dialog-based list.
- **Settings/Docs nav sidebars**: in scope for the shared primitive, or tracked separately?
- **Hover card**: migrate or delete (zero consumers today)?
- **SPEC-016**: update in place vs. leave as historical with a superseded banner — prefer the banner + pointer to SPEC-030.
