import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, useWindowDimensions,
  Modal, Animated,
} from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { useT } from '@/hooks/use-t';
import { useReaderChrome } from '@/contexts/ReaderChromeContext';
import {
  Compass, Music, Tv, Clapperboard, Upload,
  FileText, BookMarked, RotateCcw, Globe, BookOpen, ImageIcon,
} from 'lucide-react-native';
import { ICON_MUTED } from '@/lib/theme-colors';
import { SIDEBAR_EDGE_MARGIN } from '@/components/ui/sidebar';

const ICON_COLOR = ICON_MUTED;

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
      { key: 'title.channels', href: '/(tabs)/(media)/channels' },
      { key: 'title.local_media', href: '/(tabs)/(media)/local-media' },
    ],
  },
  {
    label: 'Reading',
    links: [
      { key: 'title.notes_reader', href: '/(tabs)/(reading)' },
      { key: 'title.web_reader', href: '/(tabs)/(reading)/web-reader' },
      { key: 'title.epub_reader', href: '/(tabs)/(reading)/epub' },
      { key: 'title.image_reader', href: '/(tabs)/(reading)/image-reader' },
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

// Icons matching Next.js NAV_ICONS (apps/web/src/components/layout/header.tsx)
const NAV_ICONS: Record<string, React.JSX.Element> = {
  '(media)': <Compass size={16} color={ICON_COLOR} />,
  '(reading)': <FileText size={16} color={ICON_COLOR} />,
  '(vocab)': <BookMarked size={16} color={ICON_COLOR} />,
  explore: <Compass size={16} color={ICON_COLOR} />,
  music: <Music size={16} color={ICON_COLOR} />,
  'live-tv': <Tv size={16} color={ICON_COLOR} />,
  'tv-shows': <Clapperboard size={16} color={ICON_COLOR} />,
  channels: <Tv size={16} color={ICON_COLOR} />,
  'local-media': <Upload size={16} color={ICON_COLOR} />,
  reader: <FileText size={16} color={ICON_COLOR} />,
  'web-reader': <Globe size={16} color={ICON_COLOR} />,
  epub: <BookOpen size={16} color={ICON_COLOR} />,
  'image-reader': <ImageIcon size={16} color={ICON_COLOR} />,
  dictionary: <BookMarked size={16} color={ICON_COLOR} />,
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
  /** Measured height of the header bar — drawer panel starts right below it. */
  headerHeight: number;
}

export function HamburgerDrawer({ open, onClose, headerHeight }: HamburgerDrawerProps) {
  const t = useT();
  const { requestCloseReader } = useReaderChrome();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(256, screenWidth * 0.6);

  // Hidden position: fully off the right edge (resting position is
  // right: SIDEBAR_EDGE_MARGIN), so the floating panel clears the screen.
  const hiddenX = drawerWidth + SIDEBAR_EDGE_MARGIN + 16;
  // Animated value for slide-in from the right
  const translateX = useRef(new Animated.Value(hiddenX)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : hiddenX,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: open ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, overlayOpacity, hiddenX]);

  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* Semi-transparent overlay — tap to close */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        className="absolute inset-0 bg-black/20"
        style={{ opacity: overlayOpacity }}
      >
        <Pressable className="flex-1" onPress={onClose} />
      </Animated.View>

      {/* Floating drawer panel — inset from the header and the screen edges
          (right/bottom) with rounded corners, matching the shared sidebar
          sheet so no panel ever touches the screen edges. */}
      <Animated.View
        className="absolute bg-background border border-border shadow-lg"
        style={{
          top: headerHeight + SIDEBAR_EDGE_MARGIN,
          bottom: insets.bottom + SIDEBAR_EDGE_MARGIN,
          right: SIDEBAR_EDGE_MARGIN,
          width: drawerWidth,
          borderRadius: 12,
          transform: [{ translateX }],
        }}
      >
        <ScrollView className="flex-1 p-4">
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
                    // Tapping "Epub Reader" while already on the epub reader
                    // closes the open book (an alternative to the close
                    // button) instead of a no-op same-route navigation.
                    const onEpubSelfNav = link.href === '/(tabs)/(reading)/epub' && (pathname === '/epub' || pathname.endsWith('/epub'));
                    if (onEpubSelfNav) { requestCloseReader(); return; }
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
      </Animated.View>
    </Modal>
  );
}
