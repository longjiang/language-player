import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';

export default function DictionaryPage() {
  const { l1, l2 } = useLanguage();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">Dictionary</h1>
      <p className="mt-2 text-muted-foreground">
        Look up words in {languageName(l2.code)} with translations to {languageName(l1.code)}.
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground">
          Dictionary search, tokenization, and word-saving will be ported from the Classic Nuxt app.
        </p>
      </div>
    </div>
  );
}
