import React from 'react';
import { SettingsRoute } from '@/components/settings/SettingsRoute';

/**
 * `app/(tabs)/(me)/settings/review.tsx` deep-link target (ADR-0042). Renders nothing itself — it opens the
 * app-wide settings modal on the `review` category.
 */
export default function ReviewSettingsRoute() {
  return <SettingsRoute category="review" />;
}
