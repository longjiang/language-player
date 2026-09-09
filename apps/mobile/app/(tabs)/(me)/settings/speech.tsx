import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/speech.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `speech` category.
 */
export default function SpeechSettingsRoute() {
  return <SettingsRoute category="speech" />;
}
