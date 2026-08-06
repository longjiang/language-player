'use client';

/**
 * Highlights the first case-insensitive occurrence of `term` inside `text`,
 * using the same <mark> styling as subs-search-results so the emphasized
 * word stands out consistently across corpus sections.
 *
 * Null-safe: Sketch Engine occasionally returns null for a token's string
 * (see ARCH-020 §9), so missing text/term degrade to a plain span instead of
 * throwing on `.toLowerCase()`.
 */
export function HighlightTerm({
  text,
  term,
}: {
  text: string | null | undefined;
  term: string | null | undefined;
}) {
  const safeText = text ?? '';
  const safeTerm = term ?? '';
  if (!safeTerm) return <span>{safeText}</span>;
  const lowerText = safeText.toLowerCase();
  const lowerTerm = safeTerm.toLowerCase();
  const idx = lowerText.indexOf(lowerTerm);
  if (idx === -1) return <span>{safeText}</span>;
  return (
    <span>
      {safeText.slice(0, idx)}
      <mark className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30">
        {safeText.slice(idx, idx + safeTerm.length)}
      </mark>
      {safeText.slice(idx + safeTerm.length)}
    </span>
  );
}
