'use client';

/**
 * Highlights the first case-insensitive occurrence of `term` inside `text`,
 * using the same <mark> styling as subs-search-results so the emphasized
 * word stands out consistently across corpus sections.
 */
export function HighlightTerm({ text, term }: { text: string; term: string }) {
  if (!term) return <span>{text}</span>;
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerText.indexOf(lowerTerm);
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/15 px-0.5 font-semibold text-primary ring-1 ring-primary/30">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </span>
  );
}
