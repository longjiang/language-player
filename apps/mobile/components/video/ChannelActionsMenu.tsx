import React, { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { MoreVertical } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useChannelPreference } from '@/hooks/use-channel-preference';
import { Pressable } from '@/components/ui/pressable';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';

interface ChannelActionsMenuProps {
  channelId?: string;
  /** When provided, the menu also offers "Add to Playlist" for this video. */
  video?: YouTubeVideo;
}

/**
 * Reusable "..." menu for channel subscribe/not-interested actions.
 * When a `video` is passed, also offers "Add to Playlist" (Classic's
 * YouTubeVideoCard actions modal behavior).
 *
 * Renders a MoreVertical button that opens a NATIVE menu — an iOS `UIMenu`
 * anchored popover (iOS 14+) / Android `PopupMenu` — via the
 * `@react-native-menu/menu` native module (ChannelActionsMenu → UIMenu).
 *
 * NOTE: this is a native module, so it requires a development build
 * (`npx expo run:ios` / `run:android`); it does not run in Expo Go.
 * It replaces the previous `ContextMenu` bottom-sheet picker so the anchored
 * popover can be compared against the action-sheet style.
 */
export function ChannelActionsMenu({ channelId, video }: ChannelActionsMenuProps) {
  const t = useT();
  const { pref, savePref } = useChannelPreference(channelId);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  if (!channelId && !video) return null;

  // iOS SF Symbol for a menu item; Android's PopupMenu renders text-only, so
  // no image is passed there. `imageColor` is REQUIRED on New-Architecture
  // builds running iOS 26+: the codegen defaults it to 0 (transparent) and the
  // native layer tints the SF Symbol with `rgba(0,0,0,0)`, making the icon
  // invisible (react-native-menu#1034/#1200). Use the brand primary color so
  // the icons are visible and match the theme.
  const sf = (name: string) => (Platform.OS === 'ios' ? name : undefined);

  const actions = [
    ...(channelId
      ? [
          pref !== 'subscribed'
            ? {
                id: 'subscribe',
                title: t('action.subscribe'),
                image: sf('bell'),
                imageColor: ICON_PRIMARY,
              }
            : {
                id: 'unsubscribe',
                title: t('action.unsubscribe'),
                image: sf('bell.slash'),
                imageColor: ICON_PRIMARY,
              },
          pref !== 'not_interested'
            ? {
                id: 'not-interested',
                title: t('action.not_interested'),
                image: sf('eye.slash'),
                imageColor: ICON_PRIMARY,
              }
            : {
                id: 'remove-not-interested',
                title: t('action.remove_not_interested'),
                image: sf('eye'),
                imageColor: ICON_PRIMARY,
              },
        ]
      : []),
    ...(video
      ? [
          {
            id: 'add-to-playlist',
            title: t('action.add_to_playlist'),
            image: sf('music.note.list'),
            imageColor: ICON_PRIMARY,
          },
        ]
      : []),
  ];

  const handleAction = useCallback(
    (event: string) => {
      switch (event) {
        case 'subscribe':
          savePref('subscribed');
          break;
        case 'unsubscribe':
          savePref('neutral');
          break;
        case 'not-interested':
          savePref('not_interested');
          break;
        case 'remove-not-interested':
          savePref('neutral');
          break;
        case 'add-to-playlist':
          // The native menu auto-dismisses before onPressAction fires, so we
          // can present the dialog on top directly (no delay needed, unlike
          // the old bottom-sheet modal).
          setPlaylistOpen(true);
          break;
      }
    },
    [savePref],
  );

  return (
    <>
      <MenuView
        onPressAction={({ nativeEvent }) => handleAction(nativeEvent.event)}
        actions={actions}
      >
        <Pressable
          className="h-7 w-7 items-center justify-center rounded-md active:bg-muted"
          hitSlop={6}
          accessibilityRole="button"
        >
          <MoreVertical size={16} color={ICON_MUTED} />
        </Pressable>
      </MenuView>
      <AddToPlaylistDialog
        open={playlistOpen}
        onOpenChange={setPlaylistOpen}
        video={video ?? null}
      />
    </>
  );
}
