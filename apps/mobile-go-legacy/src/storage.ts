// @/src/storage.ts
// Platform-aware storage: SecureStore on native, localStorage on web

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type StorageInterface = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const webStorage: StorageInterface = {
  getItemAsync: async (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItemAsync: async (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  },
  deleteItemAsync: async (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently fail
    }
  },
};

const nativeStorage: StorageInterface = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};

export const secureStorage: StorageInterface =
  Platform.OS === 'web' ? webStorage : nativeStorage;
