// @/contexts/TVShowsContext.tsx

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { getCollectionItems } from '@/src/api/directus';
import { useLanguage } from '@/contexts/LanguageContext';
import { Show } from '@/components/ShowCard';

interface TVShowsContextType {
  shows: Show[];
  isLoading: boolean;
  loadShows: () => Promise<void>;
}

const TVShowsContext = createContext<TVShowsContextType | undefined>(undefined);

export const useTVShows = () => {
  const context = useContext(TVShowsContext);
  if (!context) {
    throw new Error('useTVShows must be used within a TVShowsProvider');
  }
  return context;
};

export const TVShowsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [shows, setShows] = useState<Show[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { l2Lang } = useLanguage();

  const loadShows = async () => {
    if (!l2Lang) return;
    setIsLoading(true);
    try {
      const tvShows = await getCollectionItems('tv_shows', {
        filter: { l2: { eq: l2Lang.id } },
      });
      setShows(tvShows as Show[]);
    } catch (error) {
      console.error('Failed to load shows:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadShows();
  }, [l2Lang]);

  const value = {
    shows,
    isLoading,
    loadShows,
  };

  return <TVShowsContext.Provider value={value}>{children}</TVShowsContext.Provider>;
};