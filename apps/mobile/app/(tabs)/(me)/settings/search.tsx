import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useT } from '@/hooks/use-t';
import { ToggleRow } from '@/components/settings/ToggleRow';

export function SearchSettings() {
  const { search, updateSearch } = useSettingsContext();
  const { isPro } = useSubscription();
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        <ToggleRow
          label={t('setting.expand_subs_search')}
          desc={t('setting.expand_subs_search_desc')}
          value={isPro && search.expandSubsSearch}
          disabled={!isPro}
          onValueChange={(v) => updateSearch({ expandSubsSearch: v })}
        />
      </View>
    </ScrollView>
  );
}

export default SearchSettings;
