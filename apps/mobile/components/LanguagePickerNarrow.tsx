/**
 * Narrow/tab-based language picker layout (ADR-0017).
 *
 * Used on phones (< 640px) and in dialog/header mode.
 * Two tabs: "I speak" (L1) and "I'm learning" (L2).
 * Tapping L1 auto-advances to L2 tab.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  SectionList,
  type SectionListData,
} from 'react-native';
import { X, Search } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { PLACEHOLDER_COLOR, ICON_MUTED } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import type {
  LanguageSection,
  UseLanguagePickerReturn,
} from '@langplayer/shared';

// ── Props ─────────────────────────────────────

interface LanguagePickerNarrowProps extends UseLanguagePickerReturn {
  /** Called when user confirms a valid L1+L2 pair. */
  onConfirm: () => void;
  /** Show the welcome title (for onboarding). */
  showTitle?: boolean;
  /** Show close button (for dialog/header). */
  showClose?: boolean;
  /** Called when user dismisses. */
  onDismiss?: () => void;
  /** Platform getName callback (passed through for use in rendering). */
  getName: (code: string) => string;
  /** Root container classes. Defaults to `flex-1 bg-background` (fullscreen). */
  containerClassName?: string;
}

// ── Tab segments ──────────────────────────────

const TABS = ['l1', 'l2'] as const;

/** Short code for compact display (e.g. 'zh-Hans' → 'ZH', 'en' → 'EN'). */
function shortCode(code: string): string {
  return code.split('-')[0]!.toUpperCase();
}

// ── Component ─────────────────────────────────

export function LanguagePickerNarrow(props: LanguagePickerNarrowProps) {
  const {
    selectedL1,
    selectedL2,
    searchL1,
    searchL2,
    activeTab,
    useTraditional,
    filteredL1,
    filteredL2,
    isReady,
    setSelectedL1,
    setSelectedL2,
    setSearchL1,
    setSearchL2,
    setActiveTab,
    setUseTraditional,
    onConfirm,
    showTitle,
    showClose,
    onDismiss,
    getName,
    containerClassName,
  } = props;

  const t = useT();

  const isL1 = activeTab === 'l1';
  const search = isL1 ? searchL1 : searchL2;
  const setSearch = isL1 ? setSearchL1 : setSearchL2;
  const sections = isL1 ? filteredL1 : filteredL2;
  const selectedCode = isL1 ? selectedL1 : selectedL2;

  const handleSelect = (code: string) => {
    if (isL1) {
      setSelectedL1(code);
    } else {
      setSelectedL2(code);
    }
  };

  // ── Render helpers ──

  const renderLanguageItem = ({ item }: { item: string }) => {
    const isSelected = item === selectedCode;
    const accentBg = isL1 ? 'bg-primary' : 'bg-accent';
    const accentText = 'text-primary-foreground';

    return (
      <Pressable
        className={`border border-border rounded-lg px-3 py-2 mb-1.5 flex-row items-center justify-between ${
          isSelected ? accentBg : 'bg-card'
        }`}
        onPress={() => handleSelect(item)}
      >
        <Text
          className={`text-sm ${isSelected ? accentText : 'text-foreground'}`}
        >
          {getName(item)}
        </Text>
        <Text
          className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
        >
          {item.toUpperCase()}
        </Text>
      </Pressable>
    );
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: SectionListData<string, LanguageSection>;
  }) => {
    if (!section.title) return <View className="h-2" />;
    return (
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2 mt-1">
        {section.title}
      </Text>
    );
  };

  // ── Render ──

  return (
    <View className={containerClassName ?? 'flex-1 bg-background'}>
      {/* Header */}
      {showTitle && (
        <View className="px-6 pt-6 pb-2">
          <Text className="text-2xl font-bold text-foreground">
            {t('title.welcome')}
          </Text>
          <Text className="text-muted-foreground mt-1">
            {t('msg.choose_languages')}
          </Text>
        </View>
      )}

      {showClose && (
        <View className="flex-row justify-end px-4 pt-2">
          <Pressable onPress={onDismiss} className="p-1.5 rounded-lg">
            <X size={20} color={ICON_MUTED} />
          </Pressable>
        </View>
      )}

      {/* Tab bar */}
      <View className="px-6 pt-2 pb-2">
        <View className="flex-row rounded-lg border border-border bg-muted p-0.5">
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className={`flex-1 py-2 items-center rounded-md ${
                activeTab === tab ? 'bg-card' : ''
              }`}
              {...e2e(`picker-${tab}-tab`)}
            >
              <Text
                className={`text-sm font-semibold ${
                  activeTab === tab
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {tab === 'l1' ? t('title.i_speak') : t('title.i_learning')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Bordered panel: search + language list */}
      <View className="mx-6 mb-3 rounded-xl border border-border bg-card">
        {/* Search */}
        <View className="px-3 pt-3 pb-1">
          <View className="flex-row items-center bg-background border border-border rounded-lg px-3 py-2">
            <Search size={16} color={ICON_MUTED} />
            <TextInput
              className="flex-1 ml-2 text-foreground text-sm"
              placeholder={t('placeholder.search_languages')}
              placeholderTextColor={PLACEHOLDER_COLOR}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoFocus={false}
              {...e2e('picker-search-input')}
            />
          </View>
        </View>

        {/* Language list */}
        <SectionList
          className="px-3 pb-3 h-96"
          sections={sections}
          keyExtractor={(item) => item}
          renderItem={renderLanguageItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      {/* Summary bar (bordered panel) — always visible */}
      <View className="mx-6 mb-4 rounded-xl border border-border bg-card px-4 py-3">
        {/* Script toggle for Chinese */}
        {selectedL2 === 'zh' && (
          <View className="flex-row rounded-lg border border-border bg-muted p-0.5 mb-2">
            <Pressable
              onPress={() => setUseTraditional(false)}
              className={`flex-1 py-1.5 items-center rounded-md ${
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
              className={`flex-1 py-1.5 items-center rounded-md ${
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

        {/* Selection + Next/Confirm */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-sm text-foreground font-medium">
              {shortCode(selectedL1 || 'en')}
            </Text>
            <Text className="text-sm text-muted-foreground">→</Text>
            <Text className="text-sm text-foreground font-medium">
              {selectedL2 ? shortCode(selectedL2) : ''}
            </Text>
          </View>

          {/* On L1 tab: "Next" switches to L2 tab */}
          {activeTab === 'l1' && (
            <Pressable
              onPress={() => setActiveTab('l2')}
              className="bg-primary px-4 py-2 rounded-lg"
              {...e2e('picker-next-button')}
            >
              <Text className="text-primary-foreground font-bold text-sm">
                {t('action.next')}
              </Text>
            </Pressable>
          )}

          {/* On L2 tab with L2 picked: orange "Confirm" */}
          {activeTab === 'l2' && selectedL2 && (
            <Pressable
              onPress={onConfirm}
              className="bg-accent px-4 py-2 rounded-lg"
              {...e2e('picker-confirm-button')}
            >
              <Text className="text-accent-foreground font-bold text-sm">
                {t('action.confirm')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
