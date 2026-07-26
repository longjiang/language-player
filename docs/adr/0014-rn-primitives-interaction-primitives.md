# ADR-0014: Interaction Primitives Strategy — Headless UI for Web + Mobile

**Date**: 2026-07-25
**Status**: proposed
**See also**: [ADR-0003 (no shared UI)](./0003-no-shared-ui.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md), [SPEC-016](../specs/016-interaction-primitives-migration.md) (implementation plan)

## Context

Both the web and mobile apps rely on hand-rolled implementations of common interaction primitives — modals, dropdowns, selects, toggles, tabs, and drawers. These suffer from the same class of bugs across both platforms:

1. **Offscreen clipping** — Inline positioned overlays are clipped by ancestor `overflow: hidden` or screen edges. No portal rendering isolates them from the component tree.
2. **Tap/click-through** — Backdrop overlays don't reliably capture all pointer/touch events. Clicks or taps on the backdrop can trigger interactions on components rendered beneath.
3. **No focus trapping** — Keyboard focus and screen readers can escape the overlay into underlying UI. No accessibility focus management.
4. **z-index wars** — Multiple overlays compete via manual stacking values. Without portals, stacking depends on render order, not a managed layer system.
5. **Inconsistent behavior** — Each hand-rolled instance has subtly different dismiss behavior, animation timing, and accessibility support.

These are not styling bugs — they are **structural bugs** caused by rendering overlays inline in the component hierarchy instead of at the root view level with proper overlay semantics. No amount of CSS or NativeWind refinement fixes them; the component needs to be rendered in a different place in the view hierarchy.

### Web: The first migration validated the approach

On 2026-07-24, the web team replaced a hand-rolled modal in `LanguageSwitcher` (`apps/web/src/components/layout/language-switcher.tsx`) with shadcn/ui's `Dialog` component (commit `28ceadfda1`). This eliminated ~50 lines of manual state management, Escape key handling, body scroll lock, and backdrop wiring.

```tsx
// Before (hand-rolled): useState + useEffect + useCallback + document.body.style + fixed div + backdrop div
// After (shadcn/ui):
<Dialog>
  <DialogTrigger>...</DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

The fix adopted `@base-ui/react/dialog` via shadcn/ui: a headless primitive handling portal rendering, overlay touch capture, focus trapping, and keyboard dismiss. The web team wrapped it with Tailwind classes for visual styling.

Five more hand-rolled primitives remain on web, all candidates for the same treatment: Popover (UserMenu, TextActionMenu), Select (VoicePicker, LanguageLevelSelect), Tabs (TabbedPanel), Switch (settings toggles), and HoverCard/Popover (DictionaryPopup).

### Mobile: The same bugs, no migration yet

The mobile app hand-rolls all six interaction primitives. The `LanguageSwitcher` dropdown at `apps/mobile/components/layout/LanguageSwitcher.tsx` is the clearest example:

```tsx
// Line 152-153: inline positioned dropdown, NOT portaled
<Pressable className="absolute inset-0 z-40" onPress={() => setOpen(null)} />
<View className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
```

This has the same structural vulnerabilities as the web's pre-migration code: offscreen clipping (no portal), tap-through to sibling components (no touch capture), and no focus trap. The `UserMenu`, `DictionaryPopup`, `SubsSearchResults` modal, `TabbedPanel`, and `HamburgerDrawer` all have their own ad-hoc implementations with subtly different behavior.

### The shared architectural pattern

Both platforms can use the same two-layer architecture:

```
┌──────────────────────────────────────────────────┐
│              Styled Wrapper (ours)                │
│  NativeWind/Tailwind classes + design tokens     │
│  Visual identity — our colors, spacing, fonts     │
├──────────────────────────────────────────────────┤
│           Headless Primitive (library)            │
│  Portal, focus trap, overlay capture, keyboard,  │
│  ARIA, animation hooks — zero visual styling     │
└──────────────────────────────────────────────────┘
```

This aligns with ADR-0003: components are separate per platform, but the architectural pattern (headless primitive + styled wrapper) is shared. ADR-0011's design tokens supply the visual layer for both platforms' wrappers.

## Options Considered

### Web Options

#### Option W1: Continue hand-rolling interaction primitives

- **Pros**: No new dependencies, full control.
- **Cons**: The Dialog migration (commit `28ceadfda1`) already demonstrated the cost: ~50 lines of boilerplate per overlay, recurring offscreen/tap-through/focus-trap bugs, and inconsistent dismiss behavior across components. Five more primitives remain — each would replicate these problems.

#### Option W2: Build a custom React component library from scratch

- **Pros**: Full control over API design and behavior. No external dependency risk.
- **Cons**: Re-inventing focus trapping, portal rendering, keyboard navigation, and ARIA roles is a multi-year maintenance commitment. These are solved problems with mature open-source implementations. The opportunity cost is high — time spent on interaction plumbing is time not spent on language-learning features.

#### Option W3: Adopt shadcn/ui (@base-ui/react primitives + Tailwind styling)

- **Pros**: Battle-tested headless primitives from the Radix UI team (now `@base-ui/react`). Already configured in the project (`components.json`). Dialog migration already complete and validated. Each primitive is independently installable. Styled wrappers use our existing Tailwind config and design tokens. Components are copied into our source tree (not a black-box dependency) — we own and can modify them.
- **Cons**: Adds `@base-ui/react` as a dependency (already installed for Dialog). Each new primitive adds a ~100-line styled wrapper file. The shadcn CLI (`npx shadcn@latest add`) sometimes overwrites project config files (globals.css, tailwind.config.ts) — needs manual reversion as documented in commit `28ceadfda1`.

### Mobile Options

#### Option M1: Continue hand-rolling with raw React Native APIs

- **Pros**: No new dependencies, full control, no learning curve.
- **Cons**: The same class of bugs that drove the web migration keeps recurring. Each new modal/dropdown/select re-invents portal rendering, touch capture, and focus management. The mobile `LanguageSwitcher` already exhibits offscreen clipping and tap-through vulnerabilities. The DictionaryPopup, Settings panels, and HamburgerDrawer all have their own ad-hoc modal implementations — each with subtly different behavior and edge cases.

#### Option M2: Adopt react-native-reusables (shadcn/ui for React Native)

- **Pros**: Ships pre-built styled components matching the web app's shadcn/ui look. Includes reanimated enter/exit animations. Component API mirrors shadcn/ui.
- **Cons**: Ships visual styling and animation presets bundled with each component. These defaults are intentionally shadcn-matching (web-style fade+scale transitions, shadcn color mappings). Overriding them to match our design tokens from ADR-0011 means fighting the library's defaults. The animation presets replicate CSS transitions (ease-out, duration-based) rather than native spring physics. Adds an abstraction layer on top of `@rn-primitives` that provides visual design we already have. Would create an inconsistent situation: web owns its styled wrappers, but mobile defers to a third party's visual decisions.

#### Option M3: Adopt @rn-primitives directly (headless only)

- **Pros**: Solves the structural bugs (portal, touch capture, focus trap) without imposing any visual design. We supply NativeWind classes using our existing shared design tokens from ADR-0011. Same architectural pattern as the web app (headless `@base-ui/react` → styled `@/components/ui/dialog.tsx`). Each primitive is independently installable — only adopt what we need. Zero visual defaults to override. Both platforms own their styled wrappers; only the headless layer is delegated to a library.
- **Cons**: Must build our own styled wrappers (~60–80 lines per primitive, comparable to web's `dialog.tsx` at ~100 lines). Must create our own animation presets using `react-native-reanimated`. Not a drop-in solution — requires design work per primitive. `@rn-primitives` is community-maintained (mitigated by its vendorable design — source is meant to be copied like shadcn/ui).

## Decision

**Web: Option W3 — Adopt shadcn/ui (@base-ui/react primitives + Tailwind styling).**  
**Mobile: Option M3 — Adopt @rn-primitives directly, wrapped with NativeWind + our design tokens.**

Both platforms follow the same architectural pattern: **headless primitive library handles interaction correctness, our own styled wrappers handle visual identity.** The headless libraries differ by platform (DOM vs. native views), but the layer above — design tokens, class name conventions, file organization — is shared.

| Concern | Web | Mobile |
|---|---|---|
| Headless primitive library | `@base-ui/react` (via shadcn/ui) | `@rn-primitives` |
| Styling layer | Tailwind CSS + shared tokens | NativeWind + shared tokens |
| Styled wrappers location | `apps/web/src/components/ui/` | `apps/mobile/components/ui/` |
| Animation | `tw-animate-css` (CSS transitions) | `react-native-reanimated` (spring-based) |
| Component source | Copied into our tree (shadcn pattern) | Copied/vendored as needed |

### Rationale

1. **Solves real bugs on both platforms.** Portal rendering (no more offscreen clipping), overlay touch/click capture (no more tap-through), focus trapping (no more keyboard/accessibility escapes). The web Dialog migration already validated this: the same ~50 lines of boilerplate disappeared and the structural bugs vanished.

2. **Architectural symmetry.** Both platforms use headless primitives wrapped with our own styling layer. Developers moving between platforms encounter the same pattern: import the primitive, wrap with design tokens. The web's `@/components/ui/dialog.tsx` (~100 lines) is the template for both platforms' wrappers.

3. **No visual imposition.** Neither `@base-ui/react` nor `@rn-primitives` ships visual styling. Our design tokens from ADR-0011 apply directly via Tailwind/NativeWind classes (`bg-background`, `text-foreground`, `border-border`). The visual identity stays under our control. This is why Option M2 (react-native-reusables) was rejected — it would cede visual control to a library on mobile while web retains it, creating an asymmetry.

4. **Surgical adoption.** We don't need to migrate every component — only the interaction primitives that are currently hand-rolled and buggy. Domain components (TokenizedText, VideoGrid, SubtitleDisplay) remain untouched. Per SPEC-016, the migration targets five primitives per platform in priority order.

5. **Animation is platform-appropriate.** Web uses CSS transitions (`tw-animate-css`), which is the right tool for DOM animations. Mobile uses `react-native-reanimated` with spring physics, which is the right tool for native-feel animations. Neither platform forces the other's animation model.

6. **Vendorable source.** Both `@base-ui/react` (via shadcn/ui's copy pattern) and `@rn-primitives` are designed to have their source copied into the project. If either becomes unmaintained, we own the code and can maintain it ourselves.

## Consequences

### Web

**Dependencies (already installed):**
- `@base-ui/react` — headless primitives (Dialog already in use)
- `shadcn` CLI — component scaffolding
- `tw-animate-css` — CSS animation utilities

**New files (one per primitive, ~100 lines each):**
- `apps/web/src/components/ui/popover.tsx` — UserMenu, TextActionMenu
- `apps/web/src/components/ui/select.tsx` — VoicePicker, LanguageLevelSelect
- `apps/web/src/components/ui/tabs.tsx` — TabbedPanel
- `apps/web/src/components/ui/switch.tsx` — Settings toggles
- `apps/web/src/components/ui/hover-card.tsx` — DictionaryPopup (evaluate Popover vs HoverCard)

**Files refactored:**
- `apps/web/src/components/layout/user-menu.tsx` — `<Popover>` replaces hand-rolled dropdown
- `apps/web/src/components/text-action-menu.tsx` — `<Popover>` replaces `dropdownRef`
- `apps/web/src/components/voice-picker.tsx` — `<Select>` replaces hand-rolled dropdown
- `apps/web/src/components/language-level-select.tsx` — `<Select>` replaces hand-rolled select
- `apps/web/src/components/tabbed-panel.tsx` — `<Tabs>` replaces hand-rolled tabs
- `apps/web/src/components/dictionary-popup.tsx` — `<Popover>` or `<HoverCard>` replaces inline positioning
- `apps/web/src/app/[l1]/[l2]/settings/` — `<Switch>` replaces raw checkboxes

**Migration order (by impact):**
1. Popover (UserMenu on every page)
2. Tabs (TabbedPanel used in Settings and Word Detail)
3. Select (VoicePicker, LanguageLevelSelect)
4. Switch (Settings toggles)
5. HoverCard/Popover (DictionaryPopup — evaluate which fits)

### Mobile

**Dependencies added to `apps/mobile/`:**
- `@rn-primitives/dialog` — modal dialogs, popups, bottom sheets
- `@rn-primitives/select` — dropdown selects, language pickers
- `@rn-primitives/switch` — toggle switches
- `@rn-primitives/tabs` — tabbed panels (Settings, Word Detail)
- `react-native-reanimated` — **promoted to direct dependency** with explicit version pin. Currently a transitive dependency via Expo, but `apps/mobile/lib/animations.ts` will import from it directly. Transitive deps can vanish when upstream trees change; a direct dependency guarantees availability.

**New files:**
- `apps/mobile/components/ui/dialog.tsx` — styled Dialog wrapper (~60–80 lines, mirrors web's `dialog.tsx`)
- `apps/mobile/components/ui/select.tsx` — styled Select wrapper (~50–70 lines)
- `apps/mobile/components/ui/switch.tsx` — styled Switch wrapper (~30–40 lines)
- `apps/mobile/components/ui/tabs.tsx` — styled Tabs wrapper (~50–70 lines)
- `apps/mobile/lib/animations.ts` — shared reanimated spring-based animation presets (~30–50 lines)

**Files refactored:**
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — inline dropdown → `<Dialog>`
- `apps/mobile/components/layout/UserMenu.tsx` — inline dropdown → `<Dialog>`
- `apps/mobile/components/dictionary/DictionaryPopup.tsx` — RN `Modal` → `<Dialog>`
- `apps/mobile/components/video/SubsSearchResults.tsx` — RN `Modal` → `<Dialog>`
- `apps/mobile/components/TabbedPanel.tsx` — hand-rolled tabs → `<Tabs>`
- `apps/mobile/app/(tabs)/(me)/settings.tsx` — hand-rolled selects/switches → `<Select>`/`<Switch>`
- `apps/mobile/components/layout/HamburgerDrawer.tsx` — slide-in panel → `<Dialog>` with slide animation

**Migration strategy:**
1. Install `@rn-primitives/dialog` first, build the styled wrapper, and replace the `LanguageSwitcher` dropdown (the simplest and most directly comparable to the web migration in commit `28ceadfda1`).
2. **Accessibility verification checkpoint**: After migrating LanguageSwitcher, verify with VoiceOver (iOS) and TalkBack (Android) that focus is trapped inside the dialog and that the backdrop dismiss gesture works. React Native's accessibility model differs materially from web ARIA — this must be validated, not assumed.
3. Replace `DictionaryPopup` and `SubsSearchResults` modal with the Dialog wrapper.
4. **Select validation checkpoint**: Before committing to `@rn-primitives/select`, verify it can handle the LanguageSwitcher's full UX: text input for search, `ScrollView` with `keyboardShouldPersistTaps="handled"`, and popular/all categorized sections. If `@rn-primitives/select` cannot compose with these elements, the Dialog primitive alone is the better tool — render a Dialog containing the same searchable list. Select may not need a dedicated primitive at all.
5. Evaluate `@rn-primitives/switch` for Settings toggles.
6. Evaluate `@rn-primitives/tabs` for `TabbedPanel`. Note: the `as any` type casts in the current `TabbedPanel` (from the 2026-07-25 tsc fix commit) are about `React.Children.toArray` typing and will not be resolved by `@rn-primitives/tabs` unless the child-passing structure is also refactored. The motivation for Tabs is structural: focus management, keyboard navigation, and ARIA `tablist`/`tabpanel` roles — not the type casts.
7. **HamburgerDrawer**: `@rn-primitives` does not have a dedicated Drawer primitive. Default approach: use `@rn-primitives/dialog` configured with a slide-from-left animation. If the feel isn't native enough, evaluate a dedicated drawer library (e.g., `zeego/drawer`) as a follow-up. The drawer is lower priority because its current hand-rolled implementation has fewer structural bugs than inline dropdowns.

**Components NOT affected (both platforms):**
- `TokenizedText`, `SubtitleDisplay`, `VideoCard`, `VideoGrid`, `VideoControlBar`, `TranscriptQueuePanel`, and all other domain components — these are not interaction primitives and remain as-is.

**Risk:** `@rn-primitives` is a community project (not a large organization). Mitigation: the primitives are thin wrappers around React Native's built-in `Modal`, `Pressable`, and accessibility APIs — they add correctness logic, not novel rendering. If a primitive becomes unmaintained, we can vendor its source (it's designed to be copied, like shadcn/ui).
