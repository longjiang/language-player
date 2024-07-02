// @/contexts/SettingsContext

import React, { createContext, useReducer, useContext, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'react-native';

const systemColorScheme = useColorScheme(); // Gets the system color scheme ('light' or 'dark')

// Define the initial state for the settings
const initialState = {
  showPinyin: false,
  showDefinition: false,
  useTraditional: false,
  showTranslation: false,
  showQuickGloss: false,
  autoPronounce: false,
  darkMode: systemColorScheme === 'dark',  // Initialize based on system preference
  quizMode: false,
};

// Define the types for the state and actions
export interface SettingsState {
  showPinyin: boolean;
  showDefinition: boolean;
  useTraditional: boolean;
  showTranslation: boolean;
  autoPronounce: boolean;
  darkMode: boolean;
  showQuickGloss: boolean;
  quizMode: boolean;
}

type SettingsAction =
  | { type: 'SET_SETTINGS'; payload: Partial<SettingsState> }
  | { type: 'TOGGLE_SETTING'; payload: keyof SettingsState };

// Reducer function to handle state changes
const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
  switch (action.type) {
    case 'SET_SETTINGS':
      return { ...state, ...action.payload };
    case 'TOGGLE_SETTING':
      return { ...state, [action.payload]: !state[action.payload] };
    default:
      return state;
  }
};

// Create the context
const SettingsContext = createContext<{
  settings: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
}>({
  settings: initialState,
  dispatch: () => null,
});

// Create a provider component
export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, dispatch] = useReducer(settingsReducer, initialState);

  useEffect(() => {
    const loadSettings = async () => {
      const savedSettings = await SecureStore.getItemAsync('userSettings');
      if (savedSettings) {
        dispatch({ type: 'SET_SETTINGS', payload: JSON.parse(savedSettings) });
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const saveSettings = async () => {
      await SecureStore.setItemAsync('userSettings', JSON.stringify(settings));
    };
    saveSettings();
  }, [settings]);

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
