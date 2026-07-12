'use client';

import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { useT } from '@/hooks/use-t';

export default function DictionaryPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title.dictionary')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('msg.lookup_words_desc', { l1: languageName(l1.code), l2: languageName(l2.code) })}
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground">
          {t('msg.dictionary_placeholder')}
        </p>
      </div>
    </div>
  );
}
