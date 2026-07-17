// @/contexts/ThemeContext

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

// Simple theme objects (replaces @react-navigation/native DarkTheme/DefaultTheme)
const DarkTheme = { dark: true, colors: {} };
const DefaultTheme = { dark: false, colors: {} };

type ThemeType = typeof DarkTheme | typeof DefaultTheme;
interface ThemeContextType {
  theme: ThemeType;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { settings } = useSettings();
  const [theme, setTheme] = useState<ThemeType>(settings.darkMode ? DarkTheme : DefaultTheme);

  useEffect(() => {
    setTheme(settings.darkMode ? DarkTheme : DefaultTheme);
  }, [settings.darkMode]);

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
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
