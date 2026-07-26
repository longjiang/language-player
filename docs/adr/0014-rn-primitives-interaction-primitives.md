# ADR-0014: Use @rn-primitives for Mobile Interaction Primitives

**Date**: 2026-07-25
**Status**: proposed
**See also**: [ADR-0003 (no shared UI)](./0003-no-shared-ui.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md), [Commit 28ceadfda1](https://github.com/zerotohero/language-player/commit/28ceadfda1) (web: shadcn/ui Dialog adoption)

## Context

### What the web team already solved

On 2026-07-24, the web team replaced a hand-rolled modal in the **web app's** `LanguageSwitcher` (`apps/web/src/components/layout/language-switcher.tsx`) with shadcn/ui's `Dialog` component (commit `28ceadfda1`). This was a **web-only change** — shadcn/ui is built on `@base-ui/react` (DOM) and does not run on React Native. The motivation was **actual rendering bugs**, not boilerplate reduction:

1. **Offscreen rendering** — The hand-rolled modal used `fixed inset-0` within the component tree. When the trigger was near a viewport edge or inside a clipped container, the modal rendered partially outside the visible area.
2. **Tap-through** — The backdrop `onClick` dismiss wasn't reliably intercepting all pointer events. Clicks on the backdrop could trigger interactions on components rendered beneath.
3. **Manual interaction boilerplate** — Escape key handling, body scroll lock, and focus management were hand-coded (~50 lines of `useState` + `useEffect` + `useCallback`).

The fix was adopting `@base-ui/react/dialog` via shadcn/ui: a headless primitive that handles portal rendering (isolated from ancestor clipping), proper overlay touch capture, focus trapping, and keyboard dismiss. The web team wrapped it with Tailwind classes for visual styling.

### The mobile app has the same class of bugs

The mobile app currently hand-rolls all interaction primitives using raw React Native APIs. For example, the `LanguageSwitcher` dropdown at `apps/mobile/components/layout/LanguageSwitcher.tsx`:

```tsx
// Line 152-153: inline positioned dropdown, NOT portaled
<Pressable className="absolute inset-0 z-40" onPress={() => setOpen(null)} />
<View className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
```

This pattern has the same structural vulnerabilities:

1. **Offscreen clipping** — The dropdown uses `absolute` positioning inside a `flex-row` parent. If the parent is near a screen edge or inside a scrollable/clipped container (`overflow: hidden`), the dropdown is cut off. There's no portal — the content lives in the same view hierarchy as the trigger.

2. **Tap-through to underlying components** — The backdrop is a sibling `<Pressable>` in the same `flex-row` container. React Native's touch system can deliver touches to views beneath if the overlay doesn't fully capture them. There's no native modal presentation layer.

3. **No focus trap** — Screen readers and external keyboards can escape the dropdown into underlying UI. There's no accessibility focus management.

4. **z-index wars** — Multiple overlays (dictionary popup, language picker, hamburger drawer) compete for z-index via manual `z-40`/`z-50` values. With no portal, stacking context depends on render order in the component tree.

These are not styling bugs — they are **structural bugs** caused by rendering modals inline in the component hierarchy instead of at the root view level with proper overlay semantics.

### The parallel architecture

The web app's architecture forms a clean two-layer pattern:

| Layer | Web | Responsibility |
|---|---|---|
| Headless primitive | `@base-ui/react` (DOM) | Portal, focus trap, overlay capture, keyboard dismiss, ARIA |
| Styled wrapper | `@/components/ui/dialog.tsx` | Tailwind classes, visual design via shared design tokens |

The mobile equivalent follows the same pattern:

| Layer | Mobile | Responsibility |
|---|---|---|
| Headless primitive | `@rn-primitives` (React Native) | Portal via RN `Modal`, overlay touch capture, focus trap, back-button dismiss, ARIA |
| Styled wrapper | `@/components/ui/dialog.tsx` (mobile) | NativeWind classes, visual design via shared design tokens |

This aligns with ADR-0003: components are separate per platform, but the architectural pattern (headless primitive + styled wrapper) is shared.

## Options Considered

### Option A: Continue hand-rolling with raw React Native APIs

- **Pros**: No new dependencies, full control, no learning curve
- **Cons**: The same class of bugs the web team already solved keeps recurring. Each new modal/dropdown/select re-invents portal rendering, touch capture, and focus management. The mobile `LanguageSwitcher` already exhibits offscreen clipping and tap-through vulnerabilities. The DictionaryPopup, Settings panels, and HamburgerDrawer all have their own ad-hoc modal implementations — each with subtly different behavior and edge cases.

### Option B: Adopt react-native-reusables (shadcn/ui for React Native)

- **Pros**: Ships pre-built styled components matching the web app's shadcn/ui look. Includes reanimated enter/exit animations. Component API mirrors shadcn/ui.
- **Cons**: Ships visual styling and animation presets bundled with each component. These defaults are intentionally shadcn-matching (web-style fade+scale transitions, shadcn color mappings). Overriding them to match our design tokens from ADR-0011 means fighting the library's defaults. The animation presets replicate CSS transitions (ease-out, duration-based) rather than native spring physics. Adds an abstraction layer on top of `@rn-primitives` that provides visual design we already have.

### Option C: Adopt @rn-primitives directly (headless only)

- **Pros**: Solves the structural bugs (portal, touch capture, focus trap) without imposing any visual design. We supply NativeWind classes using our existing shared design tokens from ADR-0011. Same architectural pattern as the web app (headless `@base-ui/react` → styled `@/components/ui/dialog.tsx`). Each primitive is independently installable — only adopt what we need. Zero visual defaults to override.
- **Cons**: Must build our own styled wrappers (~30-50 lines per primitive, similar to the web's `dialog.tsx`). Must create our own animation presets using `react-native-reanimated`. Not a drop-in solution — requires design work per primitive.

## Decision

**Option C: Adopt @rn-primitives directly, wrapped with NativeWind + our design tokens.**

Rationale:

1. **Solves the real bugs.** Portal rendering (no more offscreen clipping), overlay touch capture (no more tap-through), focus trapping (no more accessibility escapes). These are the exact bugs that drove the web team to adopt `@base-ui/react`.

2. **Architectural symmetry with web.** Both platforms use headless primitives (`@base-ui/react` on web, `@rn-primitives` on mobile) wrapped with our own styling layer. Developers moving between platforms encounter the same pattern: import the primitive, wrap with design tokens. The web team's `@/components/ui/dialog.tsx` (~100 lines) is the template for the mobile equivalents.

3. **No visual imposition.** `@rn-primitives` ships zero styling — no colors, no spacing, no animations. Our NativeWind classes (`bg-background`, `text-foreground`, `border-border`) apply directly to primitive components. The visual identity stays under our control via ADR-0011's shared design tokens.

4. **Surgical adoption.** We don't need to migrate every component. The five most bug-prone interaction primitives are targeted first: Dialog (language picker, dictionary popup), Select (settings dropdowns), Switch (settings toggles), Tabs (settings panels), and Drawer (hamburger menu). Domain components (TokenizedText, VideoGrid, SubtitleDisplay) remain untouched.

5. **Animation is our own.** `@rn-primitives` components expose `entering`/`exiting` props that accept `react-native-reanimated` transitions. We define a small set of animation presets (spring-based, iOS-feel) rather than adopting web-style CSS duration transitions from react-native-reusables.

## Consequences

**Dependencies added to `apps/mobile/`:**
- `@rn-primitives/dialog` — modal dialogs, popups, bottom sheets
- `@rn-primitives/select` — dropdown selects, language pickers
- `@rn-primitives/switch` — toggle switches
- `@rn-primitives/tabs` — tabbed panels (Settings, Word Detail)
- `react-native-reanimated` — **promoted to direct dependency** with explicit version pin. Currently a transitive dependency via Expo, but `apps/mobile/lib/animations.ts` will import from it directly. Transitive deps can vanish when upstream trees change; a direct dependency guarantees availability.

**New mobile files created:**
- `apps/mobile/components/ui/dialog.tsx` — styled Dialog wrapper (NativeWind + design tokens). Estimated ~60–80 lines (comparable to web's `dialog.tsx` at ~100 lines, which includes overlay, close button, portal wiring, and enter/exit animation classes).
- `apps/mobile/components/ui/select.tsx` — styled Select wrapper (~50–70 lines)
- `apps/mobile/components/ui/switch.tsx` — styled Switch wrapper (~30–40 lines)
- `apps/mobile/components/ui/tabs.tsx` — styled Tabs wrapper (~50–70 lines)
- `apps/mobile/lib/animations.ts` — shared reanimated spring-based animation presets (~30–50 lines)

**New shared files (potentially):**
- `packages/shared/animation-tokens.ts` — if we want animation durations/curves as shared tokens. Likely not needed initially; start with mobile-only presets.

**Components NOT affected:**
- `TokenizedText`, `SubtitleDisplay`, `VideoCard`, `VideoGrid`, `VideoControlBar`, `TranscriptQueuePanel`, and all other domain components — these are not interaction primitives and remain as-is.

**Migration strategy:**
1. Install `@rn-primitives/dialog` first, build the styled wrapper, and replace the `LanguageSwitcher` dropdown (the simplest and most directly comparable to the web migration in commit `28ceadfda1`).
2. **Accessibility verification checkpoint**: After migrating LanguageSwitcher, verify with VoiceOver (iOS) and TalkBack (Android) that focus is trapped inside the dialog and that the backdrop dismiss gesture works. React Native's accessibility model differs materially from web ARIA — this must be validated, not assumed.
3. Replace `DictionaryPopup` with the Dialog wrapper (currently uses RN `Modal` directly).
4. **Select validation checkpoint**: Before committing to `@rn-primitives/select`, verify it can handle the LanguageSwitcher's full UX: text input for search, `ScrollView` with `keyboardShouldPersistTaps="handled"`, and popular/all categorized sections. If `@rn-primitives/select` cannot compose with these elements, the Dialog primitive alone is the better tool — render a Dialog containing the same searchable list. Select may not need a dedicated primitive at all.
5. Evaluate `@rn-primitives/switch` for Settings toggles.
6. Evaluate `@rn-primitives/tabs` for `TabbedPanel`. Note: the `as any` type casts in the current `TabbedPanel` (from the 2026-07-25 tsc fix commit) are about `React.Children.toArray` typing and will not be resolved by `@rn-primitives/tabs` unless the child-passing structure is also refactored. The motivation for Tabs is structural: focus management, keyboard navigation, and ARIA `tablist`/`tabpanel` roles — not the type casts.
7. **HamburgerDrawer**: `@rn-primitives` does not have a dedicated Drawer primitive. Default approach: use `@rn-primitives/dialog` configured with a slide-from-left animation. If the feel isn't native enough, evaluate a dedicated drawer library (e.g., `zeego/drawer`) as a follow-up. The drawer is lower priority than the other primitives because its current hand-rolled implementation (slide-in panel + backdrop `Pressable`) has fewer structural bugs than inline dropdowns.

**Risk:** `@rn-primitives` is a community project (not a large organization). Mitigation: the primitives are thin wrappers around React Native's built-in `Modal`, `Pressable`, and accessibility APIs — they add correctness logic, not novel rendering. If a primitive becomes unmaintained, we can vendor its source (it's designed to be copied, like shadcn/ui).
