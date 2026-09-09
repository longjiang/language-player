import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/display.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `display` category.
 */
export default function DisplaySettingsRoute() {
  return <SettingsRoute category="display" />;
}
