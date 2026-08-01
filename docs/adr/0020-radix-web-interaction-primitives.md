# ADR-0020: Use Radix for Web Interaction Primitives

**Date**: 2026-08-01
**Status**: accepted
**See also**: [ADR-0014 (rn-primitives for mobile)](./0014-rn-primitives-interaction-primitives.md), [ADR-0011 (shared design tokens)](./0011-shared-design-tokens.md), [ADR-0003 (no shared UI)](./0003-no-shared-ui.md), [SPEC-030](../specs/030-radix-ui-migration.md) (implementation plan)

## Context

The web app's interaction primitives (`dialog`, `sheet`, `popover`, `hover-card`, `select`, `tabs`, `switch`) were built on `@base-ui/react`, while the mobile app's mirrored `components/ui/` folder uses `@rn-primitives` — the React Native port of the Radix component API. The two platforms therefore spoke different headless-UI dialects for the same components, complicating the port-exactly workflow and keeping the web app outside the shadcn/ui ecosystem it was already structurally imitating (CVA variants, `data-slot`, thin wrappers).

## Decision

Migrate all web interaction primitives from `@base-ui/react` to `@radix-ui/react` (dialog, sheet, popover, hover-card, select, tabs, switch), and consolidate the four hand-rolled content sidebars (dictionary, reader notes, EPUB chapters, web-reader) onto a single shared, Radix-backed `Sidebar` primitive.

Design decisions:

1. **Styled wrappers stay the contract.** Feature code imports `@/components/ui/*`, never Radix directly. Wrapper public APIs were kept stable so consumer call sites did not change during migration (Select needed a popper-positioning + sentinel-value adjustment; see below).
2. **Mobile stays on `@rn-primitives`.** Radix does not run on React Native. The win is API symmetry: web Radix and mobile rn-primitives now expose the same component shapes (`Root/Trigger/Content/Item`), making ports mechanical. ADR-0003 (no shared UI across platforms) is unchanged.
3. **Sidebar consistency is a shared primitive, not a shared design.** All four content sidebars now render the same desktop collapsible panel + mobile Radix Dialog sheet, with identical header/close/empty-state/footer chrome. Feature content (words, notes, TOC, outline) remains feature-owned.
4. **Behavioral norms follow Radix defaults**: focus trap, focus restore, Escape, outside-pointer dismiss, scroll lock, and `data-[state=*]` animations via `tailwindcss-animate`.
5. **Native browser dialogs are removed from UI paths.** `prompt()`/`confirm()` usages in notes and saved-words flows were replaced with app dialogs; raw `<select>` elements in TV shows, Live TV, and subs-search were converted to the shared Select.

## Consequences

**Positive**

- Web and mobile primitives now share one component API family, simplifying the porting workflow.
- The shadcn/ui component catalog (including its Sidebar) becomes directly usable; the `shadcn` CLI is already a dependency.
- Deterministic overlay behavior across dialogs, sheets, popovers, and selects.
- Bundle sizes decreased slightly on migrated routes (e.g., reader 353→328 kB, epub 354→328 kB, web-reader 351→325 kB first-load JS).
- One headless library on web instead of two; `@base-ui/react` removed from `apps/web` dependencies.

**Negative / trade-offs**

- Migration churn: all seven wrappers rewritten, plus consumer fixes (sr-only `DialogTitle` additions, sentinel `__all__` values for Radix Select items, native-select conversions).
- Radix Select rejects empty-string item values; the Live TV filters use a `__all__` sentinel mapped back to `null`.
- Radix Popover has no `Title`/`Description` primitives; those wrapper exports are now plain elements (popovers do not require them for a11y).
- Radix logs dev warnings for dialog content without a `DialogTitle`; sr-only titles were added to existing consumers to satisfy this.
- Raw range inputs and the hand-rolled pagination/buttons outside `ui/` were intentionally left in place (no web range primitive exists; sweep scope limited to components with a ui counterpart).

## Alternatives considered

- **Stay on Base UI**: viable, but keeps the two-platform API split and forecloses shadcn component adoption; Base UI's smaller ecosystem was the deciding factor against.
- **Adopt shadcn's official Sidebar**: left-nav oriented with its own provider; our four sidebars are right-side panels, so we extracted our own `ui/sidebar.tsx` from the piloted `WordListSidebar` instead.
