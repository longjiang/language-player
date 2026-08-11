'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSettingsContext } from '@/providers/settings-provider';
import { useSubscriptionContext } from '@/providers/subscription-provider';
import { useT } from '@/hooks/use-t';
import { ToggleRow } from '../_components/ToggleRow';

export default function SearchSettingsPage() {
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
    return <div className="mx-auto max-w-lg px-4 py-12 text-center text-muted-foreground">{t('msg.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <h1 className="text-3xl font-bold mb-8">{t('setting.subs_search')}</h1>

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
