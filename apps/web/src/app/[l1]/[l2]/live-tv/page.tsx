'use client';

import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { Tv } from 'lucide-react';

export default function LiveTVPage() {
  const { l1, l2 } = useLanguage();

  if (!l2.has.liveTV) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">Live TV</h1>
        <p className="mt-4 text-muted-foreground">
          Live TV is not available for {languageName(l2.code)} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">Live TV — {languageName(l2.code)}</h1>
      <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <Tv className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          Live TV channels will be ported from the Classic Nuxt app.
        </p>
      </div>
    </div>
  );
}
