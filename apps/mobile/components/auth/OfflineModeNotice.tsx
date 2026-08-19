import React from 'react';
import { Text, View } from 'react-native';
import { Button, buttonTextClass } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-destructive">
          {t('error.offline_mode_blocked')}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          <Text className={buttonTextClass('default')}>
            {t('action.turn_off_offline_mode')}
          </Text>
        </Button>
      </CardContent>
    </Card>
  );
}
