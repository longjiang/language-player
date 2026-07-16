'use client';

import { useEffect, useState } from 'react';
import { useInflection } from '@langplayer/api-client';
import type { InflectedForm } from '@langplayer/shared';
import { Loader2 } from 'lucide-react';
import { useT } from '@/hooks/use-t';

/** ISO 639-1 → ISO 639-3 mappings for languages with inflection support. */
const L2_TO_L3: Record<string, string> = {
  ja: 'jpn',
  ko: 'kor',
  en: 'eng',
  de: 'deu',
  it: 'ita',
  es: 'spa',
  fr: 'fra',
  nl: 'nld',
  ru: 'rus',
  uk: 'ukr',
};

/** Languages that use the Japanese inflector. */
const JP_LANGS = new Set(['ja']);
/** Languages that use the Korean inflector. */
const KO_LANGS = new Set(['ko']);
/** Languages that use the pattern library inflector. */
const PATTERN_LANGS = new Set(['en', 'de', 'it', 'es', 'fr', 'nl']);
/** Languages that use pymorphy2. */
const PYMORPHY_LANGS = new Set(['ru', 'uk']);

interface InflectionTableProps {
  /** The dictionary-form headword to inflect. */
  head: string;
  /** ISO 639-1 language code of the target language. */
  l2Code: string;
  /** Verb type hint for Japanese ichidan verbs ("v1"). Ignored for other languages. */
  verbType?: 'v1';
}

/**
 * Fetches and displays a language's inflection/conjugation table.
 *
 * Supported languages:
 *   Japanese (godan/ichidan verbs + i-adj), Korean (all 6 irregular types),
 *   English, German, Italian, Spanish, French, Dutch (pattern library),
 *   Russian, Ukrainian (pymorphy2).
 *
 * Renders nothing if the language has no inflection support
 * (e.g., Chinese, Vietnamese, Thai).
 */
export function InflectionTable({ head, l2Code, verbType }: InflectionTableProps) {
  const inflection = useInflection();
  const t = useT();
  const [forms, setForms] = useState<InflectedForm[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const l3 = L2_TO_L3[l2Code];
  const isSupported = l3 != null;

  useEffect(() => {
    if (!isSupported || !head) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    let promise: Promise<InflectedForm[]>;

    if (JP_LANGS.has(l2Code)) {
      promise = inflection.japanese(head, verbType);
    } else if (KO_LANGS.has(l2Code)) {
      promise = inflection.korean(head);
    } else if (PATTERN_LANGS.has(l2Code)) {
      promise = inflection.pattern(head, l3);
    } else if (PYMORPHY_LANGS.has(l2Code)) {
      promise = inflection.pymorphy(head, l3);
    } else {
      setLoading(false);
      return;
    }

    promise
      .then((data) => {
        if (!cancelled) {
          setForms(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load inflections');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [head, l2Code, verbType]);

  // ── Don't render if language has no inflection ──
  if (!isSupported) return null;

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  // ── No data ──
  if (!forms || forms.length <= 1) return null;

  // ── Group by table ──
  const groups: Record<string, InflectedForm[]> = {};
  for (const f of forms) {
    const key = f.table;
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(f);
  }

  // Move "head" group to the top
  const tableNames = Object.keys(groups);
  const headIdx = tableNames.indexOf('head');
  if (headIdx > 0) {
    tableNames.splice(headIdx, 1);
    tableNames.unshift('head');
  }

  // ── Map table names to translated labels ──
  const tableLabel = (name: string): string => {
    const map: Record<string, string> = {
      conjugation: t('label.conjugation'),
    };
    return map[name] ?? name;
  };

  // ── Render ──
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{t('title.conjugations')}</h2>

      {tableNames.map((table) => {
        const group = groups[table];
        if (!group || group.length === 0) return null;

        // "head" table: render inline, not as a grid
        if (table === 'head') {
          return null;
        }

        return (
          <div key={table} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/50 px-4 py-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {tableLabel(table)}
              </h3>
            </div>
            <div className="divide-y divide-border">
              {group.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/20 transition-colors"
                >
                  <span className="text-muted-foreground">{f.field}</span>
                  <span className="font-medium" lang={l2Code}>
                    {f.form}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
