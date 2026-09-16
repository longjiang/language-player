# ADR-0047 — Mobile inputs stay visible: a keyboard-aware layout, not a bigger scroll area

**Status:** Accepted (2026-09-17)
**See also:**
- [SPEC-066: SRS Review Page](../specs/066-srs-review-page.md) — the spell answer row this was found on
- [SPEC-095: Interactive Textbook](../specs/095-interactive-textbook.md) — the task inputs fixed with the same tooling
- [ARCH-027: Per-aspect logging](../arch/027-per-aspect-logging.md) — the `srs` domain the diagnostics use
- [ARCH-028: Local development runbook](../arch/028-local-development-runbook.md) — the dev-build pipeline a native module addition forces
- [ADR-0014: RN interaction primitives](0014-rn-primitives-interaction-primitives.md) — the same "one shared primitive, used everywhere" instinct

---

## Context

In SRS spell mode, the answer field disappeared behind the software keyboard
once the context text was long. Scrolling could not reveal it, which is the
detail that identifies the cause: it is not a scroll bug, it is a **layout that
has no room left to scroll**.

The review card's scroll view was sized `flex-1` / `max-h-full`, so its viewport
was the full window height minus the header. iOS does **not** resize the window
for the keyboard — the keyboard overlays it — so the viewport extended behind
the keyboard, and maximum scroll offset placed the bottom of the content (the
answer row) exactly at the bottom of that taller viewport, i.e. underneath the
keyboard. Nothing on the screen added a keyboard inset: no
`KeyboardAvoidingView`, no `automaticallyAdjustKeyboardInsets`, no
keyboard-height bottom padding.

Two facts about the platform were verified in the React Native 0.86 source
rather than assumed, because they determine which fixes are real:

| Fact | Where |
|---|---|
| iOS `automaticallyAdjustKeyboardInsets` does more than add an inset — it resolves the focused responder's frame and scrolls it above the keyboard | `node_modules/react-native/React/Views/ScrollView/RCTScrollView.m`, `_keyboardWillChangeFrame:` → `reactUpdateResponderOffsetForScrollView:` |
| There is no equivalent on Android: no `automaticallyAdjustKeyboardInsets` handling exists in the Android scroll view at all | `ReactAndroid/.../views/scroll/ReactScrollView.java` |

Android is the harder platform here, not the easier one: `apps/mobile/android/gradle.properties`
sets `edgeToEdgeEnabled=true`, and under edge-to-edge the manifest's
`android:windowSoftInputMode="adjustResize"` is inert, so the window no longer
resizes for the IME and the built-in `KeyboardAvoidingView` path that Android
apps historically relied on is not dependable.

The same defect existed a second time, unreported: `TaskShell` is a `flex-1`
`ScrollView` hosting an entire textbook task — fill-in blanks inside passages,
dictation boxes, free-write areas — with no keyboard handling at all.

## Decision

**Adopt [`react-native-keyboard-controller`](https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/)
(app-wide, via `KeyboardProvider` at the root) and fix input visibility by
changing where an input lives, not by making the scroll area bigger.**

1. **`KeyboardProvider` wraps the whole app** (`apps/mobile/app/_layout.tsx`,
   inside `GestureHandlerRootView`), so any screen can read live keyboard
   metrics. Without it the keyboard APIs report zeros.

2. **A bottom-anchored answer surface is pinned, not scrolled.** The spell
   answer row is a sibling of the card wrapped in the library's
   `KeyboardAvoidingView` (`behavior="padding"`, `automaticOffset`), so when the
   keyboard opens the card region shrinks to the space above it and the answer
   row sits directly on top of the keyboard. This is the only arrangement that
   *guarantees* visibility: it does not depend on content height, scroll
   position, IME size, or platform. The rating buttons live in the same
   keyboard-avoiding region for the same reason — after a submit they were
   appearing behind a keyboard that was still up.

3. **An input that belongs inline in a document stays inline, and the scroll
   view becomes keyboard-aware.** `KeyboardAwareScrollView` insets itself and
   scrolls the focused input into view on both platforms, which is the right
   answer where pinning is not (the textbook's blanks must stay where they are
   in the passage). It is reached through
   `apps/mobile/components/ui/keyboard-aware-scroll-view.tsx`, which registers
   NativeWind's class props for the third-party component the way `GlyphText`
   already does.

4. **`keyboardShouldPersistTaps="handled"` on any scroll surface hosting
   inputs.** Without it the first tap on the next field is swallowed by the
   scroll view as a dismiss gesture.

5. **A focused input is dismissed explicitly once it stops being the thing the
   user needs**, instead of relying on the blur that unmounting the field
   happens to cause.

**Rejected: `KeyboardStickyView`.** It translates its children up while leaving
them in flow, so the pinned row overlaps the card behind the keyboard. With
`KeyboardAvoidingView(padding)` the card *shrinks* instead, so nothing is ever
covered — including the top of the card, which matters here because the card is
the thing being read.

**Rejected: adding `automaticallyAdjustKeyboardInsets` alone** (the
zero-dependency option). It does scroll the focused input into view on iOS, but
on a long paragraph it scrolls the beginning of the sentence out of view, and it
does nothing on Android. It is a reasonable stop-gap for a screen that cannot
restructure; it is the wrong default for one that can.

## Consequences

- **A native rebuild is required.** The library is a native module: an existing
  dev client does not contain it, and importing it without one fails loudly at
  runtime. Builds go through the tracked pipeline (`scripts/dev-build.mjs`,
  ledger row in `docs/versioning/build-ledger.md`) and need explicit consent —
  see [ARCH-028](../arch/028-local-development-runbook.md).
- **`react-native-reanimated` is a real dependency of the keyboard library.**
  It was already installed and already linked natively (4.5.3, via
  `expo-router`), so nothing changed — but the pairing is now load-bearing and
  must not be pruned.
- **Screens that pin a bottom-anchored input have a layout rule to follow**:
  the input is a sibling of the scrolling content, inside the keyboard-avoiding
  region. A future screen that puts a typed answer back at the end of scroll
  content re-introduces exactly this bug.
- **Scrabble is unaffected and must stay that way.** Its tiles are dragged, not
  typed, and its hidden field never summons the soft keyboard, so it keeps the
  card's native scroll-gesture blocking (`Gesture.Native()` +
  `blocksExternalGesture`) and stays inside the scroll view. Replacing a scroll
  view that participates in that gesture composition with a composite component
  is a behavior change, not a refactor — which is also why the review card keeps
  the core `ScrollView` rather than becoming a `KeyboardAwareScrollView`.
- **Diagnostics are permanent, at info level.** The spell screen logs the answer
  row's pinned state and the keyboard height the library reports
  (`[LP Mobile] [srs]`). A reported height of `0` is the one failure mode that
  looks identical on screen to a covered layout — missing provider or a dev
  build older than the library — so it must be observable.

## Alternatives considered

| Option | Why not |
|---|---|
| iOS `automaticallyAdjustKeyboardInsets` only | Scrolls the sentence start out of view on long text; no Android answer. Kept as the fallback shape for screens that cannot restructure. |
| React Native's built-in `KeyboardAvoidingView` | Inconsistent across platforms, and unreliable on Android under edge-to-edge (the manifest's `adjustResize` is inert). |
| `KeyboardStickyView` for the pinned row | Overlaps the card instead of shrinking it. |
| Making the card shorter by hand (fixed heights, per-device constants) | Does not track IME size or hardware keyboards; reintroduces the failure the moment the keyboard changes. |
| Leaving the answer row in the scroll content and adding bottom padding to the content | Gains scroll range, but the learner still has to scroll to reach the answer, and on the reported long paragraph the blanked sentence scrolls away. |
