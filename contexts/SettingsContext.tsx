// @/contexts/SettingsContext

import React, { createContext, useReducer, useContext, useEffect, ReactNode } from 'react';
import { secureStorage } from '@/src/storage';
import { useColorScheme } from 'react-native';
import { useLanguage } from './LanguageContext';

// Initial state for settings
const initialState = {
  showPinyin: true,
  showDefinition: false,
  useTraditional: false,
  showTranslation: true,
  showQuickGloss: true,
  autoPronounce: true,
  darkMode: true,
  quizMode: false,
  l1LangCode: '',
  l2LangCode: '',
};

// Types for state and actions
export interface SettingsState {
  showPinyin: boolean;
  showDefinition: boolean;
  useTraditional: boolean;
  showTranslation: boolean;
  autoPronounce: boolean;
  darkMode: boolean;
  showQuickGloss: boolean;
  quizMode: boolean;
  l1LangCode: string;
  l2LangCode: string;
}

type SettingsAction =
  | { type: 'SET_SETTINGS'; payload: Partial<SettingsState> }
  | { type: 'TOGGLE_SETTING'; payload: keyof SettingsState }
  | { type: 'SET_L1_LANG_CODE'; payload: string }
  | { type: 'SET_L2_LANG_CODE'; payload: string };

// Reducer function to handle state changes
const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
  switch (action.type) {
    case 'SET_SETTINGS':
      return { ...state, ...action.payload };
    case 'TOGGLE_SETTING':
      return { ...state, [action.payload]: !state[action.payload] };
    case 'SET_L1_LANG_CODE':
      return { ...state, l1LangCode: action.payload || state.l1LangCode };
    case 'SET_L2_LANG_CODE':
      return { ...state, l2LangCode: action.payload || state.l2LangCode };
    default:
      return state;
  }
};

// Create context
const SettingsContext = createContext<{
  settings: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
}>({
  settings: initialState,
  dispatch: () => null,
});

// Provider component
export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const systemColorScheme = useColorScheme();
  const [settings, dispatch] = useReducer(settingsReducer, initialState);
  const { l1Lang, l2Lang, setL1Lang, setL2Lang, languages } = useLanguage();

  // Effect: Load settings from SecureStore on mount and set languages
  useEffect(() => {
    const loadSettings = async () => {
      const savedSettings = await secureStorage.getItemAsync('userSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        dispatch({ type: 'SET_SETTINGS', payload: parsedSettings });
        
        // Set l1Lang and l2Lang based on stored codes
        if (parsedSettings.l1LangCode && languages) {
          const l1Language = languages.getLangByCode(parsedSettings.l1LangCode);
          if (l1Language) setL1Lang(l1Language);
        }
        if (parsedSettings.l2LangCode && languages) {
          const l2Language = languages.getLangByCode(parsedSettings.l2LangCode);
          if (l2Language) setL2Lang(l2Language);
        }
      } else {
        // If no saved settings, initialize with default values
        const defaultSettings = {
          ...initialState,
          darkMode: systemColorScheme === 'dark',
        };
        dispatch({ type: 'SET_SETTINGS', payload: defaultSettings });
        await secureStorage.setItemAsync('userSettings', JSON.stringify(defaultSettings));
      }
    };
    loadSettings();
  }, [languages, setL1Lang, setL2Lang, systemColorScheme]);

  // Effect: Save settings to SecureStore when they change
  useEffect(() => {
    const saveSettings = async () => {
      await secureStorage.setItemAsync('userSettings', JSON.stringify(settings));
    };
    // If languages aren't set, this is initial load, so don't save
    if (settings.l1LangCode && settings.l2LangCode) {
      saveSettings();
    }
  }, [settings]);

  // Effect: Update l1LangCode in settings when l1Lang changes
  useEffect(() => {
    if (l1Lang && l1Lang.code && l1Lang.code !== settings.l1LangCode) {
      dispatch({ type: 'SET_L1_LANG_CODE', payload: l1Lang.code });
    }
  }, [l1Lang]);

  // Effect: Update l2LangCode in settings when l2Lang changes
  useEffect(() => {
    if (l2Lang && l2Lang.code && l2Lang.code !== settings.l2LangCode) {
      dispatch({ type: 'SET_L2_LANG_CODE', payload: l2Lang.code });
    }
  }, [l2Lang]);

  return (
    <SettingsContext.Provider value={{ settings, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
};

// Custom hook to use the settings context
export const useSettings = () => {
  return useContext(SettingsContext);
};