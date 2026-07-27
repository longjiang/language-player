import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { MoreVertical, Bell, BellOff, EyeOff, Eye } from 'lucide-react-native';
import { useT } from '@/hooks/use-t';
import { useChannelPreference } from '@/hooks/use-channel-preference';
import { ICON_MUTED, ICON_PRIMARY } from '@/lib/theme-colors';

interface ChannelActionsMenuProps {
  channelId: string;
}

/**
 * Reusable "..." menu for channel subscribe/not-interested actions.
 *
 * Renders a MoreVertical button. On press, opens a bottom sheet with
 * options to subscribe/unsubscribe and mark as not interested / remove.
 *
 * Ported from web's ChannelActionsMenu — uses bottom sheet instead of
 * portal-based dropdown for mobile-friendly interaction.
 */
export function ChannelActionsMenu({ channelId }: ChannelActionsMenuProps) {
  const t = useT();
  const { pref, savePref } = useChannelPreference(channelId);
  const [open, setOpen] = useState(false);

  const handleAction = (status: 'subscribed' | 'not_interested' | 'neutral') => {
    savePref(status);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); e.preventDefault?.(); setOpen(true); }}
        className="h-7 w-7 items-center justify-center rounded-md active:bg-muted"
        hitSlop={6}
      >
        <MoreVertical size={14} color={ICON_MUTED} />
      </Pressable>

      {/* Bottom sheet menu */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            className="rounded-t-2xl bg-card px-4 pb-8 pt-2"
          >
            {/* Handle bar */}
            <View className="mb-4 items-center">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </View>

            {/* Subscribe / Unsubscribe */}
            {pref !== 'subscribed' ? (
              <Pressable
                onPress={() => handleAction('subscribed')}
                className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Bell size={16} color={ICON_PRIMARY} />
                </View>
                <Text className="text-base text-foreground">{t('action.subscribe')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => handleAction('neutral')}
                className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <BellOff size={16} color={ICON_PRIMARY} />
                </View>
                <Text className="text-base text-foreground">{t('action.unsubscribe')}</Text>
              </Pressable>
            )}

            {/* Not Interested / Remove Not Interested */}
            {pref !== 'not_interested' ? (
              <Pressable
                onPress={() => handleAction('not_interested')}
                className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <EyeOff size={16} color={ICON_PRIMARY} />
                </View>
                <Text className="text-base text-foreground">{t('action.not_interested')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => handleAction('neutral')}
                className="flex-row items-center gap-3 rounded-lg px-4 py-3.5 active:bg-muted"
              >
                <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Eye size={16} color={ICON_PRIMARY} />
                </View>
                <Text className="text-base text-foreground">{t('action.remove_not_interested')}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
