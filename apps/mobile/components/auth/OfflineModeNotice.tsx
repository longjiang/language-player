import React from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';

/**
 * Escape hatch on auth screens: if the device-local Offline Mode toggle is
 * on, the network gate blocks login/registration. Show why requests fail and
 * let the user turn the toggle off right there.
 */
export function OfflineModeNotice() {
  const t = useT();
  const { offlineMode, setOfflineMode } = useSettingsContext();
  if (!offlineMode) return null;

  return (
    <View className="mb-4 rounded-lg border border-border bg-card p-3">
      <Text className="text-sm font-semibold text-destructive">
        {t('error.offline_mode_blocked')}
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {t('setting.offline_mode_desc')}
      </Text>
      <Pressable
        onPress={() => void setOfflineMode(false)}
        className="mt-2 self-start rounded-md bg-primary px-3 py-1.5"
        accessibilityRole="button"
      >
        <Text className="text-xs font-semibold text-primary-foreground">
          {t('action.turn_off_offline_mode')}
        </Text>
      </Pressable>
    </View>
  );
}
