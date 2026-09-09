import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SettingsRoute } from '@/components/settings/SettingsRoute';
import { isSettingsCategory } from '@/components/settings/settings-categories';

/**
 * `/settings` deep-link target (ADR-0042). Opens the settings modal on its list
 * view (narrow) or with Display selected (wide). A `?section=<category>` param
 * (used by the sync-status badge and older links) selects that category.
 */
export default function SettingsIndexRoute() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = typeof params.section === 'string' ? params.section : null;
  return <SettingsRoute category={isSettingsCategory(section) ? section : null} />;
}
