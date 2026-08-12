'use client';

import { useT } from '@/hooks/use-t';

function categoryKey(slug: string): string {
  return `title.${slug}`;
}

export function CategoryTitle({ slug }: { slug: string }) {
  const t = useT();
  const key = categoryKey(slug);
  const translated = t(key);
  return <>{translated !== key ? translated : slug}</>;
}
