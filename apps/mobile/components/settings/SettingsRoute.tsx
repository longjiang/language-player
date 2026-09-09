import { useEffect } from 'react';
import { useSettingsDialog } from '@/contexts/SettingsDialogContext';
import { type SettingsCategory } from '@/components/settings/settings-categories';

/**
 * Deep-link target for a settings category (ADR-0042). The route renders
 * nothing itself — it opens the app-wide settings modal on `category`, so
 * `/settings/display`, universal links and the Classic redirect adapter keep
 * working while the UI stays a modal.
 */
export function SettingsRoute({ category = null }: { category?: SettingsCategory | null }) {
  const { openSettings } = useSettingsDialog();

  useEffect(() => {
    openSettings(category);
  }, [openSettings, category]);

  return null;
}
