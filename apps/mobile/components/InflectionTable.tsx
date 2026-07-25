import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useInflection } from '@langplayer/api-client';
import type { InflectedForm } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED } from '@/lib/theme-colors';

/** ISO 639-1 → ISO 639-3 mappings for languages with inflection support. */
const ISO_639_1_TO_3: Record<string, string> = {
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
  /** When true, removes outer card styling and hides the title (for use inside a scroll section). */
  embedded?: boolean;
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
export function InflectionTable({ head, l2Code, verbType, embedded = false }: InflectionTableProps) {
  const inflection = useInflection();
  const t = useT();
  const [forms, setForms] = useState<InflectedForm[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iso639_3 = ISO_639_1_TO_3[l2Code];
  const isSupported = iso639_3 != null;

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
      promise = inflection.pattern(head, iso639_3);
    } else if (PYMORPHY_LANGS.has(l2Code)) {
      promise = inflection.pymorphy(head, iso639_3);
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
      <View className={embedded ? 'py-4' : 'my-3 rounded-lg border border-border bg-card p-4'}>
        <ActivityIndicator size="small" color={ICON_MUTED} />
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View className={embedded
        ? 'py-2'
        : 'my-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4'
      }>
        <Text className="text-sm text-destructive">{error}</Text>
      </View>
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
    <View className={embedded ? '' : 'my-3 rounded-lg border border-border bg-card p-4'}>
      {!embedded && (
        <Text className="mb-3 text-base font-semibold text-foreground">{t('title.conjugations')}</Text>
      )}

      {tableNames.map((table) => {
        const group = groups[table];
        if (!group || group.length === 0) return null;

        // "head" table: show the base form prominently (unlike Next.js which hides it).
        // Mobile screens benefit from seeing the dictionary form for orientation.
        if (table === 'head') {
          return (
            <View key="head" className="mb-3 rounded-lg bg-primary/5 px-4 py-3">
              <Text className="text-xs font-medium text-primary">Dictionary form</Text>
              <Text className="mt-1 text-lg font-bold text-foreground">{group[0]!.form}</Text>
            </View>
          );
        }

        return (
          <View key={table} className="mb-3 overflow-hidden rounded-lg border border-border bg-card">
            <View className="bg-muted/50 px-4 py-2">
              <Text className="text-sm font-medium text-muted-foreground">
                {tableLabel(table)}
              </Text>
            </View>
            <View className="divide-y divide-border">
              {group.map((f, i) => (
                <View
                  key={i}
                  className="flex-row items-center justify-between px-4 py-2"
                >
                  <Text className="text-sm text-muted-foreground">{f.field}</Text>
                  <Text className="text-sm font-medium text-foreground">{f.form}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
