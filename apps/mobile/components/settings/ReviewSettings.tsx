import React, { useCallback, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';
import { Button, buttonTextClass } from '@/components/ui/button';
import { log } from '@/lib/logger';
import { effectiveDailyNewLimit, FREE_SRS_DAILY_NEW_CARDS } from '@langplayer/utils';

export function ReviewSettings() {
  const { review, updateReview } = useSettingsContext();
  const { isPro } = useSubscription();
  const t = useT();
  const router = useRouter();
  /** True after a free user tried to set more than the free allowance. */
  const [limitDenied, setLimitDenied] = useState(false);

  // What actually applies: the configured limit, bounded by the free daily
  // new-card allowance (ADR-0034 D4, revised 2026-09-16). Reviewing cards
  // already in the deck is never limited — only new cards are.
  const effectiveLimit = effectiveDailyNewLimit(review.dailyNewLimit, isPro);

  const handleLimitChange = useCallback(
    (v: number) => {
      const requested = Math.floor(v);
      if (!isPro && requested > FREE_SRS_DAILY_NEW_CARDS) {
        log('[srs] new cards/day above the free allowance — denied', {
          requested,
          allowed: FREE_SRS_DAILY_NEW_CARDS,
          stored: review.dailyNewLimit,
        });
        setLimitDenied(true);
        // Keep the slider at the ceiling so the UI matches what applies.
        if (review.dailyNewLimit > FREE_SRS_DAILY_NEW_CARDS) {
          updateReview({ dailyNewLimit: FREE_SRS_DAILY_NEW_CARDS });
        }
        return;
      }
      setLimitDenied(false);
      if (requested !== review.dailyNewLimit) {
        updateReview({ dailyNewLimit: requested });
      }
    },
    [isPro, review.dailyNewLimit, updateReview],
  );

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="px-4 pt-6 pb-8">
        <SliderRow
          label={t('label.new_cards_per_day')}
          desc={t('msg.new_cards_per_day_desc')}
          value={effectiveLimit}
          min={1}
          max={200}
          onValueChange={handleLimitChange}
          leftLabel="1"
          centerLabel={t('msg.default_value', { n: 20 })}
          rightLabel="200"
        />
        {(limitDenied || (!isPro && review.dailyNewLimit > FREE_SRS_DAILY_NEW_CARDS)) && (
          <View className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <Text className="text-xs text-center font-medium text-foreground">
              {t('msg.free_new_cards_limit')}
            </Text>
            <Button
              onPress={() => router.push('/(tabs)/(me)/go-pro' as any)}
              variant="link"
              className="mt-1"
            >
              <Text className={buttonTextClass('link')}>{t('action.upgrade_to_pro')}</Text>
            </Button>
          </View>
        )}
        <SliderRow
          label={t('label.next_day_starts_at')}
          desc={t('msg.next_day_starts_at_desc')}
          value={review.dayStartHour}
          min={0}
          max={23}
          onValueChange={(v) => updateReview({ dayStartHour: v })}
          valueDisplay={`${review.dayStartHour}:00`}
          leftLabel="0:00"
          centerLabel="4:00"
          rightLabel="23:00"
        />
      </View>
    </ScrollView>
  );
}

export default ReviewSettings;
