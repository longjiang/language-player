# SPEC-020: iPad & Responsive Layout — Full Compatibility

## Metadata
- **Spec ID**: SPEC-020
- **Feature**: iPad responsive layout — landscape, split view, slide over, full-screen, windowed mode
- **Status**: draft
- **Created**: 2026-07-26
- **ROADMAP Phase**: Phase 8 — iPad & Responsive Layout
- **Depends on**: Phase 6 (Interaction Primitives — already complete ✅)
- **See also**:
  - [STATUS.md](../../apps/mobile/STATUS.md) — Phase 8 task list
  - [ADR-0015: Settings UI and Search](../adr/0015-settings-ui-and-search.md) — iPad split view design
  - [ADR-0014: Interaction Primitives Strategy](../adr/0014-rn-primitives-interaction-primitives.md)

---

## Overview

The mobile app currently locks orientation to portrait (`app.json`: `"orientation": "portrait"`) and has several hardcoded layout assumptions that break down on iPad — particularly in split view, slide over, and landscape modes. This spec documents every issue found and provides concrete fixes.

The app declares `"supportsTablet": true` and already has some responsive patterns (settings split view at ≥600px, video landscape detection, language picker wide/narrow switch). The remaining gaps are concentrated in three areas: orientation lock, grid column counts, and fixed-width UI elements that don't scale down for narrow panes.

---

## Evaluation: What Works Well

These responsive patterns are already in place and do not need changes:

| Component | What It Does | Verdict |
|---|---|---|
| **Settings** | Detects `width >= 600` → sidebar (`w-64`) + detail panel. Narrow mode uses stack navigation. Well-implemented split view. | ✅ |
| **Video Player (Watch)** | Detects `screenWidth / screenHeight > 1` for landscape → overlays subtitles on video vs. band below. Correct logic. | ✅ |
| **Language Picker** | `LanguagePickerWide` / `LanguagePickerNarrow` switch at `SM_BREAKPOINT` (640px). | ✅ |
| **EPUB Pagination** | Uses `useWindowDimensions` — adapts page dimensions to any screen size. | ✅ |
| **Safe Areas** | `useSafeAreaInsets()` in Header, UserMenu, live-tv, tv-shows. Handles iPad rounded corners and home indicator. | ✅ |
| **Flex Layouts** | Extensive use of `flex-1`, `flex-row`, NativeWind gap utilities — components fill available space naturally. | ✅ |
| **Portal Overlays** | `Dialog.Content` uses `w-[90%] max-w-md` — centered popovers scale appropriately on any screen. `Dialog.SheetContent` is full-width bottom sheet. `Dialog.DrawerContent` slides from the right. All use `@rn-primitives` for accessibility. | ✅ |

---

## Issues by iPad Mode

### 1. Portrait Lock (affects all modes)

**`app.json`:**
```json
"orientation": "portrait"
```

This locks the **entire app** to portrait — on iPhone AND iPad. On iPad, users expect to rotate freely. The video player already has landscape detection logic (`isWide = screenWidth / screenHeight > 1`) — the lock simply prevents it from ever activating.

**Fix:** Change to `"default": "portrait"` (or remove the key entirely). On iPhone, iOS respects the default orientation. On iPad, all four orientations become available. This is a one-line change with no code impact since the watch screen already handles landscape.

**Risk:** After unlocking, users may encounter layouts that assume portrait. The other issues below address those cases.

---

### 2. Full-Screen iPad — Portrait (820×1180) and Landscape (1180×820)

#### 2a. Video Grid — Hardcoded 2 Columns

**File:** `components/video/VideoGrid.tsx`
```tsx
numColumns={2}
```

On 820px width, each card is ~400px wide — thumbnails are enormous, layout feels sparse and wastes space. Users see only 4–6 videos per screen when 9–12 would be appropriate.

**Fix:** Make `numColumns` responsive to screen width:

```tsx
import { useWindowDimensions } from 'react-native';

// Inside the component:
const { width } = useWindowDimensions();
const numColumns = width < 400 ? 1 : width < 700 ? 2 : width < 1000 ? 3 : 4;
```

| Width Range | Columns | Typical Context |
|---|---|---|
| < 400px | 1 | iPhone SE, 1/3 iPad split |
| 400–699px | 2 | iPhone, iPad 1/2 split portrait |
| 700–999px | 3 | iPad full-screen portrait, iPad 1/2 split landscape |
| ≥ 1000px | 4 | iPad full-screen landscape |

#### 2b. Content Pages — No Max-Width

**Affected screens:** Explore, Search, Music, Watch History, Saved Words, Dictionary, TV Shows, Live TV, Channel Detail, Docs

On 820px+ screens, single-column content stretches edge-to-edge, making lines of text 80+ characters wide — hard to read. The web app uses `max-w-3xl` containers for the same reason.

**Fix:** Wrap page content in a centered container:

```tsx
<View className="flex-1 bg-background">
  <View className="flex-1 max-w-3xl w-full self-center">
    {/* existing page content */}
  </View>
</View>
```

Or, add a shared `PageContainer` component in `components/layout/`:

```tsx
// components/layout/PageContainer.tsx
import { View } from 'react-native';

export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 max-w-3xl w-full self-center">
        {children}
      </View>
    </View>
  );
}
```

**Not all screens need this.** The video watch screen, EPUB reader, and web reader benefit from full-width content. The pattern should be applied selectively to list/grid/search pages.

#### 2c. Header App Name Threshold

**File:** `components/layout/Header.tsx`
```tsx
const showAppName = screenWidth >= SM_BREAKPOINT; // 640
```

At 640px on iPad portrait (820px), the app name shows. This is fine. However, on iPad 1/2 split view portrait (~438px), it hides. Could lower to 500px for iPad, but this is a minor cosmetic preference — not a bug.

---

### 3. 50/50 Split View (~438px per pane, landscape only on most iPads)

This mode is only available in landscape on iPads (except 12.9" which supports it in portrait too). The portrait lock currently prevents it entirely — fixing issue #1 enables this mode.

#### 3a. Settings Sidebar — Too Wide for Split Pane

**File:** `app/(tabs)/(me)/settings/index.tsx`
```tsx
<View className="w-64 border-r border-border">
```

At 438px pane width, `w-64` (256px) occupies **58%** of the pane, leaving only ~180px for the detail panel. Settings forms with sliders, toggles, and segmented controls need at least 300px to be usable.

**Fix:** Cap sidebar width as a fraction of available width:

```tsx
const { width } = useWindowDimensions();
const isWide = width >= 600;
const sidebarWidth = Math.min(256, width * 0.4);
```

At 438px: `Math.min(256, 175)` → 175px sidebar, 263px detail — much more usable. At full iPad: `Math.min(256, 328)` → 256px sidebar (original behavior preserved).

**Alternative:** If `width - 256 < 320` (detail pane too narrow), fall back to narrow mode with stack navigation:

```tsx
const isWide = width >= 600 && (width - 256) >= 320;
```

#### 3b. Video Grid — 2 Columns Borderline

At 438px, `numColumns={2}` gives ~215px per card. This is acceptable for browsing but thumbnails are small (~121×68px). With the responsive column fix (2a), this falls into the 2-column range — correct behavior. No additional fix needed.

#### 3c. Drawer — Dominates Split Pane

**File:** `components/layout/HamburgerDrawer.tsx`

At 438px, the `w-64` (256px) drawer covers 58% of the pane — it feels like a full-page nav rather than a drawer overlay. The drawer should never exceed 60% of screen width.

**Fix:** Cap drawer width in `Dialog.DrawerContent`:

```tsx
// In HamburgerDrawer.tsx:
const { width: screenWidth } = useWindowDimensions();
const drawerWidth = Math.min(256, screenWidth * 0.6);
// Pass to DrawerContent via className or a width prop
```

Or, add a `maxWidth` prop to `DrawerContent` in `dialog.tsx`:

```tsx
type DrawerContentProps = DialogPrimitive.ContentProps & {
  className?: string;
  topOffset?: number;
  open?: boolean;
  /** Maximum drawer width. Default 256. */
  maxWidth?: number;
};

// In the style:
style={{ width: Math.min(256, maxWidth ?? 256) }}
```

---

### 4. 1/3 Split View (~320px)

#### 4a. Video Grid — 2 Columns Unreadable

At 320px, `numColumns={2}` gives ~152px per card. Thumbnails are ~85×48px with 12px of text below. Cards become illegible. The responsive column fix (2a) puts this at 1 column — correct.

#### 4b. Drawer — Near Full-Screen

At 320px, `w-64` (256px) = 80% of screen. With the 60% cap (3c), it would be 192px — still large but at least some content is visible behind it.

#### 4c. Settings

Width < 600, so narrow mode (stack navigation, no sidebar) kicks in. Correct behavior already. No fix needed.

---

### 5. Slide Over (~320px)

Same as 1/3 split view. All fixes above apply. Additionally:

- The app does not handle the Slide Over dismissal gesture specially — standard iOS behavior applies.
- No issues with safe area insets — `useSafeAreaInsets` handles the Slide Over window correctly.

---

### 6. Window Mode — Apple Silicon Mac (Designed for iPad)

When running on Apple Silicon Macs, the app can be resized to arbitrary dimensions. There's no minimum window size set.

| Window Size | Concern |
|---|---|
| < 300px | Text truncation, overflow. But users rarely make windows this small. |
| 300–500px | Behaves like 1/3 split view — fixes above cover this range. |
| 500–820px | Behaves like 50/50 split or iPad portrait — fixes above cover this range. |
| 820–1200px | Full iPad landscape range. Content stretches without max-width (fix 2b). |
| > 1200px | Very wide. `max-w-3xl` (768px) from fix 2b keeps content readable. |

No Mac-specific fixes beyond what's already listed.

---

## Implementation Plan

### Phase 8.1: Unlock Landscape (1 file, 1 line)

**File:** `apps/mobile/app.json`
```diff
- "orientation": "portrait",
+ "orientation": "default",
```

`"default"` means: respect the device's natural orientation. On iPhone, this is portrait. On iPad, all orientations are allowed. This is the standard Expo/RN approach.

**Risk:** None. The watch screen already handles landscape. Other screens use flex layouts that adapt. Any layout issues that appear after unlocking are addressed by the remaining tasks.

---

### Phase 8.2: Responsive Video Grid (1 file)

**File:** `apps/mobile/components/video/VideoGrid.tsx`

Add `useWindowDimensions` and compute `numColumns` from width. Add `key` prop based on column count so `FlatList` re-renders when columns change:

```tsx
import { useWindowDimensions } from 'react-native';

export function VideoGrid({ ... }: VideoGridProps) {
  const { width } = useWindowDimensions();
  const numColumns = width < 400 ? 1 : width < 700 ? 2 : width < 1000 ? 3 : 4;

  return (
    <FlatList
      key={`grid-${numColumns}`}  // force re-render on column change
      numColumns={numColumns}
      // ... rest unchanged
    />
  );
}
```

The `key` prop is important — `FlatList` does not automatically re-render when `numColumns` changes on the same component instance. Changing `key` forces a new mount with the correct column count.

---

### Phase 8.3: Settings Sidebar Width Cap (1 file)

**File:** `apps/mobile/app/(tabs)/(me)/settings/index.tsx`

Two changes:

1. Cap sidebar width:
```tsx
const sidebarWidth = Math.min(256, width * 0.4);
```

2. Optionally collapse to narrow mode if detail pane is too small:
```tsx
const isWide = width >= 600 && (width - Math.min(256, width * 0.4)) >= 320;
```

The second change is more conservative — it ensures the detail panel always has ≥320px. This means on 50/50 split (~438px), the app uses narrow mode (stack nav). Whether to do this depends on design preference. The width cap alone (change 1) may be sufficient.

---

### Phase 8.4: Drawer Width Cap (1 file)

**File:** `apps/mobile/components/layout/HamburgerDrawer.tsx`

Add `useWindowDimensions` and compute drawer width. Pass as a dynamic className or style:

```tsx
const { width: screenWidth } = useWindowDimensions();
const drawerWidth = Math.min(256, screenWidth * 0.6);

// In Dialog.DrawerContent:
<Dialog.DrawerContent
  open={open}
  topOffset={headerHeight}
  className={`w-[${Math.round(drawerWidth)}px]`}
>
```

**Note:** Tailwind/NativeWind does not support dynamic arbitrary values like `w-[${n}px]` — the class must be statically analyzable. Use inline `style` instead:

```tsx
<Dialog.DrawerContent
  open={open}
  topOffset={headerHeight}
  style={{ width: drawerWidth }}
>
```

To support this, `DrawerContent` in `dialog.tsx` should merge its own width style with a passed `style` prop. Currently `DrawerContent` sets a fixed `w-64` className. The fix is to remove the hardcoded `w-64` from `DrawerContent` and let callers set width via `className` or `style`.

---

### Phase 8.5: Wide-Screen Content Max-Width (multiple files)

**Affected screens** (all under `app/(tabs)/`):

| Screen | File |
|---|---|
| Explore | `(media)/index.tsx` |
| Search | `(media)/search.tsx` |
| Music | `(media)/music.tsx` |
| Watch History | `(media)/watch-history.tsx` |
| TV Shows | `(media)/tv-shows.tsx` |
| Live TV | `(media)/live-tv.tsx` |
| Channel Detail | `(media)/channel/[channelId].tsx` |
| Saved Words | `(vocab)/saved-words.tsx` |
| Dictionary | `(vocab)/index.tsx` |
| Review | `(vocab)/review.tsx` |
| Notes Reader | `(reading)/index.tsx` |
| Web Reader | `(reading)/web-reader.tsx` |
| Docs | `(me)/docs.tsx` |
| Profile | `(me)/profile.tsx` |
| Go Pro | `(me)/go-pro.tsx` |

**Approach A (recommended):** Create a shared `PageContainer` component:

```tsx
// components/layout/PageContainer.tsx
import { View } from 'react-native';

interface PageContainerProps {
  children: React.ReactNode;
  /** Set to true for pages that benefit from full width (video, reader, EPUB). */
  fullWidth?: boolean;
}

export function PageContainer({ children, fullWidth = false }: PageContainerProps) {
  if (fullWidth) {
    return <View className="flex-1 bg-background">{children}</View>;
  }
  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 w-full max-w-3xl self-center">
        {children}
      </View>
    </View>
  );
}
```

Then wrap each screen's root view with `<PageContainer>`. Screens that are already full-width-appropriate (Watch, EPUB reader, Local Media player) use `<PageContainer fullWidth>`.

**Approach B:** Add `max-w-3xl self-center` directly to each screen's root `<View>`. Simpler but more repetitive.

---

## Screens NOT Affected

These screens intentionally use full width and do NOT need max-width containers:

| Screen | Reason |
|---|---|
| Watch (`watch/[videoId]`) | Video player + transcript panel needs full width for readability |
| EPUB Reader (`epub`) | Book content benefits from full width; already paginated |
| Local Media (`local-media`) | Video player + subtitles need full width |
| Settings detail screens | Already handled by split view (Phase 8.3) |
| Tokenizer Debug | Dev tool — no need to constrain |

---

## Testing Matrix

After all fixes, test each screen at these sizes:

| Mode | Width | Key Screens to Test |
|---|---|---|
| iPhone SE | 375px | All — baseline, should be unchanged |
| iPhone Pro Max | 430px | All — baseline |
| iPad 1/3 Split | 320px | VideoGrid (1 col), Settings (narrow mode), Drawer (capped) |
| iPad 1/2 Split Portrait | 438px | VideoGrid (2 cols), Settings (capped sidebar), Drawer (capped) |
| iPad Full Portrait | 820px | VideoGrid (3 cols), Content pages (max-w-3xl), Settings (full sidebar) |
| iPad 1/2 Split Landscape | 590px | VideoGrid (2 cols), Content pages (max-w-3xl) |
| iPad Full Landscape | 1180px | VideoGrid (4 cols), Content pages (max-w-3xl), Video player (landscape overlay) |
| Slide Over | 320px | Same as 1/3 split |
| Mac Window (min) | ~400px | Content pages (max-w-3xl) |
| Mac Window (max) | ~1600px | Content pages (max-w-3xl centers) |

---

## Dependencies

- **Phase 6 (Interaction Primitives)** — already complete ✅. `@rn-primitives/dialog` powers the drawer and overlays; no changes needed.
- **ADR-0015** — Settings split view design already approved.
- **No backend changes** — purely client-side layout adjustments.

---

## Open Questions

1. **Settings 50/50 split: cap sidebar or collapse?** If we cap sidebar at 40% width (~175px on 438px pane), is that usable for the settings list? The list items are simple icon + label + chevron — they'd fit. But the search bar might be cramped. **Recommendation:** Try the cap first; fall back to collapse if sidebar feels too narrow.

2. **max-w-3xl (768px) vs max-w-4xl (896px)?** 3xl matches web convention and keeps line lengths comfortable (~70 chars). 4xl is slightly wider but still reasonable on large screens. **Recommendation:** Start with 3xl; can always loosen later.

3. **Should the drawer close on window resize?** If the user resizes the iPad split view while the drawer is open, it could suddenly cover 80% of the new width. **Recommendation:** Add a `useEffect` that closes the drawer when `screenWidth` changes significantly (e.g., >50px delta), as a safety measure.
