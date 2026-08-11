/**
 * Wide/bi-panel language picker layout (ADR-0017).
 *
 * Used on iPad/wide screens (≥ 640px) in fullscreen mode.
 * Two columns side-by-side: L1 panel (left) and L2 panel (right).
 * Summary bar at bottom with script toggle and confirm button.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
} from 'react-native';
import { Search, ArrowRight } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { PLACEHOLDER_COLOR, ICON_MUTED, ICON_ON_PRIMARY } from '@/lib/theme-colors';
import type {
  LanguageSection,
  UseLanguagePickerReturn,
} from '@langplayer/shared';
import { flagEmoji, isExperimentalL2 } from '@langplayer/shared';

// ── Props ─────────────────────────────────────

interface LanguagePickerWideProps extends UseLanguagePickerReturn {
  /** Called when user confirms a valid L1+L2 pair. */
  onConfirm: () => void;
  /** Show the welcome title (for onboarding). */
  showTitle?: boolean;
  /** Platform getName callback. */
  getName: (code: string) => string;
  /** Resolver for L1 names (self-names). */
  getNameL1: (code: string) => string;
}

interface LanguagePanelProps {
  title: string;
  search: string;
  onSearchChange: (q: string) => void;
  sections: LanguageSection[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  accentColor: 'primary' | 'accent';
  getName: (code: string) => string;
  /** Show the search field. L1 panel hides it. */
  showSearch?: boolean;
}

// ── Panel sub-component ───────────────────────

function LanguagePanel({
  title,
  search,
  onSearchChange,
  sections,
  selectedCode,
  onSelect,
  accentColor,
  getName,
  showSearch = true,
}: LanguagePanelProps) {
  const t = useT();
  const allItems = sections.reduce<string[]>((acc, s) => {
    acc.push(...s.data);
    return acc;
  }, []);

  return (
    <View className="flex-1">
      {/* Panel title */}
      <View className="flex-row items-center gap-2 mb-3">
        <View
          className={`w-2 h-2 rounded-full ${
            accentColor === 'primary' ? 'bg-primary' : 'bg-accent'
          }`}
        />
        <Text className="text-lg font-bold text-foreground">{title}</Text>
      </View>

      {/* Search */}
      {showSearch && (
        <View className="flex-row items-center bg-background border border-border rounded-lg px-3 py-2 mb-3">
          <Search size={16} color={ICON_MUTED} />
          <TextInput
            className="flex-1 ml-2 text-foreground text-sm"
            placeholder={t('placeholder.search_languages')}
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
          />
        </View>
      )}

      {/* Language list */}
      <FlatList
        data={allItems}
        keyExtractor={(item) => item}
        className="h-80"
        renderItem={({ item }) => {
          const isSelected = item === selectedCode;
          const isL1 = accentColor === 'primary';

          return (
            <Pressable
              className={`border border-border rounded-lg px-3 py-2.5 mb-1.5 flex-row items-center justify-between ${
                isSelected
                  ? isL1
                    ? 'bg-primary'
                    : 'bg-accent'
                  : 'bg-card'
              }`}
              onPress={() => onSelect(item)}
            >
              {!isL1 && (
                <Text className="text-base leading-none mr-2">{flagEmoji(item)}</Text>
              )}
              <Text
                className={`text-sm flex-1 flex-shrink mr-2 ${
                  isSelected ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {getName(item)}
              </Text>
              {!isL1 && isExperimentalL2(item) && (
                <Text className="rounded-full border border-warm-500/30 bg-warm-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-400">
                  {t('label.experimental')}
                </Text>
              )}
              <Text
                className={`text-xs ${
                  isSelected
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {item.toUpperCase()}
              </Text>
            </Pressable>
          );
        }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

// ── Component ─────────────────────────────────

export function LanguagePickerWide(props: LanguagePickerWideProps) {
  const {
    selectedL1,
    selectedL2,
    searchL1,
    searchL2,
    useTraditional,
    filteredL1,
    filteredL2,
    setSelectedL1,
    setSelectedL2,
    setSearchL1,
    setSearchL2,
    setUseTraditional,
    onConfirm,
    showTitle,
    getName,
    getNameL1,
  } = props;

  const t = useT();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      {showTitle && (
        <View className="px-8 pt-6 pb-4">
          <Text className="text-3xl font-bold text-foreground text-center">
            {t('title.welcome')}
          </Text>
          <Text className="text-muted-foreground text-center mt-2">
            {t('msg.choose_languages')}
          </Text>
        </View>
      )}

      {/* Bordered panel: two-column layout */}
      <View className="mx-8 mb-3 flex-1 rounded-xl border border-border bg-card p-4">
        <View className="flex-1 flex-row gap-4">
          {/* L1 panel */}
          <LanguagePanel
            title={t('title.i_speak')}
            search={searchL1}
            onSearchChange={setSearchL1}
            sections={filteredL1}
            selectedCode={selectedL1}
            onSelect={setSelectedL1}
            accentColor="primary"
            showSearch={false}
            getName={getNameL1}
          />

          {/* L2 panel */}
          <LanguagePanel
            title={t('title.i_learning')}
            search={searchL2}
            onSearchChange={setSearchL2}
            sections={filteredL2}
            selectedCode={selectedL2}
            onSelect={setSelectedL2}
            accentColor="accent"
            getName={getName}
          />
        </View>
      </View>

      {/* Summary bar (bordered panel) */}
      {(selectedL1 || selectedL2) && (
        <View className="mx-8 mb-4 rounded-xl border border-border bg-card px-4 py-3 flex-row items-center justify-center gap-3">
          {/* Script toggle for Chinese */}
          {selectedL2 === 'zh' && (
            <View className="flex-row rounded-lg border border-border bg-muted p-0.5 ml-2">
              <Pressable
                onPress={() => setUseTraditional(false)}
                className={`px-3 py-1 rounded-md ${
                  !useTraditional ? 'bg-card' : ''
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    !useTraditional
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t('setting.simplified')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setUseTraditional(true)}
                className={`px-3 py-1 rounded-md ${
                  useTraditional ? 'bg-card' : ''
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    useTraditional ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t('setting.traditional')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Bottom action: Next (no L2 yet) or Start Learning */}
          {!selectedL2 ? (
            <Pressable
              disabled
              className="bg-primary/50 px-4 py-2 rounded-lg ml-2 flex-row flex-wrap items-center gap-1 max-w-full"
            >
              <Text className="text-primary-foreground font-bold text-sm flex-shrink">
                {t('action.next')}
              </Text>
              <ArrowRight size={16} color={ICON_ON_PRIMARY} />
            </Pressable>
          ) : (
            <Pressable
              onPress={onConfirm}
              className="bg-primary px-4 py-2 rounded-lg ml-2 flex-row flex-wrap items-center gap-1 max-w-full"
            >
              <Text className="text-primary-foreground font-bold text-sm flex-shrink">
                {t('action.start_learning_lang', { name: getName(selectedL2) })}
              </Text>
              <ArrowRight size={16} color={ICON_ON_PRIMARY} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
