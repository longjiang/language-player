'use client';

import { useLocale } from 'next-intl';
import { useT } from '@/hooks/use-t';
import { useSaleWindow, formatSaleDate } from '@/hooks/use-sale';
import { SALE_DISCOUNT } from '@langplayer/shared';

/**
 * Compact sale line for the in-app upgrade prompts.
 *
 * Classic renders its full `Sale.vue` banner inside the "you need Pro" prompt
 * (`zerotohero-nuxt/components/YouNeedPro.vue` → `<Sale class="mt-4 mx-2" />`).
 * The prompts in this app are inline strips rather than screens, so this is a
 * condensed two-line version of the same message: the sale headline, the
 * discount, and the deadline.
 *
 * The percentage comes from the declared `SALE_DISCOUNT` constant — exactly as
 * Classic's `Sale.vue` does (`Math.round((1 - SALE_DISCOUNT) * 100)`) — so this
 * component needs no API call. It quotes no price, so there is nothing here
 * that could disagree with the amount checkout charges; the go-pro page, which
 * does quote a price, derives it from the price rows instead.
 *
 * Renders nothing while the sale window is closed, so callers can mount it
 * unconditionally.
 */
export function SaleNotice({ className = '' }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const { open, endsAt } = useSaleWindow();

  if (!open) return null;

  const pct = Math.round((1 - SALE_DISCOUNT) * 100);

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-red-600 dark:text-red-400">
        🥮 {t('msg.sale_mid_autumn')}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('msg.sale_discount', { pct })}
        {' · '}
        {t('msg.sale_offer_ends', { date: formatSaleDate(endsAt, locale) })}
      </p>
    </div>
  );
}
