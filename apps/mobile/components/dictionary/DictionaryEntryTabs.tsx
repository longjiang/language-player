import React, { useState } from 'react';
import { View } from 'react-native';
import type { DictionaryEntry, SavedWordContext } from '@langplayer/shared';
import { BookOpen, Film, Binary, Sparkles } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { TabbedPanel } from '@/components/TabbedPanel';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SubsSearchResults } from '@/components/video/SubsSearchResults';
import { InflectionTable } from '@/components/InflectionTable';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import { ICON_MUTED } from '@/lib/theme-colors';

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
  /** Called when the embedded DictionaryEntryCard is tapped. */
  onCardPress?: (entry: DictionaryEntry) => void;
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
 * Controlled mode: parent drives activeTab/onTabChange (used on the word detail page).
 */
export function DictionaryEntryTabs({
  entry,
  saveContext,
  l2Code,
  l1Code,
  showDefinitionTab = false,
  contextText,
  contextForm,
  onCardPress,
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
  const { allTerms, headTerm, formCount } = useInflectedSearchTerms(entry, l2Code);
  const [exactMatch, setExactMatch] = useState(false);
  const searchTermString = exactMatch ? headTerm : allTerms.join(',');

  const tabs = showDefinitionTab
    ? [
        { key: 'word', label: t('title.dictionary'), icon: () => <BookOpen size={14} color={ICON_MUTED} /> },
        { key: 'examples', label: t('title.examples_from_videos'), icon: () => <Film size={14} color={ICON_MUTED} /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: () => <Sparkles size={14} color={ICON_MUTED} /> },
        { key: 'inflections', label: t('title.conjugations'), icon: () => <Binary size={14} color={ICON_MUTED} /> },
      ]
    : [
        { key: 'examples', label: t('title.examples_from_videos'), icon: () => <Film size={14} color={ICON_MUTED} /> },
        { key: 'inflections', label: t('title.conjugations'), icon: () => <Binary size={14} color={ICON_MUTED} /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: () => <Sparkles size={14} color={ICON_MUTED} /> },
      ];

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={handleTabChange}
      className={embedded ? '' : 'rounded-xl border border-border bg-card'}
      contentClassName=""
    >
      {tab === 'word' && (
        <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
          <DictionaryEntryCard
            entry={entry}
            variant="full"
            l2Code={l2Code}
            l1Code={l1Code}
            saveContext={saveContext}
            onPress={onCardPress}
          />
        </View>
      )}
      {tab === 'examples' && (
        <SubsSearchResults
          term={searchTermString}
          exactMatch={exactMatch}
          onExactToggle={setExactMatch}
          formCount={formCount}
        />
      )}
      {tab === 'deepseek' && (
        <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
          <AiExplanation word={entry.head} contextText={contextText} contextForm={contextForm} entryFound={true} autoLoad />
        </View>
      )}
      {tab === 'inflections' && (
        <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
          <InflectionTable head={entry.head} l2Code={l2Code} embedded />
        </View>
      )}
    </TabbedPanel>
  );
}
