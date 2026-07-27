import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Monitor, Play, Volume2, RotateCcw, Download, ChevronRight } from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { useT } from '@/hooks/use-t';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SETTINGS_SEARCH_KEYS } from '@langplayer/shared';
import { SearchBar } from './_components/SearchBar';
import { DisplaySettings } from './display';
import { PlaybackSettings } from './playback';
import { SpeechSettings } from './speech';
import { ReviewSettings } from './review';

// ── Section/Row types ─────────────────────────

type LucideIcon = typeof Monitor;

interface SettingsRow {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: string;
}

interface SettingsSection {
  titleKey: string;
  rows: SettingsRow[];
}

// ── Root List Component ───────────────────────

function SettingsList({
  selectedKey,
  onSelect,
}: {
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  const { display, playback, review, getL2, loaded } = useSettingsContext();
  const { l1Lang, l2Lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [localizedLabels, setLocalizedLabels] = useState<Record<string, string[]>>({});

  // Pre-resolve search keys on locale change
  useEffect(() => {
    const result: Record<string, string[]> = {};
    for (const [category, keys] of Object.entries(SETTINGS_SEARCH_KEYS)) {
      result[category] = keys.map((key) => t(key).toLowerCase());
    }
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
          {
            key: 'display',
            icon: Monitor,
            title: t('title.display'),
            subtitle: themeLabel,
            href: '/(tabs)/(me)/settings/display',
          },
          {
            key: 'playback',
            icon: Play,
            title: t('title.playback'),
            subtitle: captionsLabel,
            href: '/(tabs)/(me)/settings/playback',
          },
          {
            key: 'speech',
            icon: Volume2,
            title: t('title.speech'),
            subtitle: `${t('label.speed')}: ${speechRate}x`,
            href: '/(tabs)/(me)/settings/speech',
          },
        ],
      },
      {
        titleKey: 'setting.learning',
        rows: [
          {
            key: 'review',
            icon: RotateCcw,
            title: t('title.review'),
            subtitle: t('msg.cards_per_day', { n: review.dailyNewLimit }),
            href: '/(tabs)/(me)/settings/review',
          },
        ],
      },
      {
        titleKey: '', // no section header for DATA section
        rows: [
          {
            key: 'offline',
            icon: Download,
            title: t('title.offline_dictionaries'),
            subtitle: '',
            href: '/(tabs)/(me)/offline-dictionaries',
          },
        ],
      },
    ];
  }, [display.theme, playback.transcriptMode, l2Settings?.speech?.rate, review.dailyNewLimit, l2Lang.code]);

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
                const isSelected = selectedKey === row.key;
                return (
                  <Pressable
                    key={row.key}
                    onPress={() => onSelect(row.key)}
                    className={`flex-row items-center gap-3 rounded-lg px-3 py-3.5 ${
                      isSelected ? 'bg-primary/10' : ''
                    }`}
                  >
                    <row.icon size={20} color={ICON_MUTED} />
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
            <Text className="text-sm text-muted-foreground text-center">
              {t('msg.no_settings_match', { query })}
            </Text>
            <Pressable onPress={() => setQuery('')} className="mt-3">
              <Text className="text-sm font-semibold text-primary">
                {t('action.clear_recent_searches')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Detail Panel (wide mode) ──────────────────

function DetailPanel({ selectedKey }: { selectedKey: string | null }) {
  switch (selectedKey) {
    case 'display':
      return <DisplaySettings />;
    case 'playback':
      return <PlaybackSettings />;
    case 'speech':
      return <SpeechSettings />;
    case 'review':
      return <ReviewSettings />;
    default:
      return (
        <View className="flex-1 items-center justify-center bg-background">
          <Text className="text-sm text-muted-foreground">
            Select a settings category
          </Text>
        </View>
      );
  }
}

// ── Main Screen ───────────────────────────────

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const sidebarWidth = Math.min(256, width * 0.4);
  const isWide = width >= 600 && (width - sidebarWidth) >= 320;

  const handleSelect = (key: string) => {
    if (isWide) {
      setSelectedKey(key);
    } else {
      // Navigate via expo-router
      if (key === 'offline') {
        router.push('/(tabs)/(me)/offline-dictionaries' as any);
      } else {
        router.push(`/(tabs)/(me)/settings/${key}` as any);
      }
    }
  };

  if (isWide) {
    return (
      <View className="flex-row flex-1 bg-background">
        <View style={{ width: sidebarWidth }} className="border-r border-border">
          <SettingsList selectedKey={selectedKey} onSelect={handleSelect} />
        </View>
        <View className="flex-1">
          <DetailPanel selectedKey={selectedKey} />
        </View>
      </View>
    );
  }

  return <SettingsList selectedKey={null} onSelect={handleSelect} />;
}
