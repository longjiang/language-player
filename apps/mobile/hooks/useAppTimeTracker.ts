// @/hooks/useAppTimeTracker.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useUserData } from '@/contexts/UserDataContext';
import { useTimer } from '@/hooks/useTimer';

export const useAppTimeTracker = () => {
  const { userData, updateProgress } = useUserData();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const l2LangCode = useRef<string | null>(null);

  useEffect(() => {
    if (userData) {
      l2LangCode.current = Object.keys(userData.progress)[0]; // Adjust this logic based on actual structure
    }
  }, [userData]);

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App has come to the foreground!');
    } else if (nextAppState.match(/inactive|background/)) {
      console.log('App has gone to the background!');
    }
    setAppState(nextAppState);
  }, [appState]);

  const updateTimeSpent = async () => {
    if (l2LangCode.current && userData) {
      const currentProgress = userData.progress[l2LangCode.current];
      const newTime = (currentProgress?.time || 0) + 15000;
      await updateProgress(l2LangCode.current, { level: currentProgress?.level || "1", time: newTime });
    }
  };

  useEffect(() => {
    AppState.addEventListener('change', handleAppStateChange);
    return () => {
      AppState.removeEventListener('change', handleAppStateChange);
    };
  }, [handleAppStateChange]);

  useTimer(updateTimeSpent, appState === 'active' ? 15000 : null);
};
