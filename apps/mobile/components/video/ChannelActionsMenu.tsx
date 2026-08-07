import React, { useCallback, useState } from 'react';
import { Bell, BellOff, EyeOff, Eye, ListMusic } from 'lucide-react-native';
import type { YouTubeVideo } from '@langplayer/shared';
import { useT } from '@/hooks/use-t';
import { useChannelPreference } from '@/hooks/use-channel-preference';
import { ContextMenu } from '@/components/ui/context-menu';
import type { ContextMenuItem } from '@/components/ui/context-menu';
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
 * Renders a MoreVertical button via ContextMenu. On press, opens a bottom
 * sheet with options to subscribe/unsubscribe and mark as not interested /
 * remove.
 *
 * Ported from web's ChannelActionsMenu — uses ContextMenu (bottom sheet)
 * instead of portal-based dropdown for mobile-friendly interaction.
 */
export function ChannelActionsMenu({ channelId, video }: ChannelActionsMenuProps) {
  const t = useT();
  const { pref, savePref } = useChannelPreference(channelId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Wait for the context-menu modal to start closing before presenting the
  // add-to-playlist dialog on top (mirrors Classic's actions-modal nextTick).
  const openAddToPlaylist = useCallback(() => {
    setMenuOpen(false);
    setTimeout(() => setPlaylistOpen(true), 0);
  }, []);

  if (!channelId && !video) return null;

  // Build menu items dynamically based on current preference state.
  // Items are recomputed when pref or translations change — both are
  // infrequent, so no need for useMemo here.
  const items: ContextMenuItem[] = [
    ...(channelId
      ? [
          pref !== 'subscribed'
            ? {
                key: 'subscribe',
                icon: Bell,
                label: t('action.subscribe'),
                onPress: () => savePref('subscribed'),
              }
            : {
                key: 'unsubscribe',
                icon: BellOff,
                label: t('action.unsubscribe'),
                onPress: () => savePref('neutral'),
              },
          pref !== 'not_interested'
            ? {
                key: 'not-interested',
                icon: EyeOff,
                label: t('action.not_interested'),
                onPress: () => savePref('not_interested'),
              }
            : {
                key: 'remove-not-interested',
                icon: Eye,
                label: t('action.remove_not_interested'),
                onPress: () => savePref('neutral'),
              },
        ]
      : []),
    ...(video
      ? [
          {
            key: 'add-to-playlist',
            icon: ListMusic,
            label: t('action.add_to_playlist'),
            onPress: openAddToPlaylist,
          },
        ]
      : []),
  ];

  return (
    <>
      <ContextMenu items={items} open={menuOpen} onOpenChange={setMenuOpen} />
      <AddToPlaylistDialog
        open={playlistOpen}
        onOpenChange={setPlaylistOpen}
        video={video ?? null}
      />
    </>
  );
}
