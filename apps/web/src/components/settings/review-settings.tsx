'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useLanguage } from '@/providers/language-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { SliderRow } from '@/components/settings/SliderRow';
import { log } from '@/lib/logger';
import { effectiveDailyNewLimit, FREE_SRS_DAILY_NEW_CARDS } from '@langplayer/utils';

export function ReviewSettings() {
  const { review, updateReview, loaded } = useSettingsContext();
  const { isPro } = useSubscriptionContext();
  const { l1, l2 } = useLanguage();
  const t = useT();
  /** True after a free user tried to set more than the free allowance. */
  const [limitDenied, setLimitDenied] = useState(false);

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

  // What actually applies: the configured limit, bounded by the free daily
  // new-card allowance (ADR-0034 D4, revised 2026-09-16). Reviewing cards
  // already in the deck is never limited — only new cards are.
  const effectiveLimit = effectiveDailyNewLimit(review.dailyNewLimit, isPro);

  const handleLimitChange = useCallback(
    (v: number) => {
      const requested = Math.floor(v);
      if (!isPro && requested > FREE_SRS_DAILY_NEW_CARDS) {
        log('[SRS Review] new cards/day above the free allowance — denied', {
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

  if (!loaded) {
    return <div className="px-6 py-10 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  const showFreeLimitNotice =
    limitDenied || (!isPro && review.dailyNewLimit > FREE_SRS_DAILY_NEW_CARDS);

  return (
    <div className="px-6 py-6">
      <h2 className="text-xl font-bold mb-6">{t('title.review')}</h2>

      <SliderRow
        label={t('label.new_cards_per_day')}
        description={t('msg.new_cards_per_day_desc')}
        min={1} max={200} step={1} value={effectiveLimit}
        onChange={handleLimitChange}
        leftLabel="1"
        centerLabel={t('msg.default_value', { n: 20 })}
        rightLabel="200"
      />

      {showFreeLimitNotice && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
          <p className="text-xs font-medium">{t('msg.free_new_cards_limit')}</p>
          <Link
            href={`/${l1.code}/${l2.code}/go-pro`}
            className="mt-1 inline-block text-xs font-semibold text-primary underline"
          >
            {t('action.upgrade_to_pro')}
          </Link>
        </div>
      )}

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
