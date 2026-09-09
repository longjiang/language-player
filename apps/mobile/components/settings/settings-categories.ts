import React from 'react';
import { Monitor, Play, Volume2, RotateCcw, Search, Download, WifiOff, Cloud } from 'lucide-react-native';

/**
 * Settings categories — the single list shared by the modal's sidebar (wide
 * screens), the modal's list view (narrow screens) and the deep-link routes
 * (`/settings/<category>`). Each entry maps a route segment to its i18n title
 * key and its detail component.
 */
export const SETTINGS_CATEGORIES = [
  'display',
  'playback',
  'speech',
  'review',
  'search',
  'network',
  'offline',
  'sync',
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export function isSettingsCategory(value: string | null | undefined): value is SettingsCategory {
  return !!value && (SETTINGS_CATEGORIES as readonly string[]).includes(value);
}

/** i18n key for a category's title (also used as the modal header). */
export const SETTINGS_TITLE_KEYS: Record<SettingsCategory, string> = {
  display: 'title.display',
  playback: 'title.playback',
  speech: 'title.speech',
  review: 'title.review',
  search: 'setting.subs_search',
  network: 'title.offline_mode',
  offline: 'title.offline_dictionaries',
  sync: 'title.sync_status',
};

/** Row icons (shared by the list and the sidebar). */
export const SETTINGS_ICONS: Record<SettingsCategory, typeof Monitor> = {
  display: Monitor,
  playback: Play,
  speech: Volume2,
  review: RotateCcw,
  search: Search,
  network: WifiOff,
  offline: Download,
  sync: Cloud,
};
