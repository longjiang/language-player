'use client';

import { useMemo, useState } from 'react';
import { isInflectable, type DictionaryEntry, type SavedWordContext } from '@langplayer/shared';
import { BookOpen, Film, Binary, Sparkles, ImageIcon, Library } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { baseCode } from '@/lib/language-data';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { TabbedPanel } from '@/components/tabbed-panel';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { SubsSearchResults } from '@/components/video/subs-search-results';
import { InflectionTable } from '@/components/inflection-table';
import { AiExplanation } from '@/components/ai-explanation';
import { ImageSearchResults } from '@/components/dictionary/image-search-results';
import { CorpusPanel } from '@/components/dictionary/corpus/corpus-panel';

interface DictionaryEntryTabsProps {
  entry: DictionaryEntry;
  /** Context for the save/bookmark button (passed through to DictionaryEntryCard). */
  saveContext?: SavedWordContext;
  /** ISO 639-1 code of the target language. */
  l2Code: string;
  /** ISO 639-1 code of the user's L1. */
  l1Code?: string;
  /** When true, includes a "Dictionary" tab as the first tab embedding DictionaryEntryCard. */
  showDefinitionTab?: boolean;
  /** Optional surrounding text context for DeepSeek explanation. */
  contextText?: string;
  /** Optional inflected form of the word as it appears in contextText. */
  contextForm?: string;
  /** Called when the embedded DictionaryEntryCard's "Open in Dictionary" button is clicked. */
  onCardClick?: (entry: DictionaryEntry) => void;
  /** Controlled mode: which tab is active. When omitted, manages state internally. */
  activeTab?: string;
  /** Controlled mode: called when the active tab changes. */
  onTabChange?: (key: string) => void;
  /** When true, removes outer border/shadow from the TabbedPanel (for embedding inside another card). */
  embedded?: boolean;
}

/**
 * Tabbed container for dictionary entry subsections: Examples, DeepSeek,
 * Conjugations, Images, Corpus (Sketch Engine). Optionally includes a
 * "Dictionary" tab (first) that embeds DictionaryEntryCard.
 *
 * Uncontrolled mode (no activeTab/onTabChange): manages tab state internally.
 * Controlled mode: parent drives activeTab/onTabChange (used on the entry detail page).
 */
export function DictionaryEntryTabs({
  entry,
  saveContext,
  l2Code,
  l1Code,
  showDefinitionTab = false,
  contextText,
  contextForm,
  onCardClick,
  activeTab: controlledTab,
  onTabChange,
  embedded = false,
}: DictionaryEntryTabsProps) {
  const t = useT();
  const isControlled = controlledTab !== undefined;
  const [internalTab, setInternalTab] = useState<string>(showDefinitionTab ? 'word' : 'examples');
  const tab = isControlled ? controlledTab : internalTab;

  const handleTabChange = (key: string) => {
    if (onTabChange) onTabChange(key);
    if (!isControlled) setInternalTab(key);
  };

  // ── Inflected search terms ──
  const { allTerms, headTerm, formCount, loading: inflectionsLoading } = useInflectedSearchTerms(entry, l2Code);
  const [exactMatch, setExactMatch] = useState(false);
  // Stable id array so TokenizedText's highlightEntryIdSet memo doesn't churn.
  const corpusHighlightEntryIds = useMemo(() => [entry.id], [entry.id]);
  // Stable forms array so the corpus sections don't re-derive/retranslate on
  // every parent render (they also feed the lazy-translation highlight terms).
  const corpusHighlightForms = useMemo(
    () => (allTerms.length ? allTerms : [entry.head]),
    [allTerms, entry.head],
  );
  // Don't pass multi-form term until inflections are resolved (avoids wasteful single-form fetch)
  const searchTermString = exactMatch ? headTerm : (inflectionsLoading ? '' : allTerms.join(','));

  // Only languages with an inflection endpoint get the Conjugations tab
  // (e.g. hidden entirely for Chinese, Thai, Vietnamese).
  const hasInflections = isInflectable(baseCode(l2Code));
  const inflectionsTab = { key: 'inflections', label: t('title.conjugations'), icon: <Binary className="h-4 w-4" /> };

  const tabs = showDefinitionTab
    ? [
        { key: 'word', label: t('title.dictionary'), icon: <BookOpen className="h-4 w-4" /> },
        { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
        { key: 'corpus', label: t('title.corpus'), icon: <Library className="h-4 w-4" /> },
        ...(hasInflections ? [inflectionsTab] : []),
        { key: 'images', label: t('title.images'), icon: <ImageIcon className="h-4 w-4" /> },
      ]
    : [
        { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
        { key: 'corpus', label: t('title.corpus'), icon: <Library className="h-4 w-4" /> },
        ...(hasInflections ? [inflectionsTab] : []),
        { key: 'images', label: t('title.images'), icon: <ImageIcon className="h-4 w-4" /> },
      ];

  // If the language has no inflections but the (possibly controlled) tab is
  // still 'inflections' — e.g. navigating from a ja entry to a zh entry on the
  // same detail page — fall back so the panel never renders empty.
  const effectiveTab = !hasInflections && tab === 'inflections' ? (showDefinitionTab ? 'word' : 'examples') : tab;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <TabbedPanel
        tabs={tabs}
        activeTab={effectiveTab}
        onTabChange={handleTabChange}
        className={embedded ? 'rounded-none border-0 bg-transparent' : 'shadow-sm'}
        contentClassName={embedded ? 'px-0 pt-4' : 'px-6 pt-4 pb-6'}
      >
        {effectiveTab === 'word' && (
          <DictionaryEntryCard
            entry={entry}
            variant="full"
            l2Code={l2Code}
            l1Code={l1Code}
            saveContext={saveContext}
            headingLevel="h2"
            onClick={onCardClick}
          />
        )}
        {effectiveTab === 'deepseek' && (
          <AiExplanation word={entry.head} contextText={contextText} contextForm={contextForm} entryFound={true} autoLoad />
        )}
        {/* Prefetch strategy: Examples/Images/Inflections stay mounted (hidden)
            so their fetches start as soon as the tabs mount or the entry changes.
            Switching tabs only toggles visibility, so nothing is loaded twice. */}
        <div className={effectiveTab === 'examples' ? '' : 'hidden'}>
          <SubsSearchResults
            term={searchTermString}
            headTerm={headTerm}
            exactMatch={exactMatch}
            onExactToggle={setExactMatch}
            formCount={formCount}
            embedded
          />
        </div>
        <div className={effectiveTab === 'images' ? '' : 'hidden'}>
          <ImageSearchResults
            term={entry.head}
            l2Code={l2Code}
            l1Code={l1Code}
            definition={entry.definitions?.[0]}
            contextText={contextText}
            contextForm={contextForm}
          />
        </div>
        <div className={effectiveTab === 'inflections' ? '' : 'hidden'}>
          <InflectionTable head={entry.head} l2Code={l2Code} embedded />
        </div>
        <div className={effectiveTab === 'corpus' ? '' : 'hidden'}>
          <CorpusPanel
            word={entry.head}
            l2Code={l2Code}
            l1Code={l1Code}
            highlightForms={corpusHighlightForms}
            highlightEntryIds={corpusHighlightEntryIds}
          />
        </div>
      </TabbedPanel>
    </div>
  );
}
