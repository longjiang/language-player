import React, { useEffect, useMemo, useRef } from 'react';
import { useColorScheme } from 'nativewind';
import { useSettingsContext } from '@/contexts/SettingsContext';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';

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
 *
 * Launch note: NativeWind's runtime only propagates a setColorScheme() to
 * the resolved scheme through an appearance-change event that it drops while
 * the app is not 'active'. On a cold launch the settings often load (from
 * SecureStore) before the app reports active, so the first apply can be
 * lost and the UI stays on the boot (system) scheme — dark on a dark-mode
 * device — even though Settings shows "light mode". Re-asserting the theme
 * when the app becomes active closes that window: by then the settings are
 * loaded, and the re-apply happens while 'active' so the change propagates.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { display, loaded } = useSettingsContext();
  const { setColorScheme } = useColorScheme();

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    if (theme === 'light') {
      setColorScheme('light');
    } else if (theme === 'dark') {
      setColorScheme('dark');
    } else {
      setColorScheme('system');
    }
  };

  // Latest values for the AppState listener (stable subscription, no
  // re-subscribe when settings change).
  const themeRef = useRef(display.theme);
  themeRef.current = display.theme;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const applyRef = useRef(applyTheme);
  applyRef.current = applyTheme;

  useEffect(() => {
    if (!loaded) return;
    applyTheme(display.theme);
  }, [display.theme, loaded, setColorScheme]);

  // Re-assert the theme every time the app becomes active (see launch note).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !loadedRef.current) return;
      applyRef.current(themeRef.current);
    });
    return () => sub.remove();
  }, []);

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
