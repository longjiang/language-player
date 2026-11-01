/**
 * Canonical classes for highlighted text.
 *
 * One highlight look everywhere — the matched term in a translation, a reader /
 * subs-search hit, and a highlighted run inside tokenized text all paint the
 * same background and the same foreground. The colors come from the shared
 * design tokens `highlight` / `highlightForeground` (SPEC-046 §1.4): light mode
 * keeps the brand-purple text, dark mode uses a very bright near-white version
 * of it so highlighted text stays legible on the tinted background.
 *
 * Surfaces append only box-model / weight utilities (e.g.
 * `${HIGHLIGHT_CLASS} rounded-sm px-0.5 font-semibold`) and never reintroduce
 * `bg-primary/…`, `dark:bg-primary/…`, or `text-primary` for a highlight.
 *
 * Mobile mirror: `apps/mobile/lib/highlight.ts` — keep the two files in sync.
 */
export const HIGHLIGHT_BG_CLASS = 'bg-highlight';
export const HIGHLIGHT_FG_CLASS = 'text-highlight-foreground';
export const HIGHLIGHT_CLASS = `${HIGHLIGHT_BG_CLASS} ${HIGHLIGHT_FG_CLASS}`;
