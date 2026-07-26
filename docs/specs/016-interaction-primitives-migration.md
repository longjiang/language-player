# SPEC-016: Interaction Primitives — Headless UI Migration (Web + Mobile)

## Metadata
- **Spec ID**: SPEC-016
- **Feature**: Migrate hand-rolled interaction components to headless UI primitives on both platforms
- **Status**: draft
- **Created**: 2026-07-25
- **ROADMAP Phase**: Phase 7 — Mobile Integration (mobile), ongoing (web)
- **See also**:
  - [ADR-0014: Use @rn-primitives for Mobile Interaction Primitives](../adr/0014-rn-primitives-interaction-primitives.md)
  - [Commit 28ceadfda1](https://github.com/zerotohero/language-player/commit/28ceadfda1) — web Dialog migration
  - [STATUS.md](../../apps/mobile/STATUS.md) — mobile port status
  - [ROADMAP.md](../../ROADMAP.md) — Phase 7 tasks

---

## Overview

Both the web and mobile apps rely on hand-rolled implementations of common interaction primitives — modals, dropdowns, selects, toggles, and tabs. These suffer from the same class of bugs:

1. **Offscreen clipping** — inline positioned overlays are clipped by ancestor `overflow: hidden` or screen edges
2. **Tap/click-through** — backdrop overlays don't reliably capture all pointer/touch events
3. **No focus trapping** — keyboard focus and screen readers can escape the overlay into underlying UI
4. **z-index wars** — multiple overlays compete via manual stacking values
5. **Inconsistent behavior** — each hand-rolled instance has subtly different dismiss behavior, animation, and accessibility

The web team already solved this for `Dialog` (commit `28ceadfda1`): replaced a hand-rolled modal with shadcn/ui's `Dialog`, which is a styled wrapper around `@base-ui/react/dialog`. This spec extends that pattern to the remaining hand-rolled interaction primitives on **both platforms**.

### Architecture

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

| Platform | Headless Library | Styling |
|---|---|---|
| Web | `@base-ui/react` (via shadcn/ui) | Tailwind CSS |
| Mobile | `@rn-primitives` | NativeWind |

---

## Current State Audit

### Web (`apps/web/`)

| Component | File | Current impl | Issue |
|---|---|---|---|
| **Dialog** | `src/components/ui/dialog.tsx` | ✅ `@base-ui/react/dialog` | Already migrated (28ceadfda1) |
| **User menu dropdown** | `src/components/layout/user-menu.tsx` | Hand-rolled: `absolute right-0 top-full z-50` inline div | Tap-through, no focus trap, no portal |
| **Text action menu** | `src/components/text-action-menu.tsx` | Hand-rolled: `dropdownRef` + inline div | Same issues; positioned near text selection |
| **Voice picker** | `src/components/voice-picker.tsx` | Comment: "Voice picker dropdown" | Select/dropdown pattern hand-rolled |
| **Dictionary popup** | `src/components/dictionary-popup.tsx` | Comment: "popover" — inline positioned | No portal, clipping in scrollable containers |
| **Tabbed panel** | `src/components/tabbed-panel.tsx` | Hand-rolled tab bar + content switch | No keyboard nav, no ARIA tab roles |
| **Language level select** | `src/components/language-level-select.tsx` | Hand-rolled select | No typeahead, no keyboard nav |

Six hand-rolled interaction primitives remain on web, all candidates for shadcn/ui equivalents.

### Mobile (`apps/mobile/`)

| Component | File | Current impl | Issue |
|---|---|---|---|
| **Language switcher** | `components/layout/LanguageSwitcher.tsx` | Inline `absolute` dropdown, no Modal | Offscreen clipping, tap-through, no focus trap |
| **User menu** | `components/layout/UserMenu.tsx` | Inline `absolute` dropdown, no Modal | Same as above |
| **Dictionary popup** | `components/dictionary/DictionaryPopup.tsx` | RN `Modal` (correct portal) | Manual backdrop, no focus trap, no animation |
| **Subs search modal** | `components/video/SubsSearchResults.tsx` | RN `Modal` (correct portal) | Manual dismiss, no focus trap |
| **Tabbed panel** | `components/TabbedPanel.tsx` | Hand-rolled tabs (`as any` casts) | No keyboard nav, no accessibility |
| **Hamburger drawer** | `components/layout/HamburgerDrawer.tsx` | Slide-in panel | Manual animation, z-index management |

Six hand-rolled interaction primitives remain on mobile, all candidates for `@rn-primitives`.

---

## User Stories

- As a **mobile user**, I want language picker and user menu dropdowns to not be clipped offscreen when the header is near the top of a scrollable page.
- As a **keyboard user** (web), I want to Tab through a dropdown's options without focus escaping to the page behind it.
- As a **screen reader user**, I want modals and popups to announce themselves and trap focus so I don't get lost.
- As a **developer**, I want to add a new dropdown or modal without re-implementing portal rendering, focus management, and keyboard dismiss every time.
- As a **user on both platforms**, I want consistent dismiss behavior — Escape/back-button/backdrop-tap all work the same way across every overlay.

---

## Implementation Plan

### Phase 1: Web — Complete shadcn/ui Adoption

The web app already has shadcn/ui configured (`components.json`) and one component (Dialog). Extend to the remaining primitives.

#### 1.1 Popover (user menu, text action menu)

**Components to replace**: `UserMenu`, `TextActionMenu`

**shadcn component**: `Popover` (`@base-ui/react/popover`)

```bash
npx shadcn@latest add popover
```

**Files changed**:
- `apps/web/src/components/ui/popover.tsx` — new styled wrapper
- `apps/web/src/components/layout/user-menu.tsx` — refactor to `<Popover><PopoverTrigger>...`
- `apps/web/src/components/text-action-menu.tsx` — refactor to `<Popover>...`

**Benefits**: Portal rendering (no clipping), focus trapping, click-outside dismiss, ARIA `combobox`/`listbox` roles.

#### 1.2 Select (language level, voice picker)

**Components to replace**: `LanguageLevelSelect`, `VoicePicker`

**shadcn component**: `Select` (`@base-ui/react/select`)

```bash
npx shadcn@latest add select
```

**Files changed**:
- `apps/web/src/components/ui/select.tsx` — new styled wrapper
- `apps/web/src/components/language-level-select.tsx` — refactor to `<Select>...`
- `apps/web/src/components/voice-picker.tsx` — refactor to `<Select>...`

**Benefits**: Typeahead, keyboard navigation (arrow keys, Enter, Escape), proper `option`/`listbox` ARIA roles, scroll-to-selected, portal for long lists.

#### 1.3 Tabs (tabbed panel)

**Component to replace**: `TabbedPanel`

**shadcn component**: `Tabs` (`@base-ui/react/tabs`)

```bash
npx shadcn@latest add tabs
```

**Files changed**:
- `apps/web/src/components/ui/tabs.tsx` — new styled wrapper
- `apps/web/src/components/tabbed-panel.tsx` — refactor to use tabs primitive internally

**Benefits**: Arrow key navigation between tabs, proper `tablist`/`tab`/`tabpanel` ARIA roles, RTL support, focus ring management.

#### 1.4 Hover Card (dictionary popup)

**Component to replace**: `DictionaryPopup`

**shadcn component**: `HoverCard` (`@base-ui/react/hover-card`)

```bash
npx shadcn@latest add hover-card
```

**Files changed**:
- `apps/web/src/components/ui/hover-card.tsx` — new styled wrapper
- `apps/web/src/components/dictionary-popup.tsx` — refactor to `<HoverCard>...`

**Note**: The dictionary popup is triggered on tap/click (not hover) and needs to stay open for interaction. `Popover` may be more appropriate than `HoverCard`. Evaluate during implementation.

#### 1.5 Switch (settings toggles)

**Component to replace**: Settings toggle switches (currently using raw `<input type="checkbox">` or custom toggle)

**shadcn component**: `Switch` (`@base-ui/react/switch`)

```bash
npx shadcn@latest add switch
```

**Files changed**:
- `apps/web/src/components/ui/switch.tsx` — new styled wrapper
- `apps/web/src/app/[l1]/[l2]/settings/` — replace raw toggles with `<Switch>`

**Benefits**: Proper `switch` ARIA role (vs `checkbox`), animated thumb, focus ring.

### Phase 2: Mobile — Adopt @rn-primitives

Per ADR-0014, adopt `@rn-primitives` headless primitives wrapped with NativeWind and shared design tokens.

#### 2.0 Pre-requisites

```bash
cd apps/mobile
npx expo install @rn-primitives/dialog @rn-primitives/select @rn-primitives/switch @rn-primitives/tabs
npx expo install react-native-reanimated  # promote to direct dependency (currently transitive via Expo)
```

Create shared animation presets:
- `apps/mobile/lib/animations.ts` — spring-based enter/exit transitions using `react-native-reanimated`

#### 2.1 Dialog (language switcher, user menu, subs search)

**Components to replace**: `LanguageSwitcher`, `UserMenu`, `SubsSearchResults` modal

**Files created**:
- `apps/mobile/components/ui/dialog.tsx` — styled Dialog wrapper (~60-80 lines)

**Pattern** (mirrors web's `dialog.tsx`):
```tsx
import { Dialog as DialogPrimitive } from '@rn-primitives/dialog';
import Animated from 'react-native-reanimated';
import { dialogEnter, dialogExit } from '@/lib/animations';

function Dialog({ children, ...props }: DialogPrimitive.RootProps) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

function DialogTrigger({ children, className, ...props }: DialogPrimitive.TriggerProps) {
  return (
    <DialogPrimitive.Trigger className={className} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
}

function DialogContent({ children, className, ...props }: DialogPrimitive.ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="absolute inset-0 bg-black/40" />
      <Animated.View entering={dialogEnter} exiting={dialogExit}>
        <DialogPrimitive.Content
          className={`rounded-xl bg-card p-4 border border-border ${className ?? ''}`}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </Animated.View>
    </DialogPrimitive.Portal>
  );
}
```

**Files refactored**:
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — inline dropdown → `<Dialog><DialogTrigger>...<DialogContent>...`
- `apps/mobile/components/layout/UserMenu.tsx` — inline dropdown → `<Dialog>...`
- `apps/mobile/components/video/SubsSearchResults.tsx` — raw `Modal` → `<Dialog>...`

**Accessibility verification** (after LanguageSwitcher migration): Verify with VoiceOver (iOS) and TalkBack (Android) that focus is trapped inside the dialog and the backdrop dismiss gesture works. React Native's accessibility model differs materially from web ARIA.

#### 2.2 Select (settings dropdowns)

**Component**: Settings dropdowns that currently use inline `Pressable` lists

**Validation checkpoint**: Before committing to `@rn-primitives/select`, verify it can handle the LanguageSwitcher's full UX: text input for search, `ScrollView` with `keyboardShouldPersistTaps="handled"`, and popular/all categorized sections. If `@rn-primitives/select` cannot compose with these elements, use the Dialog primitive instead — render a Dialog containing the same searchable list. Select may not need a dedicated primitive.

**Files created**:
- `apps/mobile/components/ui/select.tsx` — styled Select wrapper

**Files refactored**:
- `apps/mobile/app/(tabs)/(me)/settings.tsx` — replace hand-rolled selects with `<Select>`

#### 2.3 Switch (settings toggles)

**Component**: Settings toggle switches

**Files created**:
- `apps/mobile/components/ui/switch.tsx` — styled Switch wrapper

**Files refactored**:
- `apps/mobile/app/(tabs)/(me)/settings.tsx` — replace RN `Switch` with styled `<Switch>`

#### 2.4 Tabs (tabbed panel)

**Component to replace**: `TabbedPanel`

**Motivation**: Structural improvements — focus management, keyboard navigation, and ARIA `tablist`/`tabpanel` roles. Note: the `as any` type casts in the current `TabbedPanel` (from the 2026-07-25 tsc fix commit) are about `React.Children.toArray` typing and will not be resolved by `@rn-primitives/tabs` unless the child-passing structure is also refactored. The tsc fixes are a separate concern.

**Files created**:
- `apps/mobile/components/ui/tabs.tsx` — styled Tabs wrapper

**Files refactored**:
- `apps/mobile/components/TabbedPanel.tsx` — refactor to use `@rn-primitives/tabs` internally

#### 2.5 Drawer (hamburger menu)

**Component to replace**: `HamburgerDrawer`

**Evaluation**: `@rn-primitives` does not have a dedicated Drawer primitive. Default approach: use `@rn-primitives/dialog` configured with a slide-from-left animation and full-height content. If the feel isn't native enough, evaluate a dedicated drawer library (e.g., `zeego/drawer`) as a follow-up. The drawer is lower priority than the other primitives because its current hand-rolled implementation (slide-in panel + backdrop `Pressable`) has fewer structural bugs than inline dropdowns.

---

## API Endpoints

No new API endpoints. All interaction primitives are pure client-side behavior.

---

## States

Each migrated component must handle:

| State | Handling |
|---|---|
| **Open** | Portal rendered, backdrop visible, focus trapped inside |
| **Closed** | Portal unmounted, focus restored to trigger element |
| **Opening transition** | Animation preset from `lib/animations.ts` (mobile) or `tw-animate-css` (web) |
| **Closing transition** | Reverse animation, then unmount |
| **Nested overlay** | Only one overlay open at a time; opening a second closes the first (Dialog handles this) |
| **Keyboard/screen reader** | Focus trap active, Escape/back-button dismisses, ARIA roles correct |
| **Empty content** | N/A — overlays always have content |
| **Error inside overlay** | Error state rendered inside the overlay; backdrop dismiss works as escape hatch |

---

## Dependencies

- **Web**: `@base-ui/react` (already installed), `shadcn` CLI (already installed), `tw-animate-css` (already installed)
- **Mobile**: `@rn-primitives/dialog`, `@rn-primitives/select`, `@rn-primitives/switch`, `@rn-primitives/tabs` (new), `react-native-reanimated` (promoted to direct dependency; currently transitive via Expo)
- **Both**: `packages/shared/tokens.ts` (ADR-0011) for design tokens used in styled wrappers

---

## Testing Checklist

### Web
- [ ] **UserMenu**: Click avatar → dropdown opens; click outside → closes; press Escape → closes; Tab cycles through items
- [ ] **TextActionMenu**: Select word → menu appears near selection; click outside → closes; doesn't overflow viewport
- [ ] **VoicePicker/LanguageLevelSelect**: Click → options open; type to filter; Enter selects; Escape closes; scroll position preserved
- [ ] **TabbedPanel**: Arrow keys navigate tabs; Tab enters tab panel; focus ring visible
- [ ] **DictionaryPopup**: Click word → popup opens; doesn't clip in scrollable containers; click outside → closes
- [ ] **Settings toggles**: Click toggles; keyboard accessible; screen reader announces "on/off"

### Mobile
- [ ] **LanguageSwitcher**: Tap L2 button → picker opens as modal; swipe down / back button → dismisses; doesn't clip at screen edges
- [ ] **UserMenu**: Tap avatar → menu opens; tap outside → closes; back button → closes
- [ ] **DictionaryPopup**: Tap word → popup opens; doesn't render offscreen; tap backdrop → closes
- [ ] **SubsSearchResults modal**: Opens as page sheet; swipe down → dismisses; back button → dismisses
- [ ] **TabbedPanel**: Swipe between tabs; tab labels don't overflow; active indicator animates
- [ ] **HamburgerDrawer**: Slide from left; backdrop dims page; swipe right or tap backdrop → closes
- [ ] **All overlays**: Only one open at a time; opening a second automatically closes the first

---

## Migration Order

1. **Web Phase 1.1** — Popover (high impact: UserMenu on every page)
2. **Mobile Phase 2.1** — Dialog (highest bug count: LanguageSwitcher + UserMenu + SubsSearch)
3. **Mobile Phase 2.4** — Tabs (focus management + keyboard nav for TabbedPanel)
4. **Web Phase 1.3** — Tabs (parallel to mobile)
5. **Web Phase 1.2** — Select (VoicePicker, LanguageLevelSelect)
6. **Web Phase 1.5** — Switch (settings toggles)
7. **Mobile Phase 2.2** — Select (settings dropdowns)
8. **Mobile Phase 2.3** — Switch (settings toggles)
9. **Web Phase 1.4** — HoverCard/Popover (DictionaryPopup — evaluate which primitive fits)
10. **Mobile Phase 2.5** — Drawer (HamburgerDrawer — evaluate approach)
