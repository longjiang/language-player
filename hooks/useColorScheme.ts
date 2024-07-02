// @/hooks/useColorScheme

import { useColorScheme as useDefaultColorScheme } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';

export function useColorScheme(
) {
  const { settings } = useSettings();  // Use settings from context
  let theme = 'dark';  // Default to dark mode
  if (!settings) {
    theme = useDefaultColorScheme() || theme;  // Gets the system color scheme ('light' or 'dark')
  } else {
    theme = settings.darkMode ? 'dark' : 'light';  // Determine theme based on settings
    return theme;
  }
}