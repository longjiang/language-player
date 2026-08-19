import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <Card className="mb-4 p-3">
      <Text className="text-sm font-semibold text-destructive">
        {t('error.offline_mode_blocked')}
      </Text>
      <Text className="mt-1 text-xs text-muted-foreground">
        {t('setting.offline_mode_desc')}
      </Text>
      <Button
        onPress={() => void setOfflineMode(false)}
        variant="default"
        size="sm"
        className="mt-2 self-start"
        accessibilityRole="button"
      >
        <Text className="text-xs font-semibold text-primary-foreground">
          {t('action.turn_off_offline_mode')}
        </Text>
      </Button>
    </Card>
  );
}
