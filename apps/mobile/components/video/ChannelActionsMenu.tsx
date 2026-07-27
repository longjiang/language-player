import React from 'react';
import { Bell, BellOff, EyeOff, Eye } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useChannelPreference } from '@/hooks/use-channel-preference';
import { ContextMenu } from '@/components/ui/context-menu';
import type { ContextMenuItem } from '@/components/ui/context-menu';

interface ChannelActionsMenuProps {
  channelId: string;
}

/**
 * Reusable "..." menu for channel subscribe/not-interested actions.
 *
 * Renders a MoreVertical button via ContextMenu. On press, opens a bottom
 * sheet with options to subscribe/unsubscribe and mark as not interested /
 * remove.
 *
 * Ported from web's ChannelActionsMenu — uses ContextMenu (bottom sheet)
 * instead of portal-based dropdown for mobile-friendly interaction.
 */
export function ChannelActionsMenu({ channelId }: ChannelActionsMenuProps) {
  const t = useT();
  const { pref, savePref } = useChannelPreference(channelId);

  // Build menu items dynamically based on current preference state.
  // Items are recomputed when pref or translations change — both are
  // infrequent, so no need for useMemo here.
  const items: ContextMenuItem[] = [
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
  ];

  return <ContextMenu items={items} />;
}
