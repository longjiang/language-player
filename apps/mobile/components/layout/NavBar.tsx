import React from 'react';
import { View, Text, Platform } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { Pressable } from '@/components/ui/pressable';
import { router } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { ChevronDown } from 'lucide-react-native';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

interface NavGroup {
  label: string;
  /** `sf` is the iOS SF Symbol for the item (Android PopupMenu renders text-only). */
  links: { key: string; href: string; sf: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Media',
    links: [
      { key: 'title.explore', href: '/(tabs)/(media)', sf: 'safari' },
      { key: 'title.music_and_entertainment', href: '/(tabs)/(media)/music', sf: 'music.note' },
      { key: 'title.live_tv', href: '/(tabs)/(media)/live-tv', sf: 'tv' },
      { key: 'title.tv_shows', href: '/(tabs)/(media)/tv-shows', sf: 'play.rectangle' },
      { key: 'title.channels', href: '/(tabs)/(media)/channels', sf: 'play.tv' },
      { key: 'title.local_media', href: '/(tabs)/(media)/local-media', sf: 'arrow.up.doc' },
    ],
  },
  {
    label: 'Reading',
    links: [
      { key: 'title.notes_reader', href: '/(tabs)/(reading)', sf: 'doc.text' },
      { key: 'title.web_reader', href: '/(tabs)/(reading)/web-reader', sf: 'globe' },
      { key: 'title.epub_reader', href: '/(tabs)/(reading)/epub', sf: 'book' },
      { key: 'title.image_reader', href: '/(tabs)/(reading)/image-reader', sf: 'photo' },
    ],
  },
  {
    label: 'Vocab',
    links: [
      { key: 'title.dictionary', href: '/(tabs)/(vocab)', sf: 'character.book.closed' },
      { key: 'title.review', href: '/(tabs)/(vocab)/review', sf: 'arrow.clockwise' },
    ],
  },
];

/**
 * Desktop/tablet navigation bar — each group renders a native UIMenu popover
 * (iOS) / PopupMenu (Android) anchored to the group button. Mirrors web
 * Header's md+ dropdowns. Phones keep the hamburger drawer.
 */
export function NavBar() {
  const t = useT();

  const navigate = (href: string) => {
    // NOTE: tapping "Epub Reader" no longer closes an open book from the nav
    // menu (same-route close via requestCloseReader). That feature is disabled
    // because it could feed back into the epub auto-open effect and create an
    // open->close->reopen loop where a book could never be opened. The escape
    // hatches for leaving the reader are its own chromeless close button and
    // the back stack; the nav item is a plain navigation.
    router.push(href as any);
  };

  return (
    <View className="flex-row items-center gap-1">
      {NAV_GROUPS.map((group) => (
        <MenuView
          key={group.label}
          onPressAction={({ nativeEvent }) => navigate(nativeEvent.event)}
          actions={group.links.map((link) => ({
            id: link.href,
            title: t(link.key),
            image: Platform.OS === 'ios' ? link.sf : undefined,
            imageColor: ICON_PRIMARY,
          }))}
        >
          <Pressable className="flex-row items-center gap-0.5 rounded-lg px-3 py-1.5 active:bg-muted">
            <Text className="text-sm text-muted-foreground">
              {t(`nav.${group.label.toLowerCase()}` as any)}
            </Text>
            <ChevronDown size={14} color={ICON_MUTED} />
          </Pressable>
        </MenuView>
      ))}
    </View>
  );
}
