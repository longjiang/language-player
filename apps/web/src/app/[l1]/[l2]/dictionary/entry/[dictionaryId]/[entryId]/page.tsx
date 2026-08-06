'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useDictionaryContext } from '@/providers/dictionary-provider';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { getWordListNav } from '@/lib/word-list-navigation';
import { log } from '@/lib/logger';
import type { DictionaryEntry } from '@langplayer/shared';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { DictionaryEntryTabs } from '@/components/dictionary-entry-tabs';

/**
 * Single dictionary or LLM entry page.
 *
 * Route: /[l1]/[l2]/dictionary/entry/[dictionaryId]/[entryId]
 *
 * Renders two sibling panels (ADR 0007):
 *   - Definitions panel (head, pronunciation, meanings, classifiers, source) — DictionaryEntryCard
 *   - Tabs panel (Examples from Videos, Conjugations, DeepSeek) — DictionaryEntryTabs
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
  const searchParams = useSearchParams();

  const { setDetailHead, setSidebarSource } = useDictionaryContext();

  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('examples');

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryL2 = baseCode(params.l2);
      const queryL1 = params.l1;  // keep BCP 47 subtag (e.g. "zh-Hans") — backend cache is keyed by full l1
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

  // The sidebar shows the word list the user navigated here from (search
  // results, saved words, or related words). It's only available when
  // ?listCurrent= points at a stored list with more than one item — otherwise
  // there is no list to show. Also logs every dictionary nav from a wordlist.
  useEffect(() => {
    const nav = searchParams.get('listCurrent') ? getWordListNav() : null;
    if (nav) {
      log('Dictionary nav from wordlist', {
        source: nav.source,
        count: nav.items.length,
        sidebarShown: nav.items.length > 1,
        currentId: nav.currentEntryId,
      });
    }
    if (nav && nav.items.length > 1) {
      setSidebarSource({ kind: 'list', items: nav.items, currentId: nav.currentEntryId, source: nav.source });
    } else {
      setSidebarSource({ kind: 'none' });
    }
  }, [searchParams, setSidebarSource]);

  const saveContext = {
    form: entry?.head ?? '',
    text: entry?.head ?? '',
    textTitle: t('title.dictionary'),
  };

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

  // ── Entry detail: definitions card + tabs panel (siblings) ──
  return (
    <div>
      {/* Two-column on lg+, stacked on smaller */}
      <div className="flex flex-col lg:flex-row lg:gap-4 gap-4">
        {/* Definitions card */}
        <div className="lg:flex-1 lg:min-w-0 rounded-xl border border-border bg-card p-6">
          <DictionaryEntryCard
            entry={entry}
            variant="full"
            l2Code={l2.code}
            l1Code={l1.code}
            saveContext={saveContext}
            headingLevel="h1"
          />
        </div>

        {/* Tabs panel */}
        <div className="lg:flex-[2] lg:min-w-0 flex flex-col">
          <DictionaryEntryTabs
            entry={entry}
            l2Code={l2.code}
            l1Code={l1.code}
            showDefinitionTab={false}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
    </div>
  );
}
