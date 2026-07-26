'use client';

import { useT } from '@/hooks/use-t';
import { SettingsListPanel } from './SettingsListPanel';

export function SettingsSidebar() {
  const t = useT();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{t('title.settings')}</h2>
      <SettingsListPanel hideTitle />
    </div>
  );
}
