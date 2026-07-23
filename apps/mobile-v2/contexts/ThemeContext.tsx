import React, { useEffect } from 'react';
import { useColorScheme } from 'nativewind';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { StatusBar } from 'expo-status-bar';

/**
 * Reads display.theme from settings and applies the color scheme
 * via NativeWind's useColorScheme. Also updates StatusBar style.
 *
 * Default (no theme set) = dark — matches the app's design origin.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { display, loaded } = useSettingsContext();
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    if (!loaded) return;

    const theme = display.theme;
    if (theme === 'light') {
      setColorScheme('light');
    } else if (theme === 'dark') {
      setColorScheme('dark');
    } else {
      // 'system' — let NativeWind follow the device preference
      setColorScheme('system');
    }
  }, [display.theme, loaded, setColorScheme]);

  const isDark = colorScheme === 'dark' || (colorScheme !== 'light' && display.theme !== 'light');

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </>
  );
}
