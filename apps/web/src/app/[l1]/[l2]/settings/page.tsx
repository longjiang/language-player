'use client';

import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { l1, l2 } = useLanguage();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Configure your {languageName(l1.code)} → {languageName(l2.code)} learning experience.
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <Settings className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          User settings and preferences will be ported from the Classic Nuxt app.
        </p>
      </div>
    </div>
  );
}
