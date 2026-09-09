import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/playback.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `playback` category.
 */
export default function PlaybackSettingsRoute() {
  return <SettingsRoute category="playback" />;
}
