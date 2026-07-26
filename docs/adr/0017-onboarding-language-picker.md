# ADR-0017: Unified Language Picker — Onboarding + Header, Single Responsive Component

**Date**: 2026-07-26
**Status**: accepted

## Context

A language picker appears in two places: the onboarding flow (after registration) and the header language switcher (changing languages at any time). These should use the same component. Currently, both web and mobile apps have diverged across all three surfaces:

| Aspect | Web (`language-picker.tsx`) | Mobile (`select-l1.tsx` → `select-l2.tsx`) |
|---|---|---|
| **Onboarding** | Single page, `LanguagePicker` with `showTitle` | Two separate screens (`select-l1` → `select-l2`) |
| **Header switcher** | `LanguagePicker` reused inside a Dialog | Inline `LanguagePickerContent` — completely separate from onboarding |
| **L1/L2 selection** | Always pair-based: choose both then confirm | Onboarding: sequential. Header: individual per-dialog |
| **Component reuse** | ✅ One `LanguagePicker` for both onboarding + header | ❌ Two separate implementations |
| **Chinese script toggle** | Simplified/Traditional segmented control | Not implemented |
| **iPad / tablet** | Grid collapses to single column | No adaptation — full-screen lists |
| **RTL support** | `dir` attribute + RTL indicator | None |

The two-screen mobile flow works on phones but feels wasteful on iPad-sized screens (390pt iPhone SE vs ~1024pt iPad). The web's bi-panel layout looks great on wide screens but stacks L1 on top of L2 on narrow screens, forcing the user to scroll past all 31 L1 options to reach L2.

Critically, the mobile header language switcher (`apps/mobile/components/layout/LanguageSwitcher.tsx`) has its own inline `LanguagePickerContent` that duplicates the search, filter, and list-rendering logic from the onboarding screens. This means three separate code paths for the same fundamental UX: pick a language.

This ADR evaluates three approaches to unify the language picker **everywhere** — onboarding and header — across both platforms and all screen sizes.

## Options Considered

### Option A: Web's Current Approach (Bi-panel, Stacks on Narrow)

Keep the web's existing `LanguagePicker` — `md:grid-cols-2` so it's side-by-side on wide screens, single-column stacked on narrow.

```
┌─────────────────┐    ┌──────────────────────────────────┐
│  🌐 I speak      │    │  🌐 I speak     │  📖 I'm learning│
│  ▸ English       │    │  ▸ English      │  ▸ Chinese      │
│  ▸ Chinese       │    │  ▸ Chinese      │  ▸ Japanese     │
│  ...             │    │  ...            │  ...            │
├─────────────────┤    ├─────────────────┴─────────────────┤
│  📖 I'm learning │    │  [English] → [Chinese]  [Continue]│
│  ▸ Chinese       │    └──────────────────────────────────┘
│  ▸ Japanese      │
│  ...             │
└─────────────────┘
   Narrow (<768px)              Wide (≥768px)
```

**Pros:**
- Proven UX — already in production on web
- Single code path
- Chinese script toggle already implemented

**Cons:**
- Narrow layout forces L1 and L2 scrolls in one page — on a phone the user scrolls past all L1 options before reaching any L2 option. With 31 L1s, that's a lot of dead scroll space when you already know your target language.
- No step indicator (confusing: "am I picking L1 or L2 right now?")
- Doesn't match mobile navigation patterns (users expect step-by-step flows)

### Option B: Mobile's Current Approach (Two Separate Screens)

Keep mobile's two-screen flow (`select-l1.tsx` → `select-l2.tsx`). Port the web to match (a `/language-select/l1` → `/language-select/l2` flow).

```
┌──────────────┐    ┌──────────────┐
│  Step 1 of 2  │    │  Step 2 of 2  │
│              │    │              │
│  🌐 I speak   │    │  📖 I'm learn │
│  ▸ English    │    │  ▸ Chinese    │
│  ▸ Chinese    │    │  ▸ Japanese   │
│  ▸ Spanish    │    │  ▸ Korean     │
│  ...          │    │  ...          │
│              │    │              │
│  [Continue]   │    │  [Let's Go]   │
└──────────────┘    └──────────────┘
```

**Pros:**
- Clear step progression — user knows where they are
- Familiar mobile UX pattern (setup wizards, registration flows)
- Works great on phones (single focused task per screen)

**Cons:**
- Two routes to maintain on both platforms
- No iPad optimization — shows a narrow phone-like screen on a 12.9" display
- Extra navigation tap — users who know both languages must advance through an extra screen
- No summary/confirmation before committing

### Option C: Single Responsive Screen with Step Indicator

A single route that adapts its layout based on screen width. **Narrow**: step-based with a tab bar to toggle between L1 and L2 lists. **Wide**: bi-panel with both lists visible side-by-side.

#### Narrow (<640px) — Step-based with tab bar

```
┌─────────────────────────────┐
│  Choose Your Languages       │
│                              │
│  [ I speak ■ ] [ Learning ]  │  ← segmented tabs
│  ─────────────────────────   │
│  🔍 Search languages...      │
│                              │
│  POPULAR LANGUAGES           │
│  ┌─────────────────────────┐ │
│  │ 🌐  English        EN   │ │  ← tapping selects +
│  ├─────────────────────────┤ │    auto-switches to
│  │ 中文  Chinese      ZH   │ │    the other tab
│  ├─────────────────────────┤ │
│  │ español  Spanish   ES   │ │
│  └─────────────────────────┘ │
│                              │
│  ALL LANGUAGES               │
│  ...                         │
│                              │
│  ─────────────────────────   │
│  English  →  (pick target)   │  ← summary bar at bottom
└─────────────────────────────┘
```

**Key behaviors on narrow:**
- Two tabs: "I speak" (L1) and "Learning" (L2)
- Tapping a language in the L1 tab selects it and auto-switches to the L2 tab (saves a tap vs requiring the user to manually switch)
- Tapping a language in the L2 tab selects it and reveals the confirm button
- Bottom summary bar shows current selection: `English → Chinese`
- If L2 is `zh`, a script toggle appears in the summary bar

#### Wide (≥640px) — Bi-panel

```
┌──────────────────────────────────────────────┐
│           Choose Your Languages              │
├──────────────────────┬───────────────────────┤
│  🌐 I speak          │  📖 I'm learning      │
│                      │                       │
│  🔍 Search...        │  🔍 Search...         │
│                      │                       │
│  POPULAR             │  POPULAR              │
│  ▸ English    ◄──    │  ▸ Chinese     ◄──    │
│  ▸ Chinese           │  ▸ Japanese           │
│  ▸ Spanish           │  ▸ Korean             │
│  ...                 │  ...                  │
│  ──────────────      │  ──────────────       │
│  ALL LANGUAGES       │  ALL LANGUAGES        │
│  ...                 │  ...                  │
├──────────────────────┴───────────────────────┤
│  English  →  Chinese      [Simpl/Trad]  ▶ Go │
└──────────────────────────────────────────────┘
```

**Key behaviors on wide:**
- Both panels visible simultaneously, matching web's existing bi-panel UX
- L1 panel has a distinct accent color (`bg-primary/text-primary-foreground`) on selected item
- L2 panel has a warm accent (`bg-warm-500/text-white`) on selected item
- Summary bar at bottom with script toggle (when L2=zh) and "Go" button
- "Go" button disabled until both L1 and L2 are selected

#### Summary comparison

| | Narrow | Wide |
|---|---|---|
| **Layout** | Single column with tabs | Two columns side-by-side |
| **L1/L2 visible** | One at a time (tab-switch) | Both simultaneously |
| **Selection** | Tap selects + auto-advances tab | Tap toggles highlight |
| **Confirm** | Auto shows when both selected | "Go" button in summary bar |
| **Script toggle** | In summary bar (when L2=zh) | In summary bar (when L2=zh) |

#### Navigation

Both mobile and web use the same responsive component. The shell differs:

```tsx
// Mobile: apps/mobile/app/select-language.tsx
export default function SelectLanguageScreen() {
  const { setL1Lang, setL2Lang } = useLanguage();
  async function handleConfirm(l1: string, l2: string) {
    await setL1Lang(l1);
    await setL2Lang(l2);
    router.replace('/(tabs)');
  }
  return <LanguagePicker onConfirm={handleConfirm} showTitle />;
}
```

```tsx
// Web: apps/web/src/app/language-select/page.tsx
export default function LanguageSelectPage() {
  const router = useRouter();
  function handleConfirm(l1: string, l2: string) {
    router.push(`/${l1}/${l2}/explore`);
  }
  return <LanguagePicker onConfirm={handleConfirm} showTitle />;
}
```

The responsive logic lives inside `LanguagePicker` (or a component with the same API), driven by `useWindowDimensions()` on mobile and CSS `md:` breakpoints on web.

#### Chinese script toggle parity

The web's `LanguagePicker` has a Simplified/Traditional toggle when L2 is `zh`. This must be added to the mobile flow:

- **Narrow**: a segmented control in the summary bar at the bottom
- **Wide**: same treatment as web — a segmented control in the summary bar

On mobile, selecting traditional calls `setUseTraditional(true)` which persists to settings (same as web's `lib/settings.ts`).

## Decision

**Accept Option C: Single responsive screen with step indicator → columns.**

The narrow layout is a strict improvement over both existing approaches:
- Over Option A (web's stack): the user doesn't scroll past 31 L1s to reach L2. Tabs make it clear what they're picking.
- Over Option B (mobile's two screens): the user saves one navigation step. The auto-advance on L1 selection is one tap vs two.

The wide layout is identical to the web's current bi-panel UX, which is already tested and working. The same component serves both platforms.

## Consequences

### Positive

- **Single component** shared between mobile and web (same props, same responsive logic)
- **Phone-optimized** — tabs + auto-advance is faster than scrolling or two-step navigation
- **iPad-native** — bi-panel layout makes full use of screen real estate
- **Same UX on both platforms** — users switching between web and mobile get a consistent onboarding experience
- **Chinese script toggle** now works on mobile too
- **Step clarity** — tabs make it obvious what the user is selecting

### Negative

- **More complex component** — must handle two layouts, tab state, auto-advance, summary bar, script toggle
- **Mobile needs `useWindowDimensions()`** to switch layout — must re-render on orientation change
- **Web needs CSS media queries** for the breakpoint — the existing `md:grid-cols-2` pattern works but needs the step-indicator variant for narrow
- **Two code paths to maintain** inside one component — the render logic for narrow vs wide is quite different even though the data flow is the same

### Component API

The `LanguagePicker` component is shared between onboarding (full-screen) and header (dialog). Its props:

```tsx
interface LanguagePickerProps {
  /** Initial L1 code. Defaults to 'en'. */
  initialL1?: string;
  /** Initial L2 code. */
  initialL2?: string;
  /** Called when user confirms a valid L1+L2 pair. */
  onConfirm: (l1: string, l2: string) => void;
  /** Called when user dismisses (for modal/header usage). */
  onDismiss?: () => void;
  /** Show the welcome title + subtitle (for onboarding). */
  showTitle?: boolean;
  /** Show a close/dismiss button (for dialog/header usage). */
  showClose?: boolean;
}
```

**Usage across both platforms:**

```tsx
// ── Mobile onboarding (full screen) ──
// apps/mobile/app/select-language.tsx
<LanguagePicker onConfirm={handleConfirm} showTitle />

// ── Web onboarding (full screen) ──
// apps/web/src/app/language-select/page.tsx
<LanguagePicker onConfirm={handleConfirm} showTitle />

// ── Mobile header (dialog) ──
// apps/mobile/components/layout/LanguageSwitcher.tsx
<Dialog.Root>
  <Dialog.Trigger>...</Dialog.Trigger>
  <Dialog.Portal>
    <LanguagePicker
      initialL1={l1Lang.code}
      initialL2={l2Lang.code}
      onConfirm={handleConfirm}
      onDismiss={() => setOpen(false)}
      showClose
    />
  </Dialog.Portal>
</Dialog.Root>

// ── Web header (dialog) — already works like this ──
// apps/web/src/components/layout/language-switcher.tsx
<Dialog>
  <DialogTrigger>...</DialogTrigger>
  <DialogContent>
    <LanguagePicker
      initialL1={l1.code}
      initialL2={l2.code}
      onConfirm={handleConfirm}
      showClose
    />
  </DialogContent>
</Dialog>
```

The component is self-contained: it receives initial values and a callback when the user commits. It does not know whether it's in a full-screen or dialog context — the shell handles that.

This matches the web's current architecture exactly. The mobile header is the only place that needs refactoring (swap its inline `LanguagePickerContent` for the shared `LanguagePicker`).

### Files to Create/Modify

- `apps/mobile/app/select-language.tsx` — new, replaces `select-l1.tsx` and `select-l2.tsx`
- `apps/mobile/app/_layout.tsx` — register new route, remove old routes
- `apps/mobile/app/register.tsx` — redirect to `/select-language` instead of `/select-l1`
- `apps/mobile/components/layout/LanguageSwitcher.tsx` — replace inline `LanguagePickerContent` with shared `LanguagePicker` in a dialog
- `apps/web/src/components/language-picker.tsx` — add narrow step-indicator layout alongside existing bi-panel
- `apps/mobile/app/select-l1.tsx` — delete
- `apps/mobile/app/select-l2.tsx` — delete

### Revisiting

If the responsive component grows too complex (narrow vs wide are essentially different UIs sharing data logic), split into two leaf components with a shared hook for search/filter logic. The ADR principle of a single route + responsive layout should remain, but the internal implementation can be factored.
