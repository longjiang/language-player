'use client';

import { SettingsRoute } from '@/components/settings/settings-route';

/**
 * `/[l1]/[l2]/settings/display` deep-link target (ADR-0042). The settings UI is
 * a modal; this route only opens it on the Display category so links, bookmarks
 * and the Classic redirect adapter keep working.
 */
export default function DisplaySettingsRoute() {
  return <SettingsRoute category="display" />;
}
