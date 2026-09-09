import React from 'react';
import { DisplaySettings } from '@/components/settings/DisplaySettings';
import { PlaybackSettings } from '@/components/settings/PlaybackSettings';
import { SpeechSettings } from '@/components/settings/SpeechSettings';
import { ReviewSettings } from '@/components/settings/ReviewSettings';
import { SearchSettings } from '@/components/settings/SearchSettings';
import { NetworkSettings } from '@/components/settings/NetworkSettings';
import { SyncStatusScreen } from '@/components/settings/SyncStatusSettings';
import OfflineDictionariesScreen from '@/app/(tabs)/(me)/offline-dictionaries';
import { type SettingsCategory } from '@/components/settings/settings-categories';

/**
 * Detail pane of the settings modal (ADR-0042). Each category's screen is the
 * same component its deep-link route renders, so there is exactly one
 * implementation per category.
 */
export function SettingsDetail({ category }: { category: SettingsCategory | null }) {
  switch (category) {
    case 'display':
      return <DisplaySettings />;
    case 'playback':
      return <PlaybackSettings />;
    case 'speech':
      return <SpeechSettings />;
    case 'review':
      return <ReviewSettings />;
    case 'search':
      return <SearchSettings />;
    case 'network':
      return <NetworkSettings />;
    case 'offline':
      return <OfflineDictionariesScreen />;
    case 'sync':
      return <SyncStatusScreen />;
    default:
      return null;
  }
}
