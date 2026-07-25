import { useColorScheme as useDefaultColorScheme } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';

// @/hooks/useColorScheme


export function useColorScheme(): 'dark' | 'light' {
  const { settings } = useSettings();  // Use settings from context
  let theme: string = 'dark';  // Default to dark mode
  if (!settings) {
    theme = useDefaultColorScheme() || theme;  // Gets the system color scheme ('light' or 'dark')
  } else {
    theme = settings.darkMode ? 'dark' : 'light';  // Determine theme based on settings
  }
  return theme as 'dark' | 'light';
}
