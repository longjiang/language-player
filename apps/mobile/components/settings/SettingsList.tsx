import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { ChevronRight } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SETTINGS_SEARCH_KEYS } from '@langplayer/shared';
import { SearchBar } from '@/components/settings/SearchBar';
import {
  SETTINGS_ICONS,
  type SettingsCategory,
} from '@/components/settings/settings-categories';

interface SettingsRow {
  key: SettingsCategory;
  title: string;
  subtitle: string;
}

interface SettingsSection {
  titleKey: string;
  rows: SettingsRow[];
}

/**
 * Settings list — search bar + grouped category rows. Rendered as the modal's
 * list view on narrow screens and as the sidebar on wide screens (ADR-0042).
 * Selecting a row swaps the modal's detail pane instead of navigating.
 */
export function SettingsList({
  selectedKey,
  onSelect,
}: {
  selectedKey: SettingsCategory | null;
  onSelect: (key: SettingsCategory) => void;
}) {
  const t = useT();
  const { display, playback, review, search, getL2, loaded, offlineMode } = useSettingsContext();
  const { isPro } = useSubscription();
  const { l1Lang, l2Lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

  // Pre-resolve search keys on locale change
  useEffect(() => {
    const result: Record<string, string[]> = {};
    for (const [category, keys] of Object.entries(SETTINGS_SEARCH_KEYS)) {
      result[category] = keys.map((key) => t(key).toLowerCase());
    }
    // Mobile-only Offline Mode aliases (not in shared search keys, since the
    // web settings list doesn't have this local-only setting).
    result.network = [
      'setting.network',
      'title.offline_mode',
      'setting.offline_mode_desc',
      'msg.offline_mode_not_synced',
    ].map((key) => t(key).toLowerCase());
    setLocalizedLabels(result);
  }, [l2Lang.code]);

  const l2Settings = loaded ? getL2(l2Lang.code) : null;

  // Build sections from current settings values
  const sections: SettingsSection[] = useMemo(() => {
    const themeLabel =
      display.theme === 'light'
        ? t('setting.light')
        : display.theme === 'dark'
          ? t('setting.dark')
          : t('setting.system');
    const captionsLabel =
      playback.transcriptMode === 'transcript'
        ? t('title.transcript')
        : t('label.subtitles');
    const speechRate = l2Settings?.speech?.rate ?? 1.0;

    return [
      {
        titleKey: 'setting.appearance',
        rows: [
          { key: 'display', title: t('title.display'), subtitle: themeLabel },
          { key: 'playback', title: t('title.playback'), subtitle: captionsLabel },
          { key: 'speech', title: t('title.speech'), subtitle: `${t('label.speed')}: ${speechRate}x` },
        ],
      },
      {
        titleKey: 'setting.learning',
        rows: [
          { key: 'review', title: t('title.review'), subtitle: t('msg.cards_per_day', { n: review.dailyNewLimit }) },
          {
            key: 'search',
            title: t('setting.subs_search'),
            subtitle: t('setting.subs_search_hits', { n: isPro && search.expandSubsSearch ? 500 : 50 }),
          },
        ],
      },
      {
        // Mobile-only settings: there is no web equivalent, so they live under
        // their own section heading (ADR-0042).
        titleKey: 'setting.mobile',
        rows: [
          { key: 'network', title: t('title.offline_mode'), subtitle: offlineMode ? t('label.offline') : '' },
          { key: 'offline', title: t('title.offline_dictionaries'), subtitle: '' },
          { key: 'sync', title: t('title.sync_status'), subtitle: '' },
        ],
      },
    ];
  }, [display.theme, playback.transcriptMode, l2Settings?.speech?.rate, review.dailyNewLimit, isPro, search.expandSubsSearch, l2Lang.code, offlineMode]);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter((row) => {
          if (row.title.toLowerCase().includes(q)) return true;
          if (row.subtitle.toLowerCase().includes(q)) return true;
          const labels = localizedLabels[row.key];
          if (labels?.some((label) => label.includes(q))) return true;
          return false;
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [query, localizedLabels, sections]);

  const hasResults = filteredSections.length > 0;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <Text className="text-3xl font-bold text-foreground px-4 pt-6 pb-1">
        {t('title.settings')}
      </Text>
      {/* G5: Descriptive subtitle */}
      <Text className="text-sm text-muted-foreground px-4 pb-3">
        {t('msg.settings_desc', { l1: l1Lang.name, l2: l2Lang.name })}
      </Text>

      {/* Search bar */}
      <View className="px-4 pb-3">
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t('msg.search_settings')}
        />
      </View>

      {/* Sections */}
      <ScrollView className="flex-1 px-4">
        {hasResults ? (
          filteredSections.map((section) => (
            <View key={section.titleKey || section.rows[0]?.key || 'section'} className="mb-6">
              {section.titleKey ? (
                <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border pb-2 mb-1">
                  {t(section.titleKey)}
                </Text>
              ) : null}
              {section.rows.map((row) => {
                const Icon = SETTINGS_ICONS[row.key];
                const isSelected = selectedKey === row.key;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => onSelect(row.key)}
                    className={`flex-row items-center gap-3 rounded-lg px-3 py-3.5 ${
                      isSelected ? 'bg-primary/10' : ''
                    }`}
                  >
                    <Icon size={20} color={ICON_MUTED} />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        {row.title}
                      </Text>
                      {row.subtitle ? (
                        <Text className="text-xs text-muted-foreground mt-0.5">
                          {row.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color={ICON_MUTED} />
                  </Pressable>
                );
              })}
            </View>
          ))
        ) : (
          <View className="flex-1 items-center justify-center pt-16">
            <Text className="text-base text-muted-foreground text-center">
              {t('msg.no_settings_match', { query })}
            </Text>
            <Button variant="link" onPress={() => setQuery('')} className="mt-3">
              <Text className={buttonTextClass('link')}>
                {t('action.clear_recent_searches')}
              </Text>
            </Button>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
