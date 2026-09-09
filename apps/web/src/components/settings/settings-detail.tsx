'use client';

import { DisplaySettings } from '@/components/settings/display-settings';
import { PlaybackSettings } from '@/components/settings/playback-settings';
import { SpeechSettings } from '@/components/settings/speech-settings';
import { ReviewSettings } from '@/components/settings/review-settings';
import { SearchSettings } from '@/components/settings/search-settings';
import type { SettingsCategory } from '@/components/settings/settings-categories';

/**
 * Detail pane of the settings modal (ADR-0042). Each category has exactly one
 * implementation, shared with the deep-link route that renders the same modal.
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
    default:
      return null;
  }
}
