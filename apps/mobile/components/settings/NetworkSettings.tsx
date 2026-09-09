import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SectionHeader } from '@/components/settings/SectionHeader';
import { ToggleRow } from '@/components/settings/ToggleRow';

export function NetworkSettings() {
  const { offlineMode, setOfflineMode } = useSettingsContext();
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        <View className="mb-5">
          <SectionHeader title={t('setting.network')} />
          <ToggleRow
            label={t('title.offline_mode')}
            desc={t('setting.offline_mode_desc')}
            value={offlineMode}
            onValueChange={setOfflineMode}
          />
          <Text className="text-xs text-muted-foreground mt-3">
            {t('msg.offline_mode_not_synced')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

export default NetworkSettings;
