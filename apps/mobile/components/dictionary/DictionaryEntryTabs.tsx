import React, { useState } from 'react';
import { View } from 'react-native';
import { isInflectable, type DictionaryEntry, type SavedWordContext } from '@langplayer/shared';
import { BookOpen, Film, Binary, Sparkles, ImageIcon, Library } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useInflectedSearchTerms } from '@/hooks/use-inflected-search-terms';
import { TabbedPanel } from '@/components/TabbedPanel';
import { DictionaryEntryCard } from '@/components/dictionary/DictionaryEntryCard';
import { SubsSearchResults } from '@/components/video/SubsSearchResults';
import { InflectionTable } from '@/components/InflectionTable';
import { AiExplanation } from '@/components/dictionary/AiExplanation';
import { ImageSearchResults } from '@/components/dictionary/ImageSearchResults';
import { CorpusPanel } from '@/components/dictionary/corpus/corpus-panel';
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
  const { l1Lang, l2Lang } = useLanguage();
  const effectiveL1 = l1Code ?? l1Lang.code;
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

  // Only languages with an inflection endpoint get the Conjugations tab
  // (e.g. hidden entirely for Chinese, Thai, Vietnamese).
  const hasInflections = isInflectable(l2Code);
  const inflectionsTab = { key: 'inflections', label: t('title.conjugations'), icon: () => <Binary size={14} color={ICON_MUTED} /> };
  const imagesTab = { key: 'images', label: t('title.images'), icon: () => <ImageIcon size={14} color={ICON_MUTED} /> };
  const corpusTab = { key: 'corpus', label: t('title.corpus'), icon: () => <Library size={14} color={ICON_MUTED} /> };

  const tabs = showDefinitionTab
    ? [
        { key: 'word', label: t('title.dictionary'), icon: () => <BookOpen size={14} color={ICON_MUTED} /> },
        { key: 'examples', label: t('title.examples_from_videos'), icon: () => <Film size={14} color={ICON_MUTED} /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: () => <Sparkles size={14} color={ICON_MUTED} /> },
        corpusTab,
        ...(hasInflections ? [inflectionsTab] : []),
        imagesTab,
      ]
    : [
        { key: 'examples', label: t('title.examples_from_videos'), icon: () => <Film size={14} color={ICON_MUTED} /> },
        { key: 'deepseek', label: t('action.let_ai_explain'), icon: () => <Sparkles size={14} color={ICON_MUTED} /> },
        corpusTab,
        ...(hasInflections ? [inflectionsTab] : []),
        imagesTab,
      ];

  // If the language has no inflections but the (possibly controlled) tab is
  // still 'inflections' — e.g. navigating from a ja entry to a zh entry on the
  // same detail page — fall back so the panel never renders empty.
  const effectiveTab = !hasInflections && tab === 'inflections' ? (showDefinitionTab ? 'word' : 'examples') : tab;

  // Tab content panels — order must match the tabs array above
  const wordPanel = (
    <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
      <DictionaryEntryCard
        entry={entry}
        variant="full"
        l2Code={l2Code}
        l1Code={effectiveL1}
        saveContext={saveContext}
        onPress={onCardPress}
      />
    </View>
  );
  const examplesPanel = (
    <SubsSearchResults
      term={searchTermString}
      headTerm={entry.head}
      exactMatch={exactMatch}
      onExactToggle={setExactMatch}
      formCount={formCount}
    />
  );
  const deepseekPanel = (
    <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
      <AiExplanation word={entry.head} contextText={contextText} contextForm={contextForm} entryFound={true} autoLoad />
    </View>
  );
  const imagesPanel = (
    <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
      <ImageSearchResults
        term={entry.head}
        l2Code={l2Code}
        l2Name={l2Lang.name}
        l1Code={effectiveL1}
        definition={entry.definitions?.[0]}
        contextText={contextText}
        contextForm={contextForm}
      />
    </View>
  );
  const inflectionsPanel = (
    <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
      <InflectionTable head={entry.head} l2Code={l2Code} embedded />
    </View>
  );
  const corpusPanel = (
    <View className={embedded ? 'px-0 pt-4' : 'p-4'}>
      <CorpusPanel
        word={entry.head}
        l2Code={l2Code}
        l1Code={effectiveL1}
        highlightForms={allTerms.length ? allTerms : [entry.head]}
      />
    </View>
  );

  const children = showDefinitionTab
    ? [wordPanel, examplesPanel, deepseekPanel, corpusPanel, ...(hasInflections ? [inflectionsPanel] : []), imagesPanel]
    : [examplesPanel, deepseekPanel, corpusPanel, ...(hasInflections ? [inflectionsPanel] : []), imagesPanel];

  return (
    <TabbedPanel
      tabs={tabs}
      activeTab={tab}
      onTabChange={handleTabChange}
      className={embedded ? '' : 'rounded-xl border border-border bg-card'}
      contentClassName=""
    >
      {children}
    </TabbedPanel>
  );
}
