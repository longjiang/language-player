import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/hooks/use-t';

// ── Same nav structure as web (apps/web/src/components/layout/header.tsx) ──

interface NavGroup {
  label: string;
  links: { key: string; href: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Media',
    links: [
      { key: 'title.explore', href: '/(tabs)/(media)' },
      { key: 'title.music_and_entertainment', href: '/(tabs)/(media)/music' },
      { key: 'title.live_tv', href: '/(tabs)/(media)/live-tv' },
      { key: 'title.tv_shows', href: '/(tabs)/(media)/tv-shows' },
      { key: 'title.watch_history', href: '/(tabs)/(media)/watch-history' },
      { key: 'title.local_media', href: '/(tabs)/(media)/local-media' },
    ],
  },
  {
    label: 'Reading',
    links: [
      { key: 'title.notes_reader', href: '/(tabs)/(reading)' },
    ],
  },
  {
    label: 'Vocab',
    links: [
      { key: 'title.dictionary', href: '/(tabs)/(vocab)' },
      { key: 'title.saved_words', href: '/(tabs)/(vocab)/saved-words' },
      { key: 'title.review', href: '/(tabs)/(vocab)/review' },
    ],
  },
];

interface HamburgerDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HamburgerDrawer({ open, onClose }: HamburgerDrawerProps) {
  const t = useT();
  const insets = useSafeAreaInsets();

  if (!open) return null;

  return (
    <>
      {/* Backdrop — covers entire screen including notch */}
      <Pressable
        style={StyleSheet.absoluteFill}
        className="z-40 bg-black/20"
        onPress={onClose}
      />
      {/* Drawer — starts at very top, gets safe area top padding */}
      <View
        className="absolute right-0 z-50 h-full w-64 border-l border-border bg-background shadow-lg"
        style={{ paddingTop: insets.top + 8 }}
      >
        <ScrollView className="px-4">
          {NAV_GROUPS.map((group) => (
            <View key={group.label} className="mb-4">
              <Text className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t(`nav.${group.label.toLowerCase()}` as any)}
              </Text>
              {group.links.map((link) => (
                <Pressable
                  key={link.href}
                  className="rounded-lg px-3 py-2 active:bg-muted"
                  onPress={() => {
                    onClose();
                    router.push(link.href as any);
                  }}
                >
                  <Text className="text-sm text-foreground">{t(link.key)}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </>
  );
}
