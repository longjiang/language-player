'use client';

import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';
import { VoicePicker } from '@/components/voice-picker';

export default function SettingsPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.settings')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.settings_desc', { l1: languageName(l1.code), l2: languageName(l2.code) })}
      </p>

      {/* Pronunciation */}
      <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Pronunciation</h2>
        <VoicePicker />
      </section>
    </div>
  );
}
