'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches, kept up to date.
 *
 * The first client render already knows the answer: this reads `matchMedia` in the
 * state initialiser rather than starting `false` and correcting a paint later, so a
 * container chosen by width never appears in the wrong shape first. Nothing here is
 * rendered on the server — the caller is `MockAppFrame`, whose panel only exists once
 * it is open — so there is no server/client mismatch to avoid.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
