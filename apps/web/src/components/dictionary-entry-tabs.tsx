'use client';

import { useState } from 'react';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, Film, Binary, Sparkles, ImageIcon } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { TabbedPanel } from '@/components/tabbed-panel';
import { DictionaryEntryCard } from '@/components/dictionary-entry-card';
import { SubsSearchResults } from '@/components/video/subs-search-results';
import { InflectionTable } from '@/components/inflection-table';
import { AiExplanation } from '@/components/ai-explanation';
import { ImageSearchResults } from '@/components/dictionary/image-search-results';

interface DictionaryEntryTabsProps {
  entry: DictionaryEntry;
  /** Language-specific level label formatter (passed through to DictionaryEntryCard). */
  levelLabel?: (scale: string, value: string | number) => string;
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
  /** Called when the embedded DictionaryEntryCard is clicked. */
  onCardClick?: (entry: DictionaryEntry) => void;
  /** Controlled mode: which tab is active. When omitted, manages state internally. */
  activeTab?: string;
  /** Controlled mode: called when the active tab changes. */
  onTabChange?: (key: string) => void;
  /** When true, removes outer border/shadow from the TabbedPanel (for embedding inside another card). */
  embedded?: boolean;
}

/**
 * Tabbed container for dictionary entry subsections: Examples, DeepSeek, Conjugations.
 * Optionally includes a "Dictionary" tab (first) that embeds DictionaryEntryCard.
 *
 * Uncontrolled mode (no activeTab/onTabChange): manages tab state internally.
 * Controlled mode: parent drives activeTab/onTabChange (used on the entry detail page).
 */
export function DictionaryEntryTabs({
  entry,
  levelLabel,
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
  // Don't pass multi-form term until inflections are resolved (avoids wasteful single-form fetch)
  const searchTermString = exactMatch ? headTerm : (inflectionsLoading ? '' : allTerms.join(','));

  const tabs = showDefinitionTab
    ? [
        { key: 'word', label: t('title.dictionary'), icon: <BookOpen className="h-4 w-4" /> },
        { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
        { key: 'images', label: t('title.images'), icon: <ImageIcon className="h-4 w-4" /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
        { key: 'inflections', label: t('title.conjugations'), icon: <Binary className="h-4 w-4" /> },
      ]
    : [
        { key: 'examples', label: t('title.examples_from_videos'), icon: <Film className="h-4 w-4" /> },
        { key: 'images', label: t('title.images'), icon: <ImageIcon className="h-4 w-4" /> },
        { key: 'inflections', label: t('title.conjugations'), icon: <Binary className="h-4 w-4" /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: <Sparkles className="h-4 w-4" /> },
      ];

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <TabbedPanel
        tabs={tabs}
        activeTab={tab}
        onTabChange={handleTabChange}
        className={embedded ? 'rounded-none border-0 bg-transparent' : 'shadow-sm'}
        contentClassName={embedded ? 'px-0 pt-8' : 'p-6'}
      >
        {tab === 'word' && (
          <DictionaryEntryCard
            entry={entry}
            variant="full"
            l2Code={l2Code}
            l1Code={l1Code}
            levelLabel={levelLabel}
            saveContext={saveContext}
            headingLevel="h2"
            onClick={onCardClick}
          />
        )}
        {tab === 'examples' && (
          <SubsSearchResults
            term={searchTermString}
            exactMatch={exactMatch}
            onExactToggle={setExactMatch}
            formCount={formCount}
            embedded
          />
        )}
        {tab === 'images' && (
          <ImageSearchResults
            term={entry.head}
            l2Code={l2Code}
            l1Code={l1Code}
            definition={entry.definitions?.[0]}
          />
        )}
        {tab === 'deepseek' && (
          <AiExplanation word={entry.head} contextText={contextText} contextForm={contextForm} entryFound={true} autoLoad />
        )}
        {tab === 'inflections' && (
          <InflectionTable head={entry.head} l2Code={l2Code} embedded />
        )}
      </TabbedPanel>
    </div>
  );
}
