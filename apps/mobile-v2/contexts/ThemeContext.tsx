import React, { useEffect, useMemo } from 'react';
import { useColorScheme } from 'nativewind';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

/**
 * Reads display.theme from settings and applies the color scheme
 * via NativeWind's useColorScheme. Also updates StatusBar style.
 *
 * Colors are defined as CSS custom properties in global.css:
 *   :root        → light semantic tokens
 *   .dark:root   → dark semantic tokens
 *
 * NativeWind resolves hsl(var(--xxx)) at runtime based on the
 * active color scheme, matching the web app's next-themes pattern.
 * No per-component dark: overrides needed.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { display, loaded } = useSettingsContext();
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    if (!loaded) return;
    const theme = display.theme;
    if (theme === 'light') {
      setColorScheme('light');
    } else if (theme === 'dark') {
      setColorScheme('dark');
    } else {
      setColorScheme('system');
    }
  }, [display.theme, loaded, setColorScheme]);

  const isDark = useMemo(() => {
    if (!loaded) return true; // default dark while loading
    return display.theme !== 'light';
  }, [display.theme, loaded]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </>
  );
}
