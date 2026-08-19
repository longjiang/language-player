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
  SectionList,
  type SectionListData,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Button, buttonTextClass } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';
import { X, ArrowRight } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { ICON_MUTED, ICON_ON_PRIMARY, ICON_ON_ACCENT } from '@/lib/theme-colors';
import { e2e } from '@/lib/e2e';
import type {
  LanguageSection,
  UseLanguagePickerReturn,
} from '@langplayer/shared';
import { flagEmoji, isExperimentalL2 } from '@langplayer/shared';

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
  /** Resolver for L1 names (self-names). Defaults to getName. */
  getNameL1?: (code: string) => string;
  /** Root container classes. Defaults to `flex-1 bg-background` (fullscreen). */
  containerClassName?: string;
}

// ── Tab segments ──────────────────────────────

const TABS = ['l1', 'l2'] as const;

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
    getNameL1,
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
    const resolveName = (code: string) => (isL1 ? getNameL1 ?? getName : getName)(code);

    return (
      <Pressable
        className={`border border-border rounded-lg px-3 py-2 mb-1.5 flex-row items-center justify-between ${
          isSelected ? accentBg : 'bg-card'
        }`}
        onPress={() => handleSelect(item)}
      >
        {!isL1 && (
          <Text className="text-base leading-none mr-2">{flagEmoji(item)}</Text>
        )}
        <Text
          className={`text-sm flex-1 flex-shrink mr-2 ${isSelected ? accentText : 'text-foreground'}`}
        >
          {resolveName(item)}
        </Text>
        {!isL1 && isExperimentalL2(item) && (
          <Text className="rounded-full border border-warm-500/30 bg-warm-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600 dark:text-warm-400">
            {t('label.experimental')}
          </Text>
        )}
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
    if (!section.title || isL1) return <View className="h-2" />;
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
          <Button onPress={onDismiss} variant="ghost" size="icon">
            <X size={20} color={ICON_MUTED} />
          </Button>
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
        {!isL1 && (
          <View className="px-3 pt-3 pb-1">
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder={t('placeholder.search_languages')}
              inputProps={{ autoFocus: false, ...e2e('picker-search-input') }}
            />
          </View>
        )}

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

        {/* Bottom action: Next (L1) or Start Learning (L2) */}
        <View className="flex-row flex-wrap items-center justify-end">
          {activeTab === 'l1' && (
            <Button
              onPress={() => setActiveTab('l2')}
              variant="default"
              {...e2e('picker-next-button')}
            >
              <Text className={buttonTextClass('default')}>
                {t('action.next')}
              </Text>
              <ArrowRight size={16} color={ICON_ON_PRIMARY} />
            </Button>
          )}

          {activeTab === 'l2' && selectedL2 && (
            <Pressable
              onPress={onConfirm}
              className="bg-accent px-4 py-2 rounded-lg flex-row flex-wrap items-center gap-1.5 max-w-full"
              {...e2e('picker-confirm-button')}
            >
              <Text className="text-accent-foreground font-bold text-sm flex-shrink">
                {t('action.start_learning_lang', { name: getName(selectedL2) })}
              </Text>
              <ArrowRight size={16} color={ICON_ON_ACCENT} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
