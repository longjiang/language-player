'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useSettingsContext } from '@/providers/settings-provider';
import { log } from '@/lib/logger';

/**
 * Single source of truth for the applied theme: `display.theme` from
 * settings (`lp_settings` in localStorage, hydrated from the account row).
 *
 * next-themes only learns about a theme change when the settings page calls
 * `setTheme()` — on a plain refresh / PWA launch it falls back to its own
 * `theme` localStorage key, or the root layout's `defaultTheme="dark"`, which
 * can disagree with the saved settings (e.g. the theme was changed on another
 * device and arrived here via the cloud-settings hydrate). That left the UI
 * dark while Settings showed "light mode" selected.
 *
 * This component applies the settings value to next-themes as soon as the
 * settings are loaded, and re-applies whenever the value changes (local
 * edit or cloud sync), so the applied theme always follows the settings.
 * Mount it inside `SettingsProvider` wherever the provider is mounted.
 */
export function ThemeSync() {
  const { display, loaded } = useSettingsContext();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    if (!loaded) return;
    if (theme === display.theme) return;
    log(`[settings] theme sync → ${display.theme} (next-themes was ${theme ?? 'unset'})`);
    setTheme(display.theme);
  }, [loaded, display.theme, theme, setTheme]);

  return null;
}
