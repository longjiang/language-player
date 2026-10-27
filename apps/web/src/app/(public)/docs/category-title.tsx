'use client';

import { useT } from '@/hooks/use-t';

function categoryKey(slug: string): string {
  return `title.${slug}`;
}

/**
 * Category label. `override` (server-resolved for the ?l1= query) wins when
 * provided; otherwise falls back to the app-locale translation, then slug.
 */
export function CategoryTitle({ slug, override }: { slug: string; override?: string }) {
  const t = useT();
  if (override) return <>{override}</>;
  const key = categoryKey(slug);
  const translated = t(key);
  return <>{translated !== key ? translated : slug}</>;
}
