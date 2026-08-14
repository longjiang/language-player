'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useT } from '@/hooks/use-t';
import { SectionHeader } from '../_components/SectionHeader';
import { SliderRow } from '../_components/SliderRow';

export default function ReviewSettingsPage() {
  const { review, updateReview, loaded } = useSettingsContext();
  const t = useT();

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      toast.success(t('msg.settings_saved'));
    }, 1200);
    return () => clearTimeout(timer);
  }, [review, t]);

  if (!loaded) {
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-3xl font-bold mb-8">{t('title.review')}</h1>

      <SliderRow
        label={t('label.new_cards_per_day')}
        description={t('msg.new_cards_per_day_desc')}
        min={1} max={200} step={1} value={review.dailyNewLimit}
        onChange={v => updateReview({ dailyNewLimit: v })}
        leftLabel="1"
        centerLabel={t('msg.default_value', { n: 20 })}
        rightLabel="200"
      />

      <div className="mt-8">
        <SliderRow
          label={t('label.next_day_starts_at')}
          description={t('msg.next_day_starts_at_desc')}
          min={0} max={23} step={1} value={review.dayStartHour}
          onChange={v => updateReview({ dayStartHour: v })}
          leftLabel="0:00"
          centerLabel="4:00"
          rightLabel="23:00"
          valueDisplay={`${review.dayStartHour}:00`}
        />
      </div>
    </div>
  );
}
