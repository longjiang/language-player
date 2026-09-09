import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/network.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `network` category.
 */
export default function NetworkSettingsRoute() {
  return <SettingsRoute category="network" />;
}
