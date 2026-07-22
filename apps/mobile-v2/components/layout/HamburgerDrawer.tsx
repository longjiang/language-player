import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/hooks/use-t';
import {
  Compass, Music, Tv, Clapperboard, History, Upload,
  FileText, BookMarked, Bookmark, RotateCcw, Globe, BookOpen,
} from 'lucide-react-native';
import { darkSemantic, hslToHex } from '@langplayer/shared';

// Icon color from dark theme muted-foreground token
const ICON_COLOR = hslToHex(darkSemantic.mutedForeground);

// ── Same nav structure + icons as web (apps/web/src/components/layout/header.tsx) ──

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
      { key: 'title.notes_reader', href: '/(tabs)/(reading)/reader' },
      { key: 'title.web_reader', href: '/(tabs)/(reading)/web-reader' },
      { key: 'title.epub_reader', href: '/(tabs)/(reading)/epub' },
    ],
  },
  {
    label: 'Vocab',
    links: [
      { key: 'title.dictionary', href: '/(tabs)/(vocab)/dictionary' },
      { key: 'title.saved_words', href: '/(tabs)/(vocab)/saved-words' },
      { key: 'title.review', href: '/(tabs)/(vocab)/review' },
    ],
  },
];

// Icons matching Next.js NAV_ICONS (apps/web/src/components/layout/header.tsx)
const NAV_ICONS: Record<string, React.ReactNode> = {
  explore: <Compass size={16} color={ICON_COLOR} />,
  music: <Music size={16} color={ICON_COLOR} />,
  'live-tv': <Tv size={16} color={ICON_COLOR} />,
  'tv-shows': <Clapperboard size={16} color={ICON_COLOR} />,
  'watch-history': <History size={16} color={ICON_COLOR} />,
  'local-media': <Upload size={16} color={ICON_COLOR} />,
  reader: <FileText size={16} color={ICON_COLOR} />,
  'web-reader': <Globe size={16} color={ICON_COLOR} />,
  epub: <BookOpen size={16} color={ICON_COLOR} />,
  dictionary: <BookMarked size={16} color={ICON_COLOR} />,
  'saved-words': <Bookmark size={16} color={ICON_COLOR} />,
  review: <RotateCcw size={16} color={ICON_COLOR} />,
};

/** Extract last path segment as icon key (e.g., "/(tabs)/(media)/live-tv" → "live-tv"). */
function iconKey(href: string): string {
  const parts = href.split('/');
  return parts[parts.length - 1]!;
}

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
      {/* Backdrop */}
      <Pressable
        style={StyleSheet.absoluteFill}
        className="z-40 bg-black/20"
        onPress={onClose}
      />
      {/* Drawer */}
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
                  className="flex-row items-center gap-3 rounded-lg px-3 py-2 active:bg-muted"
                  onPress={() => {
                    onClose();
                    router.push(link.href as any);
                  }}
                >
                  <View className="opacity-100">{NAV_ICONS[iconKey(link.href)]}</View>
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
