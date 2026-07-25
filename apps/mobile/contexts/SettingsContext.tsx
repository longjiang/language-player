import React, { createContext, useContext, type ReactNode } from 'react';
import { useSettings } from '@/hooks/use-settings';
import type {
  SettingsV2,
  TokenizedTextSettings,
  DisplaySettings,
  PlaybackSettings,
  ReviewSettings,
  L2Settings,
} from '@langplayer/shared';

interface SettingsContextValue {
  settings: SettingsV2;
  loaded: boolean;

  tokenizedText: TokenizedTextSettings;
  updateTokenizedText: (patch: Partial<TokenizedTextSettings>) => void;
  display: DisplaySettings;
  updateDisplay: (patch: Partial<DisplaySettings>) => void;
  playback: PlaybackSettings;
  updatePlayback: (patch: Partial<PlaybackSettings>) => void;
  review: ReviewSettings;
  updateReview: (patch: Partial<ReviewSettings>) => void;

  getL2: (code: string) => L2Settings;
  updateL2: (code: string, patch: Partial<L2Settings>) => void;
  ensureL2: (code: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext must be used within <SettingsProvider>');
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const value = useSettings();
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
