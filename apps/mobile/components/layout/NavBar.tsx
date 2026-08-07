import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import {
  Compass, Music, Tv, Clapperboard, Upload,
  FileText, Globe, BookOpen, BookMarked, RotateCcw, ChevronDown,
} from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';

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
      { key: 'title.local_media', href: '/(tabs)/(media)/local-media' },
    ],
  },
  {
    label: 'Reading',
    links: [
      { key: 'title.notes_reader', href: '/(tabs)/(reading)' },
      { key: 'title.web_reader', href: '/(tabs)/(reading)/web-reader' },
      { key: 'title.epub_reader', href: '/(tabs)/(reading)/epub' },
    ],
  },
  {
    label: 'Vocab',
    links: [
      { key: 'title.dictionary', href: '/(tabs)/(vocab)' },
      { key: 'title.review', href: '/(tabs)/(vocab)/review' },
    ],
  },
];

const NAV_ICONS: Record<string, React.ReactNode> = {
  explore: <Compass size={16} color={ICON_MUTED} />,
  music: <Music size={16} color={ICON_MUTED} />,
  'live-tv': <Tv size={16} color={ICON_MUTED} />,
  'tv-shows': <Clapperboard size={16} color={ICON_MUTED} />,
  'local-media': <Upload size={16} color={ICON_MUTED} />,
  reader: <FileText size={16} color={ICON_MUTED} />,
  'web-reader': <Globe size={16} color={ICON_MUTED} />,
  epub: <BookOpen size={16} color={ICON_MUTED} />,
  dictionary: <BookMarked size={16} color={ICON_MUTED} />,
  review: <RotateCcw size={16} color={ICON_MUTED} />,
};

function iconKey(href: string): string {
  const parts = href.split('/');
  return parts[parts.length - 1]!;
}

/**
 * Desktop/tablet navigation bar — mirrors apps/web Header's md+ dropdowns.
 * Rendered only at ≥768px by Header; phones keep the hamburger drawer.
 */
export function NavBar({ headerHeight }: { headerHeight: number }) {
  const t = useT();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const navigate = (href: string) => {
    setOpenGroup(null);
    router.push(href as any);
  };

  const activeGroup = NAV_GROUPS.find((group) => group.label === openGroup);

  return (
    <>
      <View className="flex-row items-center gap-1">
        {NAV_GROUPS.map((group) => (
          <Pressable
            key={group.label}
            onPress={() => setOpenGroup(openGroup === group.label ? null : group.label)}
            className={`flex-row items-center gap-0.5 rounded-lg px-3 py-1.5 active:bg-muted ${
              openGroup === group.label ? 'bg-muted' : ''
            }`}
          >
            <Text className="text-sm text-muted-foreground">
              {t(`nav.${group.label.toLowerCase()}` as any)}
            </Text>
            <ChevronDown size={14} color={ICON_MUTED} />
          </Pressable>
        ))}
      </View>

      <Modal
        transparent
        visible={openGroup !== null}
        animationType="fade"
        onRequestClose={() => setOpenGroup(null)}
      >
        <View className="flex-1">
          <Pressable className="absolute inset-0" onPress={() => setOpenGroup(null)} />
          {activeGroup && (
            <View
              style={{
                position: 'absolute',
                top: headerHeight,
                left: 16,
                // Inline shadow instead of the `shadow-lg` class: NativeWind's
                // dynamic class upgrades can crash dev builds with a misleading
                // "navigation context" error (nativewind/nativewind#1432).
                shadowColor: ICON_MUTED,
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
              className="z-50 min-w-[180px] rounded-lg border border-border bg-card p-1"
            >
              {activeGroup.links.map((link) => (
                <Pressable
                  key={link.href}
                  onPress={() => navigate(link.href)}
                  className="flex-row items-center gap-2.5 rounded-md px-3 py-2 active:bg-muted"
                >
                  <View className="opacity-60">{NAV_ICONS[iconKey(link.href)]}</View>
                  <Text className="text-sm text-muted-foreground">{t(link.key)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}
