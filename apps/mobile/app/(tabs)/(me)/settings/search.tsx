import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/search.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `search` category.
 */
export default function SearchSettingsRoute() {
  return <SettingsRoute category="search" />;
}
