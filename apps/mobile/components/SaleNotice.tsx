import { View, Text } from 'react-native';
import { useT } from '@/hooks/use-t';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSaleWindow, formatSaleDate } from '@/hooks/use-sale';

/**
 * Compact sale line for the in-app upgrade prompts, mirroring the web
 * `SaleNotice`.
 *
 * Classic renders its full `Sale.vue` banner inside the "you need Pro" prompt
 * (`zerotohero-nuxt/components/YouNeedPro.vue` → `<Sale class="mt-4 mx-2" />`),
 * so the offer appears wherever the user is told to upgrade. The prompts here
 * are inline strips, so this is the condensed version: the sale headline and
 * the deadline.
 *
 * ⚠️ Unlike the web notice, this deliberately quotes NO discount percentage.
 * Mobile has no non-store purchase path, so whether a discount applies depends
 * on the App Store Connect / Play Console price for `pro_go` — something this
 * component cannot confirm without querying the store. Advertising "50% off"
 * here, above a button whose purchase sheet may charge full price, is exactly
 * the misleading claim the store-price coupling exists to prevent. The go-pro
 * and profile screens — which do read the store price — show the discount once
 * the store confirms it.
 *
 * Renders nothing while the sale window is closed, so callers mount it
 * unconditionally.
 */
export function SaleNotice({ className = '' }: { className?: string }) {
  const t = useT();
  const { l1Lang } = useLanguage();
  const { open, endsAt } = useSaleWindow();

  if (!open) return null;

  return (
    <View className={className}>
      <Text className="text-sm font-semibold text-red-600 dark:text-red-400">
        🥮 {t('msg.sale_mid_autumn')}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">
        {t('msg.sale_offer_ends', { date: formatSaleDate(endsAt, l1Lang.code) })}
      </Text>
    </View>
  );
}
