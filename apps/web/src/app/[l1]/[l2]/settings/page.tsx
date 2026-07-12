'use client';

import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.settings')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.settings_desc', { l1: languageName(l1.code), l2: languageName(l2.code) })}
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <Settings className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">
          {t('msg.settings_placeholder')}
        </p>
      </div>
    </div>
  );
}
