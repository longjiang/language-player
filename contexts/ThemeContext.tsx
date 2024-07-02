// @/contexts/ThemeContext

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as ReactNavigationThemeProvider } from '@react-navigation/native';
import { useSettings } from '@/contexts/SettingsContext';

type ThemeType = typeof DarkTheme | typeof DefaultTheme;
interface ThemeContextType {
  theme: ThemeType;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { settings } = useSettings();
  const [theme, setTheme] = useState<ThemeType>(settings.darkMode ? DarkTheme : DefaultTheme);  // Default to dark theme

  // Whenever settings.darkMode changes, update the theme
  useEffect(() => {
    setTheme(settings.darkMode ? DarkTheme : DefaultTheme);
  }, [settings.darkMode]);

  return (
    <ThemeContext.Provider value={{ theme }}>
      <ReactNavigationThemeProvider value={theme}>{children}</ReactNavigationThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
