import React from 'react';
import { View, ScrollView } from 'react-native';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';

export function ReviewSettings() {
  const { review, updateReview } = useSettingsContext();
  const t = useT();

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        <SliderRow
          label={t('label.new_cards_per_day')}
          desc={t('msg.new_cards_per_day_desc')}
          value={review.dailyNewLimit}
          min={1}
          max={200}
          onValueChange={(v) => updateReview({ dailyNewLimit: v })}
          leftLabel="1"
          centerLabel={t('msg.default_value', { n: 20 })}
          rightLabel="200"
        />
      </View>
    </ScrollView>
  );
}

export default ReviewSettings;
