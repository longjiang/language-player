'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { ToggleRow } from '@/components/settings/ToggleRow';

export function SearchSettings() {
  const { search, updateSearch, loaded } = useSettingsContext();
  const { isPro } = useSubscriptionContext();
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
  }, [search, t]);

  if (!loaded) {
    return <div className="px-6 py-10 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="px-6 py-6">
      <h2 className="text-xl font-bold mb-6">{t('setting.subs_search')}</h2>

      <ToggleRow
        label={t('setting.expand_subs_search')}
        description={t('setting.expand_subs_search_desc')}
        checked={isPro && search.expandSubsSearch}
        disabled={!isPro}
        onChange={(v) => updateSearch({ expandSubsSearch: v })}
      />
    </div>
  );
}
