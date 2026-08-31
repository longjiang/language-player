import React, { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { useLanguage } from '@/contexts/LanguageContext';
import type {
  SettingsV2,
  TokenizedTextSettings,
  DisplaySettings,
  PlaybackSettings,
  ReviewSettings,
  SearchSettings,
  L2Settings,
} from '@langplayer/shared';

interface SettingsContextValue {
  settings: SettingsV2;
  loaded: boolean;
  cloudHydrated: boolean;

  tokenizedText: TokenizedTextSettings;
  updateTokenizedText: (patch: Partial<TokenizedTextSettings>) => void;
  display: DisplaySettings;
  updateDisplay: (patch: Partial<DisplaySettings>) => void;
  playback: PlaybackSettings;
  updatePlayback: (patch: Partial<PlaybackSettings>) => void;
  review: ReviewSettings;
  updateReview: (patch: Partial<ReviewSettings>) => void;
  search: SearchSettings;
  updateSearch: (patch: Partial<SearchSettings>) => void;

  /** Local-only network kill switch (never synced to the account). */
  offlineMode: boolean;
  setOfflineMode: (value: boolean) => Promise<void>;

  getL2: (code: string) => L2Settings;
  updateL2: (code: string, patch: Partial<L2Settings>) => void;
  ensureL2: (code: string) => void;
  /** Convenience: toggle Chinese script variant for the given L2 code. */
  setUseTraditional: (l2Code: string, value: boolean) => void;
  /** Record the last-used L1/L2 pair in the cloud settings (cross-device login restore). */
  setLanguagePair: (l1: string, l2: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext must be used within <SettingsProvider>');
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const { l1Lang, l2Lang } = useLanguage();

  // Record the last-used pair in the cloud settings whenever the learner's
  // language changes. LanguageContext writes the pair to SecureStore; this
  // mirrors it into the synced settings blob so a future login on another
  // device restores it. Re-runs after cloud hydration so an early (pre-
  // hydration) mount still syncs once the row is applied.
  const l1Code = l1Lang?.code;
  const l2Code = l2Lang?.code;
  useEffect(() => {
    if (!l1Code || !l2Code) return;
    settings.setLanguagePair(l1Code, l2Code);
  }, [l1Code, l2Code, settings.cloudHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: SettingsContextValue = {
    ...settings,
    setUseTraditional: (l2Code: string, value: boolean) => {
      const current = settings.getL2(l2Code);
      settings.updateL2(l2Code, {
        display: { ...current.display, traditional: value },
      });
    },
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
