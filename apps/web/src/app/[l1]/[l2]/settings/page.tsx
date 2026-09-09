'use client';

import { SettingsRoute } from '@/components/settings/settings-route';

/**
 * `/[l1]/[l2]/settings` deep-link target (ADR-0042). Opens the settings modal
 * on its list view (narrow) or with Display selected (wide).
 */
export default function SettingsListRoute() {
  return <SettingsRoute />;
}
