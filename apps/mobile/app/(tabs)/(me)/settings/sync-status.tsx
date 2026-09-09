import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/sync-status.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `sync` category.
 */
export default function SyncStatusScreenRoute() {
  return <SettingsRoute category="sync" />;
}
