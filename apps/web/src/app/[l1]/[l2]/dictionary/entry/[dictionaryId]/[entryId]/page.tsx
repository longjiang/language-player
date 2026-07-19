'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import type { DictionaryEntry, ProficiencyLevel } from '@langplayer/shared';
import { formatLevel } from '@langplayer/shared';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { Loader2, AlertCircle, BookOpen, Film, Binary, Sparkles } from 'lucide-react';
import { TabbedPanel } from '@/components/tabbed-panel';
import { SubsSearchResults } from '@/components/video/subs-search-results';
import { InflectionTable } from '@/components/inflection-table';
import { AiExplanation } from '@/components/ai-explanation';
import { DictionaryDefinitionsPanel } from '@/components/dictionary/dictionary-definitions-panel';

/**
 * Single dictionary or LLM entry page.
 *
 * Route: /[l1]/[l2]/dictionary/entry/[dictionaryId]/[entryId]
 *
 * Renders two sibling panels (ADR 0007):
 *   - Definitions panel (head, pronunciation, meanings, classifiers, source)
 *   - Tabs panel (Examples from Videos, Conjugations, DeepSeek)
 *
 * On wide screens (≥ lg), they sit side-by-side.
 * On narrow screens, they stack vertically.
 */
export default function DictionaryEntryPage() {
  const params = useParams<{
    l1: string;
    l2: string;
    dictionaryId: string;
    entryId: string;
  }>();
  const { l1, l2 } = useLanguage();
  const t = useT();

  const { setDetailHead } = useDictionaryContext();

  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('examples');

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryL2 = baseCode(params.l2);
      const queryL1 = baseCode(params.l1);
      const entryId = decodeURIComponent(params.entryId).replace(/~/g, ',');
      const url = `${PYTHON_API_URL}/dictionary/entry?l2=${queryL2}&dict=${encodeURIComponent(params.dictionaryId)}&id=${encodeURIComponent(entryId)}&l1=${queryL1}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError(res.status === 404 ? t('error.entry_not_found') : `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const entryData: DictionaryEntry | undefined = data.entry;
      setEntry(entryData ?? null);

      if (entryData?.head) {
        setDetailHead(entryData.head);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load entry');
    }
    setLoading(false);
  }, [params.l2, params.l1, params.dictionaryId, params.entryId, t, setDetailHead]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const levelLabel = (scale: string, value: string | number) =>
    formatLevel({ scale, value } as ProficiencyLevel).long;

  const saveContext = {
    form: entry?.head ?? '',
    text: entry?.head ?? '',
    textTitle: t('title.dictionary'),
  };

  // Inflected search terms for the examples tab (hook requires valid entry shape)
  const dummyEntry = { head: '', pronunciation: '' };
  const entryForTerms = entry ?? dummyEntry;
  const { allTerms, headTerm, formCount } = useInflectedSearchTerms(entryForTerms as any, l2.code);
  const [exactMatch, setExactMatch] = useState(false);
  const searchTermString = exactMatch ? headTerm : (entry ? allTerms.join(',') : '');

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  // ── No entry ──
  if (!entry) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t('error.entry_not_found')}</p>
        </div>
      </div>
    );
  }

  // ── Entry detail: definitions panel + tabs panel (siblings) ──
  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Two-column on lg+, stacked on smaller */}
      <div className="flex flex-col lg:flex-row lg:gap-4 gap-4 h-full">
        {/* Definitions panel */}
        <div className="lg:flex-1 lg:min-w-0 rounded-xl border border-border bg-card p-6 overflow-y-auto">
          <DictionaryDefinitionsPanel
            entry={entry}
            l2Code={l2.code}
            l1Code={l1.code}
            levelLabel={levelLabel}
            saveContext={saveContext}
            headingLevel="h1"
          />
        </div>

        {/* Tabs panel */}
        <div className="lg:flex-1 lg:min-w-0 flex flex-col min-h-0">
          <TabbedPanel
            tabs={[
              { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
              { key: 'inflections', label: t('title.conjugations'), icon: <Binary className="h-4 w-4" /> },
              { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            className="flex-1 min-h-0"
            contentClassName="overflow-y-auto"
          >
            {activeTab === 'examples' && (
              <SubsSearchResults
                term={searchTermString}
                exactMatch={exactMatch}
                onExactToggle={setExactMatch}
                formCount={formCount}
                embedded
              />
            )}
            {activeTab === 'inflections' && (
              <InflectionTable head={entry.head} l2Code={l2.code} embedded />
            )}
            {activeTab === 'deepseek' && (
              <AiExplanation word={entry.head} entryFound={true} autoLoad />
            )}
          </TabbedPanel>
        </div>
      </div>
    </div>
  );
}
